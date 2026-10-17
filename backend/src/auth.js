const { randomBytes, scrypt: scryptCallback, timingSafeEqual, createHash } = require('node:crypto')
const { promisify } = require('node:util')
const { User, Profile, Session } = require('./models')
const scrypt = promisify(scryptCallback)
const ttl = 7 * 24 * 60 * 60 * 1000
const digest = value => createHash('sha256').update(value).digest('hex')
const cookies = raw => Object.fromEntries((raw || '').split(';').map(p => p.trim().split('=')))
async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
    const key = await scrypt(password, salt, 64)
    return { salt, hash: key.toString('hex') }
}
async function authenticateCookie(raw) {
    const token = cookies(raw).sid
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null
    const session = await Session.findOne({ tokenHash: digest(token), expiresAt: { $gt: new Date() } }).lean()
    return session?.username || null
}
async function isLoggedIn(req, res, next) {
    try {
        req.username = await authenticateCookie(req.headers.cookie)
        if (!req.username) return res.status(401).send({ error: 'Please log in again.' })
        next()
    } catch (err) { next(err) }
}
async function issueSession(res, username) {
    const token = randomBytes(32).toString('hex')
    await Session.create({ tokenHash: digest(token), username, expiresAt: new Date(Date.now() + ttl) })
    res.cookie('sid', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: ttl, path: '/' })
}
const validPassword = p => typeof p === 'string' && p.length >= 8 && p.length <= 128
module.exports = (app,options={}) => {
    const googleEnabled=!!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) || (process.env.NODE_ENV==='test' && !!options.oauth)
    app.get('/auth/config',(_req,res)=>res.send({googleEnabled}))
    app.post('/register', async (req, res) => {
        const { username, password, email, dob, phone, zipcode } = req.body
        if (typeof username !== 'string' || !/^[A-Za-z][A-Za-z0-9]{2,29}$/.test(username) || !validPassword(password))
            return res.status(400).send({ error: 'Use a 3–30 character alphanumeric username and an 8–128 character password.' })
        const fieldsToValidate={email,phone,zipcode,dob}
        for(const [name,value] of Object.entries(fieldsToValidate)) {
            if(value!==undefined && typeof value!=='string')return res.status(400).send({error:`Invalid ${name}.`})
        }
        if(email!==undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).send({error:'Invalid email.'})
        if(phone!==undefined && !/^\d{10}$/.test(phone))return res.status(400).send({error:'Invalid phone.'})
        if(zipcode!==undefined && !/^\d{5}$/.test(zipcode))return res.status(400).send({error:'Invalid zipcode.'})
        if(dob!==undefined) {
            const birth=new Date(dob),now=new Date();let age=now.getFullYear()-birth.getFullYear()
            if(now.getMonth()<birth.getMonth() || (now.getMonth()===birth.getMonth() && now.getDate()<birth.getDate()))age--
            if(!/^\d{4}-\d{2}-\d{2}$/.test(dob) || !Number.isFinite(birth.getTime()) || age<18)return res.status(400).send({error:'You must be at least 18.'})
        }
        if (await User.exists({ username })) return res.status(409).send({ error: 'Username already exists.' })
        const fields = await hashPassword(password)
        try { await User.create({ username, ...fields }) }
        catch (err) { if (err.code === 11000) return res.status(409).send({ error: 'Username already exists.' }); throw err }
        await Profile.create({ username, display: typeof req.body.display === 'string' ? req.body.display.slice(0,80) : username, headline: 'New here', email: typeof email === 'string' ? email.slice(0,254) : '', dob, phone, zipcode, avatar: '' })
        await issueSession(res, username)
        res.status(201).send({ username, result: 'success' })
    })
    app.post('/login', async (req, res) => {
        const { username, password } = req.body
        if (typeof username !== 'string' || typeof password !== 'string' || password.length > 128) return res.status(400).send({ error: 'Invalid credentials.' })
        const user = await User.findOne({ username })
        // Legacy MD5 records are intentionally not accepted in this clean project database.
        const salt = user?.salt || 'constant-time-fallback-salt'
        const key = await scrypt(password, salt, 64)
        const stored = Buffer.from(user?.hash || '', 'hex')
        if (stored.length !== key.length || !timingSafeEqual(key, stored)) return res.status(401).send({ error: 'Invalid credentials.' })
        await issueSession(res, username)
        res.send({ username, result: 'success' })
    })
    app.put('/logout', isLoggedIn, async (req, res) => {
        const token = cookies(req.headers.cookie).sid
        await Session.deleteOne({ tokenHash: digest(token) })
        app.get('io')?.in(`user:${req.username}`).disconnectSockets(true)
        res.clearCookie('sid', { path: '/' }).send({ result: 'OK' })
    })
    app.put('/password', isLoggedIn, async (req, res) => {
        if (!validPassword(req.body.password)) return res.status(400).send({ error: 'Password must contain 8–128 characters.' })
        await User.updateOne({ username: req.username }, await hashPassword(req.body.password))
        await Session.deleteMany({ username: req.username })
        app.get('io')?.in(`user:${req.username}`).disconnectSockets(true)
        res.clearCookie('sid', { path: '/' }).send({ result: 'success', username: req.username })
    })
    if(googleEnabled) require('./oauth')(app,{issueSession,cookies,digest},options.oauth)

}
module.exports.isLoggedIn = isLoggedIn
module.exports.authenticateCookie = authenticateCookie
module.exports.hashPassword = hashPassword

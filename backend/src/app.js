const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const mongoose = require('mongoose')
const path = require('node:path')
const fs = require('node:fs')
const { rateLimit } = require('express-rate-limit')
const cookieParser = require('cookie-parser')
function createApp(options={}) {
    const app = express()
    const origin = process.env.FRONTEND_ORIGIN || 'http://localhost:4200'
    if(process.env.TRUST_PROXY==='1')app.set('trust proxy',1)
    app.use(helmet({contentSecurityPolicy:{directives:{'img-src':["'self'",'data:','https:'],'connect-src':["'self'",origin,origin.replace(/^http/,'ws')],'script-src':["'self'"],'style-src':["'self'","'unsafe-inline'"]}}}))
    app.use(cors({ origin, credentials: true }))
    app.use((req,res,next) => {
        if (!['GET','HEAD','OPTIONS'].includes(req.method) && ((req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site']==='cross-site'))
            return res.status(403).send({ error: 'Origin not allowed.' })
        next()
    })
    app.use(express.json({ limit: '1mb' }), cookieParser())
    // Preserve legacy HW7 routes while the browser uses a single /api namespace.
    app.use((req,_res,next)=>{if(req.url.startsWith('/api/'))req.url=req.url.slice(4);next()})
    const authLimiter=rateLimit({ windowMs:60000,limit:process.env.NODE_ENV==='test'?1000:20,standardHeaders:'draft-8',legacyHeaders:false })
    app.use(['/login','/register'],authLimiter)
    app.get('/health',(_req,res)=>res.send({status:'ok'}))
    app.get('/ready',async(_req,res)=>{
        try{await mongoose.connection.db.admin().ping();res.send({status:'ready'})}
        catch{res.status(503).send({status:'unavailable'})}
    })
    const webRoot=options.webRoot || process.env.WEB_ROOT
    if(webRoot){
        const index=path.resolve(webRoot,'index.html')
        if(!fs.existsSync(index))throw new Error('Frontend build is missing. Run npm run build in frontend first.')
        app.get(/^\/(main|chat|profile)?$/, (req,res,next)=>{
            if(!req.originalUrl.startsWith('/api/') && req.headers.accept?.includes('text/html'))return res.sendFile(index)
            next()
        })
    }
    require('./auth')(app,options)
    const mediaStore = options.mediaStore === undefined ? require('./media').createMediaStore() : options.mediaStore
    require('./media').mediaRoutes(app,mediaStore)
    require('./profile')(app,mediaStore)
    require('./articles')(app)
    require('./following')(app)
    require('./chat').chatRoutes(app)
    if(webRoot)app.use(express.static(path.resolve(webRoot),{index:false,maxAge:'1h'}))
    app.use((_req,res)=>res.status(404).send({error:'Route not found.'}))
    app.use((err,_req,res,_next) => {
        if(!err.status)console.error(err.message)
        res.status(err.status || 500).send({ error: err.status ? (err.status===413?'Request is too large.':err.message) : 'Request failed.' })
    })
    return app
}
module.exports = { createApp }

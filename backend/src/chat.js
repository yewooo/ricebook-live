const mongoose = require('mongoose')
const { Server } = require('socket.io')
const { Room, Message, User, Article, Following } = require('./models')
const { isLoggedIn, authenticateCookie } = require('./auth')
const error = (status,message) => Object.assign(new Error(message),{ status })
const validId = id => typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id)
async function requireMember(id, username) {
    if (!validId(id)) throw error(400,'Invalid room ID.')
    const room = await Room.findById(id).lean()
    if (!room) throw error(404,'Room not found.')
    if (!room.members.includes(username)) throw error(403,'Join this room first.')
    return room
}
async function visiblePost(pid, username) {
    const article = await Article.findOne({ pid }).lean()
    if (!article) throw error(404,'Post not found.')
    const follows = await Following.findOne({ username }).lean()
    if (article.author !== username && !follows?.following.includes(article.author)) throw error(403,'Post not in your feed.')
    return article
}
function chatRoutes(app) {
    app.get('/chat/rooms',isLoggedIn, async (req,res) => {
        const rooms = await Room.find({ $or:[{ isPublic:true },{ members:req.username },{ invited:req.username }] }).sort({createdAt:-1}).limit(100).lean()
        res.send({ rooms:rooms.map(r => ({ ...r, invited:r.invited.includes(req.username), joined:r.members.includes(req.username) })) })
    })
    app.post('/chat/rooms',isLoggedIn, async (req,res) => {
        const { name, isPublic = true, sourcePost } = req.body
        if (typeof name !== 'string' || !name.trim() || name.trim().length > 60 || typeof isPublic !== 'boolean') throw error(400,'Room name must contain 1–60 characters.')
        if (sourcePost !== undefined) await visiblePost(Number(sourcePost), req.username)
        const room = await Room.create({ name:name.trim(), owner:req.username, members:[req.username], isPublic, sourcePost })
        res.status(201).send({ room })
    })
    app.post('/chat/rooms/:id/join',isLoggedIn, async (req,res) => {
        if (!validId(req.params.id)) throw error(400,'Invalid room ID.')
        const room = await Room.findOneAndUpdate({ _id:req.params.id,
            $and:[{ $or:[{isPublic:true},{invited:req.username},{members:req.username}] },
                {$or:[{members:req.username},{$expr:{$lt:[{$size:'$members'},'$capacity']}}]}]
        }, { $addToSet:{members:req.username}, $pull:{invited:req.username} }, {new:true})
        if (!room) throw error(403,'Room unavailable, private, or full.')
        res.send({ room })
    })
    app.post('/chat/rooms/:id/invite',isLoggedIn, async (req,res) => {
        const room = await requireMember(req.params.id,req.username)
        if (room.owner !== req.username) throw error(403,'Only the room owner can invite members.')
        const username = req.body.username
        if (typeof username !== 'string' || !await User.exists({username})) throw error(404,'User not found.')
        await Room.updateOne({_id:room._id},{$addToSet:{invited:username}})
        res.send({result:'invited'})
    })
    app.delete('/chat/rooms/:id/members/:username',isLoggedIn, async (req,res) => {
        const room = await requireMember(req.params.id,req.username)
        if (room.owner !== req.username || req.params.username === room.owner) throw error(403,'Only the owner can remove other members.')
        await Room.updateOne({_id:room._id},{$pull:{members:req.params.username, invited:req.params.username}})
        const io = app.get('io')
        for (const socket of await io.in(`user:${req.params.username}`).fetchSockets()) {
            socket.leave(`room:${room._id}`)
            socket.emit('room:removed',{roomId:String(room._id)})
        }
        res.send({result:'removed'})
    })
    app.get('/chat/rooms/:id/messages',isLoggedIn, async (req,res) => {
        await requireMember(req.params.id,req.username)
        const query = {room:req.params.id}
        if (req.query.before) {
            if (!validId(req.query.before)) throw error(400,'Invalid message cursor.')
            query._id = {$lt:new mongoose.Types.ObjectId(req.query.before)}
        }
        const messages = await Message.find(query).sort({_id:-1}).limit(51).lean()
        const hasMore = messages.length > 50
        res.send({messages:messages.slice(0,50).reverse(),hasMore})
    })
    app.post('/chat/rooms/:id/share',isLoggedIn, async (req,res) => {
        await requireMember(req.params.id,req.username)
        const post = await visiblePost(Number(req.body.postId),req.username)
        if (typeof req.body.clientId !== 'string' || !/^[\w-]{8,80}$/.test(req.body.clientId)) throw error(400,'Invalid client message ID.')
        const message = await persistMessage({room:req.params.id,sender:req.username,clientId:req.body.clientId,postId:post.pid,text:`${post.author}: ${post.text.slice(0,1800)}`})
        app.get('io').to(`room:${req.params.id}`).emit('message:new',message)
        res.send({message})
    })
}
async function persistMessage(fields) {
    try { return (await Message.create(fields)).toObject() }
    catch(err) {
        if (err.code !== 11000) throw err
        return Message.findOne({room:fields.room,sender:fields.sender,clientId:fields.clientId}).lean()
    }
}
function attachChat(server,app) {
    const origin = process.env.FRONTEND_ORIGIN || 'http://localhost:4200'
    const io = new Server(server,{cors:{origin,credentials:true},maxHttpBufferSize:16384,allowRequest:(req,done) => done(null,!req.headers.origin || req.headers.origin===origin)})
    app.set('io',io)
    io.use(async (socket,next) => {
        try {
            socket.data.username = await authenticateCookie(socket.request.headers.cookie)
            if (!socket.data.username) return next(new Error('Please log in again.'))
            next()
        } catch(err) { next(new Error('Authentication failed.')) }
    })
    // Per-process limits/presence: see architecture notes for multi-instance deployment.
    const buckets = new Map()
    const limited = username => {
        const now = Date.now(), b = buckets.get(username)
        if (!b || now-b.start>10000) { buckets.set(username,{start:now,count:1}); return false }
        return ++b.count>30
    }
    const sweep = setInterval(() => { for (const [key,b] of buckets) if(Date.now()-b.start>10000) buckets.delete(key) },30000)
    sweep.unref(); io.engine.on('close',()=>clearInterval(sweep))
    const presence = roomId => {
        const names = new Set([...io.sockets.sockets.values()].filter(s=>s.rooms.has(`room:${roomId}`)).map(s=>s.data.username))
        io.to(`room:${roomId}`).emit('room:presence',{roomId,users:[...names]})
    }
    io.on('connection',socket => {
        const username = socket.data.username
        socket.join(`user:${username}`)
        let lastTyping=0
        const handle = fn => async (payload={},ack=()=>{}) => {
            if (typeof ack !== 'function') ack=()=>{}
            try {
                if (!await authenticateCookie(socket.request.headers.cookie)) { socket.disconnect(); return ack({error:'Session expired.'}) }
                if (!payload || typeof payload !== 'object') throw error(400,'Invalid payload.')
                ack({ok:true,...await fn(payload)})
            } catch(err) { ack({error:err.status?err.message:'Request failed.'}) }
        }
        socket.on('room:join',handle(async ({roomId}) => {
            await requireMember(roomId,username)
            for (const room of socket.rooms) if(room.startsWith('room:')) { socket.leave(room); presence(room.slice(5)) }
            socket.join(`room:${roomId}`); presence(roomId)
            return {roomId}
        }))
        socket.on('message:send',handle(async ({roomId,text,clientId}) => {
            if (limited(username)) throw error(429,'Slow down and try again shortly.')
            await requireMember(roomId,username)
            if (typeof text!=='string' || !text.trim() || text.trim().length>2000) throw error(400,'Message must contain 1–2000 characters.')
            if(typeof clientId!=='string' || !/^[\w-]{8,80}$/.test(clientId)) throw error(400,'Invalid client message ID.')
            const message=await persistMessage({room:roomId,sender:username,text:text.trim(),clientId})
            io.to(`room:${roomId}`).emit('message:new',message)
            return {message}
        }))
        socket.on('room:typing',handle(async ({roomId}) => {
            if(Date.now()-lastTyping<1000) return {}
            lastTyping=Date.now()
            await requireMember(roomId,username)
            socket.to(`room:${roomId}`).emit('room:typing',{roomId,username})
            return {}
        }))
        socket.on('disconnecting',()=>{
            const rooms=[...socket.rooms].filter(r=>r.startsWith('room:')).map(r=>r.slice(5))
            setImmediate(()=>rooms.forEach(presence))
        })
    })
    return io
}
module.exports={chatRoutes,attachChat}

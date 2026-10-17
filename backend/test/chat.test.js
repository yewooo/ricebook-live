process.env.NODE_ENV='test'
const {test,before,after}=require('node:test')
const assert=require('node:assert/strict')
const {createServer}=require('node:http')
const mongoose=require('mongoose')
const {MongoMemoryServer}=require('mongodb-memory-server')
const {io}=require('socket.io-client')
const {createApp}=require('../src/app')
const {attachChat}=require('../src/chat')
const {Room,Message,Article,Session}=require('../src/models')
let mongo,server,chat,url,alice,bob,eve,room,privateRoom
const sockets=[]
async function api(path,method='GET',body,cookie){const res=await fetch(url+path,{method,headers:{'Content-Type':'application/json',...(cookie?{cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:res.status,body:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]}}
async function register(username){const result=await api('/register','POST',{username,password:'TestPassword2026!',email:`${username}@example.test`});assert.equal(result.status,201);return result.cookie}
function connect(cookie){return new Promise((resolve,reject)=>{const s=io(url,{extraHeaders:{cookie},transports:['websocket'],reconnection:false});sockets.push(s);s.once('connect',()=>resolve(s));s.once('connect_error',reject)})}
function emit(s,event,payload){return new Promise((resolve,reject)=>s.timeout(4000).emit(event,payload,(err,result)=>err?reject(err):resolve(result)))}
before(async()=>{
 mongo=await MongoMemoryServer.create();await mongoose.connect(mongo.getUri());await Promise.all(Object.values(require('../src/models')).map(m=>m.init()))
 const app=createApp();server=createServer(app);chat=attachChat(server,app);await new Promise(r=>server.listen(0,'127.0.0.1',r));url=`http://127.0.0.1:${server.address().port}`
 alice=await register('alice');bob=await register('bob');eve=await register('eve')
 room=(await api('/chat/rooms','POST',{name:'Study group',isPublic:true},alice)).body.room
 privateRoom=(await api('/chat/rooms','POST',{name:'Private team',isPublic:false},alice)).body.room
}, {timeout:180000})
after(async()=>{sockets.forEach(s=>s.disconnect());if(chat)await new Promise(r=>chat.close(r));await mongoose.disconnect();await mongo?.stop()})
test('unauthenticated HTTP requests are denied',async()=>assert.equal((await api('/chat/rooms')).status,401))
test('registration creates a usable session and rejects duplicates and weak passwords',async()=>{
 assert.equal((await api('/profile','GET',undefined,alice)).status,200)
 assert.equal((await api('/register','POST',{username:'alice',password:'TestPassword2026!'})).status,409)
 assert.equal((await api('/register','POST',{username:'weak',password:'123'})).status,400)
})
test('login rejects NoSQL object payloads and invalid passwords',async()=>{
 assert.equal((await api('/login','POST',{username:{$ne:null},password:'x'})).status,400)
 assert.equal((await api('/login','POST',{username:'alice',password:'invalid'})).status,401)
 assert.equal((await api('/login','POST',{username:'alice',password:'TestPassword2026!'})).status,200)
})
test('cross-origin mutation is rejected',async()=>{
 const res=await fetch(url+'/chat/rooms',{method:'POST',headers:{Origin:'https://untrusted.test','Content-Type':'application/json',cookie:alice},body:JSON.stringify({name:'no'})});assert.equal(res.status,403)
})
test('private rooms are hidden from outsiders and cannot be joined without an invitation',async()=>{
 assert.equal((await api('/chat/rooms','GET',undefined,bob)).body.rooms.some(r=>r._id===privateRoom._id),false)
 assert.equal((await api(`/chat/rooms/${privateRoom._id}/join`,'POST',{},bob)).status,403)
 assert.equal((await api(`/chat/rooms/${room._id}/messages`,'GET',undefined,bob)).status,403)
})
test('owner invitation enables private membership',async()=>{
 assert.equal((await api(`/chat/rooms/${privateRoom._id}/invite`,'POST',{username:'bob'},alice)).status,200)
 assert.equal((await api(`/chat/rooms/${privateRoom._id}/join`,'POST',{},bob)).status,200)
 assert.equal((await api(`/chat/rooms/${privateRoom._id}/invite`,'POST',{username:'eve'},bob)).status,403)
})
test('room validation rejects invalid IDs and invalid visibility',async()=>{
 assert.equal((await api('/chat/rooms/nope/messages','GET',undefined,alice)).status,400)
 assert.equal((await api('/chat/rooms','POST',{name:'x',isPublic:'false'},alice)).status,400)
})
test('room capacity is enforced atomically',async()=>{
 await Room.updateOne({_id:room._id},{$set:{capacity:2}})
 const results=await Promise.all([api(`/chat/rooms/${room._id}/join`,'POST',{},bob),api(`/chat/rooms/${room._id}/join`,'POST',{},eve)])
 assert.deepEqual(results.map(r=>r.status).sort(),[200,403])
 assert.equal((await Room.findById(room._id)).members.length,2)
 await Room.updateOne({_id:room._id},{$set:{capacity:50,members:['alice','bob']}})
})
test('socket handshake requires a real session',async()=>{
 await assert.rejects(connect('sid='+'a'.repeat(64)),/log in again/)
})
test('realtime messages are delivered, persisted, deduplicated and sender identity is server-controlled',async()=>{
 const a=await connect(alice),b=await connect(bob)
 assert.equal((await emit(a,'room:join',{roomId:room._id})).ok,true)
 assert.equal((await emit(b,'room:join',{roomId:room._id})).ok,true)
 const received=new Promise(r=>b.once('message:new',r))
 const payload={roomId:room._id,text:'Hello from the API test',clientId:'test-message-0001',sender:'eve'}
 const ack=await emit(a,'message:send',payload)
 assert.equal(ack.message.sender,'alice');assert.equal((await received).text,payload.text)
 const retry=await emit(a,'message:send',payload);assert.equal(retry.message._id,ack.message._id)
 assert.equal(await Message.countDocuments({clientId:payload.clientId}),1)
 assert.equal((await api(`/chat/rooms/${room._id}/messages`,'GET',undefined,bob)).body.messages.length,1)
})
test('socket membership checks prevent unauthorized reads and writes',async()=>{
 const e=await connect(eve)
 assert.match((await emit(e,'room:join',{roomId:room._id})).error,/Join/)
 assert.match((await emit(e,'message:send',{roomId:room._id,text:'no',clientId:'unauthorized-001'})).error,/Join/)
})
test('message pagination returns 50 then older records, without overlap',async()=>{
 await Message.insertMany(Array.from({length:55},(_,i)=>({room:privateRoom._id,sender:'alice',text:`Message ${i}`,clientId:`history-${i}`})))
 const first=(await api(`/chat/rooms/${privateRoom._id}/messages`,'GET',undefined,alice)).body
 assert.equal(first.messages.length,50);assert.equal(first.hasMore,true)
 const second=(await api(`/chat/rooms/${privateRoom._id}/messages?before=${first.messages[0]._id}`,'GET',undefined,alice)).body
 assert.equal(second.messages.length,5);assert.equal(second.hasMore,false)
 assert.equal(new Set([...first.messages,...second.messages].map(m=>m._id)).size,55)
})
test('a feed post can become a room and be shared idempotently',async()=>{
 await Article.create({pid:999,author:'alice',text:'Build a project together',comments:[]})
 const created=await api('/chat/rooms','POST',{name:'Post discussion',sourcePost:999},alice);assert.equal(created.status,201)
 const path=`/chat/rooms/${created.body.room._id}/share`
 const first=await api(path,'POST',{postId:999,clientId:'share-post-999'},alice)
 const second=await api(path,'POST',{postId:999,clientId:'share-post-999'},alice)
 assert.equal(first.status,200);assert.equal(first.body.message._id,second.body.message._id)
 assert.equal(first.body.message.postId,999)
})
test('kicked members lose history and message access immediately',async()=>{
 assert.equal((await api(`/chat/rooms/${privateRoom._id}/members/bob`,'DELETE',undefined,alice)).status,200)
 assert.equal((await api(`/chat/rooms/${privateRoom._id}/messages`,'GET',undefined,bob)).status,403)
 const b=await connect(bob)
 assert.match((await emit(b,'message:send',{roomId:privateRoom._id,text:'denied',clientId:'kicked-user-001'})).error,/Join/)
})
test('logout revokes the session and disconnects its sockets',async()=>{
 const e=await connect(eve)
 const disconnected=new Promise(r=>e.once('disconnect',r))
 assert.equal((await api('/logout','PUT',{},eve)).status,200)
 await disconnected
 assert.equal((await api('/chat/rooms','GET',undefined,eve)).status,401)
})
test('password changes revoke sessions',async()=>{
 const cookie=await register('passwordtest')
 assert.equal((await api('/password','PUT',{password:'NewPassword2026!'},cookie)).status,200)
 assert.equal((await api('/profile','GET',undefined,cookie)).status,401)
})

// Self-contained, loopback-only benchmark. Does not accept or contact remote targets.
process.env.NODE_ENV='test'
const {createServer}=require('node:http')
const {performance,monitorEventLoopDelay}=require('node:perf_hooks')
const {randomBytes,createHash}=require('node:crypto')
const os=require('node:os')
const fs=require('node:fs/promises')
const path=require('node:path')
const mongoose=require('mongoose')
const {MongoMemoryServer}=require('mongodb-memory-server')
const {io}=require('socket.io-client')
const {createApp}=require('../src/app')
const {attachChat}=require('../src/chat')
const {User,Profile,Session,Room,Message}=require('../src/models')
const pause=ms=>new Promise(r=>setTimeout(r,ms))
const round=n=>Math.round(n*100)/100
const summary=values=>{const s=[...values].sort((a,b)=>a-b);return{count:s.length,minMs:round(s[0]||0),p50Ms:round(s[Math.ceil(s.length*.5)-1]||0),p95Ms:round(s[Math.ceil(s.length*.95)-1]||0),p99Ms:round(s[Math.ceil(s.length*.99)-1]||0),maxMs:round(s.at(-1)||0)}}
function connect(url,cookie){return new Promise((resolve,reject)=>{const s=io(url,{extraHeaders:{cookie},transports:['websocket'],reconnection:false,timeout:10000});s.once('connect',()=>resolve(s));s.once('connect_error',reject)})}
function emit(s,event,payload){return new Promise((resolve,reject)=>s.timeout(10000).emit(event,payload,(e,r)=>e?reject(e):r.error?reject(new Error(r.error)):resolve(r)))}
async function scenario(url,n,iteration){
 const prefix=`b${n}r${iteration}`,names=Array.from({length:n},(_,i)=>`${prefix}u${i}`)
 const tokens=names.map(()=>randomBytes(32).toString('hex'))
 await User.insertMany(names.map(username=>({username})))
 await Profile.insertMany(names.map(username=>({username})))
 await Session.insertMany(names.map((username,i)=>({username,tokenHash:createHash('sha256').update(tokens[i]).digest('hex'),expiresAt:new Date(Date.now()+3600000)})))
 const room=await Room.create({name:prefix,owner:names[0],members:names,isPublic:true,capacity:50})
 const cookies=tokens.map(t=>`sid=${t}`),sockets=[]
 try{
  const connectionStart=performance.now()
  sockets.push(...await Promise.all(cookies.map(c=>connect(url,c))))
  await Promise.all(sockets.map(s=>emit(s,'room:join',{roomId:String(room._id)})))
  const connectAndJoinMs=performance.now()-connectionStart
  await Promise.all(sockets.map((s,i)=>emit(s,'message:send',{roomId:String(room._id),text:'Warmup',clientId:`warmup-${prefix}-${i}`})))
  await pause(100)
  const sentAt=new Map(),ackTimes=[],deliveryTimes=[],seen=sockets.map(()=>new Set());let errors=0
  sockets.forEach((s,i)=>s.on('message:new',m=>{
   if(!m.clientId.startsWith(`measure-${prefix}-`)||seen[i].has(m._id))return
   seen[i].add(m._id);const started=sentAt.get(m.clientId);if(started!==undefined)deliveryTimes.push(performance.now()-started)
  }))
  const delay=monitorEventLoopDelay({resolution:10});delay.enable()
  const start=performance.now()
  await Promise.all(sockets.map(async(s,i)=>{
   for(let j=0;j<10;j++){
    const clientId=`measure-${prefix}-${i}-${j}`,started=performance.now();sentAt.set(clientId,started)
    try{await emit(s,'message:send',{roomId:String(room._id),text:`Representative collaboration message ${i}-${j}: reviewing the feed and chat integration.`,clientId});ackTimes.push(performance.now()-started)}catch{errors++}
   }
  }))
  const writeDuration=performance.now()-start,expectedDeliveries=n*n*10
  const deadline=performance.now()+10000
  while(seen.reduce((sum,s)=>sum+s.size,0)<expectedDeliveries && performance.now()<deadline)await pause(25)
  delay.disable()
  const persisted=await Message.countDocuments({room:room._id,clientId:{$regex:`^measure-${prefix}-`}})
  const historyTimes=[]
  await Promise.all(cookies.map(async cookie=>{
   const t=performance.now(),res=await fetch(`${url}/api/chat/rooms/${room._id}/messages`,{headers:{cookie}});const json=await res.json()
   if(res.status!==200||json.messages.length!==50)throw new Error('History verification failed')
   historyTimes.push(performance.now()-t)
  }))
  const duplicate=await emit(sockets[0],'message:send',{roomId:String(room._id),text:'Retry ignored',clientId:`measure-${prefix}-0-0`})
  const retryCount=await Message.countDocuments({room:room._id,clientId:`measure-${prefix}-0-0`})
  return{clients:n,iteration,messagesPerClient:10,messageBytesApprox:100,transport:'websocket',offeredMessages:n*10,acknowledged:ackTimes.length,errors,persisted,uniqueDeliveries:seen.reduce((sum,s)=>sum+s.size,0),expectedDeliveries,connectAndJoinMs:round(connectAndJoinMs),writeDurationMs:round(writeDuration),acknowledgedMessagesPerSecond:round(ackTimes.length/(writeDuration/1000)),acknowledgement:summary(ackTimes),fanoutDelivery:summary(deliveryTimes),historyRequests:summary(historyTimes),eventLoopP99Ms:round(delay.percentile(99)/1e6),duplicateRetryCount:retryCount,pass:errors===0&&persisted===n*10&&seen.reduce((sum,s)=>sum+s.size,0)===expectedDeliveries&&retryCount===1}
 }finally{sockets.forEach(s=>s.disconnect())}
}
async function main(){
 let mongo,server,gateway
 try{
  mongo=await MongoMemoryServer.create();await mongoose.connect(mongo.getUri());await Promise.all(Object.values(require('../src/models')).map(m=>m.init()))
  const app=createApp();server=createServer(app);gateway=attachChat(server,app);await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`
  const results=[]
  for(const clients of [10,50])for(let iteration=1;iteration<=3;iteration++){const result=await scenario(url,clients,iteration);results.push(result);console.log(`${clients} clients, run ${iteration}: ${result.acknowledged} acked / ${result.persisted} stored; p95 ${result.acknowledgement.p95Ms} ms; ${result.pass?'PASS':'FAIL'}`)}
  const report={measuredAt:new Date().toISOString(),environment:{node:process.version,platform:os.platform(),arch:os.arch(),cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,memoryGiB:round(os.totalmem()/2**30),mongoVersion:mongo.instanceInfo?.instance?.mongodProcess?.spawnArgs?.find(x=>x.includes('mongod'))?'local binary':'local MongoDB'},methodology:{topology:'API, WebSocket load clients, and local MongoDB on one development machine over loopback. No TLS, WAN, or hosted-environment latency.',workload:'3 repetitions each: 10 or 50 authenticated clients in one room; warmup then 10 acknowledged sequential sends per client, clients run concurrently. Fanout to every joined client. 10,000 ms deadlines.',scope:'Measures local bounded bursts, not sustainable production capacity, real users, or maximum concurrency. Client and server share the Node process. Login hashing is excluded; real sessions are seeded.',limits:'Production message throttle remains enabled (30 events per user per 10 seconds); auth endpoint throttle is raised in test mode, but authentication still checks MongoDB on every socket action.'},results,allPassed:results.every(r=>r.pass)}
  const destination=path.resolve(__dirname,'../../docs/benchmark-results.json');await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,JSON.stringify(report,null,2)+'\n');console.log(`Results saved to docs/benchmark-results.json`)
  if(!report.allPassed)process.exitCode=1
 }finally{if(gateway)await new Promise(r=>gateway.close(r));await mongoose.disconnect();await mongo?.stop()}
}
main().catch(e=>{console.error(e);process.exitCode=1})

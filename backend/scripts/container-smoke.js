const assert=require('node:assert/strict')
const {execFileSync}=require('node:child_process')
const {randomBytes}=require('node:crypto')
const {io}=require('socket.io-client')
const fs=require('node:fs/promises')
const path=require('node:path')
const url='http://localhost:4300'
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function api(route,method='GET',body,cookie){const r=await fetch(url+route,{method,headers:{Origin:url,'Content-Type':'application/json',...(cookie?{cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,body:await r.json(),cookies:r.headers.getSetCookie()}}
async function ready(){for(let i=0;i<60;i++){try{if((await api('/ready')).status===200)return}catch{}await sleep(500)}throw new Error('Container did not become ready')}
function connect(cookie){return new Promise((resolve,reject)=>{const s=io(url,{extraHeaders:{cookie,Origin:url},transports:['websocket'],reconnection:false});s.once('connect',()=>resolve(s));s.once('connect_error',reject)})}
function emit(s,event,payload){return new Promise((resolve,reject)=>s.timeout(5000).emit(event,payload,(e,r)=>e?reject(e):r.error?reject(new Error(r.error)):resolve(r)))}
async function main(){
 let socket
 try{
  await ready()
  for(const route of ['/','/main','/chat','/profile']){const r=await fetch(url+route,{headers:{Accept:'text/html'}});assert.equal(r.status,200);assert.match(await r.text(),/RiceBook Live/)}
  assert.equal((await api('/api/profile')).status,401)
  const username='container'+randomBytes(4).toString('hex'),password='ContainerSmoke2026!'
  const registered=await api('/api/register','POST',{username,password,email:`${username}@example.test`});assert.equal(registered.status,201)
  const raw=registered.cookies.find(s=>s.startsWith('sid='));assert.match(raw,/HttpOnly/);assert.match(raw,/Secure/);assert.match(raw,/SameSite=Lax/);const cookie=raw.split(';')[0]
  const created=await api('/api/chat/rooms','POST',{name:'Container persistence check'},cookie);assert.equal(created.status,201);const roomId=created.body.room._id
  socket=await connect(cookie);await emit(socket,'room:join',{roomId});const message=await emit(socket,'message:send',{roomId,text:'This message survives application restart.',clientId:'container-smoke-message'});const messageId=message.message._id;socket.disconnect()
  // Only the dedicated QA application's container is restarted.
  execFileSync('docker',['restart','ricebook-live-qa-app-1'],{stdio:'pipe'})
  await ready()
  const history=await api(`/api/chat/rooms/${roomId}/messages`,'GET',undefined,cookie);assert.equal(history.status,200);assert.equal(history.body.messages[0]._id,messageId)
  const fresh=await api('/api/login','POST',{username,password});assert.equal(fresh.status,200)
  const report={verifiedAt:new Date().toISOString(),target:'loopback Docker QA stack, NODE_ENV=production',checks:{spaDeepLinks:true,unauthenticatedApiDenied:true,secureHttpOnlyCookie:true,realWebSocketWrite:true,appRestart:true,persistedSessionAfterRestart:true,persistedMessageAfterRestart:true,loginAfterRestart:true},cloudDeployed:false}
  await fs.writeFile(path.resolve(__dirname,'../../docs/container-smoke-results.json'),JSON.stringify(report,null,2)+'\n');console.log('PASS: production container, SPA deep links, secure cookies, socket message, application restart, persisted session/history.')
 }finally{socket?.disconnect()}
}
main().catch(e=>{console.error(e);process.exitCode=1})

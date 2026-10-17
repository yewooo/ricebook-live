process.env.NODE_ENV='test'
const {test,before,after}=require('node:test')
const assert=require('node:assert/strict')
const {createServer}=require('node:http')
const mongoose=require('mongoose')
const {MongoMemoryServer}=require('mongodb-memory-server')
const {createApp}=require('../src/app')
let mongo,server,url,alice,bob,post
async function api(path,method='GET',body,cookie){const res=await fetch(url+path,{method,headers:{'Content-Type':'application/json',...(cookie?{cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});return{status:res.status,body:res.status===204?null:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]}}
async function register(username){const result=await api('/api/register','POST',{username,password:'SocialTest2026!',email:`${username}@example.test`,phone:'7135551234',zipcode:'77005',dob:'2000-01-01'});assert.equal(result.status,201);return result.cookie}
before(async()=>{mongo=await MongoMemoryServer.create();await mongoose.connect(mongo.getUri());await Promise.all(Object.values(require('../src/models')).map(m=>m.init()));server=createServer(createApp());await new Promise(r=>server.listen(0,'127.0.0.1',r));url=`http://127.0.0.1:${server.address().port}`;alice=await register('socialalice');bob=await register('socialbob')},{timeout:180000})
after(async()=>{if(server)await new Promise(r=>server.close(r));await mongoose.disconnect();await mongo?.stop()})
test('API namespace and health/readiness are available',async()=>{assert.equal((await api('/api/health')).status,200);assert.equal((await api('/api/ready')).status,200);assert.equal((await api('/api/auth/config')).body.googleEnabled,false)})
test('registration rejects malformed profile data and underage date before creating a user',async()=>{
 const {User}=require('../src/models')
 for(const patch of [{email:'bad'},{email:{$ne:null}},{phone:'no'},{zipcode:'0'},{dob:'2020-01-01'}]){
  assert.equal((await api('/register','POST',{username:'invalidprofile',password:'SocialTest2026!',...patch})).status,400)
 }
 assert.equal(await User.countDocuments({username:'invalidprofile'}),0)
})
test('profile updates are validated and applied atomically',async()=>{
 const invalid=await api('/api/profile','PUT',{email:'changed@example.test',phone:'bad'},alice);assert.equal(invalid.status,400)
 assert.equal((await api('/api/profile','GET',undefined,alice)).body.email,'socialalice@example.test')
 const ok=await api('/api/profile','PUT',{email:'changed@example.test',phone:'3125551234',zipcode:'60601',headline:'Ready for interviews'},alice);assert.equal(ok.status,200)
 const fresh=(await api('/api/profile','GET',undefined,alice)).body;assert.equal(fresh.phone,'3125551234');assert.equal(fresh.zipcode,'60601');assert.equal(fresh.headline,'Ready for interviews')
 assert.equal((await api('/api/profile','PUT',{username:'socialbob'},alice)).status,400)
})
test('sensitive profile fields cannot be fetched for other users',async()=>{
 for(const field of ['email','phone','zipcode','dob'])assert.equal((await api(`/${field}/socialbob`,'GET',undefined,alice)).status,403)
 assert.equal((await api('/headline/socialbob','GET',undefined,alice)).status,200)
})
test('avatar validation accepts bounded raster data and rejects SVG or oversized data',async()=>{
 const avatar='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aEuoAAAAASUVORK5CYII='
 assert.equal((await api('/api/avatar','PUT',{avatar},alice)).status,200)
 assert.equal((await api('/api/avatar','GET',undefined,alice)).body.avatar,avatar)
 assert.equal((await api('/api/avatar','PUT',{avatar:'data:image/svg+xml;base64,PHN2Zz4='},alice)).status,400)
 assert.equal((await api('/api/avatar','PUT',{avatar:'data:image/png;base64,'+'A'.repeat(700001)},alice)).status,400)
})
test('following validates target users and is idempotent',async()=>{
 assert.equal((await api('/following/doesnotexist','PUT',{},alice)).status,404)
 assert.equal((await api('/following/socialalice','PUT',{},alice)).status,400)
 await api('/following/socialbob','PUT',{},alice);await api('/following/socialbob','PUT',{},alice)
 assert.deepEqual((await api('/following','GET',undefined,alice)).body.following,['socialbob'])
})
test('posts, follows and unfollows update the visible feed',async()=>{
 post=(await api('/article','POST',{text:'A durable social post'},bob)).body.articles[0]
 assert.equal((await api('/articles','GET',undefined,alice)).body.articles.some(p=>p.pid===post.pid),true)
 await api('/following/socialbob','DELETE',undefined,alice)
 assert.equal((await api('/articles','GET',undefined,alice)).body.articles.some(p=>p.pid===post.pid),false)
 await api('/following/socialbob','PUT',{},alice)
})
test('concurrent post creation assigns unique numeric IDs',async()=>{
 const results=await Promise.all(Array.from({length:25},(_,i)=>api('/article','POST',{text:`Concurrent post ${i}`},alice)))
 assert.ok(results.every(r=>r.status===201));assert.equal(new Set(results.map(r=>r.body.articles[0].pid)).size,25)
})
test('posts are author-editable and reject invalid content',async()=>{
 assert.equal((await api(`/articles/${post.pid}`,'PUT',{text:'Unauthorized'},alice)).status,403)
 assert.equal((await api(`/articles/${post.pid}`,'PUT',{text:'Updated post'},bob)).status,200)
 assert.equal((await api('/article','POST',{text:{$ne:null}},alice)).status,400)
 assert.equal((await api('/article','POST',{text:' '},alice)).status,400)
 assert.equal((await api('/articles/1trailing','PUT',{text:'bad'},alice)).status,400)
})
test('concurrent comments persist without lost writes or duplicate comment IDs',async()=>{
 const results=await Promise.all(Array.from({length:20},(_,i)=>api(`/articles/${post.pid}`,'PUT',{text:`Comment ${i}`,commentId:-1},alice)))
 assert.ok(results.every(r=>r.status===200))
 const fresh=(await api(`/articles/${post.pid}`,'GET',undefined,alice)).body.articles[0]
 assert.equal(fresh.comments.length,20);assert.equal(new Set(fresh.comments.map(c=>c.commentId)).size,20)
 const id=fresh.comments[0].commentId
 assert.equal((await api(`/articles/${post.pid}`,'PUT',{text:'Edited comment',commentId:id},alice)).status,200)
 assert.equal((await api(`/articles/${post.pid}`,'PUT',{text:'Not mine',commentId:id},bob)).status,403)
})
test('post deletion is author-scoped and removes the record',async()=>{
 assert.equal((await api(`/articles/${post.pid}`,'DELETE',undefined,alice)).status,403)
 assert.equal((await api(`/articles/${post.pid}`,'DELETE',undefined,bob)).status,204)
 assert.equal((await api(`/articles/${post.pid}`,'GET',undefined,alice)).body.articles.length,0)
})
test('server logout invalidates the persisted session',async()=>{
 assert.equal((await api('/api/logout','PUT',{},alice)).status,200)
 assert.equal((await api('/api/profile','GET',undefined,alice)).status,401)
})

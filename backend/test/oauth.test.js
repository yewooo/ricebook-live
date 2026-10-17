process.env.NODE_ENV='test'
const {test,before,after}=require('node:test')
const assert=require('node:assert/strict')
const {createServer}=require('node:http')
const express=require('express')
const mongoose=require('mongoose')
const {MongoMemoryServer}=require('mongodb-memory-server')
const {createApp}=require('../src/app')
const {User,Profile}=require('../src/models')
let mongo,server,provider,url,providerUrl,used=false
async function begin(){const r=await fetch(url+'/api/auth/google',{redirect:'manual'});return{location:new URL(r.headers.get('location')),cookie:r.headers.get('set-cookie').split(';')[0]}}
async function callback(start,extra=''){return fetch(url+`/api/auth/google/callback?code=valid-code&state=${start.location.searchParams.get('state')}${extra}`,{headers:{cookie:start.cookie},redirect:'manual'})}
before(async()=>{
 mongo=await MongoMemoryServer.create();await mongoose.connect(mongo.getUri());await Promise.all(Object.values(require('../src/models')).map(m=>m.init()))
 const fake=express();fake.use(express.urlencoded({extended:false}));fake.post('/token',(req,res)=>{if(req.body.code!=='valid-code')return res.status(400).send({error:'invalid_grant'});res.send({access_token:'mock-access-token',token_type:'Bearer'})});fake.get('/userinfo',(_req,res)=>res.send({sub:'mock-google-123',name:'Mock Google User',email:'mock@example.test',email_verified:true,picture:''}))
 provider=createServer(fake);await new Promise(r=>provider.listen(0,'127.0.0.1',r));providerUrl=`http://127.0.0.1:${provider.address().port}`
 server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));url=`http://127.0.0.1:${server.address().port}`
 const app=createApp({oauth:{clientID:'mock-client',clientSecret:'mock-secret',authorizationURL:providerUrl+'/authorize',tokenURL:providerUrl+'/token',userProfileURL:providerUrl+'/userinfo',callbackURL:url+'/api/auth/google/callback'}});server.on('request',app)
},{timeout:180000})
after(async()=>{await Promise.all([server,provider].filter(Boolean).map(s=>new Promise(r=>s.close(r))));await mongoose.disconnect();await mongo?.stop()})
test('OAuth redirects with a bounded state cookie and minimal profile/email scope',async()=>{
 const start=await begin();assert.equal(start.location.origin,providerUrl);assert.match(start.location.searchParams.get('state'),/^[a-f0-9]{64}$/);assert.equal(start.location.searchParams.get('scope'),'profile email')
})
test('OAuth rejects missing, mismatched and expired state',async()=>{
 assert.equal((await fetch(url+'/api/auth/google/callback?code=valid-code',{redirect:'manual'})).status,403)
 const start=await begin();assert.equal((await fetch(url+'/api/auth/google/callback?state='+'a'.repeat(64),{headers:{cookie:start.cookie},redirect:'manual'})).status,403)
 await require('../src/models').OAuthState.updateMany({},{$set:{expiresAt:new Date(0)}})
 assert.equal((await callback(start)).status,403)
})
test('mock-provider callback creates a real application session and profile',async()=>{
 const start=await begin(),res=await callback(start);assert.equal(res.status,302);assert.match(res.headers.get('location'),/oauth=complete/)
 const cookies=res.headers.getSetCookie(),sid=cookies.find(s=>s.startsWith('sid=')).split(';')[0]
 const profile=await fetch(url+'/api/profile',{headers:{cookie:sid}});assert.equal(profile.status,200);assert.equal((await profile.json()).username,'google_mock-google-123')
 assert.equal((await callback(start)).status,403)
})
test('repeated provider login reuses an identity without duplicate accounts',async()=>{
 const start=await begin();assert.equal((await callback(start)).status,302)
 assert.equal(await User.countDocuments({googleId:'mock-google-123'}),1);assert.equal(await Profile.countDocuments({username:'google_mock-google-123'}),1)
})
test('provider denial returns a recoverable login error',async()=>{
 const start=await begin(),state=start.location.searchParams.get('state')
 const res=await fetch(url+`/api/auth/google/callback?error=access_denied&state=${state}`,{headers:{cookie:start.cookie},redirect:'manual'})
 assert.equal(res.status,302);assert.match(res.headers.get('location'),/oauth=error/)
})

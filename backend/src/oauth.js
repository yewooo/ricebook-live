const {randomBytes,timingSafeEqual}=require('node:crypto')
const {Passport}=require('passport')
const {Strategy}=require('passport-google-oauth20')
const {User,Profile,OAuthState}=require('./models')
module.exports=(app,{issueSession,cookies,digest},testProvider)=>{
 const passport=new Passport()
 const origin=process.env.FRONTEND_ORIGIN || 'http://localhost:4200'
 const provider=process.env.NODE_ENV==='test' && testProvider?testProvider:{}
 const options={
  clientID:process.env.GOOGLE_CLIENT_ID || provider.clientID,
  clientSecret:process.env.GOOGLE_CLIENT_SECRET || provider.clientSecret,
  callbackURL:process.env.GOOGLE_CALLBACK_URL || provider.callbackURL || `${origin}/api/auth/google/callback`,
  ...provider
 }
 passport.use(new Strategy(options,async(_access,_refresh,profile,done)=>{
  try{
   if(!profile.id)throw new Error('Provider did not return a user ID.')
   const username=`google_${profile.id}`
   // Google identities are kept separate; matching email never silently links accounts.
   const user=await User.findOneAndUpdate({googleId:profile.id},{$setOnInsert:{username,googleEmail:profile.emails?.[0]?.value}},{upsert:true,new:true})
   await Profile.updateOne({username},{$setOnInsert:{username,display:profile.displayName,email:profile.emails?.[0]?.value,avatar:profile.photos?.[0]?.value || '',headline:'New here'}},{upsert:true})
   done(null,user)
  }catch(e){done(e)}
 }))
 app.use(passport.initialize())
 app.get('/auth/google',async(req,res,next)=>{
  const state=randomBytes(32).toString('hex')
  await OAuthState.create({_id:digest(state),expiresAt:new Date(Date.now()+600000)})
  res.cookie('oauth_state',state,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:600000,path:'/'})
  passport.authenticate('google',{scope:['profile','email'],state,session:false})(req,res,next)
 })
 app.get('/auth/google/callback',async(req,res,next)=>{
  const state=req.query.state,stored=cookies(req.headers.cookie).oauth_state
  if(typeof state!=='string'||!/^[a-f0-9]{64}$/.test(state)||typeof stored!=='string'||state.length!==stored.length||!timingSafeEqual(Buffer.from(state),Buffer.from(stored)))return res.status(403).send({error:'Invalid OAuth state. Please start sign-in again.'})
  const consumed=await OAuthState.findOneAndDelete({_id:digest(state),expiresAt:{$gt:new Date()}})
  if(!consumed)return res.status(403).send({error:'OAuth request expired or was already used.'})
  res.clearCookie('oauth_state',{path:'/'});next()
 },passport.authenticate('google',{session:false,failureRedirect:`${origin}/?oauth=error`}),async(req,res)=>{
  await issueSession(res,req.user.username)
  res.redirect(`${origin}/?oauth=complete`)
 })
}

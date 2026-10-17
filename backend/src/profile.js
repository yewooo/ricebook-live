const { Profile } = require('./models')
const { isLoggedIn } = require('./auth')
const rules = {
 display: v => typeof v === 'string' && v.trim().length > 0 && v.length <= 80,
 headline: v => typeof v === 'string' && v.trim().length > 0 && v.length <= 240,
 email: v => typeof v === 'string' && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
 phone: v => typeof v === 'string' && /^\d{10}$/.test(v),
 zipcode: v => typeof v === 'string' && /^\d{5}$/.test(v),
 avatar: v => typeof v === 'string' && v.length <= 700000 && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(v)
}
const fail = message => Object.assign(new Error(message),{status:400})
function validate(patch){
 if(!patch || Array.isArray(patch) || typeof patch !== 'object' || !Object.keys(patch).length)throw fail('No profile updates supplied.')
 for(const [key,value] of Object.entries(patch))if(!rules[key] || !rules[key](value))throw fail(`Invalid ${key}.`)
 return patch
}
module.exports = app => {
 app.get('/profile',isLoggedIn,async(req,res)=>{
  const profile=await Profile.findOne({username:req.username}).select('-_id -__v').lean()
  if(!profile)return res.status(404).send({error:'Profile not found.'})
  res.send(profile)
 })
 app.put('/profile',isLoggedIn,async(req,res)=>{
  const patch=validate(req.body)
  const profile=await Profile.findOneAndUpdate({username:req.username},{$set:patch},{new:true}).select('-_id -__v').lean()
  res.send(profile)
 })
 for(const field of ['headline','display','email','zipcode','phone','dob','avatar']){
  const get=async(req,res)=>{
   const username=req.params.user || req.username
   if(['email','zipcode','phone','dob'].includes(field) && username!==req.username)return res.status(403).send({error:'This profile field is private.'})
   const profile=await Profile.findOne({username}).lean()
   if(!profile)return res.status(404).send({error:'User not found.'})
   res.send({username,[field]:profile[field] || ''})
  }
  app.get(`/${field}`,isLoggedIn,get);app.get(`/${field}/:user`,isLoggedIn,get)
  if(field!=='dob')app.put(`/${field}`,isLoggedIn,async(req,res)=>{
   const patch=validate({[field]:req.body[field]})
   await Profile.updateOne({username:req.username},{$set:patch})
   res.send({username:req.username,...patch})
  })
 }
}

const { Following, User } = require('./models')
const { isLoggedIn } = require('./auth')
module.exports=app=>{
 const get=async(req,res)=>{
  const username=req.params.user||req.username
  const f=await Following.findOne({username}).lean()
  res.send({username,following:f?.following||[]})
 }
 app.get('/following',isLoggedIn,get);app.get('/following/:user',isLoggedIn,get)
 app.put('/following/:user',isLoggedIn,async(req,res)=>{
  const username=req.username,target=req.params.user
  if(target===username)return res.status(400).send({error:'You cannot follow yourself.'})
  if(!await User.exists({username:target}))return res.status(404).send({error:'User not found.'})
  const f=await Following.findOneAndUpdate({username},{$addToSet:{following:target}},{new:true,upsert:true})
  res.send({username,following:f.following})
 })
 app.delete('/following/:user',isLoggedIn,async(req,res)=>{
  const f=await Following.findOneAndUpdate({username:req.username},{$pull:{following:req.params.user}},{new:true})
  res.send({username:req.username,following:f?.following||[]})
 })
}

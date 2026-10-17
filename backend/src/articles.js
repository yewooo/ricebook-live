const { Article, Following, Counter }=require('./models')
const {isLoggedIn}=require('./auth')
const textValid=t=>typeof t==='string'&&t.trim().length>0&&t.length<=10000
async function authors(username){const f=await Following.findOne({username}).lean();return [username,...(f?.following||[])]}
async function allocate(name,initial){
 try{await Counter.updateOne({_id:name},{$setOnInsert:{value:initial}},{upsert:true})}catch(e){if(e.code!==11000)throw e}
 return (await Counter.findOneAndUpdate({_id:name},{$inc:{value:1}},{new:true})).value
}
module.exports=app=>{
 const get=async(req,res)=>{
  const query={author:{$in:await authors(req.username)}}
  if(req.params.id){if(/^\d+$/.test(req.params.id))query.pid=Number(req.params.id);else query.author=req.params.id}
  const articles=await Article.find(query).sort({date:-1,pid:-1}).limit(500).lean()
  res.send({articles})
 }
 app.get('/articles',isLoggedIn,get);app.get('/articles/:id',isLoggedIn,get)
 app.post('/article',isLoggedIn,async(req,res)=>{
  if(!textValid(req.body.text))return res.status(400).send({error:'Post must contain 1–10000 characters.'})
  const last=await Article.findOne().sort({pid:-1}).select('pid').lean()
  const pid=await allocate('article',last?.pid||0)
  const article=await Article.create({pid,author:req.username,text:req.body.text.trim(),date:new Date(),comments:[]})
  res.status(201).send({articles:[article]})
 })
 app.put('/articles/:id',isLoggedIn,async(req,res)=>{
  if(!/^\d+$/.test(req.params.id)||!textValid(req.body.text))return res.status(400).send({error:'Invalid article ID or text.'})
  const pid=Number(req.params.id),text=req.body.text.trim(),commentId=req.body.commentId
  const article=await Article.findOne({pid}).lean()
  if(!article)return res.status(404).send({error:'Article not found.'})
  let updated
  if(commentId===undefined){
   if(article.author!==req.username)return res.status(403).send({error:'Only the author may edit this article.'})
   updated=await Article.findOneAndUpdate({pid,author:req.username},{$set:{text}},{new:true})
  }else if(commentId===-1){
   if(!(await authors(req.username)).includes(article.author))return res.status(403).send({error:'Follow this author to comment.'})
   const id=await allocate(`comment:${pid}`,Math.max(-1,...article.comments.map(c=>c.commentId)))
   updated=await Article.findOneAndUpdate({pid},{$push:{comments:{commentId:id,author:req.username,text,date:new Date()}}},{new:true})
  }else if(Number.isSafeInteger(commentId)&&commentId>=0){
   const comment=article.comments.find(c=>c.commentId===commentId)
   if(!comment)return res.status(404).send({error:'Comment not found.'})
   if(comment.author!==req.username)return res.status(403).send({error:'Only the comment author may edit it.'})
   updated=await Article.findOneAndUpdate({pid,comments:{$elemMatch:{commentId,author:req.username}}},{$set:{'comments.$.text':text,'comments.$.date':new Date()}},{new:true})
  }else return res.status(400).send({error:'Invalid comment ID.'})
  res.send({articles:updated?[updated]:[]})
 })
 app.delete('/articles/:id',isLoggedIn,async(req,res)=>{
  if(!/^\d+$/.test(req.params.id))return res.status(400).send({error:'Invalid article ID.'})
  const article=await Article.findOne({pid:Number(req.params.id)}).lean()
  if(!article)return res.status(404).send({error:'Article not found.'})
  if(article.author!==req.username)return res.status(403).send({error:'Only the author may delete it.'})
  await Article.deleteOne({_id:article._id});res.status(204).end()
 })
}

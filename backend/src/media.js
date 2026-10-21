const { createHash } = require('node:crypto')
const { pipeline } = require('node:stream/promises')
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3')
const { isLoggedIn } = require('./auth')
const invalid = message => Object.assign(new Error(message), {status:400})
function decodeAvatar(value) {
 const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+=*)$/.exec(value)
 if (!match) throw invalid('Choose a supported image.')
 const body = Buffer.from(match[2], 'base64'), type = match[1]
 if (!body.length || body.length > 500*1024) throw invalid('Image must be at most 500KB.')
 const signature = type==='png' ? body.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))
  : type==='jpeg' ? body[0]===255&&body[1]===216&&body[2]===255
  : type==='gif' ? ['GIF87a','GIF89a'].includes(body.subarray(0,6).toString())
  : body.subarray(0,4).toString()==='RIFF'&&body.subarray(8,12).toString()==='WEBP'
 if(!signature) throw invalid('Image content does not match its type.')
 return {body, contentType:`image/${type}`}
}
function createMediaStore({bucket=process.env.S3_BUCKET,client}={}) {
 if(!bucket)return null
 const s3=client || new S3Client({region:process.env.AWS_REGION || 'us-east-2'})
 return {
  async saveAvatar(username,value) {
   const {body,contentType}=decodeAvatar(value)
   // One object per account bounds retained avatar storage; bucket remains private.
   const key=`avatars/${createHash('sha256').update(username).digest('hex')}`
   await s3.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:body,ContentType:contentType,ServerSideEncryption:'AES256',CacheControl:'no-store'}))
   return `/api/media/${key}`
  },
  async readAvatar(key) {return s3.send(new GetObjectCommand({Bucket:bucket,Key:key}))}
 }
}
function mediaRoutes(app,store) {
 app.get('/media/avatars/:id',isLoggedIn,async(req,res,next)=>{
  if(!store || !/^[a-f0-9]{64}$/.test(req.params.id))return res.status(404).send({error:'Image not found.'})
  try {
   const object=await store.readAvatar(`avatars/${req.params.id}`)
   if(!['image/png','image/jpeg','image/gif','image/webp'].includes(object.ContentType))return res.status(404).send({error:'Image not found.'})
   res.set({'Content-Type':object.ContentType,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'})
   await pipeline(object.Body,res)
  } catch(err) {
   if(res.headersSent)return res.destroy()
   if(err.name==='NoSuchKey')return res.status(404).send({error:'Image not found.'})
   next(err)
  }
 })
}
module.exports={decodeAvatar,createMediaStore,mediaRoutes}

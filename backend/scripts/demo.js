// Uses a real local MongoDB process with a persistent, gitignored data directory.
const path=require('node:path')
const fs=require('node:fs')
const {MongoMemoryServer}=require('mongodb-memory-server')
const mongoose=require('mongoose')
async function main(){
 const dir=path.resolve(__dirname,'../.demo-db'); fs.mkdirSync(dir,{recursive:true})
 const mongo=await MongoMemoryServer.create({instance:{dbPath:dir,storageEngine:'wiredTiger',dbName:'ricebook_live'}})
 process.env.MONGO_URL=mongo.getUri('ricebook_live')
 const {start}=require('../index'); const server=await start()
 const {User,Profile,Article,Following,Room}=require('../src/models'); const {hashPassword}=require('../src/auth')
 for(const username of ['alex','maya','jordan']){
  if(!await User.exists({username})){
   await User.create({username,...await hashPassword('CampusDemo2026!')})
   await Profile.create({username,display:username,headline:'Building things together',email:`${username}@example.test`,zipcode:'77005',phone:'7135551234',dob:'2000-01-01',avatar:''})
  }
  await Following.updateOne({username},{$set:{following:['alex','maya','jordan'].filter(n=>n!==username)}},{upsert:true})
 }
 if(!await Article.exists({})){ await Article.insertMany([
  {pid:1,author:'maya',text:'Looking for teammates for a campus hackathon. I am building a resource-sharing app and would love to work with a frontend developer. Start a discussion room below if you are interested!',date:new Date(),comments:[]},
  {pid:2,author:'jordan',text:'System design study group this Thursday. We will explore how realtime chat handles reconnects, message ordering, and duplicate delivery.',date:new Date(Date.now()-3600000),comments:[]}
 ]) }
 if(!await Room.exists({name:'Project studio'})) await Room.create({name:'Project studio',owner:'alex',members:['alex','maya','jordan'],isPublic:true,sourcePost:1})
 console.log('Demo users: alex / maya / jordan · password: CampusDemo2026!')
 console.log('Demo records are persisted in backend/.demo-db. No external database is contacted.')
 for(const sig of ['SIGINT','SIGTERM']) process.once(sig,async()=>{await mongo.stop()})
}
main().catch(err=>{console.error(err.message);process.exit(1)})

const {test}=require('node:test')
const assert=require('node:assert/strict')
const {decodeAvatar,createMediaStore}=require('../src/media')
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aEuoAAAAASUVORK5CYII='
test('rejects disguised and oversized images before issuing an S3 write',()=>{
 assert.throws(()=>decodeAvatar('data:image/png;base64,'+Buffer.from('<script>bad</script>').toString('base64')),/does not match/)
 assert.throws(()=>decodeAvatar('data:image/png;base64,'+Buffer.alloc(512001).toString('base64')),/500KB/)
 assert.equal(decodeAvatar(png).contentType,'image/png')
})
test('stores avatars under one user-scoped key with encryption and no public ACL',async()=>{
 const sent=[],client={send:async command=>{sent.push(command.input);return {}}}
 const store=createMediaStore({bucket:'private-test-bucket',client})
 const url=await store.saveAvatar('alice',png)
 assert.match(url,/^\/api\/media\/avatars\/[a-f0-9]{64}$/)
 assert.equal(await store.saveAvatar('alice',png),url)
 assert.notEqual(await store.saveAvatar('bob',png),url)
 assert.equal(sent[0].ServerSideEncryption,'AES256');assert.equal(sent[0].ACL,undefined)
 assert.equal(sent[0].Bucket,'private-test-bucket');assert.ok(Buffer.isBuffer(sent[0].Body))
})
test('S3 write failure is propagated so the profile does not receive an unpersisted reference',async()=>{
 const store=createMediaStore({bucket:'private-test-bucket',client:{send:async()=>{throw new Error('S3 unavailable')}}})
 await assert.rejects(store.saveAvatar('alice',png),/S3 unavailable/)
})

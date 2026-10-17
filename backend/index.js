require('dotenv').config()
const { createServer } = require('node:http')
const mongoose = require('mongoose')
const { createApp } = require('./src/app')
const { attachChat } = require('./src/chat')
async function start() {
    await mongoose.connect(process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/ricebook_live')
    await Promise.all(Object.values(require('./src/models')).map(model => model.init()))
    const app = createApp()
    const server = createServer(app)
    attachChat(server, app)
    const port = process.env.PORT || 3000
    server.listen(port, () => console.log(`RiceBook Live API: http://localhost:${port}`))
    for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
        app.get('io').close(() => mongoose.disconnect().then(() => process.exit(0)))
    })
    return server
}
if (require.main === module) start().catch(err => { console.error(err.message); process.exit(1) })
module.exports = { start }

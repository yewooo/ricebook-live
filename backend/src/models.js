// src/models.js
const mongoose = require('mongoose')
const collectionPrefix = process.env.COLLECTION_PREFIX || ''
if(!/^[a-z0-9_]{0,24}$/.test(collectionPrefix))throw new Error('Invalid collection prefix.')
const scopedModel = (name,schema) => mongoose.model(name,schema,collectionPrefix ? collectionPrefix+mongoose.pluralize()(name) : undefined)

/**
 * ---------- User ----------
 * 支持：
 *  - 本地账号：username + salt + hash
 *  - Google 登录：googleId + googleEmail
 */
const userSchema = new mongoose.Schema({
    // 我们在系统里用的用户名（本地注册或第一次 Google 登录时确定）
    username: { type: String, unique: true },

    // 本地密码登录
    salt: String,
    hash: String,

    // Google OAuth 相关字段
    // 注意：很多用户没有 googleId，所以要 sparse: true
    googleId: {
        type: String,
        unique: true,
        sparse: true,
    },
    googleEmail: String,
})

const User = scopedModel('User', userSchema)

/**
 * ---------- Profile ----------
 * 用户可见资料：headline / avatar 等
 */
const profileSchema = new mongoose.Schema({
    username: { type: String, unique: true },
    display: String,
    headline: String,
    email: String,
    zipcode: String,
    phone: String,
    dob: String,
    avatar: String,
})

const Profile = scopedModel('Profile', profileSchema)

/**
 * ---------- Article ----------
 * 文章 + 内嵌评论
 */
const articleSchema = new mongoose.Schema({
    pid:   { type: Number, unique: true },
    author: String,               // 直接用 username
    text:   String,
    date:   { type: Date, default: Date.now },
    comments: [
        {
            commentId: Number,
            author:    String,    // 评论作者 username
            text:      String,
            date:      { type: Date, default: Date.now },
        }
    ]
})

articleSchema.index({ author: 1, date: -1, pid: -1 })
const Article = scopedModel('Article', articleSchema)

/**
 * ---------- Following ----------
 * 每个文档代表一个用户的“关注列表”
 */
const followingSchema = new mongoose.Schema({
    // 谁的 follow 列表
    username: { type: String, unique: true },
    // 他 follow 的用户名数组
    following: [String],
})

const Following = scopedModel('Following', followingSchema)

/**
 * ---------- 导出 ----------
 */
module.exports = {
    User,
    Profile,
    Article,
    Following,
}
const sessionSchema = new mongoose.Schema({
    tokenHash: { type: String, unique: true, required: true },
    username: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true, expires: 0 }
})
const roomSchema = new mongoose.Schema({
    name: { type: String, required: true, maxlength: 60 },
    owner: { type: String, required: true },
    members: [String], invited: [String],
    isPublic: { type: Boolean, default: true },
    capacity: { type: Number, default: 50 },
    sourcePost: Number
}, { timestamps: true })
roomSchema.index({ members: 1, createdAt: -1 })
const messageSchema = new mongoose.Schema({
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    sender: { type: String, required: true },
    text: { type: String, required: true, maxlength: 2000 },
    clientId: { type: String, required: true },
    postId: Number
}, { timestamps: true })
messageSchema.index({ room: 1, _id: -1 })
messageSchema.index({ room: 1, sender: 1, clientId: 1 }, { unique: true })
module.exports.Session = scopedModel('Session', sessionSchema)
module.exports.Room = scopedModel('Room', roomSchema)
module.exports.Message = scopedModel('Message', messageSchema)
const counterSchema = new mongoose.Schema({ _id: String, value: Number })
module.exports.Counter = scopedModel('Counter', counterSchema)

module.exports.OAuthState = scopedModel('OAuthState',new mongoose.Schema({ _id:String, expiresAt:{type:Date,expires:0} }))

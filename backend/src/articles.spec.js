// src/articles.spec.js
require('../spec/helpers/junitReporter.js')
const fetch = require('node-fetch')

const baseUrl = 'http://localhost:3000'
const url = (path) => `${baseUrl}${path}`

describe('Backend API flow', () => {
    let username
    const password = '123'
    let cookie // 保存 sid
    let createdPid // 用于测试 /articles/:id

    // 1. 注册 testUser<ID>
    it('registers a new user with unique id', (done) => {
        const id = Date.now()
        username = `testUser${id}`

        fetch(url('/register'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        })
            .then(res => {
                expect(res.status).toBe(200)
                return res.json()
            })
            .then(body => {
                expect(body.username).toBe(username)
                expect(body.result).toBe('success')
                done()
            })
            .catch(err => { fail(err); done() })
    })

    // 2. 登录并保存 cookie
    it('logs in as the new user and stores cookie', (done) => {
        fetch(url('/login'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        })
            .then(res => {
                expect(res.status).toBe(200)
                const rawCookies = res.headers.raw()['set-cookie']
                expect(rawCookies).toBeDefined()
                cookie = rawCookies[0]
                return res.json()
            })
            .then(body => {
                expect(body.username).toBe(username)
                expect(body.result).toBe('success')
                done()
            })
            .catch(err => { fail(err); done() })
    })

    // 3. 更新 headline + GET headline 验证
    it('updates and gets headline', (done) => {
        const newHeadline = 'Hello from Jasmine test!'

        // PUT headline
        fetch(url('/headline'), {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'cookie': cookie
            },
            body: JSON.stringify({ headline: newHeadline })
        })
            .then(res => {
                expect(res.status).toBe(200)
                return res.json()
            })
            .then(body => {
                expect(body.headline).toBe(newHeadline)

                // GET headline
                return fetch(url('/headline'), {
                    method: 'GET',
                    headers: { 'cookie': cookie }
                })
            })
            .then(res2 => {
                expect(res2.status).toBe(200)
                return res2.json()
            })
            .then(body2 => {
                expect(body2.headline).toBe(newHeadline)
                done()
            })
            .catch(err => { fail(err); done() })
    })

    // 4. 创建新文章并验证数量 +1
    it('creates an article and verifies it was added', (done) => {
        let beforeCount = 0
        const text = 'My first article from Jasmine!'

        fetch(url('/articles'), {
            method: 'GET',
            headers: { 'cookie': cookie }
        })
            .then(res => res.json())
            .then(body => {
                beforeCount = body.articles.length

                return fetch(url('/article'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'cookie': cookie
                    },
                    body: JSON.stringify({ text })
                })
            })
            .then(res => res.json())
            .then(body => {
                expect(body.articles.length).toBe(1)
                const newArticle = body.articles[0]
                expect(newArticle.text).toBe(text)
                expect(newArticle.pid).toBeDefined()

                createdPid = newArticle.pid // 保存 pid

                return fetch(url('/articles'), {
                    method: 'GET',
                    headers: { 'cookie': cookie }
                })
            })
            .then(res2 => res2.json())
            .then(body2 => {
                expect(body2.articles.length).toBe(beforeCount + 1)
                done()
            })
            .catch(err => { fail(err); done() })
    })

    // 5. GET /articles/:id（Rubric 必须）
    it('gets article by id', (done) => {
        fetch(url(`/articles/${createdPid}`), {
            method: 'GET',
            headers: { 'cookie': cookie }
        })
            .then(res => {
                expect(res.status).toBe(200)
                return res.json()
            })
            .then(body => {
                expect(body.articles).toBeDefined()
                expect(body.articles.length).toBe(1)
                const art = body.articles[0]

                expect(art.pid).toBe(createdPid)
                expect(art.author).toBe(username)
                done()
            })
            .catch(err => { fail(err); done() })
    })

    // 6. 登出后不能访问 protected resource
    it('logs out and cannot access protected resources', (done) => {
        fetch(url('/logout'), {
            method: 'PUT',
            headers: { 'cookie': cookie }
        })
            .then(res => {
                expect(res.status).toBe(200)
                return fetch(url('/articles'), {
                    method: 'GET',
                    headers: { 'cookie': cookie }
                })
            })
            .then(res2 => {
                expect(res2.status).toBe(401)
                done()
            })
            .catch(err => { fail(err); done() })
    })
})
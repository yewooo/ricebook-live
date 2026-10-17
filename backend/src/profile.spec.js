const fetch = require('node-fetch')
const baseUrl = 'http://localhost:3000'

describe('Profile endpoint access control', () => {
    it('requires login for /headline', (done) => {
        fetch(`${baseUrl}/headline`)
            .then(res => {
                expect(res.status).toBe(401)
                done()
            })
            .catch(err => { fail(err); done() })
    })
})
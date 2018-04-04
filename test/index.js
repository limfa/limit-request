const assert = require('assert')
const http = require('http')
const os = require('os')
const fs = require('fs')
const path = require('path')
var Request = require('../request');

describe('main', ()=>{
    const SERVERS = []
    after(()=>{
        SERVERS.forEach(v=>v.close())
    })

    it('METHOD getHtml', (done)=>{
        const TEXT = 'TEXT'
        const server = http.createServer((request, response)=>{
            response.end(TEXT)
        }).on('error', done).listen(8080, ()=>{
            const {address, port} = server.address()
            console.log(`Listening ${address}:${port}`)
        })
        SERVERS.push(server)
        const request = new Request()
        request.getHtml({
            url: 'http://127.0.0.1:8080',
        }).then(res=>{
            assert(res.body === TEXT, `res.body: ${res.body}`)
            done()
        }, done)
    })

    it('METHOD saveImage', (done)=>{
        const TEXT = 'TEXT'
        const server = http.createServer((request, response)=>{
            response.end(TEXT)
        }).on('error', done).listen(8081, ()=>{
            const {address, port} = server.address()
            console.log(`Listening ${address}:${port}`)
        })
        SERVERS.push(server)
        const request = new Request()
        let p1 = path.join(os.tmpdir(), Math.random().toString())
        let p2 = path.join(os.tmpdir(), Math.random().toString())
        Promise.all([
            request.saveImage({
                src: 'http://127.0.0.1:8081',
                stream: process.stdout,
            }),
            request.saveImage({
                src: 'http://127.0.0.1:8081',
                dist: p1,
            }),
            request.saveImage({
                src: 'http://127.0.0.1:8081',
                getStream:()=>fs.createWriteStream(p2),
            }),
        ]).then(()=>{
            p1 = fs.readFileSync(p1, 'utf-8')
            p2 = fs.readFileSync(p2, 'utf-8')
            assert(p1 === TEXT, `"${p1}" is differnet than "${TEXT}"`)
            assert(p2 === TEXT, `"${p2}" is differnet than "${TEXT}"`)
            done()
        }, done)
    })

    it('PROPERTY limitCount', (done)=>{
        const limitCount = 3
        let index = 0
        const server = http.createServer((request, response)=>{
            ++index
            console.log(`current request count: "${index}"`)
            assert(index <= limitCount, `${index} > ${limitCount}`)
            setTimeout(()=>{
                --index
                response.end('')
            }, 350)
        }).on('error', (err) => {
            done(err)
        }).listen(8082, ()=>{
            const {address, port} = server.address()
            console.log(`Listening ${address}:${port}`)
        })
        SERVERS.push(server)
        const request = new Request({
            limitCount,
        })
        const ps = []
        for(let i = 0;i < 4; ++i){
            ps.push(request.saveStream({
                src: 'http://127.0.0.1:8082',
                stream: process.stdout,
            }))
        }
        for(let i = 0;i < 10; ++i){
            ps.push(request.getHtml({url: 'http://127.0.0.1:8082'}))
        }
        Promise.all(ps).then(()=>{
            done()
        }, done)
    })

    it('METHOD comeback', (done)=>{
        const allowErrorCount = 4
        const TEXT = '123'
        const server = http.createServer((request, response)=>{
            response.end(TEXT)
        }).on('error', (err) => {
            done(err)
        }).listen(8083, ()=>{
            const {address, port} = server.address()
            console.log(`Listening ${address}:${port}`)
        })
        SERVERS.push(server)
        const request = new Request({
            allowErrorCount,
        })
        let index = 0
        let p = request.getHtml({url: 'http://127.0.0.1:8083'})
        const run = p=>p.then(res=>{
            assert(TEXT === res.body, `${TEXT} === ${res.body}`)
            ++index
            if(index <= allowErrorCount) return run(p.limitRequest.comeback())
        })
        run(p).then(()=>{
            assert(p.limitRequest.errorCount === allowErrorCount, `${p.limitRequest.errorCount} === ${allowErrorCount}`)
            return p.limitRequest.comeback().catch(e=>{
                assert(e instanceof Error)
            })
        }).then(()=>{
            done()
        }, done)
    })

    it('PROPERTY requestInterval', (done)=>{
        const requestInterval = 500
        const TEXT = '123'
        let i = 0
        let lastTime = 0
        const server = http.createServer((request, response)=>{
            ++i
            const now = Date.now()
            const rtime = now - lastTime
            console.log(`request interval: "${rtime}ms"`)
            // 20ms 误差
            assert(rtime + 20 >= requestInterval, `No.${i} request: ${now - lastTime} >= ${requestInterval}`)
            lastTime = now
            response.end(TEXT)
        }).on('error', (err) => {
            done(err)
        }).listen(8084, ()=>{
            const {address, port} = server.address()
            console.log(`Listening ${address}:${port}`)
        })
        SERVERS.push(server)
        const request = new Request({
            requestInterval,
            limitCount: 20,
        })
        const ps = []
        for(let i = 0; i < 20; ++i){
            ps.push(request.getHtml({url: 'http://127.0.0.1:8084'}))
        }
        Promise.all(ps).then(()=>{
            done()
        }, done)
    })

    it('PROPERTY priority', (done)=>{
        let prioritys = []
        for(let i = 0; i < 20; ++i){
            prioritys.push(i)
        }   
        prioritys.sort(()=>Math.random() > 0.5)
        let i = prioritys.length
        const server = http.createServer((request, response)=>{
            console.log(`request.url: "${request.url}"`)
            let q = request.url.slice(1)
            --i
            assert(q == i, `priority "${q}" should be "${i}"`)
            response.end('')
        }).on('error', (err) => {
            done(err)
        }).listen(8085, ()=>{
            const {address, port} = server.address()
            console.log(`Listening ${address}:${port}`)
        })
        SERVERS.push(server)
        const request = new Request({
            limitCount: 20,
        })
        const ps = prioritys.map(priority=>request.getHtml({url: 'http://127.0.0.1:8085/'+priority, priority}))
        Promise.all(ps).then(()=>{
            done()
        }, done)
    })
})
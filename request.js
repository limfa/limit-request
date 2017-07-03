'use strict';
/**
 * 限流请求器
 * @流程图
 *     https://www.processon.com/view/link/55ed3625e4b012a2db1de579
 * @example
 *      let request = new Request({
 *          // 限制请求数
 *          limitCount : 10,
 *          // 当前请求数
 *          currentCount : 0,
 *          // 已完成请求数
 *          doneCount : 0,
 *          // 总请求数
 *          sumCount : 0,
 *          // 超时时间
 *          timeout : 30000,
 *          // 允许累计错误次数
 *          allowErrorCount : 3,
 *          // 每条请求至少的间隔时间
 *          requestInterval : 0,
 *      });      
 *      request.on('done' ,function(name){
 *          console.log(  Math.floor(request.doneCount * 100 / request.sumCount) + '%' , name);
 *      })
 *      .on('error' ,function(name ,type){
 *          console.log(type , name);
 *      })
 *      .on('fail' ,function(name){
 *          console.log('fail' , name);
 *      });
 *      
 *      request.getHtml({
 *          url: 'http://www.baidu.com/',
 *          encoding: 'utf-8',
 *      }).then(res=>console.log(res.body) ,dumpError);
 *
 *      request.saveImage({
 *          src: 'http://www.baidu.com/img/bd_logo1.png',
 *          stream: './images/baidu_logo.png',
 *          progressClassback: ()=>process.stdout.write('.'),
 *      }).then(()=>console.log('success') ,dumpError);
 *
 *      function dumpError(ex){ 
 *          process.stderr.write(ex.stack); 
 *      }
 */

const util = require('util');
const fs = require('fs');
const events = require('events');
const request = require('request');
const iconv = require('iconv-lite');


class SubRequest extends events.EventEmitter{
    /**
     * 子请求
     * @param {String}   name        请求的名称，默认是请求的链接
     * @param {Function} fn          Promise的参数函数
     * @param {Request}   mainRequest   主
     */
    constructor(args, fn ,mainRequest){
        super();

        // 错误次数
        this.errorCount = 0;
        // 名称
        this.name = '';
        // 权重 先大
        this.priority = 0;
        // 请求的Promise的参数
        this.fn = fn;
        for(let k in args){
            if(args.hasOwnProperty(k) && this.hasOwnProperty(k) && args[k] !== void 0) this[k] = args[k];
        }
        this.mainRequest = mainRequest;
        this.init();
    }

    init(){
        // 状态 pending resolved rejected
        this.status = 'pending';
        this.promise = new Promise((resolve ,reject)=>{
            this.resolve = (...arg)=>{
                if(this.status != 'pending') throw new Error(`status error`);
                this.status = 'resolved';
                resolve(...arg);
            };
            this.reject = (...arg)=>{
                if(this.status != 'pending') throw new Error(`status error`);
                this.status = 'rejected';
                reject(...arg);
            };
        });
        // 注入当前对象
        this.promise.limitRequest = this;
        return this;
    }

    /**
     * 发起请求
     * @return {Promise} 请求操作
     */
    request(){
        let timer;
        let promise = new Promise((resolve ,reject)=>{
            let async = this._async = this.fn(resolve ,reject);
            timer = setTimeout(()=>{
                // 取消请求
                try{
                    async && async.abort();
                }catch(ex){}
                reject('timeout');
                // if(async) return async;
            } ,this.mainRequest.timeout);
        });
        promise.then((...arg)=>{
            clearTimeout(timer);
            this.resolve(...arg);
        } ,(type)=>{
            clearTimeout(timer);
            ++this.errorCount;

            if(this.errorCount > this.mainRequest.allowErrorCount){
                this.reject(type);
                this.mainRequest.emit('fail' ,this.name);
            }else{
                // 重新回到队列尾部
                this.mainRequest.queue.push(this);
                this.mainRequest.emit('error' ,this.name ,type);
            }
        });
        return promise;
    }

    // 重新回到队列尾部并初始化
    comeback(anew = false){
        if(this.status == 'pending') throw new Error(`status error`);
        if(anew === true) this.errorCount = 0;
        // 视为错误
        ++this.errorCount;
        if(this.errorCount > this.mainRequest.allowErrorCount) return Promise.reject(`error limit`);
        this.init();
        this.mainRequest.queue.push(this);
        process.nextTick(()=>{
            this.mainRequest.start();
        });
        return this.promise;
    }
}



class Request extends events.EventEmitter{

    constructor(settings){
        super();

        this.encoding = 'utf-8';
        // 限制请求数
        this.limitCount = 10;
        // 当前请求数
        this.currentCount = 0;
        // 已完成请求数
        this.doneCount = 0;
        // 总请求数
        this.sumCount = 0;
        // 超时时间
        this.timeout = 30000;
        // 允许累计错误次数
        this.allowErrorCount = 3;
        // 队列
        this.queue = [];
        // 每条请求至少的间隔时间
        this.requestInterval = 0;
        // 上一次请求时间
        this._lastRequestTime = null;
        // 定时请求
        this._timer = null;

        // 参数覆盖
        settings = settings || {};
        for(let k in settings){
            if(this.hasOwnProperty(k) && settings.hasOwnProperty(k)) this[k] = settings[k];
        }
    }

    /**
     * 加入队列
     * @param {String} name       请求名称
     * @param {Function} subrequest 请求的Promise的参数
     * @return {Promise} 返回请求的Prosime对象
     */
    add(args ,subrequest ,priority){
        ++this.sumCount;
        let _ = new SubRequest(args ,subrequest ,this);

        // 按权重大小 二分算法
        let a = 0, b = this.queue.length;
        while(b-a > 0){
            let s = Math.floor((b - a) / 2) + a;
            if(_.priority > this.queue[s].priority){
                b = s ;
            }else{
                a = s + 1;
            }
        }
        this.queue.splice(a ,0 ,_);

        process.nextTick(()=>{
            this.start();
        });
        return _.promise;
    }

    /**
     * 保存图片 并返回promise
     * @param  {Object} args 参数
     *     @key {String}  src  请求图片的链接
     *     @key {Stream}  stream  保存的流 options  
     *     @key {String}  dist  保存的路径 options  
     *     @key {Function<Promise(Stream)>}  getStream  获取保存的流 options  
     *     @key {Function}  progressCallback  下载中回调
     *     @key {Object}  params  request的参数 see https://github.com/request/request
     * @return {Promise} 返回请求的Prosime对象
     */
    saveImage(args){
        function fn(resolve, reject) {
            let p = Promise.resolve();
            if(!args.stream){
                if(args.dist){
                    args.stream = fs.createWriteStream(args.dist);
                }else if(args.getStream){
                    p = args.getStream().then(stream=>{
                        args.stream = stream;
                    });
                }
            }

            const requestArgs = Object.assign(args.params || {}, {
                url: fixUrl(args.src),
            });
            let pipe = request.get(requestArgs);
            pipe.on('response', res=>{
                // 获取图片404处理
                if(res.statusCode != 200){
                    pipe.abort();
                    reject(new Error(`request "${args.src}" fail with status code "${res.statusCode}"`));
                }
            });
            if(args.progressCallback){
                pipe.on('data' ,args.progressCallback);
            }

            p.then(()=>{
                if(!args.stream) return reject(`param error: not found "args.stream"`);

                // 在一些场景下 close 事件有效 ，而在有些下 end 有效？
                args.stream.on('close' ,resolve).on('end' ,resolve);

                pipe.on('error' ,function(e){
                    reject(`pipe error: "${args.src}" with the error: ${e.stack}`);
                });
                args.stream.on('error' ,function(e){
                    reject(`stream error: "${args.src}" with the error: ${e.stack}`);
                });
                pipe.pipe(args.stream);
            });
            return pipe;
        };
        return this.add({
            name: args.src,
            priority: args.priority,
        } ,fn);
    };

    /**
     * 获取html 返回promise
     * @param  {Object} args 参数
     *                       @key {String}  url  请求链接
     *                       @key {String}  encoding  编码
     *                       @key ... see https://github.com/request/request
     * @return {Promise} 返回请求的Prosime对象
     *         @d  resolve 带html参数
     */
    getHtml(args) {
        let priority = args.priority;
        delete args.priority;
        function fn(resolve, reject) {
            let encoding = args.encoding || this.encoding;
            args.headers = args.headers || {
                'User-Agent': 'Node',
            };
            args.encoding = null;
            args.url = fixUrl(args.url);
            return request(args, (err, res, html)=>{
                if(err) return reject(err);
                if(!res) return reject('getHtml error: ' + args.url +' response is empty');
                if(200 != res.statusCode) return reject(new Error('读取失败'+res.statusCode)); 
                // 转编码
                try{
                    res.body = iconv.decode(html, encoding);
                }catch(ex){
                    console.warn(ex.stack);
                }
                resolve(res);
            });
        };
        return this.add({
            name: args.url,
            priority: priority,
        } ,fn);
    }

    // 执行
    start(){
        // 队列空
        if(this.queue.length <= 0) return;
        // 请求数满
        if(this.currentCount >= this.limitCount) return;
        // 小于请求间隔时间
        let d = this.requestInterval - (Date.now() - this._lastRequestTime);
        if(d > 0){
            clearTimeout(this._timer);
            this._timer = setTimeout(()=>this.start() ,d);
            return;
        }

        ++this.currentCount;
        this._lastRequestTime = Date.now();
        let subrequest = this.queue.shift();
        subrequest.request().then((res)=>{
            --this.currentCount;
            ++this.doneCount;

            // res 并不一定存在
            this.emit('done' ,subrequest.name, res);

            this.start();
        } ,()=>{
            --this.currentCount;
            this.start();
        });
        this.emit('request' ,subrequest.name, subrequest);

        this.start();
    }
}


module.exports = Request;

// 纠正url中带中文字符
function fixUrl(url){
    return url.replace(/[^\x00-\xff]/g, v=>encodeURI(v));
}
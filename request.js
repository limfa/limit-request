'use strict';
/**
 * 限流请求器
 * @流程图
 *     https://www.processon.com/view/link/55ed3625e4b012a2db1de579
 * @example
 *      var request = new Request({
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

var util = require('util');
var fs = require('fs');
var events = require('events');
var request = require('request');
var iconv = require('iconv-lite');


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
        // this.resolve;
        // this.reject;
        this.promise = new Promise((resolve ,reject)=>{
            this.resolve = resolve;
            this.reject = reject;
        });
    }

    /**
     * 发起请求
     * @return {Promise} 请求操作
     */
    request(){
        let timer;
        let promise = new Promise((resolve ,reject)=>{
            let async = this.fn(resolve ,reject);
            timer = setTimeout(()=>{
                // 取消请求
                try{
                    async && async.abort();
                }catch(ex){}
                reject('timeout');
                // if(async) return async;
            } ,this.mainRequest.timeout);
        });
        promise.then(()=>{
            clearTimeout(timer);
        } ,()=>{
            clearTimeout(timer);
            ++this.errorCount;
        });
        this.mainRequest.emit('request' ,this.name);
        return promise;
    }
}



class Request extends events.EventEmitter{

    constructor(settings){
        super();

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
     *                       @key {String}  src  请求图片的链接
     *                       @key {String}  dist  保存的路径 options  ;dist和stream二选一,优先stream
     *                       @key {String}  stream  保存的流 options  ;dist和stream二选一,优先stream
     *                       @key {String}  progressCallback  下载中回调
     * @return {Promise} 返回请求的Prosime对象
     */
    saveImage(args){
        function fn(resolve, reject) {
            if(!args.stream){
                args.stream = fs.createWriteStream(args.dist);
            }
            let pipe = request.get(args.src);
            if(args.progressCallback){
                pipe.on('data' ,args.progressCallback);
            }
            // 在一些场景下 close 事件有效 ，而在有些下 end 有效？
            args.stream.on('close' ,resolve).on('end' ,resolve);

            pipe.on('error' ,function(e){
                console.log('pipe error: ' + args.src + ' with the error: ' + e);
                reject('pipe error: ' + args.src + ' with the error: ' + e);
            });
            args.stream.on('error' ,function(e){
                console.log('stream error: ' + args.src + ' with the error: ' + e);
                reject('stream error: ' + args.src + ' with the error: ' + e);
            });
            pipe.pipe(args.stream);
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
            let encoding = args.encoding || 'utf8';
            args.headers = args.headers || {
                'User-Agent': 'Node',
            };
            args.encoding = null;
            return request(args, (err, res, html)=>{
                if(err) reject(err);
                if(!res) reject('getHtml error: ' + args.url +' response is empty');
                if(200 != res.statusCode){reject(new Error('读取失败'+res.statusCode)); }
                // 转编码
                res.body = iconv.decode(html, encoding);
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
        subrequest.request().then(arg=>{
            --this.currentCount;
            ++this.doneCount;

            subrequest.resolve(arg);
            this.emit('done' ,subrequest.name);

            this.start();
        } ,type=>{
            if(subrequest.errorCount > this.allowErrorCount){
                subrequest.reject();
                this.emit('fail' ,subrequest.name);
            }else{
                this.queue.push(subrequest);
                this.emit('error' ,subrequest.name ,type);
            }

            --this.currentCount;
            this.start();
        });

        this.start();
    }
}


module.exports = Request;

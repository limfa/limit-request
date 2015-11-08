/**
 * 限流请求器
 * @流程图
 *     https://www.processon.com/view/link/55ed3625e4b012a2db1de579
 * @example
 *      var request = new Request({
 *          limitCount: 10,
 *      });      
 *      request.on('done' ,function(current,sum ,name){
 *          console.log( Math.floor(current * 100 / sum) + '%' , name);
 *      })
 *      .on('error' ,function(name ,type){
 *          console.log(type , name);
 *      })
 *      .on('fail' ,function(name){
 *          console.log('fail' , name);
 *      });
 *      request.getHtml({url : 'http://www.baidu.com/'})
 */

var util = require('util');
var fs = require('fs');
var events = require('events');
var request = require('request');
// 扩展内部编码，让gbk得到支持
require('iconv-lite').extendNodeEncodings();

/**
 * 子请求
 * @param {String}   name        请求的名称，默认是请求的链接
 * @param {Function} fn          Promise的参数函数
 * @param {Request}   mainRequest   主
 */
function SubRequest( args, fn ,mainRequest){
    events.EventEmitter.call(this);
    this.errorCount = 0;
    this.name = '';
    this.priority = 0;
    this.fn = fn;
    for(var k in args){
        if(args.hasOwnProperty(k) && this.hasOwnProperty(k) && args[k] !== void 0) this[k] = args[k];
    }
    this.mainRequest = mainRequest;
    var _this = this;
    // this.resolve;
    // this.reject;
    this.promise = new Promise(function(resolve ,reject){
        _this.resolve = resolve;
        _this.reject = reject;
    });
};
util.inherits(SubRequest ,events.EventEmitter);

/**
 * 发起请求
 * @return {Promise} 请求操作
 */
SubRequest.prototype.request = function(){
    var _this = this;
    var timer;
    function fn(resolve ,reject){
        var async = _this.fn(resolve ,reject);
        timer = setTimeout(function(){
            async.abort();
            reject('timeout');
        } ,_this.mainRequest.timeout);
    }
    var promise = new Promise(fn);
    promise.then(function(){
        clearTimeout(timer);
    } ,function(){
        clearTimeout(timer);
        ++_this.errorCount;
    });
    _this.mainRequest.emit('request' ,this.name);
    return promise;
};

function Request(settings){
    events.EventEmitter.call(this);
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
    for(var k in settings){
        if(this.hasOwnProperty(k) && settings.hasOwnProperty(k)) this[k] = settings[k];
    }
};
util.inherits(Request ,events.EventEmitter);
module.exports = Request;

/**
 * 加入队列
 * @param {String} name       请求名称
 * @param {Function} subrequest 请求的Promise的参数
 * @return {Promise} 返回请求的Prosime对象
 */
Request.prototype.add = function(args ,subrequest ,priority){
    ++this.sumCount;
    var _ = new SubRequest(args ,subrequest ,this);

    // 按权重大小 二分算法
    var a = 0, b = this.queue.length;
    while(b-a > 0){
        var s = Math.floor((b - a) / 2) + a;
        if(_.priority > this.queue[s].priority){
            b = s ;
        }else{
            a = s + 1;
        }
    }
    this.queue.splice(a ,0 ,_);

    var _this = this;
    process.nextTick(function(){
        _this.start();
    });
    return _.promise;
};

/**
 * 保存图片 并返回promise
 * @param  {Object} args 参数
 *                       @key {String}  src  请求图片的链接
 *                       @key {String}  dist  保存的路径 options  ;dist和stream二选一,优先stream
 *                       @key {String}  stream  保存的流 options  ;dist和stream二选一,优先stream
 * @return {Promise} 返回请求的Prosime对象
 */
Request.prototype.saveImage = function(args){
    function fn(resolve, reject) {
        if(!args.stream){
            args.stream = fs.createWriteStream(args.dist);
        }
        var pipe = request.get(args.src);
        // pipe.on('close' ,function(){
        //     resolve();
        // });
        args.stream.on('end' ,function(){
            resolve();
        });
        pipe.on('error' ,function(e){
            console.log('pipe error: ' + args.src + ' with the error: ' + e);
            reject('pipe error: ' + args.src + ' with the error: ' + e);
        });
        args.stream.on('error' ,function(e){
            console.log('stream error: ' + args.src + ' with the error: ' + e);
            reject('stream error: ' + args.src + ' with the error: ' + e);
        });
        pipe.pipe(args.stream);
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
Request.prototype.getHtml = function(args) {
    var priority = args.priority;
    delete args.priority;
    function fn(resolve, reject) {
        args.headers = args.headers || {
            'User-Agent': 'Node',
        };
        return request(args, function(err, res, html){
            if(err) reject(err);
            if(!res) reject('getHtml error: ' + args.url +' response is empty');
            if(200 != res.statusCode){reject(new Error('读取失败'+res.statusCode)); }
            resolve(res);
        });
    };
    return this.add({
        name: args.url,
        priority: priority,
    } ,fn);
};

// 执行
Request.prototype.start = function(){
    // 队列空
    if(this.queue.length <= 0) return;
    // 请求数满
    if(this.currentCount >= this.limitCount) return;
    // 小于请求间隔时间
    var d = this.requestInterval - (Date.now() - this._lastRequestTime);
    if(d > 0){
        clearTimeout(this._timer);
        this._timer = setTimeout(()=>this.start() ,d);
        return;
    }

    ++this.currentCount;
    this._lastRequestTime = Date.now();
    var subrequest = this.queue.shift();
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
};


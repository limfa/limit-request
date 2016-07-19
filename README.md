限流请求器
====
[流程图](https://www.processon.com/view/link/55ed3625e4b012a2db1de579)

## 功能

* 限制并发请求数
* 间隔请求
* 请求失败重新请求 可限制错误次数
* 超时时间

## example
```javascript
var request = new Request({
    // 限制请求数
    limitCount : 10,
    // 当前请求数
    currentCount : 0,
    // 已完成请求数
    doneCount : 0,
    // 总请求数
    sumCount : 0,
    // 超时时间
    timeout : 30000,
    // 允许累计错误次数
    allowErrorCount : 3,
    // 每条请求至少的间隔时间
    requestInterval : 0,
});      
request.on('done' ,function(name){
    console.log(  Math.floor(request.doneCount * 100 / request.sumCount) + '%' , name);
})
.on('error' ,function(name ,type){
    console.log(type , name);
})
.on('fail' ,function(name){
    console.log('fail' , name);
});

// 获取HTML
request.getHtml({
    url: 'http://www.sina.com.cn/',
    encoding: 'gbk',
}).then(res=>{
    console.log(res.body);
    return request.getHtml({
        url: 'http://www.google.com/',
    });
}).then(res=>{
    console.log(res.body);
}).catch(dumpError);

// 获取保存图片
request.saveImage({
    src: 'http://www.baidu.com/img/bd_logo1.png',
    stream: './images/baidu_logo.png',
    progressClassback: ()=>process.stdout.write('.'),
}).then(()=>{
    console.log('success');
}).catch(dumpError);

function dumpError(ex){ 
    process.stderr.write(ex.stack); 
}

```

### intro

todo
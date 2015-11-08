限流请求器
====
[流程图](https://www.processon.com/view/link/55ed3625e4b012a2db1de579)

## example
```javascript
var request = new Request({
    limitCount: 10,
});      
request.on('done' ,function(current,sum ,name){
    console.log( Math.floor(current * 100 / sum) + '%' , name);
})
.on('error' ,function(name ,type){
    console.log(type , name);
})
.on('fail' ,function(name){
    console.log('fail' , name);
});
request.getHtml({url : 'http://www.baidu.com/'})

```

### intro

todo
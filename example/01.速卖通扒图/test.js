var fs = require('fs');
var path = require('path');

var Request = require('./lib/request');
var request = new Request();
// 单个文件响应完成
request.on('done' ,function(current,sum ,name){
    console.log( Math.round(current * 100 / sum) + '%' , name);
})
// .on('finish' ,function(e){
//     console.log('finish');
// })
// 单个文件请求发生错误
.on('error' ,function(name ,type){
    console.log(type , name);
})
// 单个文件累计错误过多
.on('fail' ,function(name){
    console.log('fail' , name);
});
var urls = fs.readFileSync('urls.txt').toString().split(/\r\n/).filter(function(v){return String(v).trim()});
urls.forEach(function(url){
    request.getHtml({
        url: url ,
        encoding:'gbk' ,
    }).then(function(html){
        
    } ,function(a){
        console.log(a)
    });
});

// 递归创建文件
function mkFile(_path ,content){
    // if(!fs.existsSync(_path)){
        var dirname = path.dirname(_path);
        mkDir(dirname);
        fs.writeFileSync(_path ,content);
    // }
}
// 递归创建目录
function mkDir(_path){
    if(!fs.existsSync(_path)){
        var dirname = path.dirname(_path);
        mkDir(dirname);
        fs.mkdirSync(_path);
    }
}
// 创建可保存的命名
function getSaveName(name){
    return name.replace(/[\\\/:*?"<>|]/g,'');
}

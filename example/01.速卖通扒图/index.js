var cheerio = require('cheerio');
var fs = require('fs');
var path = require('path');
var request = require('request');

var settings = {
    // 图片选择器
    imgSelector: '#dt-tab img',
    // 编码
    encoding : 'gbk',
    // 图片保存目录
    savePath: 'images',

    // 限制请求数
    limitCount : 10 ,
    // 超时时间
    timeout : 10000 ,
    // 允许累计错误次数
    allowErrorCount : 3 ,
};

var Request = require('../../request');
var request = new Request(settings);
// 单个文件响应完成
request.on('done' ,function(name){
    console.log(  Math.floor(request.doneCount * 100 / request.sumCount) + '%' , name);
})
.on('request' ,function(name){
    // console.log( 'request', name);
})
// 单个文件请求发生错误
.on('error' ,function(name ,type){
    console.log(type , name);
})
// 单个文件累计错误过多
.on('fail' ,function(name){
    console.log('fail' , name);
});

// 从文件中获取链接
var urls = fs.readFileSync('urls.txt').toString().split(/\r\n/).filter(function(v){return String(v).trim()});
urls.forEach(function(url ,i){
    // 获取url上的html
    request.getHtml({
        url: url ,
        encoding:settings.encoding ,
    }).then(function(res) {
        var html = res.body;
        var _index = i + 1;

        var $ = cheerio.load(html);
        // 目录名称    
        var name = $('h1.d-title').text();  // 部分商家无货号，以商品名称命名   -  edit by su
        name = (_index<10?('0'+_index):_index) + ' - ' + name;
        // 路径
        var filepath = path.join(settings.savePath ,name);
        mkDir(filepath);
        // 获取高清图片
        getHDPicture($ ,filepath);
        // 获取详细信息图片
        var filepath2 = path.join(filepath ,'详细信息');
        mkDir(filepath2);
        getDetailPicture($ ,filepath2);
        // 创建快捷方式
        createQuick( path.join(filepath ,name +'.url') ,url);
    } ,function(err){
        console.log('addAllHtml error: ' + err);
    });
});

// 获取高清图片
function getHDPicture($ ,filepath){
    var res = [];
    // 获取的高清图url
    $(settings.imgSelector).each(function(i ,v){
        var $v = $(v);
        var src = $v.attr('data-lazy-src');
        if(!src) src = $v.attr('src');
        res.push(src);
    });
    // 保存图片
    res.forEach(function(v ){
        v = v.replace(/\.(\d+)x\1/ ,'');
        var filename = getSaveName(path.basename(v));
        filename = path.join(filepath ,filename);
        request.saveImage({
            src : v ,
            dist : filename ,
            priority : 2,
        });
    });
}

// 获取详细信息图片
function getDetailPicture($ ,filepath){
    // 获取详细信息图片
    var tfs_url = $('#desc-lazyload-container').data('tfs-url');
    request.getHtml({
        url: tfs_url,
        priority: 3,
    }).then(function(res){
        eval(res.body);
        var $ = cheerio.load(desc);
        var imgres =[];
        $('img').attr('src' ,function(i ,v){
            imgres.push(v);
        });
        imgres.forEach(function(v){
            var filename = getSaveName(path.basename(v));
            filename = path.join(filepath ,filename);
            request.saveImage({
                src : v ,
                dist : filename ,
                priority : 2,
            });
        });
    });
}

// 创建快捷方式
function createQuick(filename ,url){
    mkFile(filename ,'[{000214A0-0000-0000-C000-000000000046}]\r\nProp3=19,2\r\n[InternetShortcut]\r\nIDList=\r\nURL=' + url);
}

// 递归创建目录
function mkDir(_path){
    if(!fs.existsSync(_path)){
        var dirname = path.dirname(_path);
        mkDir(dirname);
        fs.mkdirSync(_path);
    }
}
// 递归创建文件
function mkFile(_path ,content){
    // if(!fs.existsSync(_path)){
        var dirname = path.dirname(_path);
        mkDir(dirname);
        fs.writeFileSync(_path ,content);
    // }
}
// 创建可保存的命名
function getSaveName(name){
    return name.replace(/[\\\/:*?"<>|]/g,'');
}

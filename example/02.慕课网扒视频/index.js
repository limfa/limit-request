var cheerio = require('cheerio');
var path = require('path');
var fs = require('fs');
var Request = require('../../request');

var request = new Request({
    limitCount: 2,
    timeout: 3600 * 1000 * 24,
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

var id = +process.argv[2];

if(+id===id){
    download(id);
}

function download(id){
    request.getHtml({
        url: 'http://www.imooc.com/learn/' + id,
    } ,2).then(req=>{
        var $ = cheerio.load(req.body);
        var title = $('h2').text().trim();
        var chapters = $('.mod-chapters .chapter');
        var video = [];
        chapters.each((i ,v)=>{
            var title = $('h3' ,v).text().trim();
            var vas = [];
            $('.video li a' ,v).each((i ,v)=>{
                v = $(v);
                var id = v.attr('href').match(/\d+$/)[0];
                vas.push({
                    name: v.text().trim(),
                    id: id,
                });
            });
            video.push({
                title: title,
                videos: vas
            });
        });
        return request.getHtml({
            url: 'http://www.imooc.com/video/' + video[0].videos[0].id,
        } ,2).then(req=>{
            var $ = cheerio.load(req.body);
            var $li = $('.downlist li');
            var result = [];
            $li.each((i,v)=>{
                result.push({
                    name: $('span' ,v).text(), 
                    href: $('a' ,v).attr('href')
                });
            });

            return {
                title: title,
                videos: video,
                downloads: result,
            };
        });
    }).then(info=>{
        var savepath = path.join('save' ,getSaveName(info.title));
        mkDir(savepath);
        info.downloads.forEach(v=>{
            var p = path.join(savepath ,getSaveName(v.name) + path.extname(v.href));
            request.saveImage({
                src: v.href,
                dist: p,
            } ,3);
        });
        info.videos.forEach(v=>{
            var p = path.join(savepath ,getSaveName(v.title));
            mkDir(p);
            v.videos.forEach(video=>{
                var name = path.join(p ,getSaveName(video.name));
                saveVideo(name ,video.id);
            });
        });
    }).catch(dumpError);
}

function saveVideo(saveName ,id){
    request.getHtml({
        url: 'http://www.imooc.com/course/ajaxmediainfo/?mid='+id+'&mode=flash',
    } ,2).then(req=>{
        var json = JSON.parse(req.body);
        // var name = json.data.result.name;
        var videoUrl = json.data.result.mpath[0];

        return request.saveImage({
            progressCallback: ()=>process.stdout.write('.'),
            src: videoUrl,
            dist: saveName + path.extname(videoUrl)
        })
    }).catch(dumpError);
}

// 打印错误
function dumpError(ex){
    process.stderr.write(ex.stack);
    model.close();
}
// 创建可保存的命名
function getSaveName(name){
    return name.replace(/[\\\/:*?"<>|]/g,'');
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
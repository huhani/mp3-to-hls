# hls-to-mp3
Convert MP3 file to enable HLS streaming using JavaScript.
Divide the MP3 files into different fragments.

### How to use:

```
var MP3ToHLS = require("mp3-to-hls");
var fs = require("fs");

var mp3file = "./test.mp3";
var extractConfig = {
    extractDir: "./audio/",
    filename: "media_w",
    playlist: "playlist",
};
var segmentDuration = [2, 3, 10];

var mux = new MP3ToHLS(mp3file, segmentDuration);
mux.getPromise().then(function(){
    if (!fs.existsSync(extractConfig.extractDir)){
        fs.mkdirSync(extractConfig.extractDir);
    }
    return mux.extract(extractConfig);
}).then(function(){
    console.log(">> done!");
})['catch'](function(err){
    console.error(err);
});

```

### Example of results above
M3U8 URL : https://dev17.dnip.co.kr/test/audio/playlist.m3u8

Original file : https://dev17.dnip.co.kr/test/Original.mp3

Play URL : https://hls-js.netlify.com/demo/?src=https%3A%2F%2Fdev17.dnip.co.kr%2Ftest%2Faudio%2Fplaylist.m3u8
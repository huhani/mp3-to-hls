var MP3ToHLS = require("../");
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
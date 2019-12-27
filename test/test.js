

var MP3ToHLS = require("./index");


var mux = new MP3ToHLS('./t.mp3', [2, 3, 5]);
mux.getPromise().then(function(){
    console.log(">> done!");
});
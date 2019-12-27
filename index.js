

var buildDeferred = require("./lib/buildDeferred");
var MP3FrameSplitter = require("./lib/MP3FrameSplitter");
var HLSPlaylist = require("./lib/HLSPlaylist");


//FIXME
var fs = require("fs");

var MP3ToHLS = function MP3ToHLS() {

    var AbortError = new Error("Aborted");

    function strToArr(str) {
        return Array.prototype.map.call(str, function(char){
            return char.charCodeAt(0);
        });
    }

    function MP3ToHLS(target, segmentDuration) {
        if(segmentDuration === void 0) {
            segmentDuration = [2, 3, 10];
        }

        var that = this;
        this._target = target;
        this._segmentDuration = segmentDuration;
        this._ended = false;
        this._started = false;
        this._deferred = buildDeferred();
        this._createFileJobDeferred = null;
        this._FrameReader = null;
        this._result = null;
        this._extractDeferred = null;
        this._initTimerID = setTimeout(function(){
            that._initTimerID = null;
            that._started = true;
            that._init();
        }, 0);
    }

    MP3ToHLS.id3TimestampRepresentation = function(timestampOffset) {
        var buffer = [];
        var mpeg2Timestamp = Math.floor(timestampOffset * 90000);
        var timestampStr = mpeg2Timestamp.toString(16);
        while(timestampStr.length < 16) {
            timestampStr = '0' + timestampStr;
        }
        for(var i=0; i< 16; i+=2) {
            var numStr = timestampStr.substring(i, i+2);
            var num = parseInt(numStr, 16);
            buffer.push(num);
        }

        return buffer;
    };

    MP3ToHLS.getID3Tag = function(timestampOffset) {
        var id3 = "ID3";
        var priv = "PRIV";
        var owner = "com.apple.streaming.transportStreamTimestamp";

        var buffer = strToArr(id3).concat([4, 0,
                0,
                0, 0, 0, 63],
            strToArr(priv),
            [0, 0, 0, 53,
                0, 0],
            strToArr(owner),
            [0],
            MP3ToHLS.id3TimestampRepresentation(timestampOffset)
        );

        return new Uint8Array(buffer);
    };


    MP3ToHLS.prototype._init = function() {
        var that = this;
        this._FrameReader = new MP3FrameSplitter(this._target, {
            fragmentDuration: this._segmentDuration
        });
        this._FrameReader.getPromise().then(function(result){
            that._result = result;


            //FIXME
            that._createFile(result.fragments).then(function(){
                that._resolve(result);
            })['catch'](function(err){
                that._reject(err);
            });

        })['catch'](function(err){
            console.error(err);
            that._reject(err);
        });

    };

    MP3ToHLS.prototype.abort = function() {
        if(!this.isEnded()) {
            var that = this;
            this._aborted = true;
            if(!this._isStarted()) {
                clearTimeout(this._initTimerID);
                this._initTimerID = null;
            } else if(this._FrameReader !== null) {
                this._FrameReader.getPromise().then(function(data){
                    that._onComplete(data);
                })['catch'](function(err){
                    that._onFailure(err);
                });
            }
        }
    };


    // FIXME
    MP3ToHLS.prototype._onComplete = function(data) {

    };

    MP3ToHLS.prototype._onFailure = function(err) {
        this._reject(err);
    };


    //FIXME
    MP3ToHLS.prototype.extract = function(config) {
        if(this._extractDeferred) {
            return this._extractDeferred.promise;
        }
    };

    MP3ToHLS.prototype._createFile = function(fragments) {

        // FIXME

        var that = this;
        var idx = 0;
        var deferred = buildDeferred();
        var playlist = [];

        var createFile = function(){
            var fragment = fragments[idx];
            var range = fragment.range;
            var fragmentBuffers = [];
            var writeDeferred = buildDeferred();
            var readDeferred = buildDeferred();

            readDeferred.promise.then(function(data){
                fs.writeFile("./audio/chunk_"+(idx)+".mp3", data, function(err) {
                    if(err){
                        return writeDeferred.reject(err);
                    }
                    playlist.push({
                        duration: fragment.duration,
                        path: "./chunk_"+idx+".mp3"
                    });
                    idx++;

                    writeDeferred.resolve();
                });

                return writeDeferred.promise;
            }).then(function(){
                if(idx >= fragments.length) {
                    fs.writeFile("./audio/playlist.m3u8", HLSPlaylist(playlist), function(err){
                        if(!err){
                            deferred.resolve();
                        } else {
                            deferred.reject(err);
                        }
                    });
                } else {
                    createFile();
                }
            })['catch'](function(e){
                deferred.reject(e);
            });

            var readStream = fs.createReadStream(that._target, {
                start: range.start,
                end: range.end
            });
            readStream.on('readable', function() {
                this.read();
            });
            readStream.on('end', function() {
                var id3Tag = that.constructor.getID3Tag(fragment.timestampOffset);
                var buf = new Uint8Array(Buffer.concat(fragmentBuffers));
                var newBuf = new Uint8Array(id3Tag.byteLength+buf.byteLength);
                newBuf.set(id3Tag, 0);
                newBuf.set(buf, id3Tag.byteLength);
                readDeferred.resolve(newBuf);
            });
            readStream.on('data', function(chunk) {
                fragmentBuffers.push(chunk);
            });
            readStream.on('error', function(err) {
                readDeferred.reject(err);
            });


        };

        createFile();

        return deferred.promise;
    };

    MP3ToHLS.prototype._resolve = function(data) {
        if(!this.isEnded()) {
            this._ended = true;
            this._deferred.resolve(data);
        }
    };

    MP3ToHLS.prototype._reject = function(err) {
        if(!this.isEnded()) {
            this._ended = true;
            this._deferred.reject(err);
        }
    };

    MP3ToHLS.prototype._isStarted = function(){
        return this._started;
    };

    MP3ToHLS.prototype.getPromise = function() {
        return this._deferred.promise;
    };

    MP3ToHLS.prototype.isEnded = function() {
        return this._ended || this._aborted;
    };







    return MP3ToHLS;

}();

module.exports = MP3ToHLS;
var BufferReader = require("./reader/BufferReader");
var buildDeferred = require("./buildDeferred");


var FrameReader = function FrameReader() {

    var MIN_BUFFER_SIZE = 0x01 << 0x10;
    var MAX_BUFFER_SIZE = MIN_BUFFER_SIZE * 2;
    var MAX_NEXT_BUFFER_TRACK_THRESHOLD = 20;
    var MIN_CORRECT_FRAME_COUNT = 2;

    var BitratesMap = [
        32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448,
        32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384,
        32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
        32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256,
        8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
    var SamplingRateMap = [44100, 48000, 32000, 22050, 24000, 16000, 11025, 12000, 8000];

    function ReadInt(buffer) {
        var result = buffer.charCodeAt(0);
        for (var i = 1; i < buffer.length; ++i) {
            result <<= 8;
            result += buffer.charCodeAt(i);
        }

        return result;
    }

    function getID3v2TagLength(block) {
        if(String.fromCharCode.apply(null, block.slice(0, 3)) === 'ID3') {
            var id3v2Flag = block[5];
            var flagFooterPresent = id3v2Flag & 0x10 ? 1 : 0;
            var z0 = block[6];
            var z1 = block[7];
            var z2 = block[8];
            var z3 = block[9];
            if((z0 & 0x80) === 0 && (z1 & 0x80) === 0 && (z2 & 0x80)=== 0 && (z3 & 0x80)=== 0) {
                var headerSize = 10;
                var tagSize = ((z0&0x7f) * 0x200000) + ((z1&0x7f) * 0x4000) + ((z2&0x7f) * 0x80) + (z3&0x7f);
                var footerSize = flagFooterPresent ? 10 : 0;

                return headerSize + tagSize + footerSize;
            }
        }

        return 0;
    }

    function doFrameStuff(data, readeHeader) {
        if(data.length < 2) {
            return null;
        }

        // This section to read mp3 header is referred from https://github.com/tchakabam/multimedia-js/tree/b433e471c52cafb18308e859cf740acf3222521c
        if(data[0] === 0xFF || (data[1] & 0xE0) === 0xE0) {
            var headerOfVersion = (data[1] >> 3) & 3;
            var headerOfLayer = (data[1] >> 1) & 3;
            var headerOfBitrate = (data[2] >> 4) & 15;
            var headerOfFrequency = (data[2] >> 2) & 3;
            var headerOfPadding = !!(data[2] & 2);
            if(headerOfVersion !== 1 && headerOfBitrate !== 0 && headerOfBitrate !== 15 && headerOfFrequency !== 3) {
                var columnInBitrates = headerOfVersion === 3 ? (3 - headerOfLayer) : (headerOfLayer === 3 ? 3 : 4);
                var bitRate = BitratesMap[columnInBitrates * 14 + headerOfBitrate - 1];
                var columnInSampleRates = headerOfVersion === 3 ? 0 : headerOfVersion === 2 ? 1 : 2;
                var sampleRate = SamplingRateMap[columnInSampleRates * 3 + headerOfFrequency];
                var padding = headerOfPadding ? 1 : 0;
                var frameLength = headerOfLayer === 3 ?
                    ((headerOfVersion === 3 ? 12 : 6) * bitRate * 1000 / sampleRate + padding) << 2 :
                    ((headerOfVersion === 3 ? 144 : 72) * bitRate * 1000 / sampleRate + padding) | 0;


                // This source as reading Vbr header has been referred from https://developers.google.com/web/updates/2015/06/Media-Source-Extensions-for-Audio
                var MP3Header = null;
                if(readeHeader && data.length >= 4096) {
                    var secondPerSample = 1/sampleRate;
                    var dataStr = String.fromCharCode.apply(null, data.slice(0, 4096));

                    var paddedSamples = 0;
                    var frontPadding = 0;
                    var endPadding = 0;
                    var realSamples = 0;
                    var frameCount = null;
                    var xingDataIndex = dataStr.indexOf('Xing');
                    if (xingDataIndex === -1) {
                        xingDataIndex = dataStr.indexOf('Info');
                    }
                    if(xingDataIndex > -1) {
                        var frameCountIndex = xingDataIndex + 8;
                        frameCount = ReadInt(dataStr.substr(frameCountIndex, 4));
                        paddedSamples = (frameCount * (headerOfVersion === 3 ? 144 : 72)) << 3;
                        xingDataIndex = dataStr.indexOf('LAME');
                        if (xingDataIndex === -1) {
                            xingDataIndex = dataStr.indexOf('Lavf');
                        }
                        if(xingDataIndex > -1) {
                            var gaplessDataIndex = xingDataIndex + 21;
                            var gaplessBits = ReadInt(dataStr.substr(gaplessDataIndex, 3));
                            frontPadding = gaplessBits >> 12;
                            endPadding = gaplessBits & 0xFFF;

                        }
                        realSamples = paddedSamples - (frontPadding + endPadding);
                    }

                    MP3Header = {
                        frames: frameCount,
                        samples: null,
                        frontPadding: null,
                        endPadding: null,
                        realSamples: null,
                        totalDuration: null,
                        realSampleDuration: null,
                        frontPaddingDuration: null
                    };

                    if(paddedSamples || realSamples || frontPadding) {
                        MP3Header.samples = paddedSamples;
                        MP3Header.frontPadding = frontPadding;
                        MP3Header.endPadding = endPadding;
                        MP3Header.realSamples = realSamples;
                        MP3Header.totalDuration = paddedSamples * secondPerSample;
                        MP3Header.realSampleDuration = realSamples * secondPerSample;
                        MP3Header.frontPaddingDuration = frontPadding * secondPerSample;
                    }
                }

                return {
                    bitRate: bitRate,
                    sampleRate: sampleRate,
                    samplePerFrame: (headerOfVersion === 3 ? 144 : 72) << 3,
                    frameLength: frameLength,
                    duration: frameLength ? (frameLength << 3) / (bitRate * 1000) : 0,
                    header: MP3Header
                };
            }
        }

        return null;
    }

    function concatBuffer(buffer1, buffer2) {
        var newBuffer = new Uint8Array(buffer1.length + buffer2.length);
        newBuffer.set(buffer1, 0);
        newBuffer.set(buffer2, buffer1.length);

        return newBuffer;
    }

    function FrameReader(filepath, onFrame) {
        this._filepath = filepath;
        this._onFrame = onFrame || null;
        this._reader = null;
        this._deferred = buildDeferred();
        this._aborted = false;
        this._filesize = null;
        this._buffer = null;
        this._ended = false;
        this._ID3v2TagEndOffset = null;
        this._startOffset = 0;
        this._endOffset = 0;
        this._frameCount = 0;
        this._lastFrameOffset = 0;
        this._lastSampleRateFrameCount = 0;
        this._lastSamplePerFrame = null;
        this._lastSampleRate = null;
        this._lastSampleRateStartOffset = null;
        this._lastSampleRateEndOffset = null;
        this._loadedMP3Header = false;
        this._frameGroups = [];

        this._totalTime = 0;
        this._totalFrameSize = 0;
        this._lastSampleDuration = 0;
        this._lastBitRate = null;

        this._isVBR = false;
        this._MP3Header = null;

        this._bufferTrackCount = 0;
        this._totalBufferTrackingCount = 0;

        this._run();
    }

    FrameReader.prototype._run = function() {
        var that = this;
        this._reader = new BufferReader(this._filepath, {
            maxBufferSize: MIN_BUFFER_SIZE
        });

        //console.log(13333);
        this._reader.getInitializePromise().then(function(filesize) {
            //console.log(2333, filesize);
            that._filesize = filesize;
            that._reader.read().then(function(data){
                that._onData(data);
            });
        })['catch'](function(e){
            //console.log('err');
            that._deferred.reject(e);
        });
    };

    FrameReader.prototype._reject = function(err) {
        if(!this._ended) {
            this._ended = true;
            this._deferred.reject(err);
        }
    };

    FrameReader.prototype._resolve = function() {
        if(!this.isEnded()) {
            var that = this;
            this._ended = true;
            this._frameGroups = this._frameGroups.filter(function(each, idx){
                if(each && each.frames && each.frames >= MIN_CORRECT_FRAME_COUNT) {
                    return true;
                }
                that._frameCount -= each.frames;

                return false;
            });
            var durationFromFrameGroups = this._frameGroups.reduce(function(obj, current){
                if(current.duration) {
                    obj.duration += current.duration;
                }
                if(current.frames) {
                    obj.frameCount += current.frames;
                }
                obj.streamSize += current.end-current.start;

                return obj;
            }, {
                duration: null,
                streamSize: 0,
                frameCount: 0
            });

            var bitrate = null;
            if(durationFromFrameGroups.duration && durationFromFrameGroups.streamSize) {
                bitrate = Math.round((durationFromFrameGroups.streamSize << 3) / durationFromFrameGroups.duration / 1000);
            }
            this._deferred.resolve({
                fileSize: this._filesize,
                streamSize: durationFromFrameGroups.streamSize,
                duration: durationFromFrameGroups && durationFromFrameGroups.duration || this._totalTime,
                bitrate: bitrate,
                frameCount: durationFromFrameGroups && durationFromFrameGroups.frameCount || frameCount,
                isVBR: this._isVBR,
                frameGroups: this._frameGroups,
                isCorrectFile: this._frameGroups.length === 1
            });
        }
    };

    FrameReader.prototype.abort = function() {
        if(!this.isEnded()) {
            this._aborted = true;
            this._reject(new Error('Aborted.'));
        }
    };

    FrameReader.prototype.isEnded = function() {
        return this._aborted || this._ended;
    };

    FrameReader.prototype.getPromise = function() {
        return this._deferred.promise;
    };

    FrameReader.prototype._onData = function(data) {
        var that = this;
        this._endOffset += data.byteLength;
        if(!this._buffer) {
            this._buffer = data;
        } else {
            this._buffer = concatBuffer(this._buffer, data);
            if(this._buffer.length > MAX_BUFFER_SIZE) {
                var diff = this._buffer.length - MAX_BUFFER_SIZE;
                this._buffer = this._buffer.slice(diff);
                this._startOffset += diff;
            }
        }

        if(this._ID3v2TagEndOffset === null) {
            this._ID3v2TagEndOffset = getID3v2TagLength(data);
            if(this._ID3v2TagEndOffset) {
                this._lastFrameOffset = this._ID3v2TagEndOffset;
            }
            if(this._ID3v2TagEndOffset > this._filesize) {
                this._reject(new Error("MP3 frame was escaped from origin file."));
            }
        }
        if(this._startOffset<this._lastFrameOffset && this._lastFrameOffset+25 < this._endOffset) {
            var tagFrameSizeDiff = this._lastFrameOffset - this._startOffset;
            this._buffer = this._buffer.slice(tagFrameSizeDiff);
            this._startOffset += tagFrameSizeDiff;
        }

        if(!this._ID3v2TagEndOffset || (this._ID3v2TagEndOffset && this._startOffset >= this._ID3v2TagEndOffset)) {
            var headerStartOffset = this._buffer.indexOf(0xFF);
            if(headerStartOffset > -1) {
                if(headerStartOffset > 0) {
                    this._buffer = this._buffer.slice(headerStartOffset);
                    this._startOffset += headerStartOffset;
                    this._lastFrameOffset = this._startOffset;
                }
            } else if(!(this._endOffset === this._filesize || this._endOffset-this._lastFrameOffset <= 128)) {
                return this._reject(new Error('Cannot found mp3 header.'));
            }
        }

        var frameSizeDiff = 0;
        while(this._lastFrameOffset + (this._loadedMP3Header ? 25 : 4096) < this._endOffset){
            var frameData = doFrameStuff(this._buffer.slice(frameSizeDiff, !this._loadedMP3Header ? frameSizeDiff+4096 : frameSizeDiff+4), !this._loadedMP3Header);
            if(frameData) {
                this._loadedMP3Header = true;
                this._frameCount++;
                this._lastSampleRateFrameCount++;
                this._lastSamplePerFrame = frameData.samplePerFrame;
                var thisFrameSize = frameData.frameLength;
                if(this._onFrame) {
                    this._onFrame(frameData, this._lastFrameOffset, this._lastFrameOffset+thisFrameSize, false);
                }
                if(!this._lastSampleRateStartOffset) {
                    this._lastSampleRateStartOffset = this._lastFrameOffset;
                }
                if(!this._lastSampleRateEndOffset) {
                    this._lastSampleRateStartOffset = this._lastFrameOffset;
                }

                this._totalTime += frameData.duration;
                this._lastSampleDuration += frameData.duration;
                this._lastFrameOffset += thisFrameSize;
                this._totalFrameSize += thisFrameSize;
                frameSizeDiff += thisFrameSize;
                this._lastSampleRateEndOffset = this._lastFrameOffset;
                if(!this._isVBR && this._lastSampleRateFrameCount >= MIN_CORRECT_FRAME_COUNT) {
                    if(this._lastBitrate === null) {
                        this._lastBitrate = frameData.bitRate;
                    } else if(this._lastBitrate !== frameData.bitRate) {
                        this._isVBR = true;
                    }
                }
                if(!this._MP3Header) {
                    this._MP3Header = frameData.header;
                }

                if(this._lastSampleRate === null) {
                    this._lastSampleRate = frameData.sampleRate;
                } else if(this._lastSampleRate !== frameData.sampleRate) {
                    this._flush(this._lastFrameOffset-thisFrameSize, this._lastFrameOffset, this._lastSampleRate);
                }

                this._bufferTrackCount = 0;
            } else {
                this._flush();
                if(this._onFrame) {
                    this._onFrame(void 0, this._lastFrameOffset, void 0, void 0);
                }
                if(this._bufferTrackCount++ <= MAX_NEXT_BUFFER_TRACK_THRESHOLD) {
                    var findNextHeader = this._buffer.indexOf(0xFF, frameSizeDiff+1);
                    if(findNextHeader > -1) {
                        this._totalBufferTrackingCount++;
                        var nextHeaderOffsetDiff = findNextHeader-frameSizeDiff;
                        frameSizeDiff = findNextHeader;
                        this._lastFrameOffset += nextHeaderOffsetDiff;
                        continue;
                    }
                }

                return this._resolve();
            }

        }


        if(frameSizeDiff) {
            if(frameSizeDiff > this._buffer.length) {
                this._startOffset += this._buffer.length;
                this._buffer = null;
            } else {
                this._buffer = this._buffer.slice(frameSizeDiff);
                this._startOffset += frameSizeDiff;
            }
        }

        if((this._startOffset<this._ID3v2TagEndOffset+(this._loadedMP3Header ? 25 : 4096) || this._startOffset+MIN_BUFFER_SIZE>= this._endOffset || this._lastFrameOffset>=this._endOffset) && this._endOffset<this._filesize-1) {
            this._reader.read().then(function(data){
                that._onData(data);
            });
        } else {
            this._flush();
            return this._resolve();
        }

    };

    FrameReader.prototype._flush = function(lastOffset, startOffset, sampleRate) {
        var sampleRateStartOffset = this._lastSampleRateStartOffset;
        var sampleRateEndOffset = lastOffset ? lastOffset : this._lastSampleRateEndOffset;
        if(sampleRateStartOffset !== null && sampleRateEndOffset !== null) {
            var calcDuration = null;
            if(this._lastSampleRate && this._lastSampleRateFrameCount && this._MP3Header && this._MP3Header.samplePerFrame) {
                calcDuration = this._lastSampleRateFrameCount * this._MP3Header.samplePerFrame / this._lastSampleRate;
            }
            var duration = calcDuration !== null ? calcDuration : this._lastSampleDuration;
            var bitrate = duration && sampleRateEndOffset ? Math.round(((sampleRateEndOffset-sampleRateStartOffset) << 3) / duration / 1000) : null;
            this._frameGroups.push({
                start: sampleRateStartOffset,
                end: sampleRateEndOffset,
                sampleRate: this._lastSampleRate,
                frames: this._lastSampleRateFrameCount,
                duration: duration,
                bitrate: bitrate,
                header: this._MP3Header
            });
        }
        this._lastSampleRate = sampleRate ? sampleRate : null;
        this._lastSampleRateStartOffset = startOffset ? startOffset : null;
        this._lastSampleRateEndOffset = null;
        this._lastSampleRateFrameCount = 0;
        this._lastSampleDuration = 0;
        this._MP3Header = null;
    };

    return FrameReader;
}();


module.exports = FrameReader;

var MP3FileReader = require('./FrameReader');
    var MP3FrameSplitter = function() {

    var AbortError = new Error("Aborted.");
    var MIN_CORRECT_FRAME_COUNT = 2;

    function determineIsNextOffset(ranges, offset) {
        return !!(ranges && ranges[ranges.length-1].end === offset);
    }

    function getMP3Duration(mp3Header, frameCount) {
        return frameCount * mp3Header.samplePerFrame / mp3Header.sampleRate;
    }

    function isAcceptableFloat(num) {
        var str = num.toString();
        var idx = str.indexOf('.');

        return idx > -1 ? str.split('.')[1].length < 7 : true;
    }

    function MP3FrameSplitter(filepath, config) {
        if(filepath === void 0) {
            throw new Error("filepath must be exists.");
        }
        if(config === void 0) {
            config = {};
        }

        var that = this;
        this._filepath = filepath;
        this._initTimerID = null;
        this._aborted = false;
        this._dataRetreived =false;
        this._reader = null;
        this._hasInitialized = false;
        this._isSettled = false;
        this._fragmentDuration = config.fragmentDuration ? config.fragmentDuration : [2, 3, 10];
        //this._constantInterval = config.constantInterval ? config.constantInterval : true;
        this._allowDifferentSampleRate = config.allowDifferentSampleRate ? config.allowDifferentSampleRate : false;
        this._allowMultipleRanges = config.allowMultipleRanges ? config.allowMultipleRanges : false;
        this.__reject = null;
        this.__resolve = null;

        this._firstMP3Header = null;
        this._lastMP3Header = null;
        this._lastSampleRate = null;
        this._lastTimestampOffset = 0;
        this._lastFrameCount = 0;
        this._fragments = [];
        this._currentFragment = null;
        this._data = null;
        this._errors = [];
        this._promise = new Promise(function(resolve, reject) {
            that.__resolve = resolve;
            that.__reject = reject;
        });
        this._initTimerID = setTimeout(function(){
            that._init();
        }, 0);
    }

    MP3FrameSplitter.prototype._init = function() {
        if(!this._aborted && !this._hasInitialized) {
            var that = this;
            this._initTimerID = null;
            this._hasInitialized = true;
            this._reader = new MP3FileReader(this._filepath, this._onFrame.bind(this));
            this._reader.getPromise().then(function(result){
                that._onFinish(result);
            })['catch'](function(err){
                that._onError(err);
            });
        }
    };

    MP3FrameSplitter.prototype._onFinish = function(data) {
        this._flushFragment();
        this._dataRetreived = true;
        this._data = data;

        this._fragments = this._fragments.filter(function(each, idx){
            return each.frameCount >= MIN_CORRECT_FRAME_COUNT;
        });
        var result = {
            data: data,
            fragments: this._fragments
        };
        this._resolveEmitter(result);

        return result;
    };

    MP3FrameSplitter.prototype._onError = function(error) {
        this._flushFragment();
        this._dataRetreived = true;
        if(!this.isEnded()) {
            this._errors.push(error);
        }
        this._resolveEmitter(this._errors);
        return this._errors;
    };

    MP3FrameSplitter.prototype.getCurrentFragmentDuration = function() {
        var fragLen = this._fragments.length;
        var fragmentDurationLen = this._fragmentDuration.length;
        return this._fragmentDuration[fragLen<fragmentDurationLen ? fragLen : fragmentDurationLen-1];
    };

    MP3FrameSplitter.prototype._flushFragment = function() {
        if(this._currentFragment && this._currentFragment.range) {
            //var duration = Math.floor(getMP3Duration(this._lastMP3Header, this._currentFragment.frameCount));
            var duration = getMP3Duration(this._lastMP3Header || this._firstMP3Header, this._currentFragment.frameCount);
            this._currentFragment.duration = Math.floor(duration * 10000) / 10000;
            this._fragments.push(this._currentFragment);
            this._lastTimestampOffset += duration;
            this._lastFrameCount += this._currentFragment.frameCount;
            this._currentFragment = null;
        }

        if(!this._currentFragment) {
            this._currentFragment = {
                duration: null,
                sampleRate: null,
                frameCount: 0,
                timestampOffset: this._lastMP3Header ? getMP3Duration(this._lastMP3Header || this._firstMP3Header, this._lastFrameCount) : this._lastTimestampOffset,
                range: null
            };
        }
        this._lastMP3Header = null;
        this._lastSampleRate = null;
    };

    MP3FrameSplitter.prototype._onFrame = function(frameData, startOffset, endOffset, isInvalidFrame) {
        if(!frameData || isInvalidFrame || !this._currentFragment) {
            this._flushFragment();
        }
        if(!frameData || isInvalidFrame) {
            return;
        }

        if(!this._lastMP3Header) {
            this._lastMP3Header = frameData;
            if(!this._firstMP3Header) {
                this._firstMP3Header = frameData;
            }
        }

        if(this._lastSampleRate === null) {
            this._lastSampleRate = frameData.sampleRate;
        } else if(this._lastSampleRate !== frameData.sampleRate) {
            //throw new Error('SampleRate cannot be changed.');
            return;
        }

        var currengFragment =this._currentFragment;
        var currentFragmentRange = currengFragment.range;
        if(currentFragmentRange) {
            var durationTmp = getMP3Duration(frameData, currengFragment.frameCount);
            var isFlushed = false;
            if(durationTmp >= this.getCurrentFragmentDuration()) {
                    this._flushFragment();
                    this._lastSampleRate = frameData.sampleRate;
                    currentFragmentRange = void 0;
                    isFlushed = true;
            }

            if(!isFlushed) {
                currentFragmentRange.end = endOffset-1;
            }
        }

        if(!currentFragmentRange) {
            this._currentFragment.sampleRate = frameData.sampleRate;
            currentFragmentRange = {
                start: startOffset,
                end: endOffset
            };
        }
        this._currentFragment.frameCount++;
        this._currentFragment.range = currentFragmentRange;
    };

    MP3FrameSplitter.prototype._resolveEmitter = function(data) {
        if(!this._isSettled) {
            this._isSettled = true;
            this.__resolve(data);
        }
    };

    MP3FrameSplitter.prototype._rejectEmitter = function(err) {
        if(!this._isSettled) {
            this._isSettled = true;
            this.__reject(err || new Error("Rejected."));
        }
    };

    MP3FrameSplitter.prototype.isEnded = function() {
        return !!(this._aborted || this._dataRetreived);
    };

    MP3FrameSplitter.prototype.abort = function() {
        if(!this.isEnded()) {
            this._aborted = true;
            if(!this._hasInitialized) {
                clearTimeout(this._initTimerID);
                this._initTimerID = null;
            } else {
                if(this._reader && !this._reader.isSettled()) {
                    this._reader.abort();
                }
            }

            this._rejectEmitter(AbortError);
        }
    };

    MP3FrameSplitter.prototype.getPromise = function() {
        if(this._aborted) {
            return Promise.reject([AbortError]);
        }
        if(this._isSettled) {
            return this._errors.length ? Promise.reject(this._errors.slice(0)) : Promise.resolve({

            });
        } else {
            return this._promise;
        }
    };

    MP3FrameSplitter.prototype.getError = function() {
        return this._errors;
    };


    return MP3FrameSplitter;

}();

module.exports = MP3FrameSplitter;

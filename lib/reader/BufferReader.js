
var Reader = require("./Reader");
var buildDeferred = require("../buildDeferred");
var fs = require("fs");

var __extend = function() {
    var setProperty = Object.setPrototypeOf || {
            __proto__: []
        } instanceof Array && function(subClass, superClass) {
            subClass.__proto__ = superClass;
        }
        || function(subClass, superClass) {
            for (var key in superClass) {
                superClass.hasOwnProperty(key) && (subClass[key] = superClass[key]);
            }
        };

    return function(subClass, superClass) {
        function fn() {
            this.constructor = subClass;
        }

        setProperty(subClass, superClass);
        if(superClass === null) {
            subClass.prototype = Object.create(superClass);
        } else {
            fn.prototype = superClass.prototype;
            subClass.prototype = new fn;
        }
    };
}();

var BufferReader = function BufferReader() {

    var AbortError = new Error("Aborted");
    var EndedError = new Error("Reader has already ended.");

    function BufferReader(filepath, config) {
        var that = Reader.call(this, config) || this;
        that._filepath = filepath;
        that._filesize = 0;
        that._readable = false;
        that._listeners = [];
        that._removeReadableHandler = null;
        that._removeReadHandler= null;
        that._removeEndedHandler = null;
        that._readDeferred = null;
        that._dataQueue = [];
        that._EventHandler = [
            {
                type: 'readable',
                handler: that._onReadableHandler.bind(this)
            },
            {
                type: 'data',
                handler: that._onDataHandler.bind(this)
            },
            {
                type: 'end',
                handler: that._onEndHandler.bind(this)
            },
            {
                type: 'error',
                handler: that._onErrorHandler.bind(this)
            },
            {
                type: 'finish',
                handler: that._onFinishHandler.bind(this)
            },
            {
                type: 'open',
                handler: that._onOpenHandler.bind(this)
            },
            {
                type: 'close',
                handler: that._onCloseHandler.bind(this)
            }
        ];
        that._readedSize = 0;


    }

    __extend(BufferReader, Reader);

    BufferReader.prototype._init = function() {
        var that = this;
        try {
            fs.stat(this._filepath, function(err, stat) {
                if(!err) {
                    that._filesize = stat.size;
                    that._target = fs.createReadStream( that._filepath , { highWaterMark: that._maxBufferSize} );
                    that._attachEventHandler(that._target);
                    that._readableSubscriber = that.listenToOnce(that.onReadable, function() {
                        that._hasInitialized = true;
                        that._readable = true;
                        that._readableSubscriber = null;
                        that._onInitializeDeferred.resolve(stat.size);
                    });
                    that._removeEndedHandler = that.listenToOnce(that.onEnd, function() {
                        that._ended = true;
                    });
                    that._removeDataHandler = that.onData.subscribe(function(data){
                        that._readedSize += data.length;
                        if(that._readDeferred) {
                            that._readDeferred.resolve(data);
                            that._readDeferred = null;
                        } else {
                            that._dataQueue.push(data);
                        }
                    });
                } else {
                    that._onInitializeDeferred.reject(e);
                }
            });
        } catch(e) {
            this._onInitializeDeferred.reject(e);
        }
    };

    BufferReader.prototype._onReadableHandler = function(event) {
        console.log(">>readable event");
        if(!this.isEnded()) {
            this._onReadable.dispatch(event);
        }
    };

    BufferReader.prototype._onDataHandler = function(event) {
        //console.log(">> ondata event");
        if(!this.isEnded()) {
            this._onData.dispatch(event);
        }
    };

    BufferReader.prototype._onEndHandler = function(event) {
        //console.log(">> end event");
        if(!this.isEnded()) {
            this._onEnd.dispatch(event);
        }
    };

    BufferReader.prototype._onErrorHandler = function(event) {
        if(!this.isEnded()) {
            this._onError.dispatch(event);
        }
    };

    BufferReader.prototype._onFinishHandler = function(event) {
        if(!this.isEnded()) {
            this._onFinish.dispatch(event);
        }
    };

    BufferReader.prototype._onOpenHandler = function(event) {
        if(!this.isEnded()) {
            this._onOpen.dispatch(event);
        }
    };

    BufferReader.prototype._onCloseHandler = function(event) {
        this._onClose.dispatch(event);
    };

    BufferReader.prototype._attachEventHandler = function(readStream) {
        this._EventHandler.forEach(function(EventHandler){
            readStream.on(EventHandler.type, EventHandler.handler);
        })
    };

    BufferReader.prototype.read = function() {
        if(this._dataQueue.length) {
            return Promise.resolve(this._dataQueue.shift());
        }

        if((this._filesize && this._readedSize < this._filesize) ||
            (this._target && this.hasInitialized() && !this.isEnded())
        ) {
            if(this._readDeferred && !this._readDeferred.isSettled()) {
                return Promise.reject(new Error("Previous job is not finished yet."));
            }

            var that = this;
            var deferred = buildDeferred();
            this._readDeferred = deferred;
            var read = function() {
                try {
                    that._removeReadHandler = that.listenToOnce(that.onData, function(data) {
                        deferred.resolve(data);
                        that._readDeferred = null;
                    });

                    that._readable = false;
                    that._target.read();
                    that._readDeferred = null;
                } catch(e) {
                    deferred.reject(e);
                    that._readDeferred = null;
                }

            };

            if(this._readable) {
                read();
            } else {
                this._readableSubscriber = this.listenToOnce(this.onReadable, function() {
                    that._readable = true;
                    if(!that.isEnded()) {
                        read();
                    }
                });
            }

            return deferred.promise;
        }

        return Promise.reject(EndedError);
    };

    BufferReader.prototype.isReadable = function () {
        return this._readable;
    };

    BufferReader.prototype.destruct = function() {
        if(!this._destructed) {
            Reader.call(this);
            if(this._target) {
                if(this._readableSubscriber) {
                    this._readableSubscriber.remove();
                    this._readableSubscriber = null;
                }
                if(this._removeReadHandler) {
                    this._removeReadHandler.remove();
                    this._removeReadHandler = null;
                }
                if(this._removeEndedHandler) {
                    this._removeEndedHandler.remove();
                    this._removeEndedHandler = null;
                }
                if(!this._readDeferred.isSettled()) {
                    this._readDeferred.reject(AbortError);
                }
                if(!this._onInitializeDeferred.isSettled()) {
                    this._onInitializeDeferred.reject(AbortError);
                }
                this._target.destroy();
                this._target = null;
            }
        }
    };

    return BufferReader;
}();

module.exports = BufferReader;


var EventDispatcher = require("../EventDispatcher");
var buildDeferred = require("../buildDeferred");
var MAX_BUFFER_SIZE = 0x01 << 0x11;

var Reader = function Reader() {
    function Reader(config) {
        if(config === void 0) {
            config = {
                maxBufferSize: MAX_BUFFER_SIZE
            };
        }

        var that = this;
        this._target = null;
        this._maxBufferSize = config.maxBufferSize || MAX_BUFFER_SIZE;
        this._destructed = false;
        this._ended = false;
        this._hasStarted = false;
        this._hasInitialized = false;
        this._onInitializeDeferred = buildDeferred();
        this._onFinish = new EventDispatcher;
        this._onData = new EventDispatcher;
        this._onReadable = new EventDispatcher;
        this._onEnd = new EventDispatcher;
        this._onOpen = new EventDispatcher;
        this._onClose = new EventDispatcher;
        this._onError = new EventDispatcher;
        this.onFinish = this._onFinish.getHandle();
        this.onData = this._onData.getHandle();
        this.onReadable = this._onReadable.getHandle();
        this.onEnd = this._onEnd.getHandle();
        this.onClose = this._onClose.getHandle();
        this.onError = this._onError.getHandle();
        this._initTimerID = setTimeout(function() {
            that._initTimerID = null;
            that._init();
        }, 0);
    }

    Reader.prototype._init = function() {
        return null;
    };

    Reader.prototype.read = function() {
        return null;
    };

    Reader.prototype.hasInitialized = function() {
        return this._hasInitialized;
    };

    Reader.prototype.getInitializePromise = function() {
        return this._onInitializeDeferred.promise;
    };

    Reader.prototype.isDestructed = function() {
        return this._destructed;
    };

    Reader.prototype.listenToOnce = function(eventDispatcher, handler) {
        var subscribe = null;
        var callback = function(evt) {
            if(subscribe) {
                subscribe.remove();
                subscribe = null;
            }
            handler(evt);
        };
        subscribe = eventDispatcher.subscribe(callback);

        return subscribe;
    };

    Reader.prototype.isEnded = function() {
        return this._ended || this.isDestructed();
    };

    Reader.prototype.destruct = function() {
        if(!this._destructed) {
            if(this._initTimerID !== null) {
                clearTimeout(this._initTimerID);
                this._initTimerID = null;
            }
            this._destructed = true;
        }
    };

    return Reader;
}();

module.exports = Reader;

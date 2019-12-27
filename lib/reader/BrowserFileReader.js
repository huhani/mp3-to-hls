var Reader = require("./Reader");
var buildDeferred = require("../buildDeferred");

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

var BrowserFileReader = function BrowserFileReader() {
    function BrowserFileReader(file) {
        if(!(file instanceof File)) {
            throw new Error("file parameter must be the instance of the File.");
        }
        if(!('FileReader' in window)) {
            throw new Error("FileReader is not available in this browser.");
        }

        var that = Reader.call(this) || this;
        that._file = file;
        that._aborted = false;
        that._target = new FileReader;
        that._reading = true;
    }

    BrowserFileReader.prototype.abort = function() {
        if(!this._aborted && this._reading && this._target.readyState === 1) {
            this._aborted = true;
            this._target.abort();
            this._onInitializeDeferred.reject(new Error("Aborted"));
        }
    };

    BrowserFileReader.prototype._init = function() {
        var that = this;
        this._reading = true;
        this._target.readAsArrayBuffer(this._file);
        this._target.addEventListener('load', function(evt){
            var data = new Int8Array(evt.target.result);
            that._reading = false;
            that._onInitializeDeferred.resolve(data);
        }, false);
    };


    return BrowserFileReader;

}();

module.exports = BrowserFileReader;

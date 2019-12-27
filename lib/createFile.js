


var CreateFile = function CreateFile() {
    function CreateFile(){

        var that = this;
        this._started = false;
        this._ended = false;
        this._
        this._initTimerID = setTimeout(function(){
            that._started = true;
            that._initTimerID = null;
            that._init();
        }, 0);
    }

    CreateFile.prototype._init = function() {

    };

    CreateFile.prototype._isEnded = function() {

    };

    CreateFile.prototype._isStarted = function() {

    };

    CreateFile.prototype.abort = function() {
        if(this._initTimerID) {
            clearTimeout(this._initTimerID);
            this._initTimerID = null;
        }
    };

    CreateFile.prototype._resolve = function() {

    };

    CreateFile.prototype._reject = function() {

    };

    CreateFile.prototype.getPromise = function() {

    };

    return CreateFile;

}();

module.exports = CreateFile;

var EventDispatcher = function() {
    var ID = 0;
    function EventDispatcher(){
        this._listeners = [];
    }

    EventDispatcher.prototype.getListeners = function() {
        this._listeners = this._listeners.filter(function(subscriber){
            return !subscriber.dead;
        }).sort(function(a, b) {
            return a.priority - b.priority;
        });
        return this._listeners;
    };

    EventDispatcher.prototype.getHandle = function() {
        return {
            subscribe: this.subscribe.bind(this)
        };
    };

    EventDispatcher.prototype.subscribe = function(callback, priority) {
        if(priority === void 0) {
            priority = 20;
        }
        var that = this;
        var subscriber = {
            id: ID++,
            handler: callback,
            priority: priority,
            dead: false
        };
        this._listeners.push(subscriber);
        return {
            remove: function() {
                var idx = that._listeners.indexOf(subscriber);
                if(idx > -1) {
                    that._listeners.splice(idx, 1);
                    subscriber.dead = true;
                }
            }
        };
    };

    EventDispatcher.prototype.dispatch = function(payload) {
        var that = this;
        this.getListeners().forEach(function(listener){
            that._handleCallback(listener.handler, payload);
        });
    };

    EventDispatcher.prototype._handleCallback = function(handler, payload) {
        try {
            handler(payload);
        } catch(error) {
            window.setTimeout(function(){
                throw error;
            }, 0);
        }
    };

    return EventDispatcher;
}();

module.exports = EventDispatcher;


module.exports = EventDispatcher;

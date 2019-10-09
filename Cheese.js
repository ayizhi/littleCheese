var Streams = require('stream');
var inherits = require('util').inherits;

var Transform = Streams.Transform;

function OutputStream() {
    Transform.call(this);
}

inherits(OutputStream, Transform);

OutputStream.prototype._transform = function(chunk, encoding, callback) {
    callback(null, chunk)
}

var DEFAULT_ARRAY_DELAY = 100;
var DEFAULT_FN_DELAY = 0;

function Cheese(stream, transformations) {
    this._stream = stream || null;
    this._stream_ended = false;
    this._outputStream = new OutputStream();
    if(this._stream !== null) this.fromStream(stream);

    this._transformations = transformations || [];
    this._error_transformations = [];
    this._source_name = null;
    this._source_interval = null;
    this._source_interval_delay = null;
    this._source_interval_origin = null;
}

Cheese.prototype.fromStream = function(stream) {
    var self = this;
    this._stream = stream;
    this._source_name = 'stream';
    this._stream.on('data', (d) => self._writeToOutput(d));
    return this;
}

Cheese.prototype.fromFn = function(fn, delay = DEFAULT_FN_DELAY) {
    this._source_name = 'fn';
    this._source_interval_delay = dalay;
    this._source_interval_origin = fn;
    return this;
}

Cheese.prototype.fromArray = function(arr, delay = DEFAULT_ARRAY_DELAY) {
    this._source_name = 'array';
    this._source_interval_delay = delay;
    this._source_interval_origin = arr;
    return this;
}

Cheese.prototype._writeToOutput = function(val) {
    if(!this._stream_ended) {
        if(val !== null) {
            val = val.toString();
        }
        this._outputStream.write(val);
    }
}

Cheese.prototype._execute_filter = function(idx, value, handler, transforms) {
    var self = this;
    transforms[idx](value, (err, resp) => {
        if(!err && !!resp === true) {
            if(transforms.length > idx + 1) {
                self._execute_filter(++idx, value, handler, transforms);
            } else {
                handler(value);
            }  
        }
    })
} 

Cheese.prototype._executer_normal = function(idx, value, handler, transforms) {
    var self = this;
    if(transforms.length === 0) {
        return handler(value)
    }
    var fn = transforms[idx];

    if(fn.length == 2) {
        fn(value, (err, resp) => {
            if(err) {
                return self._execute(0, err, handler, self._error_transformations);
            }
            if(transforms.length > idx + 1) {
                self._execute(++idx, resp, handler, transforms);
            } else {
                handler(resp)
            }
        })
    } else {
        try {
            var resp = fn(value);
            if(transforms.length > idx + 1) {
                self._execute(++idx, resp, handler, transforms);
            } else {
                if(handler) {
                    handler(resp);
                }
            }
        } catch (err) {
            self._execute(0, err, handler, self._error_transformations);
        }
    }
}

Cheese.prototype._execute_reduce = function(idx, value, handler, transforms) {
    var self = this;
    transforms[idx](this._outputStream, value, (resp) => {
        if(transforms.length > idx + 1) {
            self._execute(++idx, resp, handler, transforms);
        } else {
            handler(resp)
        }
    })
}

Cheese.prototype._execute_split = function(idx, value, handler, transforms) {
    var self = this;
    var parts = transforms[idx](value);
    if(transforms.length > idx + 1) {
        self._execute(++idx, parts, handler, transforms);
    } else {
        handler(parts);
    }
}

Cheese.prototype._execute_flatmap = function(idx, value, handler, transforms) {
    var self = this;
    transforms[idx](value, this._error_transformations, (err, resp) => {
        if(err) {
            return self._execute(0, err, handler, self._error_transformations);
        }
        if(transforms.length > idx + 1) {
            self._execute(++idx, resp, handler, transforms);
        } else {
            handler(resp); 
        }
    })
}

Cheese.prototype._execute_take_transform = function(idx, value, handler, transforms) {
    var self = this;
    transforms[idx](this._outputStream, value, (err, resp) => {
        if(err) {
            return self._execute(0, err, handler, self._error_transformations);
        }
        if(transforms.length  > idx + 1) {
            self._execute(++idx, resp, handler, transforms);
        } else {
            handler(resp)
        }
    })
}

Cheese.prototype._execute_debounce_throttle = function(idx, value, handler, transforms) {
    var self = this;
    transforms[idx](this, value, idx, handler, transforms, (newStream) => {
        if(transforms.length > idx + 1) {
            self._execute(++idx, value, handler, transforms);
        } else {
            handler(value);
        }
    })
}

Cheese.prototype._execute = function(idx, value, handler, transforms) {
    var fnType = transforms[idx] ? transforms[idx].__fn_type : null;
    var execs = {
        'filter': this._execute_filter.bind(this),
        'reduce': this._execute_reduce.bind(this),
        'split': this._execute_split.bind(this),
        'take': this._execute_take_transform.bind(this),
        'debounce': this._execute_debounce_throttle.bind(this),
        'throttle': this._execute_debounce_throttle.bind(this),
        'flatMap': this._execute_flatmap.bind(this)
    };

    if(execs[fnType]) {
        execs[fnType](idx, value, handler, transforms);
    } else {
        this._executer_normal(idx, value, handler, transforms);
    }
}

Cheese.prototype.merge = function(newStream) {
    var self = this;
    newStream.on('data', (d) => {
        self._writeToOutput(d);
    })
    return this;
}

Cheese.prototype.each = function(handler) {
    var self = this;
    var index = 0;

    var transforms = this._transformations.map(t => {
        if(t.newInstance) {
            return t.newInstance();
        }
        return t;
    })

    this._outputStream.on('data', d => {
        self._execute(index, d, handler, transforms);
    })

    this._outputStream.on('finish', () => {
        self._endSource();
    })

    if(this._source_name === 'fn' && !this._source_interval) {
        self._source_interval = setInterval(() => {
            self._source_interval_origin((val) => {
                if(val === null) {
                    return self._endSource();
                }
                self._writeToOutput(val);
            })
        }, self._source_interval_delay);
    }

    if(this._source_name === 'array' && !this._source_interval) {
        this._source_interval = setInterval(() => {
            if(self._source_interval_origin.length > 0) {
                self._writeToOutput(self._source_interval_origin.shift());
            } else {
                self._endSource();
            }
        }, this._source_interval_delay);
    }
}

Cheese.prototype._endSource = function() {
    this._stream_ended = true;
    switch(this._source_name) {
        case 'stream':
            this._stream.end();
            break;
        case 'array':
        case 'fn':
            this._outputStream.end();
            clearInterval(this._source_interval);
            break;
    }
};

Cheese.prototype.then = function(fn) {
    this._transformations.push(fn);
    return this;
}

Cheese.prototype.onError = function(fn) {
    var self = this;
    if(this._error_transformations.length === 0 && this._source_name === 'stream') {
        this._stream.on('error', (err) => {
            self._execute(0, err, null, self._error_transformations);
        });
    }
    this._error_transformations.push(fn);
    return this;
}







function map(fn) {
    var _fn = (value, done) => {
        fn(value, done);
    }
    _fn.__fn_type = 'map';
    _fn.newInstance = () => map(fn);
    return _fn;
}

function filter(fn) {
    var _fn = (value, done) => {
        fn(value, done);
    }
    _fn.__fn_type = 'filter';
    _fn.newInstance = () => filter(fn);
    return _fn;
}

function reduce(init, fn) {
    var accu = init;
    var listenerSet = false;
    var _fn = (stream, value, done) => {
        accu = fn(accu, value);
        if(!listenerSet) {
            stream.on('end', () => {
                done(accu);
            });
            listenerSet = true;
        }
    };

    _fn.__fn_type = 'reduce';
    _fn.newInstance = () => reduce(init, fn);
    return _fn;
}

function take(number) {
    var counter = 0;
    var max = number;

    var _fn = (stream, value, done) => {
        counter++;
        if(counter === max) {
            stream.end();
        }
        return done(null, value);
    };

    _fn.__fn_type = 'take';
    _fn.newInstance = () => take(number)
    return _fn;
}

function takeUntil(condition) {
    var _fn = (stream, value, done) => {
        if(condition.length === 1) {
            if(condition(value)) {
                return stream.end();
            }
            return done(null, value);
        } else {
            condition(value, (err, resp) => {
                if(!!resp === true) {
                    return stream.end();
                }
                return done(err, value);
            })
        }
    } 
    _fn.__fn_type = 'take';
    _fn.newInstance = () => takeUntil(condition);
    return _fn;
}

function takeWhile(condition) {
    var _fn = (stream, value, done) => {
        if(condition.length === 1) {
            if(!condition(value)) {
                return stream.end();
            }
            return done(null, value);
        } else {
            condition(value, (err, resp) => {
                if(!!resp === false) {
                    return stream.end();
                }
                return done(err, value)
            })
        }
    }

    _fn.__fn_type = 'take';
    _fn.newInstance = () => takeWhile(condition);
    return _fn
}

function split(separator) {
    var _fn = (value) => value.toString().split(separator || '');
    _fn.__fn_type = 'split';
    _fn.newInstance = () => _fn;
    return _fn;
}

function flatMap(fn) {
    var _fn;
    var observable;
    var newStream = null;

    const setEachEvent = (stream, observable, error_transforms, done) => {
        if(Array.isArray(observable)) {
            stream.fromArray(observable)
        } else if(typeof observable === 'function') {
            stream.fromFn(observable);
        } else if(observable instanceof _streams) {
            stream.fromStream(observable);
        }

        error_transforms.forEach(et => {
            stream.onError(et)
        })

        stream.each(v => done(null, v));
    } 


    if(fn.length == 1) {
        _fn = (value, error_transforms, done) => {
            newStream = new Cheese();
            try {
                observable = fn(value);
            } catch (err) {
                return done(err)
            }
            setEachEvent(newStream, observable, error_transforms, done);
        };
    } else {
        _fn = (value, error_transforms, done) => {
            newStream = new Cheese();
            fn(value, (err, observable) => {
                if(err) {
                    return done(err);
                }
                setEachEvent(newStream, observable, error_transforms, done);
            })
        }
    }

    _fn.__fn_type = 'flatMap';
    _fn.newInstance = () => flatMap(fn);
    return _fn;
}



Cheese.Utils = {};
Cheese.Utils.map = map;
Cheese.Utils.filter = filter;
Cheese.Utils.reduce = reduce;
Cheese.Utils.take = take;
Cheese.Utils.takeUntil = takeUntil;
Cheese.Utils.takeWhile = takeWhile;
Cheese.Utils.split = split;
Cheese.Utils.flatMap = flatMap;

module.exports = Cheese



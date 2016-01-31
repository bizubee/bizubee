(function(){
    "use strict";
    
    const symbols = {
        observer: Symbol('Observer symbol'),
        default: Symbol('Default symbol')
    };
    
    const returnVal = function(val) {
        return val;
    };
    
    const api = {
        symbols,
        async(fn) {
        	return function () {
        		var gen = fn.apply(this, arguments);
        		try {
        			return resolved();
        		} catch (e) {
        			return Promise.reject(e);
        		}
        		function resolved(res) { return next(gen.next(res)); }
        		function rejected(err) { return next(gen.throw(err)); }
        		function next(ret) {
        			var val = ret.value;
        			if (ret.done) {
        				return Promise.resolve(val);
        			} else try {
        				return val.then(resolved, rejected);
        			} catch (_) {
        				throw new Error('Expected Promise/A+');
        			}
        		}
        	}
        },
        getObservableCtrl() {
        	let first = true, promises = [];
        	let onsend, onsendfail;
        	let onnext, onnextfail;
        	let done = function(value) {
        		onsend({
        			done: true,
        			value: value
        		});
        	};
        	let observable = {
        		[symbols.observer] () {
        			return observable;
        		},
        		next(value) {
        			if (first) {
        				if (value !== undefined)
        					throw new Error('First sent value must not exist!');
        
        				let p = new Promise(function(win, fail) {
        					onsend = win;
        					onsendfail = fail;
        				});
        
        				first = false;
        				api.code().then(done);
        
        				return p;
        			} else {
        				let p = new Promise(function(win, fail) {
        					onsend = win;
        					onsendfail = fail;
        				});
        
        				onnext(value);
        
        				return p;
        			}
        		}
        	};
        
        	let api = {
        		send(value) {
        			onsend({
        				value: value,
        				done: false
        			});
        
        			let npromise = new Promise(function(win, fail) {
        				onnext = win;
        				onnextfail = fail;
        			});
        
        			return npromise;
        		},
        		observable: observable
        	};
        
        	return api;
        },
        rest(iterable) {
        	let array = [];
        	for (let val of iterable) {
        		array.push(val);
        	}
        	return array;
        },
        restargs(args, index) {
        	let arr = [];
        	for (let i = index; i < args.length; i++) {
        		arr.push(args[i]);
        	}
        
        	return arr;
        },
        * iter(al) {
        	for (var i = 0; i < al.length; i++) {
        		yield al[i];
        	}
        },
        concat(args) {
        	let argv = [];
        	for (let i = 0; i < args.length; i++) {
        		for (let arg of args[i]) {
        			argv.push(arg);
        		}
        	}
        	
        	return argv;
        },
        last() {
        	if (arguments.length === 0)
        		return;
        	
        	return arguments[arguments.length - 1];
        },
        classify(cls, protoProps, staticProps) {
        	var proto = cls.prototype;
        	for (var key in protoProps) {
        		if (protoProps[key] instanceof Function) {
        			proto[key] = protoProps[key];
        		} else {
        			Object.defineProperty(proto, key, {
        				get: returnVal.bind(null, protoProps[key])
        			});
        		}
        	}
        	
        	for (var key in staticProps) {
        	    cls[key] = staticProps[key];
        	}
        	
        	return cls;
        },
        * keys(obj) {
            for (var key in obj) {
                if (obj.hasOwnProperty(key)) {
                    yield key;
                }    
            }
        }
    }
    
    api[symbols.default] = api;
    
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        let modules = null;
        
        const modcache = new Map();
        
        api.setModules = function(mdls) {
            modules = mdls;
        };
        api.require = function(n) {
            if (n === 0) {
                return api;
            }
            
            if (modules.hasOwnProperty(n)) {
                if (modcache.has(n)) {
                    return modcache.get(n);
                } else {
                    const exports   = {};
                    const modfn     = modules[n];
                    
                    modfn(exports);
                    
                    modcache.set(n, exports);
                    return exports;
                }
            } else {
                throw new Error(`Cannot find module #${n}!`);
            }
        };
        
        return api;
    }
}).apply(this, []);
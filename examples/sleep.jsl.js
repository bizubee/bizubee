(function () {
    'use strict';
    const _bzbSupportLib = function () {
        'use strict';
        const symbols = {
            observer: Symbol('Observer symbol'),
            export: Symbol('Export symbol')
        };
        const returnVal = function (val) {
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
                    function resolved(res) {
                        return next(gen.next(res));
                    }
                    function rejected(err) {
                        return next(gen.throw(err));
                    }
                    function next(ret) {
                        var val = ret.value;
                        if (ret.done) {
                            return Promise.resolve(val);
                        } else
                            try {
                                return val.then(resolved, rejected);
                            } catch (_) {
                                throw new Error('Expected Promise/A+');
                            }
                    }
                };
            },
            getObservableCtrl() {
                let first = true, promises = [];
                let onsend, onsendfail;
                let onnext, onnextfail;
                let done = function (value) {
                    onsend({
                        done: true,
                        value: value
                    });
                };
                let observable = {
                    [symbols.observer]() {
                        return observable;
                    },
                    next(value) {
                        if (first) {
                            if (value !== undefined)
                                throw new Error('First sent value must not exist!');
                            let p = new Promise(function (win, fail) {
                                onsend = win;
                                onsendfail = fail;
                            });
                            first = false;
                            api.code().then(done);
                            return p;
                        } else {
                            let p = new Promise(function (win, fail) {
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
                        let npromise = new Promise(function (win, fail) {
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
            *iter(al) {
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
                        Object.defineProperty(proto, key, { get: returnVal.bind(null, protoProps[key]) });
                    }
                }
                for (var key in staticProps) {
                    cls[key] = staticProps[key];
                }
                return cls;
            }
        };
        if (typeof module !== 'undefined' && module.exports) {
            module.exports = api;
        } else {
            let modules = null;
            const modcache = new Map();
            api.setModules = function (mdls) {
                modules = mdls;
            };
            api.require = function (n) {
                if (modules.hasOwnProperty(n)) {
                    if (modcache.has(n)) {
                        return modcache.get(n);
                    } else {
                        const exports = {};
                        const modfn = modules[n];
                        modfn(exports);
                        modcache.set(n, exports);
                        return exports;
                    }
                } else {
                    throw new Error(`Cannot find module #${ n }!`);
                }
            };
            return api;
        }
    }.apply(this, []);
    _bzbSupportLib.setModules({
        '0': function (_exports) {
            const range = function* (start, end, step) {
                step = step === undefined ? 1 : step;
                let _op;
                while (start !== end) {
                    yield start;
                    start += step;
                }
            };
            _exports.range = range;
            const tuple = function () {
                const args = _bzbSupportLib.restargs(arguments, 0);
                Object.freeze(args);
                return args;
            };
            _exports.tuple = tuple;
            const zip = function* () {
                const args = _bzbSupportLib.restargs(arguments, 0);
                const len = args.length;
                while (true) {
                    let _op1;
                    const vals = new Array(len);
                    let i = 0;
                    while (i < len) {
                        const ctrl = args[i];
                        if (ctrl.done) {
                            return;
                        } else {
                            vals[i] = ctrl.value;
                        }
                        i += 1;
                    }
                    Object.freeze(vals);
                    yield vals;
                }
            };
            _exports.zip = zip;
            const cat = function* () {
                const args = _bzbSupportLib.restargs(arguments, 0);
                for (let _bzbVar of args) {
                    const iter = _bzbVar;
                    yield* iter[Symbol.iterator]();
                }
            };
            _exports.cat = cat;
        }
    });
    {
        const sleep = function (ms) {
                return new Promise(function (win, fail) {
                    setTimeout(win, ms);
                });
            }, ticker = function (n) {
                const _observableController = _bzbSupportLib.getObservableCtrl();
                _observableController.code = _bzbSupportLib.async(function* () {
                    let time = 1000;
                    let passed = 0;
                    for (let _bzbVar1 of range(0, n)) {
                        const i = _bzbVar1;
                        yield sleep(time);
                        passed += time;
                        yield _observableController.send(passed);
                    }
                }).bind(this);
                return _observableController.observable;
            }, main = _bzbSupportLib.async(function* () {
                let pulser = setInterval(function () {
                    console.log('pulse');
                }, 500);
                const _lefthandPlaceholder = ticker(20)[_bzbSupportLib.symbols.observer]();
                while (true) {
                    const _observerController = yield _lefthandPlaceholder.next();
                    if (_observerController.done)
                        break;
                    const passed = _observerController.value;
                    console.log(passed);
                }
                clearInterval(pulser);
            });
        const _imports = _bzbSupportLib.require(0);
        const range = _imports.range;
    }
}());
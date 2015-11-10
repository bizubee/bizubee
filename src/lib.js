
"use strict";

const fs 	    = require('fs');
const vm        = require('vm');
const path 	    = require('path');
const parser   	= require('./parser');
const Module	= require('module');
const cache 	= new Map();


const ext = 'jsl';

exports.extension = ext;

function utilWarn(name) {
	console.warn(
		`Global utility function '${name}' has already been defined!`
		);
}

if (global.keys === undefined) {
	global.keys = function*(obj) {
		for (var key in obj) {
			yield key;
		}
	}
} else {
	utilWarn('keys');
}

const symbols = {};
symbols.export = Symbol('Export Symbol');
symbols.observer = Symbol('Observer Symbol');
exports.symbols = symbols;

// Thanks Anatoly Ressin (Artazor) for letting me steal your code!
exports.async = function (fn) {
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
}

exports.getObservableCtrl = function() {
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
}

exports.rest = function(iter) {
	let array = [];
	for (let val of iter) {
		array.push(val);
	}
	return array;
}

exports.restargs = function(args, index) {
	let arr = [];
	for (let i = index; i < args.length; i++) {
		arr.push(args[i]);
	}

	return arr;
}

exports.iter = function*(al) {
	for (var i = 0; i < al.length; i++) {
		yield al[i];
	}
}

function createContext(filename, ctxt) {
    let ctx = ctxt || {};
   	let mdl = new Module(filename, module);

    for (let key in global) {
    	if (global[key] === global) {
    		ctx[key] = ctx;
    	} else ctx[key] = global[key];
    }
    
    ctx.module = module;
    ctx.main = function() {
    	return 1;
    };
    
    if (filename !== null) {
		filename = path.resolve(filename);
    	let dir = path.dirname(filename);
		let dirs = dir.split(path.sep), paths = [];
		while (true) {
			let pdir = dirs.join(path.sep) || '/';
			let pth = path.resolve(pdir, 'node_modules');
			paths.push(pth);
			
			if (pdir === '/') {
				break;
			} else {
				dirs.pop();
			}
		}


		mdl.paths = paths;
	    ctx.__dirname = dir;
	    ctx.__filename = path.basename(filename);

	    ctx.require = function(mod) {
		    if (mod === 'bizubee lib') {
		    	
		        return exports;
		    }

		    return mdl.require(mod);
		};
    }
    
    return ctx;
}

exports.compileForBrowser = function(path) {
	const abspath = path.resolve(process.cwd(), path);
	
	parser.parseFile(`${abspath}.${ext}`)
}

exports.createContext = createContext;

exports.module = function() {
	return {};
}

function runFileInNewContext(filepath, ctxt) {
    let abspath         = path.resolve(filepath);
	let basename 	    = path.basename(abspath);
	let dirname	        = path.dirname(abspath);
	let compiledName	= `${basename}.${ext}.js`;	    // compiled name of file
	let originalName 	= `${basename}.${ext}`;		// original name of file
	let compiledPath    = `${dirname}/${compiledName}`;
	let originalPath    = `${dirname}/${originalName}`;
	let dirFiles        = new Set(fs.readdirSync(dirname));
    let ctx             = createContext(compiledPath, ctxt);
    
    let js;

    if (dirFiles.has(compiledName)) {
        js  = fs.readFileSync(compiledPath, 'utf8');
    } else {
        if (dirFiles.has(originalName)) {
            let ctrl    = parser.parseFile(originalPath, {});
            
            js          = ctrl.getJSText();
            
            // fs.writeFile(compiledPath, js, 'utf8');
        } else
        	throw new Error('File not found!');
    }
    
    ctx.exports = {};
    vm.runInNewContext(js, ctx, compiledPath);
    return ctx;
}

exports.runFileInNewContext = runFileInNewContext;

// bastardized version of require that works directly with bizubee files
exports.require = function(dirpath, file) {
	let abspath = path.resolve(`${dirpath}/${file}`);	// absolute path

	if (cache.has(abspath)) {
		return cache.get(abspath);
	}

    let ctx = runFileInNewContext(abspath);
    cache.set(abspath, ctx.module.exports);
    
    return ctx.module.exports;
}

// this is used when utilizing and sequences
exports.last = function() {
	if (arguments.length === 0)
		return;
	
	return arguments[arguments.length - 1];
}

exports.concat = function(args) {
	let argv = [];
	for (let i = 0; i < args.length; i++) {
		for (let arg of args[i]) {
			argv.push(arg);
		}
	}
	
	return argv;
}
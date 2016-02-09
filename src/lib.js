
"use strict";

const fs 	    = require('fs');
const vm        = require('vm');
const path 	    = require('path');
const parser   	= require('./parser');
const jsParser	= require('./js-compiler');
const support	= require('./fragments/lib');
const Module	= require('module');
const cache 	= new Map();


const ext = 'jsl';

exports.extension = ext;

// bastardized version of require that works directly with bizubee files
support.require = function(dirpath, file) {
	if (file === 'bizubee lib') {
		return support;
	}
	
	let abspath = path.resolve(`${dirpath}/${file}`);	// absolute path

	if (cache.has(abspath)) {
		return cache.get(abspath);
	}

    let ctx = runFileInNewContext(abspath);
    cache.set(abspath, ctx.exports);
    return ctx.exports;
}

support.module = function() {
	return {};
}

function utilWarn(name) {
	console.warn(
		`Global utility function '${name}' has already been defined!`
		);
}

const symbols = {};
symbols.export = Symbol('Export Symbol');
symbols.observer = Symbol('Observer Symbol');
exports.symbols = symbols;


function createContext(filename, ctxt) {
    let ctx = {};
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
		        return support;
		    }

		    return mdl.require(mod);
		};
    }
    
    if (!!ctxt) {
    	for (var key in ctxt) {
    		ctx[key] = ctxt[key];
    	}
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

function runFileInNewContext(filepath, ctxt, runtime) {

    let abspath         = path.resolve(filepath);
	let dirname	        = path.dirname(abspath);
	let extension		= path.extname(filepath);
	let dirFiles        = new Set(fs.readdirSync(dirname));
    let ctx             = createContext(abspath, ctxt);
    
    let js, jsPath;

	if (extension === '.js') {
		if (dirFiles.has(abspath))
			throw new Error(`File "${abspath}" not found!`);
        let ctrl    = jsParser.parse(abspath, true);
        js          = ctrl.getJSText({exportVar: 'exports'});
        jsPath		= abspath;
	} else {
		let realPath	= `${abspath}.${ext}`;
		if (dirFiles.has(realPath))
			throw new Error(`File "${abspath}" not found!`);
        let ctrl    	= parser.parseFile(realPath, {});
        js          	= ctrl.getJSText();
        jsPath			= `${realPath}.js`;
	}
    
    ctx.exports = {};
    vm.runInNewContext(js, ctx, jsPath);
    return ctx;
}

exports.runFileInNewContext = runFileInNewContext;




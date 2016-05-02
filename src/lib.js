"use strict";

const fs 	    = require('fs');
const vm        = require('vm');
const path 	    = require('path');
const parser   	= require('./parser');
const jsParser	= require('./js-compiler');
const support	= require('./fragments/lib');
const Module	= require('module');
const lookup	= require('./lookup');
const vargen	= require('./vargen');

const cache 	= new Map();

const ext = lookup.extension;

exports.extension = ext;

support.require = function(n) {
	if (cache.has(n)) {
		return cache.get(n);
	} else {
		let fullPath = vargen.globalUnhash(n);
		if (fullPath === 'bizubee lib') {
			return support;
		}

	    let result = runFileInNewContext(fullPath, {}, true);
	    cache.set(n, result.exports);
	    return result.exports;
	}
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
exports.symbols = support.symbols;


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
	    ctx.__filename = filename;

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

function main() {
	// default main function
}

function runStringInNewContext(bizubee, filepath, ctxt, mod) {
    let abspath     = path.resolve(filepath);
    let ctx         = createContext(abspath, ctxt);

    let ctrl    	= parser.parseString(bizubee, {file: filepath});
    let exportVar 	= vargen.nuVar('exports');
    let js          = ctrl.getJSText({exportVar});
    let jsPath		= `${abspath}.js`;
    
    if (mod) ctx[exportVar] = {};
    else ctx[exportVar] = {[exportVar]: main};
    vm.runInNewContext(js, ctx, jsPath);
    return {
    	context: ctx,
    	exports: (mod) ? ctx[exportVar] : undefined,
    	main: (!mod) ? ctx[exportVar][exportVar] || empty : undefined
    }
}

function runFileInNewContext(filepath, ctxt, mod) {

    let abspath         = path.resolve(filepath);
	let dirname	        = path.dirname(abspath);
	let extension		= path.extname(filepath);
	let dirFiles        = new Set(fs.readdirSync(dirname));
    let ctx             = createContext(abspath, ctxt);
    
    let js, jsPath, exportVar;

	if (extension === '.js') {
		if (dirFiles.has(abspath))
			throw new Error(`File "${abspath}" not found!`);
        let ctrl    = jsParser.parse(abspath, true);

        exportVar 	= vargen.nuVar('exports');
        js          = ctrl.getJSText({exportVar});
        jsPath		= abspath;
	} else {
		if (dirFiles.has(abspath))
			throw new Error(`File "${abspath}" not found!`);
        let ctrl    	= parser.parseFile(abspath, {});
        
        exportVar 		= vargen.nuVar('exports');
        js          	= ctrl.getJSText({exportVar});
        jsPath			= `${abspath}.js`;
	}
    
    if (mod) ctx[exportVar] = {};
    else ctx[exportVar] = {[exportVar]: main};
    vm.runInNewContext(js, ctx, jsPath);
    return {
    	context: ctx,
    	exports: (mod) ? ctx[exportVar] : undefined,
    	main: (!mod) ? ctx[exportVar][exportVar] || empty : undefined
    }
}

exports.runStringInNewContext = runStringInNewContext;
exports.runFileInNewContext = runFileInNewContext;




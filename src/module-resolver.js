const path = require('path');

// helps keep track of paths to resolve paths of modules statically
function ModuleResolver(rootfile, file) {
	var c = 0;
	if (file === undefined) file = false;

	const cache = new Set();
	const stack = [];

	var root = rootfile;
	if (file) {
		cache.add(path.resolve(rootfile));
		root = path.dirname(rootfile);
	}

	this.cached = function(addpath) {
		var rootPath = path.resolve(root, ...stack, addpath);
		return cache.has(rootPath);
	}

	this.startModule = function(addpath) {
		const relativeDir 	= path.dirname(addpath);
		const absoluteFile 	= path.resolve(root, ...stack, addpath);
		if (!cache.has(absoluteFile)) {
			cache.add(absoluteFile);
		}

		stack.push(relativeDir);
	}

	this.endModule = function() {
		stack.pop();
	}

	this.path = function(addpath) {
		if (addpath === undefined) {
			return path.resolve(root, ...stack);
		} else {
			return path.resolve(root, ...stack, addpath);
		}
	}

	this.paths = function() {
		return cache[Symbol.iterator]();
	}
}

module.exports = ModuleResolver;

const vargen = require('./vargen');
const path = require('path');
const hashes = new Set();


const BUILTINS = new Set([
	'iteration',
	'async',
	'observation',
	'standard',
	'collections'
]);

module.exports.extension = 'jsl';

module.exports.extensions = new Set([
	'.',
	exports.extension,
	'js'
]);

module.exports.globalHash = (file, change) => {
	const directory = path.dirname(file);
	const fullPath = path.resolve(directory, change);
	return vargen.globalHash(fullPath);
}

module.exports.lookup = (view, route) => {
	const dir = path.dirname(view);
	const ext = path.extname(route).slice(1);

	if (route[0] === '.') {
		if (exports.extensions.has(ext)) {
			return path.resolve(dir, route);			
		} else {
			return path.resolve(dir, `${route}.${exports.extension}`);
		}
	} else {
		if (route === 'bizubee lib') {
			return 'bizubee lib';
		}

		if (BUILTINS.has(route)) {
			return `${__dirname}/included/${route}.js`;
		} else {
			throw new Error(`Package "${route}" not found!`);
		}
	}
}

module.exports.cache = (view, route) => {
	if (route === undefined) {
		var fullPath = view;
	} else {
		var fullPath = exports.lookup(view, route);
	}

	hashes.add(fullPath);
}

module.exports.isCached = (view, route) => {
	if (route === undefined) {
		var fullPath = view;
	} else {
		var fullPath = exports.lookup(view, route);
	}

	return hashes.has(fullPath);
}

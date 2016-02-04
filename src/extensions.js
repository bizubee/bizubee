
const path = require('path');
const lib = require('./lib');

const EXTENSIONS = new Set([
	'js'
]);

module.exports.findAddition = function(filePath) {
	const ext = path.extname(path);
	if (ext.length === 0) {
		return '.' + lib.extension;
	} else if (ext.length === 1) {
		throw new Error('Filename cannot end with period!');
	}

	const end = ext.slice(1);

	if (EXTENSIONS.has(end)) {
		return '';
	} else {
		return '.' + lib.extension;
	}
}

module.exports.toFullPath = function(filePath) {

}
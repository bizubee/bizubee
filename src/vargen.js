
const varset 	= new Set();
const globals	= new Map();
const hashes	= new Map();

var counter = 0;

function nuVar(base) {
	var varname = base;
	do {
		varname = `_${varname}`;
	} while (varset.has(varname));

	return varname;
}

module.exports.forbid = (varname) => {
	varset.add(varname);
}

module.exports.nuVar = nuVar;

module.exports.globalVar = (name) => {
	if (globals.has(name)) {
		return globals.get(name);
	} else {
		const varname = nuVar(name);
		globals.set(name, varname);
		return varname;
	}
}

module.exports.globalHash = (text) => {
	if (hashes.has(text)) {
		return hashes.get(text);
	} else {
		hashes.set(text, counter);
		return counter++;
	}
}
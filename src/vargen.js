
const varset 	= new Set();
const globals	= new Map();
const hashes	= new Map();
const reverser	= new Map();
var counter = 0;

function nuVar(base) {
	base = base || "op";
	var i = 0, varname;
	do {
		varname = `_${base}_${i}`;
		i++;
	} while (varset.has(varname));
	exports.forbid(varname);
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
		reverser.set(counter, text);
		return counter++;
	}
}

module.exports.globalUnhash = (n) => {
	return reverser.get(n);
}
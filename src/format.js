"use strict";

function repeat(str, n) {
	let string = "";
	while (n --> 0) {
		string += str;
	}

	return string;	
}

exports.addSpacing = function(text, n) {
	let an = n - (text + "").length;

	return text + repeat(' ', an);
}

exports.repeat = repeat;
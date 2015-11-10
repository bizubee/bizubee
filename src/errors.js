
"use strict";

const repeat = require('./format').repeat;

class Line {
	constructor(string, tabbing) {
		let array = [];
		let offset = 0;
		for (let c of string) {
			if (c === '\t') {
				let tab = tabbing - offset % tabbing;
				offset += tab;
				array.push(repeat(' ', tab));
			} else {
				offset += 1;
				array.push(c);
			}
		}

		this._tabbed = string.split();
		this._untabbed = array;
	}

	// maps index to a line
	map(index) {
		let mi = 0;
		for (let i = 0; i < index; i++) {
			mi += this._untabbed[i].length;
		}

		return mi;
	}

	unmap(index) {
		let mi = 0;
		for (let i = 0; i < index; i++) {
			mi += this._untabbed[i].length;
			if (mi > index) {
				return i;
			}
		}

		throw new Error('Index out of range!');
	}

	get tabbed() {
		return this._tabbed.join('');
	}

	get untabbed() {
		return this._untabbed.join('');
	}
}

class Lines {
	constructor(csrc, tabbing) {
		this._csrc = csrc;
		this.tabbing = tabbing;
	}

	* [Symbol.iterator] () {
		let i = 0, line = "";
		for (let c of this._csrc) {
			if (c === '\n') {
				yield new Line(line, this.tabbing);
				line = "";
			} else {
				line += c;
			}
		}

		yield new Line(line, this.tabbing);
	}
}

exports.Line = Line;
exports.Lines = Lines;
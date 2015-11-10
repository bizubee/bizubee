
"use strict";

const fs = require('fs');

class CharSource {
	[Symbol.iterator] () {
		var i = 0;
		return {
			next: function() {
				let c = this.get(i++);
				return {
					done: (c === null || c === undefined),
					value: c
				};
			}.bind(this)
		}		
	}

	get() {
		throw new Error("'get' method must be implemented on all CharSource inheritors!");
	}
}

exports.FileSource = class extends CharSource {
	constructor(path) {
		super();

		var fd = fs.openSync(path, 'r');
		var stats = fs.fstatSync(fd);
		this._fd 		= fd;
		this._buff 		= new Buffer(stats.size);
		this._progress 	= 0;
	}

	get(i) {
		if (i < this._buff.length) {
			while (this._progress <= i) {
				let pos = this._progress;
				let read = fs.readSync(this._fd, this._buff, pos, 1, pos);
				if (read) {
					this._progress += read;
				} else {
					throw new Error('No bytes read!');
				}
			}

			if (this._progres === this._buff.length) {
				fs.close(this._fd);
			}

			return String.fromCharCode(this._buff[i]);
		} else {
			return null;
		}
	}
}

exports.StdinSource = class extends CharSource {

}

exports.StringSource = class extends CharSource {
	constructor(string) {
		super();

		this._length = string.length;
		this._string = string;
	}

	get(i) {
		if (i < this._length) {
			return this._string[i];
		} else {
			return null;
		}
	}
}
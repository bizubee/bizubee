"use strict";

const fs 		= require('fs');
const co 		= require('co');
const cc 		= require('cli-color');
const Pipeline	= require('lazy-iterator');
const bz 		= require('./src/parser');
const blib 		= require('./src/lib');

const pad = function(str, len) {
	str = str + "";
	if (str.length > len) {
		throw new Error('Original string cannot be longer than target!');
	} else {
		while (str.length < len) {
			str += ' ';
		}

		return str;
	}
}

const FUN_DIR = `test/function`;

let CURRENT_CODE;

let tests = [];
// get array of test files
const testFiles = new Set(fs.readdirSync('test/function/'));
const pipeline = new Pipeline();


let nullOut = {
	log: function() {

	}
};

function abstractName(bzFname) {
	return bzFname.substring(0, bzFname.length - 4);
}


function TestKit(ctrl, promise) {
	this.eq = function(a, b, msg) {
		if (a !== b) {
			ctrl.fail({
				message: msg,
				index: ctrl.index
			});
			return false;
		} else return true;
	}

	this.arrayEq = function(a1, a2, msg) {
		if (a1.length === a2.length) {
			for (let i = 0; i < a1.length; i++) {
				let truth = this.eq(a1[i], a2[i], msg);
				if (!truth) return false;
			}

			return true;
		} else {
			ctrl.fail({
				message: msg,
				index: ctrl.index
			});
		}
	}

	this.neq = function(a, b, msg) {
		if (a === b) {
			ctrl.fail({
				message: msg,
				index: ctrl.index
			});
			return false;
		} else return true;
	}

	this.throws = function(fn, msg) {
		try {
			fn();
			ctrl.fail({
				message: msg,
				index: ctrl.index
			});
			return false;
		} catch (e) {
			return true;
		}
	}

	this.assert = function(expr, msg) {
		if (!expr)
			ctrl.fail({
				message: msg,
				index: ctrl.index
			});
	}

	this.done = function(msg) {
		ctrl.win({
			message: msg,
			index: ctrl.index
		});
	}
	
	this.fail = function(msg) {
		ctrl.fail({
			message: msg,
			index: ctrl.index
		});
	}
	
	this.isInstance = function(obj, ctor, msg) {
		return this.assert(obj instanceof ctor, msg);
	}
}

const myGlobal = {
	test(title, fn) {
		let promise = new Promise(function(win, fail) {
			let ctrl = {
				win: win,
				fail: fail,
				index: tests.length
			};
	
			fn(new TestKit(ctrl));
		});
	
		pipeline.send({
			promise: promise,
			title: title
		});
	}
};

co(function*(){
	let i = 0, passed = 0, failed = 0;
	console.log(`failed (${cc.red('*')}), passed (${cc.green('*')}):\n`)

	console.log(`test   ${pad("", 50)}\tresult`)
	console.log()
	while (true) {
		const ctrl = yield pipeline.next();
		const test = ctrl.value;
		
		try {
			let res = yield test.promise;

			console.log(`${pad(i + 1, 5)}: ${pad(test.title, 50)}\t${cc.green('*')}`);

			passed++;
		} catch (res) {

			console.log(`${pad(i + 1, 5)}: ${pad(test.title, 50)}\t${cc.red('*')}`);

			failed++;
		}

		i++;
	}
});

co(function*() {
	for (let testFile of testFiles) {
		let relativePath = `test/function/${testFile}`;
	
		if (!testFile.endsWith('.jsl')) {
			continue;
		}
	
		let ctrl = bz.parseFile(relativePath, {
			output: console,
			throwSyntax: true
		});
	
		blib.runFileInNewContext(
			`${__dirname}/${abstractName(relativePath)}`,
			myGlobal
			);
		
		yield Promise.resolve();
	}
	
	pipeline.close();
});
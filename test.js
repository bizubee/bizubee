"use strict";

const fs 		= require('fs');
const co 		= require('co');
const cc 		= require('cli-color');
const Pipeline	= require('lazy-iterator');
const bz 		= require('./src/parser');
const lex 		= require('./src/lexer');
const sources	= require('./src/source');
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


const descriptionTable = [
	'Lexing error',
	'Bizubee AST build error',
	'JS AST generation error',
	'JS code generation error',
	'Runtime error'
];

const PADDING = 60;

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


function TestKit(ctrl, promise) {
	this.eq = function(a, b, msg) {
		if (a !== b) {
			ctrl.fail();
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
			ctrl.fail();
		}
	}

	this.neq = function(a, b, msg) {
		if (a === b) {
			ctrl.fail();
			return false;
		} else return true;
	}

	this.throws = function(fn, msg) {
		try {
			fn();
			ctrl.fail();
			return false;
		} catch (e) {
			return true;
		}
	}

	this.assert = function(expr, msg) {
		if (!expr)
			ctrl.fail();
	}

	this.done = function(msg) {
		ctrl.win();
	}
	
	this.fail = function(msg) {
		ctrl.fail();
	}
	
	this.isInstance = function(obj, ctor, msg) {
		return this.assert(obj instanceof ctor, msg);
	}

	this.throwError = () => {
	    var t = null;
	    return t.noprop.noprop;
	}

	this.dontThrowError = () => {
	    return 5;
	}

	this.observableFromArray = (arr) => {
		var observable = {};
		observable[blib.symbols.observer] = () => {
			var i = 0;
			return {
				next() {
					if (i < arr.length) {
						i++;
						return Promise.resolve({
							value: arr[i - 1],
							done: false
						});
					} else {
						return Promise.resolve({
							value: null,
							done: true
						});
					}
				},
				[blib.symbols.observer] () {
					return this;
				}
			}
		};

		return observable;
	}

	this.is = function(value, target) {
		return typeof value === target;
	}
}

const startRgx =
	/^test\( *('.*'), \([$a-zA-Z][$a-zA-Z0-9]*\) *-> *~? *{ *\n?$/;

function* getLines(file) {
	var csrc = new sources.FileSource(file);
	var line = "", i = 0;
	while (true) {
		const c = csrc.get(i);
		if (c === null) {
			yield line;
			return;
		}

		line += c;

		if (c === '\n') {
			yield line;
			line = "";
		}

		i++;
	}
}

function* getTests(file) {
	var test = null, name = null;
	for (var string of getLines(file)) {
		if (string[0] === 't') {
			const match = startRgx.exec(string);
			if (match !== null) {
				if (name !== null && test !== null ) {
					yield [name, `\n${test}`];
				}

				name = eval(match[1]);
				test = string;
				continue;
			}
		}

		if (test !== null) {
			test += string;
		}
	}

	if (name !== null && test !== null ) {
		yield [name, `\n${test}`];
	}
}


const discard = (el) => {
	// do nothing
}

const runTests = co.wrap(function*({name, source, path}) {
	var promise;
	var passed = 0;
	const globalContext = {
		test(title, fn) {
			promise = new Promise(function(win, fail) {
				let ctrl = {
					win: win,
					fail: fail,
					index: tests.length
				};
		
				fn(new TestKit(ctrl));
			});
		}
	};

	// compiler able to tokenize
	try {
		const csrc = new sources.StringSource(source);
		for (var token of lex.parseCharSrc(csrc)) {
			// do nothing
		}
		passed += 1;
	} catch (e) {
		return passed;
	}


	const ctrl = bz.parseString(source, {
		file: path,
		output: console,
		throwSyntax: true
	});

	// compiler able to generate bizubee ast
	try {
		discard(ctrl.tree);
		passed += 1;
	} catch (e) {
		return passed;
	}

	// compiler able to generate JS AST
	try {
		ctrl.getJSTree();
		passed += 1;
	} catch (e) {
		return passed;
	}

	// compiler able to generate JS code
	try {
		ctrl.getJSText();
		passed += 1;
	} catch (e) {
		return passed;
	}

	// unexpected runtime error(s)
	try {
		blib.runStringInNewContext(
			source,
			path,
			globalContext
			);
		try {
			yield promise;
			passed += 1;
		} catch (e) {
			return passed;
		}
	} catch(e) {
		return passed;
	}

	return passed;
});

co(function*(){
	let i = 0, passed = 0, failed = 0;
	console.log(`failed (${cc.red('*')}), passed (${cc.green('*')}):\n`);

	console.log(`test   ${pad("", PADDING)}\tresult`);
	console.log();
	while (true) {
		const ctrl = yield pipeline.next();
		if (ctrl.done)
			break;
		
		const test = ctrl.value;
		const res = yield test.promise;
		const max = 5;
		var status = "";
		for (let i = 0; i < max; i++) {
			if (i < res)
				status += cc.green('*');
			else
				status += cc.red('*');
		}

		if (res === max)
			console.log(`${pad(i + 1, 5)}: ${pad(test.title, PADDING)}\t${status}`);
		else {
			const msg = descriptionTable[res];
			const str = `${pad(i + 1, 5)}: ${pad(test.title, PADDING)}\t${status}`;
			console.log(`${cc.bgWhite(str)}${cc.bgWhite('\t' + msg + '\t')}`);
		}
		if (res === max)
			passed++;
		else
			failed++;

		i++;
	}
	
	console.log();
	if (passed === i) {
		console.log(`Passed all ${i} tests, congratulations!!!`)
	} else {
		console.log(`Failed ${failed} of ${i} tests, sorry! :(`)
	}
});

co(function*() {
	for (let testFile of testFiles) {
		let relativePath = `test/function/${testFile}`;
		if (!testFile.endsWith('.bz')) {
			continue;
		}

		for (var [name, source] of getTests(relativePath)) {
			pipeline.send({
				title: name,
				promise: runTests({
					name,
					source,
					path: relativePath
				})
			});

			yield Promise.resolve();
		}
	}
	
	pipeline.close();
});
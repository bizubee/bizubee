"use strict";

// javascript keywords
const JS_KW = new Set([
	"break",
	"case",
	"class",
	"catch",
	"const",
	"continue",
	"debugger",
	"default",
	"delete",
	"do",
	"else",
	"export",
	"extends",
	"finally",
	"for",
	"function",
	"if",
	"import",
	"in",
	"instanceof",
	"let",
	"new",
	"return",
	"super",
	"switch",
	"this",
	"throw",
	"try",
	"typeof",
	"var",
	"void",
	"while",
	"with",
	"yield"
]);

// bizubee keywords
const JSL_KW = new Set([
	"on",
	"await",
	"is",
	"isnt",
	"not",
	"from",
	"pass",
	"as",
	"then"
]);

// patterns to match for a beginning or complete token
// for every string put in the first match is returned
const total = [
	{
		pattern: /./,
		tag: 'PATH',
		final: true,
		test: function(value, trail){
			if (trail.length < 2) 	return false;
			if (value === '\n') 	return false;

			let i = 1, pattern = ['FROM', 'WHITESPACE'];
			while (true) {
				let poffset = pattern.length - i, toffset = trail.length - i;
				if (poffset < 0) {
					return true;
				}

				if (pattern[poffset] !== trail[toffset]) {
					return false;
				}

				i++;
			}
		},
		fetch: function(cursor) {
			var rec = cursor.recorder();
			while (!cursor.end()) {
				let c = cursor.next();
				if (c === '\n') {
					cursor.back();
					this.value += rec.done();
					return;
				} 
			}

			this.value += rec.done();
		}
	},
	{
		pattern: "'",
		tag: 'RAW_STRING',
		fetch: function(cursor) {
			let escape = false;
			this.value = "'";
			while (!cursor.end()) {
				let c = cursor.next();

				this.value += c;

				if (c === "'" && !escape)
					return;
				
				if (escape)
					escape = false;
				if (c === '\\')
					escape = true;

			}

			throw new Error('Unexpected EOF!');
		}
	},
	{
		pattern: '"',
		tag: 'RICH_STRING',
		fetch: function(cursor) {
			var
			escape 	= false,
			seend 	= false,
			part 	= "",
			parts 	= [],
			istress = 0,
			rec 	= cursor.recorder();

			while (!cursor.end()) {
				let c = cursor.next();
				if (escape) {
					escape = false;
				} else {
					if (c === '"') {
						parts.push(part);
						this.value += rec.done();
						this.subtokens = parts;
						return;
					}

					if (c === '$') {
						seend = true;
						continue;
					}

					if (seend) {
						seend = false;
						if (c === '{') {
							let tokens = getInterpolationTokens(cursor);
							parts.push(part);
							parts.push(tokens);
							part = "";
							continue;
						} else {
							part += '$';
						}
					}

					if (c === '\\') {
						escape = true;
						seend = false;
					}
				}

				part += c;
			}

			throw new Error("Unexpected EOF!");
		}
	},
	{
		pattern: '#',
		tag: 'END_COMMENT',
		fetch: function(cursor) {
			var rec = cursor.recorder();
			while (!cursor.end()) {
				let c = cursor.next();
				if (c === '\n') {
					cursor.back();
					this.value += rec.done();
					return;
				}
			}

			this.value += rec.done();
		}
	},
	{
		pattern: /[\(|\)]/
	},
	{
		pattern: /[\[|\]]/
	},
	{
		pattern: /[\{|\}]/
	},
	{
		pattern: /[\t ]+/,
		tag: 'WHITESPACE'
	},
	{
		pattern: /([\t ]*\n[\t ]*)+/,
		tag: 'ENDLN'
	},
	{
		pattern: /[0-9]+/,
		tag: 'INT'
	},
	{
		pattern: /[0-9]*\.[0-9]+([eE][\-\+]?[0-9]+)/,
		tag: 'FLOAT'
	},
	{
		pattern: /0o[01234567]+/,
		tag: 'BASE8'
	},
	{
		pattern: /0b[01]+/,
		tag: 'BINARY'
	},
	{
		pattern: /0x[A-f0-9]/,
		tag: 'HEX'
	},
	{
		pattern: /[\$A-Za-z_][\$\w]*/,
		tag: 'NAME',
		test: function(string, trail) {
			return !(JS_KW.has(string) || JSL_KW.has(string));
		}
	},
	{
		pattern: /[\$A-Za-z_][\$\w]*/,
		tag: function(value) {
			return value.toUpperCase();
		},
		test: function(string, trail) {
			return (JS_KW.has(string) || JSL_KW.has(string));
		}

	},
	{
		pattern: "->",
		tag: 'UB_FUNC'
	},
	{
		pattern: "=>",
		tag: 'B_FUNC'
	},
	{
		pattern: "~*",
		tag: 'FUNC_TYPE_AGEN'
	},
	{
		pattern: "|.",
		tag: 'CASCADE'
	},
	{
		pattern: ".",
		tag: 'ACCESS'
	},
	{
		pattern: /=|\+=|-=|\*=|\/=|\/\/=|%=|\^=/,
		tag: 'ASSIGN'
	},
	{
		pattern: '..',
		tag: 'SPLAT'
	},
	{
		pattern: 'yield*',
		tag: 'YIELD_FROM'
	},
	{pattern: ':'},
	{pattern: ','},
	{pattern: "*"},
	{pattern: "~"},
	{pattern: "&"},
	{pattern: "+"},
	{pattern: "-"},
	{pattern: "%"},
	{pattern: "/"},
	{pattern: "//"},
	{pattern: "^"},
	{pattern: "==", tag: 'COMPARE'},
	{pattern: "!=", tag: 'COMPARE'},
	{pattern: ">=", tag: 'COMPARE'},
	{pattern: "<=", tag: 'COMPARE'},
	{pattern: ">", tag: 'COMPARE'},
	{pattern: "<", tag: 'COMPARE'},
	{pattern: "@"},
	{pattern: '--'},
	{pattern: '++'}
];


function Cursor(csrc) {
	var i = 0, apis = new Set();
	var x = 0, lines = [];
	var buffered = false, cbuff = [];
	var that = this;

	function getc(index) {
		let c = csrc.get(index);
		if (c === null) {
			throw new Error('Index out of range!');
		} else return c;
	}

	function add(c) {
		for (var api of apis) {
			api.add(c);
		}
	}

	function remove() {
		for (var api of apis) {
			api.remove();
		}
	}

	this.recorder = function() {
		var chars = [];

		var api = {
			add: function(c) {
				chars.push(c);
			},
			remove: function() {
				chars.pop();
			}
		};

		apis.add(api);

		return {
			done: function() {
				apis.delete(api);
				return chars.join("");
			}
		}
	}

	this.next = function() {
		var c = getc(i);
		this.forward(true);
		return c;
	}

	this.back = function() {
		this.backward(true);
		return getc(i);
	}

	this.forward = function(record) {
		var c = getc(i++);
		if (c === '\n') {
			lines.push(x);
			x = 0;
		} else {
			x++;
		}

		if (record) add(c);
	}

	this.backward = function(record) {
		var c = getc(--i);
		if (c === '\n') {
			x = lines.pop();
		} else {
			x--;
		}
		if (record) remove();
	}

	this.end = function() {
		return csrc.get(i) === null;
	}

	this.position = function() {
		return [x, lines.length];
	}
}

function keywordType(token) {
	if (token.tag === token.value.toUpperCase()) {
		if (JSL_KW.has(token.value))
			return 'jsl';
		if (JS_KW.has(token.value))
			return 'js';
	}
	
	return null;
}

function Token(value, tag, pos) {
	this.position = pos || [null, null];
	this.begin = false;
	this.value = value;
	this.tag = tag || value;
	this.rule = null;
	this.getPosition = function() {
	    var
	    x = this.position[0],
	    y = this.position[1];
	    for(let i = 0; i < value.length; i++) {
	        let c = value[i];
	        if (c === '\n') {
	            x = 0;
	            y++;
	        } else {
	            x++;
	        }
	    }
	    
	    return {
            first_column: this.position[0],
            first_line: this.position[1],
            last_column: x,
            last_line: y
	    }
	}
}

Token.prototype.fetch = function(cursor) {
	return this.rule.fetch.apply(this, [cursor]);
}

function getInterpolationTokens(cursor) {
	var tokens = [], indent = 0;
	for (let token of getRawTokens(cursor)) {
		if (token.tag === 'EOF') {
			throw new Error("Unexpected EOF!!!");
		}

		if (token.tag === '{')  {
			indent++;
		}

		if (token.tag === '}') {
			if (indent === 0) {
				return tokens;
			} else {
				indent--;
			}
		}

		tokens.push(token);
	}
}

function* getTokensFromCursor(cursor) {
	var
	pos         = [0, 0],
	match 		= null,
	prevmatch 	= null,
	threshold 	= 3,
	stress 		= 0,
	trail		= [],
	token 		= "";

	while (!cursor.end()) {
		let
		c = cursor.next(),
		ended = cursor.end();

		token += c;

		match = findMatch(token, trail, prevmatch);

		if (ended) {
			if (match) { // last token to be generated
			    match.position = pos;
				trail.push(match.tag);
				yield match;
				break;
			} else if (prevmatch === null) {
				throw new Error("No tokens found!");
			}
		}

		if (match === null) {
			if (prevmatch !== null) {
				stress++;
				if (stress === threshold || ended){
					while (stress > 0) {
						cursor.back();
						stress--;
					}
                    
					if (prevmatch.begin)
						prevmatch.fetch(cursor);
					
					prevmatch.position = pos;
                    pos = cursor.position();
					
					trail.push(prevmatch.tag);
					yield prevmatch;
                    
					prevmatch = null;
					token = "";
				}
			}
		} else {
			stress = 0;
			prevmatch = match;
		}
	}
}

function hardmatch(reggie, string) {
	var match = string.match(reggie);
	return match !== null && string === match[0];
}

function findMatch(text, trail, prev) {
	if (prev !== null && prev.rule.final)
		return null;

	for (var i = 0; i < total.length; i++) {
		let rule = total[i];
		if (rule.pattern instanceof RegExp) {
			if (!hardmatch(rule.pattern, text))
				continue;
		} else {
			if (rule.pattern !== text)
				continue;
		}

		if ('test' in rule) {
			if (!rule.test(text, trail, prev))
				continue;
		}

		let token;
		if ('fetch' in rule) {
			token = new Token(text, rule.tag);
			token.begin = true;
			token.rule = rule;
			return token;
		} else {
			if ('tag' in rule) {
				if (rule.tag instanceof Function) {
					token = new Token(text, rule.tag(text))
				} else {
					token = new Token(text, rule.tag);					
				}
			} else {
				token = new Token(text);
			}

			token.rule = rule;
		}
	
		if ('process' in rule) {
			rule.process(token);
		}

		return token;
	}

	return null;
}

function getTokensFromSource(csrc) {
	var cursor = new Cursor(csrc);
	return getTokensFromCursor(cursor);
}

exports.keywordType = keywordType;
exports.Token = Token;
exports.getTokensFromSource = getTokensFromSource;
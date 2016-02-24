"use strict";

var fs 			= require('fs');
var vm			= require('vm');
var path		= require('path');
var escodegen	= require('escodegen');
var esvalid		= require('esvalid');
var parser 		= require('./generated-parser');
var lexer 		= require('./lexer');
var sources		= require('./source');
var nodes 		= require('./bz-nodes');

function control(tokens, parameters) {
	let psr = getParser();
	let tree = null;
	let jstree = null;
	return {
		get tree() {
			if (tree === null) {
				tree = psr.parse(tokens, parameters.source, parameters.file);
				tree.parameters = parameters;
			}
			
			return tree;
		},
		getJSTree(o) {
			return (jstree || (jstree = this.tree.toJS(o || {})));
		},
		getJSText(o) {
			const parsed = this.getJSTree(o);
			return escodegen.generate(parsed);
		},
		getMap(targetFile) {
			const parsed = this.getJSTree();
			const dir = path.relative(
				path.dirname(targetFile),
				path.dirname(tree.parameters.rootfile)
				);
			return escodegen.generate(parsed, {
				sourceMap: true,
				sourceMapRoot: dir
			});
		},
		get api() {
			return this.tree.api;
		}
	}
}

{
	let gkey = Symbol('generator');
	parser.Parser.prototype.lexer = {
		lex: function() {
			var next = this[gkey].next();
			if (next.done) {
				return null;
			} else {
				let token		= next.value;
				let position 	= token.getPosition();
				this.yytext 	= token;
			    this.yyloc 		= position;
			    this.yylloc 	= position;
			    this.yylineno 	= position.first_line;
				return token.tag;
			}
		},
		setInput: function(tokens, csrc, file) {
			this.source = csrc;
			this.filename = file;
			this[gkey] = tokens;
		},
		upcomingInput: function() {
		    return null;
		}
	};
}


function getParser() {
	let psr = new parser.Parser();
	psr.yy = nodes;
	return psr;
}


exports.parseFile = function(path, parameters) {
	let csrc = new sources.FileSource(path);
	parameters.file = path;
	return exports.parseCharSrc(csrc, parameters);
}


exports.parseString = function(string, parameters) {
	let csrc = new sources.StringSource(string);
	return exports.parseCharSrc(csrc, parameters);
}


exports.parseCharSrc = function(csrc, parameters) {
	let gen = lexer.parseCharSrc(csrc);
	parameters.source = csrc;
	return control(gen, parameters);
}


exports.parseRawTokens = function(tokens, parameters) {
	let gen = lexer.refineTokens(tokens[Symbol.iterator]());
	return control(gen, parameters);
}


exports.parseTokens = function(tokens, parameters) {
	return control(tokens, parameters);
}
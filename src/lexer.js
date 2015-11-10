"use strict";

const scanner 		= require("./scanner");
const collectibles 	= require("./collectibles");
const filters = [];

function pgen(gen) {
	if (gen instanceof collectibles.PeekableGenerator) {
		return gen;
	} else {
		return new collectibles.PeekableGenerator(gen);
	}
}

const symmetric = {
	'{':'}',
	'[':']',
	'(':')'
};

const reverseSymetric = {};
for (let key in symmetric) {
	reverseSymetric[symmetric[key]] = key;
}

function virtualAfter(token, tag) {
	tag = tag || token.tag;
	let pos = token.getPosition();
	return new scanner.Token('', tag, [
		pos.last_column,
		pos.last_line
	]);
}

function virtualBefore(token, tag) {
	tag = tag || token.tag;
	return new scanner.Token('', tag, token.position);
}

function getIndent(token) {
	let i = token.value.length;
	let tabbing = 0;
	while (i --> 0) {
		if (token.value[i] === '\n') {
			return tabbing;
		} else {
			tabbing++;
		}
	}
} 

function* getEnd(gen, begin) {
	gen = pgen(gen);
	var end = symmetric[begin];
	var indent = 0, arrr = [];
	for (var token of gen) {
		arrr.push(`${token.tag}:${token.value}`);
		if (token.tag === end) {
			if (indent === 0) {
				return token;
			}
			else indent--;
		}

		if (token.tag === begin) {
			indent++;
		}

		yield token;
	}

	throw new Error('No end token found');
}


function* getIndentEnd(gen, token) {
	gen = pgen(gen);
	let
	skipyield = false,
	indent = getIndent(token);

	for (let token of gen) {
		let tag = token.tag;
		if (tag in symmetric) {
			yield token;
			let end = yield* getEnd(gen, tag);
			yield end;
			skipyield = true;
		}
		
		if (!skipyield)
			yield token;
		else
			skipyield = false;
		
		let lookahead = gen.peek();
		if (!lookahead.value)
			throw new Error('This should not happen!');
		else {
			let future = lookahead.value;
			if (future.tag in reverseSymetric) {
				return future;
			}
			
			if (future.tag === 'ENDLN' && getIndent(future) < indent) {
				return future;
			}
			
			if (future.tag === 'BLOCK_RIGHT') {
				return future;				
			}
			
			if (future.tag === 'EOF') {
				return future;
			}
		}
	}
	
	throw new Error('No end of indentation found');
}

function nextValue(iterator) {
	var ctrl = iterator.next();
	
	if (ctrl.done) return null;
	else return ctrl.value;
}

function endlnFilterFactory(before, after) {
	function* filterWhitespaceAfter(gen) {
		gen = pgen(gen);
		var filter = false;
		for (let token of gen) {
			if (filter) {
				filter = false;
				if (token.tag === 'ENDLN') continue;
			}

			if (after.has(token.tag)) {
				filter = true;
			}

			yield token;
		}
	}

	// filter whitespace
	return function* (gen) {
		gen = pgen(gen);
		var seenendln = false, endln;

		for (let token of filterWhitespaceAfter(gen)) {
			if (token.tag === 'ENDLN') {
				seenendln = true;
				endln = token;
				continue;
			}

			if (seenendln && !before.has(token.tag)) {
				yield endln;
			}

			seenendln = false;
			yield token;
		}
	}
}




filters.push(function* (gen) {
	gen = pgen(gen);
	for (var token of gen) {
		if (token.tag === 'WHITESPACE') continue;
		if (token.tag === 'END_COMMENT') continue;
		
		yield token;
	}
	
	yield virtualAfter(token, 'EOF');
});

{
	const after = new Set([
		'ASSIGN',
		'ACCESS',
		'CONST',
		'VAR',
		'STATIC',
		',',
		'[',
		'(',
		'{'
	]);
	
	const before = new Set([
		'ASSIGN',
		'ACCESS',
		',',
		']',
		')',
		'}'
	]);

	filters.push(endlnFilterFactory(before, after));
}

{
	// demote's all keyword tokens to name tokens if after '.' or before ':'
	filters.push(function*(gen){
		gen = pgen(gen);
		let prev = null;
		for (let token of gen) {
			let kwtype = scanner.keywordType(token);
			if (kwtype !== null) {
				if (prev !== null && prev.tag === 'ACCESS') {
					token.tag = 'NAME';
				}
				
				let next = gen.peek();
				if (!next.done && next.value.tag === ':') {
					token.tag = 'NAME';
				}
			}
			
			yield token;
			prev = token;
		}
	});
}


{
    const block = {
    	left: 'BLOCK_LEFT',
    	right: 'BLOCK_RIGHT'
    };

	function* fnGen(gen) {
		gen = pgen(gen);
		var end, after = nextValue(gen);
		if (after.tag === '{') {
			after.tag = block.left;
			yield after;
			end = yield* sub(getEnd(gen, '{'));
			end.tag = block.right;
			yield end;
		} else if (after.tag === 'ENDLN') {
			yield virtualBefore(after, block.left);
			yield after;
			end = yield* sub(getIndentEnd(gen, after));
			yield virtualBefore(end, block.right);
		} else {
			switch(after.tag) {
				case '*':
				after.tag = 'FUNC_TYPE_GENERATOR';
				yield after;
				break;

				case '~':
				after.tag = 'FUNC_TYPE_ASYNC';
				yield after;
				break;

				case 'FUNC_TYPE_AGEN':
				yield after;
				break;

				default:
				yield after;
				return;
			}

			after = nextValue(gen);
			if (after.tag === '{') {
				after.tag = block.left;
				yield after;
				end = yield* sub(getEnd(gen, '{'));
				end.tag = block.right;
				yield end;
			} else if (after.tag === 'ENDLN') {
				yield virtualBefore(after, block.left);
				yield after;
				end = yield* sub(getIndentEnd(gen, after));
				yield virtualBefore(end, block.right);
			} else {
				throw new Error(
					'Only ordinary one line functions allowed!'
					);
			}
		}
	}

	function* directAfterGen(gen) {
		gen = pgen(gen);
		
		var 
		end,
		token 	= nextValue(gen);
		
		if (token.tag in obj) {
			let func = obj[token.tag];

			yield token;
			yield* func(gen);
			return
		}

		if (implicitDef.has(token.tag)) {
			yield token;
			return;
		}

		if (token.tag === '{') {
			token.tag = block.left;
			yield token;
			end = yield* sub(getEnd(gen, '{'));
			end.tag = block.right;
			yield end;
		} else if (token.tag === 'ENDLN') {
			yield virtualBefore(token, block.left);
			yield token;
			end = yield* sub(getIndentEnd(gen, token));
			yield virtualBefore(end, block.right);
		} else
			throw new Error(`Unrecognized token: ${token.tag}(${token.value})!`);
	}

	function* afterExpressionGen(gen) {
		gen = pgen(gen);
		
		let first = true;
		for (var token of gen) {
			if (token.tag === '{' && !first) {
				token.tag = block.left;
				yield token;
				let end = yield* sub(getEnd(gen, '{'));
				end.tag = block.right;
				yield end;
				return;
			} else if (token.tag === 'ENDLN') {
				yield virtualBefore(token, block.left);
				yield token;
				let end = yield* sub(getIndentEnd(gen, token));
				yield virtualBefore(end, block.right);
				return;
			}

			first = false;

			yield token;

			if (token.tag in symmetric) {
				yield yield* sub(getEnd(gen, token.tag));
				continue;
			}

			if (token.tag in obj) {
				let func = obj[token.tag];
				yield* func(gen);
				return;
			}

			if (implicitDef.has(token.tag))
				return;
		}
	}

	function* sub(gen) {
		gen = pgen(gen);
		while (true) {
			let token, next = gen.next();
			if (next.done) {
				return next.value;
			} else token = next.value;

			yield token;
			if (token.tag in obj) {
				let func = obj[token.tag];
				yield* func(gen);
			}

			if (token.tag in symmetric) {
				yield yield* sub(getEnd(gen, token.tag));
			}
		}
	}

	const implicitDef = new Set([
		'IF',
		'WHILE',
		'FOR',
		'TRY'
	]);


	const afterExpression = new Set([
		'IF',
		'CATCH',
		'WHILE',
		'IN',
		'ON'
	]);

	const directAfter = new Set([
		'ELSE',
		'TRY',
		'FINALLY'
	]);

	const fn = new Set([
		'B_FUNC',
		'UB_FUNC',
		'DO'
	]);

	var obj = {};

	for (let header of afterExpression) {
		obj[header] = afterExpressionGen;
	}

	for (let header of directAfter) {
		obj[header] = directAfterGen;
	}

	for (let header of fn) {
		obj[header] = fnGen;
	}

	// tag block delimiters
	filters.push(function* (gen) {
		gen = pgen(gen);
		for (var token of gen) {
			yield token;
			if (token.tag in obj) {
				let func = obj[token.tag];
				yield* func(gen);
			}
		}
	});
}

{
	filters.push(function* (gen) {
	    for (let token of pgen(gen)) {
	    	if (token.tag === 'EOF')
	    		return;
	    	else
	    		yield token;
	    }
	});
}

{
	filters.push(endlnFilterFactory(
		new Set(['ELSE', 'CATCH', 'FINALLY', 'BLOCK_RIGHT']),
		new Set(['BLOCK_LEFT'])
		));
}

{
	const START = new Set(['UB_FUNC', 'B_FUNC']);
	function tagPair(pair) {
		pair.left.tag = 'PARAM_LEFT';
		pair.right.tag = 'PARAM_RIGHT';
	}

	function parenPair() {
		return {
			left: null,
			right: null,
			index: null
		};
	}

	function last(list) {
		if (list.length === 0) {
			throw new Error('Empty list!');
		}
		return list[list.length - 1];
	}

	function collect(gen, list) {
		var indent = 0;
		var map = new Map();
		var pair = parenPair();

		pair.left = list[0];
		map.set(0, [pair]);

		for (let token of gen) {
			list.push(token);

			if (token.tag === ')') {
				let pair = last(map.get(indent));
				pair.right = token;
				pair.index = list.length - 1;

				if (indent === 0) {
					return map;
				} else indent--;
			}

			if (token.tag === '(') {
				let pp = parenPair();
				pp.left = token;
				indent++;

				if (!map.has(indent)) {
					map.set(indent, []);
				}

				map.get(indent).push(pp);
			}
		}
		
		throw new Error('Unclosed parenthesis!');
	}


	// identify parameter delimiters
	filters.push(function* (gen) {
		gen = pgen(gen);
		for (var token of gen) {
			if (token.tag === '(') {
				let list = [token];
				let map = collect(gen, list);
				let next = gen.next();					

				if (next.done) token = null;
				else token = next.value;
				{
					let i = map.size;
					while (0 <-- i) {
						for (let ppair of map.get(i)) {
							if (START.has(list[ppair.index + 1].tag)) {
								tagPair(ppair);	
							}
						}
					}

					if (token !== null && START.has(token.tag)) {
						tagPair(map.get(0)[0]);
					}

					yield* list[Symbol.iterator]();
				}

				if (next.done) return;
			}

			yield token;
		}
	});
}

{
	const precedeOp = new Set([
		'NAME',
		'THIS',
		'@',
		'BLOCK_RIGHT',
		'INDEX_RIGHT',
		'CALL_RIGHT',
		')',
		'}',
		']'
	]);

	function* defineSymmetric(gen, prev) {
		gen = pgen(gen);
		let token, prevtag = prev || null;
		while(true) {
			let ctrl = gen.next();
			if (ctrl.done) return ctrl.value;
			else token = ctrl.value;

			if (token.tag === '(') {
				let end, has = precedeOp.has(prevtag);

				if (has) token.tag = 'CALL_LEFT';
				yield token;
				token = yield* defineSymmetric(getEnd(gen, '('), '(');
				if (has) token.tag = 'CALL_RIGHT';
			}

			if (token.tag === '[') {
				let end, has = precedeOp.has(prevtag);

				if (has) token.tag = 'INDEX_LEFT';
				yield token;
				token = yield* defineSymmetric(getEnd(gen, '['), '[');
				if (has) token.tag = 'INDEX_RIGHT';
			}

			yield token;
			prevtag = token.tag;
		}
	}


	// identifies calls and indexes
	filters.push(function(gen) {
		return defineSymmetric(gen, null);
	});
}

{
	const pre = new Set([
		'ASSIGN'
	]);

	const post = new Set([
		'FOR',
		'CATCH',
		'AS'
	]);

	const unindent = new Set([
		'BLOCK_RIGHT',
		'INDEX_RIGHT',
		'CALL_RIGHT',
		'PARAM_RIGHT',
		'OP_RIGHT',
		'AP_RIGHT',
		']',
		')',
		'}'
	]);

	const indent = new Set([
		'BLOCK_LEFT',
		'INDEX_LEFT',
		'CALL_LEFT',
		'PARAM_LEFT',
		'OP_LEFT',
		'AP_LEFT',
		'[',
		'(',
		'{'
	]);

	function* resolveAP(iter, tkn) {
		iter = pgen(iter);
		tkn.tag = 'AP_LEFT';
		yield tkn;
		for (let token of iter) {
			let end;

			if (token.tag === '{') {
				yield* resolveOP(iter, token);
			} else if (token.tag === '[') {
				yield* resolveAP(iter, token);
			} else {
				yield token;
			}

			if (token.tag === 'SPLAT') continue;

			end = yield* tagAssignables(nextTag(iter, ',', 'AP_RIGHT'));
			if (end)
				return;
			else
				continue;
		}
	}

	function* resolveOP(iter, tkn) {
		iter = pgen(iter);
		tkn.tag = 'OP_LEFT';
		yield tkn;
		for (let token of iter) {
			let end;
			if (token.tag === '{') {
				yield* resolveOP(iter, token);
			} else if (token.tag === '[') {
				yield* resolveAP(iter, token);
			} else {
				yield token;
			}
			
			if (token.tag === 'OP_RIGHT') return;

			end = yield* tagAssignables(nextTag(iter, ':', 'OP_RIGHT'));
			if (end)
				return;
			else
				continue;
		}
	}

	function* resolvePA(iter, tkn) {
		iter = pgen(iter);
		tkn.tag = 'PARAM_LEFT';
		yield tkn;
		for (let token of iter) {
			let end;

			if (token.tag === '{') {
				yield* resolveOP(iter, token);
			} else if (token.tag === '[') {
				yield* resolveAP(iter, token);
			} else {
				yield token;
			}

			if (token.tag === 'PARAM_RIGHT') return;

			if (token.tag === 'SPLAT') continue;

			end = yield* tagAssignables(nextTag(iter, ',', 'PARAM_RIGHT'));
			if (end)
				return;
			else
				continue;
		}
	}

	function* nextTag(gen, char, endtag) {
		gen = pgen(gen);
		let depth = 0;
		for (let token of gen) {
			if (depth === 0) {
				if (token.tag === char) {
					yield token;
					return false;
				}

				if (unindent.has(token.tag)) {
					token.tag = endtag;
					yield token;
					return true;
				}

				if (token.tag === 'ASSIGN')
					token.tag = 'DEFVAL';
			}

			yield token;

			if (indent.has(token.tag)) {
				depth++;
				continue;
			}

			if (unindent.has(token.tag)) {
				depth--;
			}
		}
	}

	function* tagAssignables(gen) {
		gen = pgen(gen);
		while (true) {
			let token, ctrl = gen.next();
			if (ctrl.done) return ctrl.value;
			else token = ctrl.value;

			if (token.tag === 'PARAM_LEFT') {
				yield* resolvePA(gen, token, 'PARAM_LEFT');
				continue;
			}

			if (post.has(token.tag)) {
				yield token;
				for (let tkn of gen) {
					if (tkn.tag === '(') {
						yield tkn;
					} else {
						if (tkn.tag === '{') {
							yield* resolveOP(gen, tkn);
						} else if (tkn.tag === '[') {
							yield* resolveAP(gen, tkn);
						} else {
							yield tkn;
							break;
						}
					}
				}

				continue;
			}

			if (token.tag === '{' || token.tag === '[') {
				let pee, array = [], sgen = getEnd(gen, token.tag);

				while (true) {
					let ctrl = sgen.next();
					array.push(ctrl.value)
					if (ctrl.done) break;
				}

				pee = gen.peek();
				if (!pee.done && pre.has(pee.value.tag)) {
					if (token.tag === '{') yield* resolveOP(array[Symbol.iterator](), token);
					if (token.tag === '[') yield* resolveAP(array[Symbol.iterator](), token);
				} else {
					let end = array.pop();
					yield  token;
					yield* tagAssignables(array[Symbol.iterator]());
					yield  end;
				}
				continue;
			}

			yield token;
		}
	}

	// identifies the []{}s for assignables as opposed to normal objects and arrays
	filters.push(function(gen) {
		return tagAssignables(gen);
	});
}

{
	// identifies curly brackets that are module import sets and tags * as all
	filters.push(function*(gen) {
		gen = pgen(gen);
		let importmode = false, buff = [];
		for (let token of gen) {
			if (token.tag === 'IMPORT') {
				importmode = true;
				yield token;
				continue;
			}

			if (token.tag === 'FROM') {
				importmode = false;

				yield token;
				continue;
			}

			if (token.tag === '*') {
				if (importmode) token.tag = 'ALL';
				yield token;
				continue;
			}

			if (token.tag === '{') {
				if (!importmode) {
					yield token;
					continue;
				}
				token.tag = 'MOD_LEFT';
				yield token;
				let end = yield* getEnd(gen, '{');
				end.tag = 'MOD_RIGHT';
				yield end;
				continue;
			}

			yield token;
		}
	});
}

{
	let tagStuff = function*(gen) {
		gen = pgen(gen);
		let val = nextValue(gen);
		if (val.tag === '*') {
			val.tag = 'ALL';
			yield val;
			return;
		}

		if (val.tag === '{') {
			val.tag = 'EXP_LEFT';
			let end = yield* getEnd(gen, '{');
			end.tag = 'EXP_RIGHT';
			yield end;
			return;
		}

		yield val;
		return;
	}

	// identifies curly brackets belonging to export sets, and tags * as 'ALL'
	filters.push(function*(gen) {
		gen = pgen(gen);
		for (let token of gen) {
			yield token;

			if (token.tag === 'EXPORT') {
				yield* tagStuff(gen);
			}
		}
	});
}

{
	const declarative = new Set([
		'VAR',
		'CONST'
	]);
	
	filters.push(function*(gen) {
		gen = pgen(gen);
		let prev = null;
		for (let token of gen) {
			if (prev === null && token.tag !== 'ENDLN') {
				yield virtualBefore(token, 'ENDLN');
			}
			
			if (token.tag === ',' && declarative.has(prev)) {
				continue;
			}
			
			yield token;
			prev = token.tag;	
		}
	});
}

exports.parseCharSrc = function(csrc) {
	return exports.refineTokens(scanner.getTokensFromSource(csrc), csrc);
}

exports.refineTokens = function(iterable, src) {
	let filtered = iterable;
	for (let filter of filters) {
		filtered = filter(filtered);
	}
	return filtered;
}
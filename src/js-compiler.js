"use strict";

const fs = require('fs')
const acorn = require('acorn');
const escodegen = require('escodegen');
const vargen = require('./vargen');
const resolver = require('./module-resolver');
const js = require('./js-nodes');
const jsg = require('./js-gen');
const findAddition = require('./extensions').findAddition;
const bzParser = require('./parser');
const ext = require("./lib").extension;

function getImport(line, filename, importVar) {
	const support = importVar || vargen.globalVar('bzbSupportLib');
	const requiring = jsg.getJSMethodCall(
		[support, 'require']
		[new js.Literal(+resolver.globalHash(
			filename,
			line.source.value
			))]
		);
	const declarators = [];
	let ivar;
	if (line.specifiers.length === 1) {
		ivar = requiring;
	} else {
		ivar = new js.Identifier(vargen.nuVar('imports'));

		declarators.push(
			new js.VariableDeclarator(
				ivar,
				requiring
				)
			);
	}

	for (var specifier of line.specifiers) {
		if (specifier.type === "ImportDefaultSpecifier") {
			declarators.push(
				new js.VariableDeclarator(
					new js.Identifier(specifier.local.name),
					new js.MemberExpression(
						ivar,
						jsg.getJSMemberExpression([
							support,
							'symbols',
							'default'
							]),
						true
						)
					)
				);
		} else if (specifier.type === 'ImportNamespaceSpecifier') {
			declarators.push(
				new js.VariableDeclarator(
					new js.Identifier(specifier.local.name),
					ivar
					)
				);
		} else {
			declarators.push(
				new js.VariableDeclarator(
					new js.Identifier(specifier.local.name),
					jsg.getJSMemberExpression(
						ivar.name,
						specifier.imported.name
						)
					)
				);
		}
	}
	
	return new js.VariableDeclaration(
		declarators,
		'const'
		);
}



function* getExports(line, filename, exportVar) {
	const gvar = exportVar || vargen.globalVar('exports');
	if (line.declaration === null) {
		for (var specifier of line.specifiers) {
			yield new js.ExpressionStatement(
				new js.AssignmentExpression(
					'=',
					jsg.getJSMemberExpression(
						[gvar, specifier.exported.name]
						),
					new js.Identifier(specifier.local.name)
					)
				);
		}
	} else {
		const declaration = line.declaration;
		yield declaration;
		if (declaration.type === 'VariableDeclaration') {
			for (var declarator of declaration.declarations) {
				if (declarator.id.type !== 'Identifier')
					throw new Error('Pattern exports not yet implemented!');

				yield new js.ExpressionStatement(
					new js.AssignmentExpression(
						'=',
						jsg.getJSMemberExpression(
							[gvar, declarator.id.name]
							),
						new js.Identifier(declarator.id.name)
						)
					);
			}
		} else {
			yield new js.ExpressionStatement(
					new js.AssignmentExpression(
					'=',
					jsg.getJSMemberExpression(
						[gvar, declaration.id.name]
						),
					new js.Identifier(declaration.id.name)
					)
				);
		}
	}
}

const parse = (filename, dynamic) => {
	const body		= [];
	const source 	= fs.readFileSync(filename);
	const program	= acorn.parse(source, {
		ecmaVersion: 6,
		sourceType: 'module',
		onToken(token) {
			if (token.type.label === 'name') {
				vargen.forbid(token.value);
			}
		}
	});

	return {
		get tree() {
			return program;
		},
		* getImports(modcache) {
	        for (var statement of program.body) {
	            if (statement.type === 'ImportDeclaration') {
	                if (statement.source === LIB_PATH) {
	                    continue;
	                }
	                if (modcache.cached(statement.source)) {
	                    continue;
	                }

	                const base      = modcache.path(statement.source);
	                const extend    = findAddition(statement.source);
	                var ctrl, gen, api;
	                if (extension === '.' + ext) {
	                    ctrl = parser.parseFile(`${base}${extension}`, {
	                        browser: {
	                            root: false
	                        }
	                    });

	                    gen = ctrl.tree.getImports(modcache);
	                    api = ctrl.tree;
	                } else {
	                    ctrl = jsCompiler.parse(`${base}${extension}`);
	                    gen = ctrl.getImports(modcache);
	                    api = ctrl;
	                }


	                modcache.startModule(statement.path);
	                yield*  gen;
	                modcache.endModule();
	                yield [
	                    modcache.path(statement.path),
	                    api
	                ];
	            }
	        }
		},
		* getExports() {

		},
		getJSTree(o) {
			return this.toJS(o || {});
		},
		getJSText(o) {
			return escodegen.generate(this.toJS(o || {}));
		},
		toJS(o) {
			var linebuff = [];
			var bzbVar, exportVar;
			if (dynamic) {
				linebuff.push(
					new js.ExpressionStatement(
						new js.Literal("use strict")
						)
					);
				bzbVar = vargen.nuVar('bzbSupportLib');
				exportVar = o.exportVar;
				linebuff.push(
					jsg.getJSAssign(
						bzbVar,
						jsg.getJSMethodCall(
							['require'],
							[new js.Literal("bizubee lib")]
							),
						'const')
					);
			} else {
				bzbVar = vargen.globalVar('bzbSupportLib');
				exportVar = vargen.globalVar('exports');
			}

			for (var line of program.body) {
				if (line.type === 'ImportDeclaration') {
					linebuff.push(getImport(line, filename, bzbVar));
					continue;
				}

				if (line.type === 'ExportNamedDeclaration') {
					linebuff.push(...getExports(line, filename, exportVar));
					continue;
				}

				if (line.type === 'ExportDefaultDeclaration') {
					linebuff.push(
						new js.ExpressionStatement(
							new js.AssignmentExpression(
								'=',
								new js.MemberExpression(
									exportVar,
									jsg.getJSMemberExpression([
										bzbVar,
										'symbols',
										'default'
										])
									),
									true
								),
								line.declaration
							)
						);

					continue;
				}

				linebuff.push(line);
			}

			if (dynamic) return new js.Program(linebuff);
			else return new js.FunctionExpression(
				null,
				[new js.Identifier(exportVar)],
				new js.BlockStatement(linebuff)
				);
		}
	}
}

exports.parse = parse;
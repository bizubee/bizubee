
import * as js from './js-nodes';
import escodegen from 'escodegen';
import pathlib from 'path'
import fs from 'fs';
import path from 'path';
import {Lines, Line} from './errors';
import {Queue} from './collectibles';
import {findAddition} from './extensions';
import {
    nuVar,
    globalVar,
    globalHash, 
    forbid
    } from './vargen';

import {
    getJSLines,
    getJSAssign,
    getJSDeclare,
    getJSIterable,
    getJSMethodCall,
    getJSConditional,
    getJSMemberExpression
    } from './js-gen';

import jsCompiler from './js-compiler';
import lookup from './lookup';

const acorn = require("acorn");
const ext = require("./lib").extension;
const _ = null;

const PKEY = Symbol('Program key');
const OKEY = Symbol('Options key');

const IGNORE = Symbol('Ingorable properties');

const EMPTY = new js.EmptyStatement();
const LIB_PATH = "bizubee lib";

const binaryOperator = new Set([
    "==",
    "!=",
    "<",
    "<=",
    ">",
    ">=",
    "+",
    "-",
    "*",
    "/",
    "//",
    "%",
    "^",
    "&",
    "has",
    "is"
]);

const logicalOperator = new Set([
    "or",
    "and"
]);

const assignmentOperator = new Set([
    "=",
    "+=",
    "-=",
    "*=",
    "/=",
    "//=",
    "%=",
    "^=",
    "&="
]);

const updateOperator = new Set([
    "++",
    "--"
]);

const unaryOperators = new Set([
    '+',
    '-',
    'delete',
    '!'
]);

const convert = {
    // cuz JS's '==' operator is total sh**
    '==': '===',
    '!=': '!==',

    'OR': '||',
    'AND': '&&',
    'IS': 'instanceof',

    '&': '+'
};

const stringEscapeTable = {
    'n': '\n',
    'r': '\r',
    't': '\t',
    'b': '\b',
    'f': '\f'
};

const PATH_MAP = new Map();
const PARENT_KEY = Symbol('parent');
const POSITION_KEY = Symbol('position');

const vars = new Set();
const nodeQueue = new Queue();

let LIB, DEFAULT;

Array.prototype.append = function(elems) {
    if (elems instanceof Array) {
        for (var i = 0; i < elems.length; i++) {
            this.append(elems[i]);
        }
    } else {
        this.push(elems);
    }
}

Array.prototype.prepend = function(elems) {
    if (elems instanceof Array) {
        let i = elems.length;

        while (i --> 0) {   // while i goes to 0 prepend the elements
            this.prepend(elems[i]);
        }
    } else {
        this.unshift(elems);
    }
}

function defined(val) {
    return val !== undefined && val !== null;
}

// keeps track of underscoring necessary for util vars to avoid collisions
function knowIdLead(name) {
    var i = 0;
    while (i < name.length) {
        if (name[i] !== '_')
            break;
        
        if (i >= MAX_LEAD.length) {
            MAX_LEAD += '_';
        }
        
        i++;
    }
}

function last(jsargs) {
    return js.getJSMethodCall([LIB, 'last'], jsargs);
}

function assertBinaryOperator(operator) {
    if (binaryOperator.has(operator)) {
        return operator;
    } else {
        throw new Error(`Operator "${operator}" not binary!`);
    }
}

function assertLogicalOperator(operator) {
    if (logicalOperator.has(operator)) {
        return operator;
    } else {
        throw new Error(`Operator "${operator}" not logical!`);
    }
}

function assertAssignmentOperator(operator) {
    if (assignmentOperator.has(operator)) {
        return operator;
    } else {
        throw new Error(`Operator "${operator}" not assignment!`);
    }
}

function assertUpdateOperator(operator) {
    if (updateOperator.has(operator)) {
        return operator;
    } else {
        throw new Error(`Operator "${operator}" not update!`);
    }
}


function statement(jsExpr) {
    if (jsExpr instanceof Array) {
        let arr = [];
        for (let i = 0; i < jsExpr.length; i++) {
            arr.push(statement(jsExpr[i]));
        }

        return arr;
    }

    if (jsExpr instanceof js.Expression) {
        return new js.ExpressionStatement(jsExpr);
    } else {
        return jsExpr;
    }
}


function iife(statements) {
    return new js.CallExpression(
        new js.FunctionExpression(
            null,
            [],
            new js.BlockStatement(statements)
            ),
        []
        );
}

export function wrap(node) {
    if (node instanceof BlockStatement) {
        return node;
    } else {
        return new BlockStatement([node]).pos(node[POSITION_KEY]);
    }
}


export class Node {
    constructor() {
        this[IGNORE] = new Set();
        this.type = this.constructor.name;
        this.loc = null;
        this.compiled = false;
        nodeQueue.eat(this);
    }

    setParent() {
        for (var key in this) {
            const nd = this[key];
            if (nd instanceof Node) {
                nd[PARENT_KEY] = this;
                nd.setParent();
                continue;
            }

            if (nd instanceof Array) {
                for (let node of nd) {
                    if (node instanceof Node) {
                        node[PARENT_KEY] = this;
                        node.setParent();
                    }
                }
                continue;
            }
        }
    }

    getOpvars(n) {
        return this
        .getParentScope()
        .getOpvars(n);
    }

    freeOpvars(opvars) {
        return this
        .getParentScope()
        .freeOpvars(opvars);
    }

    onASTBuild(e = {}) {
        
    }

    * walk() {
        var ignore = this[IGNORE];
        outer:
        for (let key in this) {
            if (ignore.has(key))
                continue;

            let obj = this[key];
            if (obj instanceof Array) {
                for (let val of obj) {
                    if (!(val instanceof Node))
                        continue outer;

                    let nosearch = yield {key, value: val};
                    if (nosearch)
                        continue;

                    yield* val.walk();
                }
            } else if (obj instanceof Node) {
                let nosearch = yield {key, value: obj};
                if (nosearch)
                    continue;
                yield* obj.walk();
            }
        }
    }

    pos(left, right = null) {
        if (right === null) {
            this[POSITION_KEY] = left;            
        } else {
            this[POSITION_KEY] = {
                first_column: left.first_column,
                first_line: left.first_line,
                last_column: right.last_column,
                last_line: right.last_line
            }
        }
        return this;
    }

    toJS(o) {
        if (this.compiled) {
            this.error(`Cannot recompile ${this.constructor.name} node!`);
            throw new Error('Cannot compile node more than once!');
        } else {
            this.compiled = true;
            return this._toJS(o);
        }
    }
    
    // make sure this method is implemented for all node subclasses
    _toJS(o) {
        this.error('Method "toJS" not implemented!');
    }

    getParentScope() {
        let parent = this.parent;
        while (true) {
            if (parent instanceof Scope) {
                return parent;
            } else {
                parent = parent.parent;
            }
        }
    }

    getParentBlock() {
        let block = this.getParentScope();
        if (block instanceof Program) {
            return null;
        } else {
            return block;
        }
    }

    getParentFunction() {
        let parent = this.parent;
        while (true) {
            if (parent instanceof FunctionExpression) {
                return parent;
            } else if (parent instanceof Program) {
                return null;
            } else {
                parent = parent.parent;
            }
        }
    }

    error(text) {
        let loc = this[POSITION_KEY];
        let x = loc.first_column, y = loc.first_line;
        let lines = new Lines(this.source, 4);

        lines.error(text, [x, y]);
    }

    get parent() {
        return this[PARENT_KEY];
    }

    get program() {
        if (this[PKEY] !== undefined) return this[PKEY];

        let current = this;
        while (true) {
            if (current instanceof Program) {
                this[PKEY] = current;
                return current;
            }

            if (current.type === "ExpressionStatement") {
                if (current.parent === null) {
                    console.log(JSON.stringify(current, null, 4));
                }
            }
            current = current.parent;
        }
    }

    set filename(value) {
        this.program.parameters.file = value;
    }

    get filename() {
        return this.program.parameters.file;
    }


    set source(value) {
        this.program.parameters.source = value;
    }

    get source() {
        return this.program.parameters.source;
    }
    
    get position() {
        let position = this[POSITION_KEY];
        return [
            position.first_column,
            position.first_line,
            position.last_column,
            position.last_line,
        ];
    }
}

// includes block scopes and the program/module scope
export class Scope extends Node {
    constructor(statements) {
        super();
                
        this.body = statements;
        this._opvars = [];
        this._forbiddenvars = new Set();
        this._funcDeclarations = new Map();
    }

    getOpvars(n) {
        let arr = [], i = 0;
        
        while (arr.length < n) {
            if (i < this._opvars.length) {
                let opvar = this._opvars[i];
                if (!this._forbiddenvars.has(opvar)) {
                    arr.push(opvar);
                    this._forbiddenvars.add(opvar);
                }
            } else {
                let opvar = nuVar('opvar');
                this._opvars.push(opvar);
                arr.push(opvar);
                this._forbiddenvars.add(opvar);
            }
            i++;
        }
        
        return arr;
    }
    
    freeOpvars(opvars) {
        for (var opvar of opvars) {
            this._forbiddenvars.delete(opvar);
        }
    }

    getOpvarsDeclaration() {
        let identifiers = 
            this._opvars
                .map(id => new js.Identifier(id));
        return new js.VariableDeclaration(identifiers, 'let');
    }

    getFunctionDeclarations() {
        const declarators = [];
        for (var [name, func] of this._funcDeclarations) {
            const declarator = new js.VariableDeclarator(
                new js.Identifier(name),
                func
                );
            declarators.push(declarator);
        }
        
        return new js.VariableDeclaration(declarators, 'const');
    }

    [Symbol.iterator] () {
        var i = 0;
        return {
            next: () => {
                if (i >= this.body.length) {
                    return {
                        done: true,
                        value: undefined
                    }
                } else {
                    return {
                        done: false,
                        value: this.body[i++]
                    }
                }
            }
        }
    }

    * getJSLines(o) {
        
        for (let line of this.body) {
            // if line is a function declaration we compile the function
            // then save it in a map to be put later in a const declaration at top of
            // scope, cause all function declarations are 'bubbled' to the top of their scope

            if (line instanceof FunctionDeclaration) {    
                const name = line.identifier.name;
                if (this instanceof Program && name === 'main') {
                    this.containsMain = true;
                }

                if (this._funcDeclarations.has(name)) {
                    line.error('Cannot declare function more than once!');
                }
                
                this._funcDeclarations.set(
                    name,
                    line.func.toJS(o)
                    );
                
                continue;
            }
            
            let nodes = line.toJS(o);
            if (nodes instanceof Array) {
                // if the js compilation is a serialisation (array) of nodes
                // we must yield each node of the serialization individually
                
                for (let subline of nodes) {
                    yield statement(subline);
                }
            } else if (nodes instanceof js.Expression || nodes instanceof js.Statement) {
                yield statement(nodes);
            } else {
                if (nodes instanceof js.Super) {
                    yield nodes;
                    continue;
                }
                
                line.error(`Invalid object ${typeof nodes}!`);
            }
        }
    }
}

export class Program extends Scope {
    constructor(statements) {
        super(statements);
        
        this.setParent();

        this.containsMain = false;
        while (nodeQueue.length > 0) {
            let node = nodeQueue.crap();
            node.onASTBuild({});
        }
    }
    
    resolve(route) {
        return lookup.lookup(this.filename, route);
    }
    
    * getImports() {
        const parser = require('./parser');
        for (var statement of this.body) {
            if (statement instanceof ImportDeclaration) {
                if (statement.path === LIB_PATH) {
                    continue;
                }
                const fullpath = lookup.lookup(this.filename, statement.path);
                if (lookup.isCached(fullpath)) {
                    continue;
                } else {
                    lookup.cache(fullpath);
                }

                const extension = path.extname(fullpath);
                var ctrl, gen, api;
                if (extension === '.' + ext) {
                    ctrl = parser.parseFile(fullpath, {
                        rootfile: this.parameters.rootfile,
                        browser: {
                            root: false
                        }
                    });

                    gen = ctrl.tree.getImports();
                    api = ctrl.tree;
                } else {
                    ctrl = jsCompiler.parse(fullpath);
                    gen = ctrl.getImports();
                    api = ctrl;
                }

                yield* gen;
                yield [
                    fullpath,
                    api
                ];
            }
        }
    }
    
    * getExports() {
        for (var statement of this.body) {
            if (statement instanceof ExportNamedDeclaration) {
                if (statement.declaration === null) {
                    for (var spec of statement.specifiers) {
                        yield [spec.exported.name, spec.local.name];
                    }
                } else {
                    const dec = statement.declaration;
                    if (dec instanceof VariableDeclaration) {
                        for (var id of dec.extractVariables()) {
                            yield [id.name, id.name];
                        }
                    } else {
                        yield [dec.identifier.name, dec.identifier.name]
                    }
                }
            }

            if (statement instanceof ExportDefaultDeclaration) {
                const hasProp = statement.declaration.hasOwnProperty('identifier');
                const name = (hasProp) ? statement.declaration.identifier.name : null;
                yield ["[default]", name];
            }
        }
    }

    compileBrowser(o) {
        // recursively resolve libraries
        
        // set var LIB to support lib at top
        // set LIB.modules to a map (key -> function)
        // run root program in sub-scope
        
        const modmap            = new Map();
        const cache             = new Set();
        const modules           = [];
        const instructions      = [
            statement(new js.Literal('use strict'))
        ];
        const directives = [
        ];
        
        globalHash(LIB_PATH);
        
        for (let [abspath, program] of this.getImports()) {
            const hash = globalHash(abspath);
            modmap.set(hash, program);
        }

        o.exportVar = globalVar('exports');
        LIB = globalVar('bzbSupportLib');
        
        
        instructions.push(getJSDeclare(
            new js.Identifier(LIB),
            acorn.parseExpressionAt(
                fs.readFileSync(`${__dirname}/fragments/lib.js`, 'utf8'),
                0,
                {ecmaVersion: 6}
                ),
            'const'
            ));

        for (var [key, mod] of modmap) {
            if (mod === null) 
                modules.push(
                    new js.Property(
                        new js.Literal('' + key),
                        new js.Identifier(LIB)
                        )
                    );
            else
                modules.push(
                    new js.Property(
                        new js.Literal('' + key),
                        mod.toJS(o)
                        )
                    );   
        }
        
        instructions.push(statement(getJSMethodCall(
            [LIB, 'setModules'],
            [new js.ObjectExpression(modules)]
            )));
            
     
        for (let jsline of this.getJSLines(o)) {
            directives.push(jsline);
        }
     
        if (this._funcDeclarations.size > 0)
            directives.unshift(this.getFunctionDeclarations());
        if (this._opvars.length > 0)
            directives.unshift(this.getOpvarsDeclaration());

        return new js.Program([
            new js.ExpressionStatement(
                iife(
                    [
                        ...instructions,
                        new js.BlockStatement(directives)
                    ]
                    )
                )
        ]).from(this);
    }
    
    compileBrowserModule(o) {
        o.exportVar = globalVar('exports')
        var instructions = [];

        for (let jsline of this.getJSLines(o)) {
            instructions.push(jsline);
        }

        if (this._funcDeclarations.size > 0)
            instructions.unshift(this.getFunctionDeclarations());
        if (this._opvars.length > 0)
            instructions.unshift(this.getOpvarsDeclaration());

        return new js.FunctionExpression(
            null,
            [new js.Identifier(o.exportVar)],
            new js.BlockStatement(instructions)
            ).from(this);
    }
    
    runtimeCompile(o) {
        LIB = nuVar('bzbSupportLib');
        var instructions = statement([
            new js.Literal("use strict"),
            getJSAssign(LIB, getJSMethodCall(['require'], [new js.Literal(LIB_PATH)]), 'const'),
            EMPTY,
            EMPTY,
            EMPTY,
        ]) || o.instructions;

        for (let jsline of this.getJSLines(o)) {
            instructions.push(jsline);
        }

        if (this.containsMain)
            instructions.append(
                statement(
                    new js.AssignmentExpression(
                        '=',
                        getJSMemberExpression([o.exportVar, o.exportVar]),
                        new js.Identifier('main')
                        )
                    )
                );
        

        if (this._opvars.length > 0)
            instructions[3] = this.getOpvarsDeclaration();
        if (this._funcDeclarations.size > 0)
            instructions[4] = this.getFunctionDeclarations();

        return new js.Program(instructions).from(this);
    }
    
    _toJS(o) {
        if (this.parameters.browser) {
            if (this.parameters.browser.root) {
                return this.compileBrowser(o);
            } else {
                return this.compileBrowserModule(o);
            }
        } else {
            return this.runtimeCompile(o);
        }
    }

    set parameters(params) {
        this[OKEY] = params;
    }

    get parameters() {
        return this[OKEY];
    }
}

export class Statement extends Node {

}

export class BlockStatement extends Scope {
    _toJS(o) {
        var instructions = [] || o.instructions;
        for (let line of this.getJSLines(o)) {
            if (line instanceof js.Expression)
                instructions.push(statement(line))
            else
                instructions.push(line);
        }
        
        if (this._funcDeclarations.size > 0)
            instructions.unshift(this.getFunctionDeclarations());
        if (this._opvars.length > 0)
            instructions.unshift(this.getOpvarsDeclaration());

        return new js.BlockStatement(instructions).from(this);
    }
}

export class ExpressionStatement extends Statement {
    constructor(expression) {
        super();
        
        this.expression = expression;
    }

    _toJS(o) {
        return new js.ExpressionStatement(this.expression.toJS(o))
            .from(this);
    }
}

// *
export class IfStatement extends Statement {
    constructor(test, consequent, alternate = null) {
        super();
        
        this.test = test;
        this.consequent = consequent;
        this.alternate = alternate;
    }

    _toJS(o) {
        let test        = this.test.toJS(o);
        let consequent  = this.consequent.toJS(o);
        let alternate   = null;

        if (this.alternate !== null) 
            alternate = this.alternate.toJS(o);

        return new js.IfStatement(test, consequent, alternate)
            .from(this);
    }

    setAlternate(alternate) {
                this.alternate = alternate;

        return this;
    }
}

export class ControllStatement extends Statement {
    _label() {
        const target = this._target();
        if (target.label === null) {
            const label = nuVar('label');
            target.label = label;
            return label;
        } else {
            return target.label;
        }
    }

    _target() {
        var current = this.parent, n = this.magnitude;

        while (true) {
            if (
                current instanceof ForStatement ||
                current instanceof WhileStatement
                ) {

                if (n === 0) {
                    return current;
                } else {
                    n--;
                }
            } else if (current instanceof FunctionExpression) {
                this.error('Cannot break/continue outside of function!');
            } else if (current instanceof Program) {
                this.error('Not enough nested loops to break/continue from!');
            }

            current = current.parent;
        }
    }
}

// *
export class BreakStatement extends ControllStatement {
    constructor(magnitude = 0) {
        super();
                this.magnitude = +magnitude;
    }

    _toJS(o) {
        if (this.magnitude === 0) {
            return new js.BreakStatement()
                .from(this);            
        } else {
            const label = this._label();
            return new js.BreakStatement(
                new js.Identifier(label)
                ).from(this);
        }
    }
}

// *
export class ContinueStatement extends ControllStatement {
    constructor(magnitude = 0) {
        super();
                this.magnitude = +magnitude;
    }

    _toJS(o) {
        if (this.magnitude === 0) {
            return new js.ContinueStatement()
                .from(this);            
        } else {
            const label = this._label();
            return new js.ContinueStatement(
                new js.Identifier(label)
                ).from(this);
        }
    }
}

// *
export class SwitchStatement extends Statement {
    constructor(discriminant, cases) {
        super();
                
        this.discriminant = discriminant;
        this.cases = cases;
    }
}

// *
export class ReturnStatement extends Statement {
    constructor(argument, after) {
        super();
        
        this.argument = argument;
        this.after = after;
    }

    _toJS(o) {
        if (defined(this.after)) {
            if (this.after instanceof ReturnStatement)
                this.after.error('Cannot return from function multiple times!');
            
            let variableName    = nuVar('returnValue');
            let variable        = new js.Identifier(variableName);
            let lines           = [
                getJSDeclare(variable, this.argument.toJS(o), 'const')
            ];
            
            lines.append(this.after.toJS(o));
            lines.append(new js.ReturnStatement(variable).from(this));
            return statement(lines);
        } else {
            if (defined(this.argument))
                return new js.ReturnStatement(this.argument.toJS(o))
                    .from(this);
            else
                return new js.ReturnStatement()
                    .from(this);
        }
    }
}


export class ThrowStatement extends Statement {
    constructor(argument) {
        super();
        
        this.argument = argument;
    }

    _toJS(o) {
        return new js.ThrowStatement(this.argument.toJS(o))
            .from(this);
    }
}

export class TryStatement extends Statement {
    constructor(block, catchClause = null, finalizer = null) {
        super();
        
        this.block = block;
        this.handler = catchClause;
        this.finalizer = finalizer;
    }
    
    _toJS(o) {
        let handler = (defined(this.handler)) ? this.handler.toJS(o) : null;
        let finalizer = (defined(this.finalizer)) ? this.finalizer.toJS(o) : null;
        return new js.TryStatement(
            this.block.toJS(o),
            handler,
            finalizer
            ).from(this);
    }
}


export class WhileStatement extends Statement {
    constructor(test, body) {
        super();
        
        this.test = test;
        this.body = body;
        this.label = null;
    }

    _toJS(o) {
        let test = this.test.toJS(o);
        let body = this.body.toJS(o);

        if (this.label === null) {
            return new js.WhileStatement(test, body)
                .from(this);            
        } else {
            return new js.LabeledStatement(
                new js.Identifier(this.label),
                new js.WhileStatement(test, body)
                ).from(this);
        }
    }
}

export class ForStatement extends Statement {
    constructor(left, right, body, async = false) {
        super();
        
        this.left = left;
        this.right = right;
        this.body = body;
        this.async = async;
        this.label = null;
    }

    _toJS(o) {
        if (this.async) return this.asyncToJS(o);
        else return this.syncToJS(o);
    }

    syncToJS(o) {
        let left = nuVar('iterant');
        let right = this.right.toJS(o);
        let nuleft = new js.VariableDeclaration(
            [new js.VariableDeclarator(new js.Identifier(left))],
            'let'
        );

        let jbody = this.body.toJS(o);
        let declare = getJSDeclare(this.left, new js.Identifier(left), 'const');

        jbody.body.unshift(declare);

        let loop = new js.ForOfStatement(jbody, nuleft, right)

        if (this.label === null) {
            return loop.from(this);
        } else {
            return new js.LabeledStatement(
                new js.Identifier(this.label),
                loop
                ).from(this);
        }
    }

    asyncToJS(o) {
        let pfunc = this.getParentFunction();
        if (!pfunc.async)
            this.error('Cannot have for-on loop in sync function!');

        let right = nuVar('lefthandPlaceholder');   // variable placeholder for async generator expression
        let ctrl = nuVar('observerController');     // generator's {done(bool), value} variable
        let ctrle = getJSAssign(
            ctrl,
            new js.YieldExpression(getJSMethodCall([right, 'next'], [])),
            'const'
            );

        let cond = new js.IfStatement(
            getJSMemberExpression([ctrl, 'done']),
            new js.BreakStatement())

        let decl = getJSDeclare(this.left,
            getJSMemberExpression([ctrl, 'value']));

        let body = [ctrle, cond].concat(decl);
        for (let line of this.body) {
            body.append(line.toJS(o));
        }


        let buff = [
            getJSAssign(
                right,
                new js.CallExpression(
                    new js.MemberExpression(
                        this.right.toJS(),
                        getJSMemberExpression([LIB, 'symbols', 'observer']),
                        true
                        ),
                    []
                    ),
                'const'
                ).from(this)
        ];

        if (this.label === null) {
            buff.push(
                new js.WhileStatement(
                    new js.Literal(true),
                    new js.BlockStatement(body)
                    ).from(this)
                );
        } else {
            buff.push(
                new js.LabeledStatement(
                    new js.Identifier(this.label),
                    new js.WhileStatement(
                        new js.Literal(true),
                        new js.BlockStatement(body)
                        )
                    ).from(this)
                );
        }

        return buff;
    }
}

export class Declaration extends Statement {

}

export class VariableDeclaration extends Declaration {
    constructor(declarators, constant = false) {
        super();
        
        this.declarators = declarators;
        this.constant = constant;
    }

    * varnames() {
        for (var id of this.extractVariables()) {
            yield id.name;
        }
    }

    * extractVariables() {
        for (let decl of this.declarators) {
            let left = decl.id;
            
            if (left instanceof Identifier) {
                yield left.name;
                continue;
            }

            if (left instanceof Pattern) {
                yield* left.extractVariables();
                continue;
            }

            left.error('Invalid variable or pattern!');
        }
    }

    _toJS(o) {
        let jsvars = [];
        let type = (this.constant) ? 'const' : 'let';

        for (let declarator of this.declarators) {
            jsvars = jsvars.concat(declarator.toJS(o));
        }

        return new js.VariableDeclaration(jsvars, type)
            .from(this);
    }

    add(declarator) {
                this.declarators.push(declarator);
        return this;
    }

    addAndReturn(assignable, assignee) {
        let declarator =
            new VariableDeclarator(assignable, assignee);

        
        this.declarators.push(declarator);
        return this;
    }
}

export class VariableDeclarator extends Node {
    constructor(id, init = null) {
        super();
        
        this.id = id;
        this.init = init;
    }

    _toJS(o) {
        // always return an array
        
        let init = (!!this.init) ? this.init.toJS(o) : null;
        if (this.id instanceof Pattern) {
            if (init === null)
                this.id.error('All pattern declarations must be initialized!');

            let nuvar = nuVar('patternPlaceholder');
            let arr = [
                new js.VariableDeclarator(new js.Identifier(nuvar), init)
                    .from(this)
            ];

            for (let pattern of this.id.extractAssigns(new js.Identifier(nuvar))) {
                arr.push(pattern);
            }

            return arr;
        } else return new js.VariableDeclarator(this.id.toJS(o), init)
            .from(this);
    }
}

export class Expression extends Node {
    constructor() {
        super();
    }

    toStatement() {
        return new ExpressionStatement(this);
    }
}

export class ThisExpression extends Expression {
    _toJS(o) {
        return new js.ThisExpression();
    }
}

export class YieldExpression extends Expression {
    constructor(argument = null, delegate = false) {
        super(argument);
        
        this.argument = argument;
        this.delegate = delegate;
    }

    _toJS(o) {
        let inyield, pfunc = this.getParentFunction();
        if (pfunc === null || !pfunc.generator) {
            this.error('Yield expression only allowed inside a generator function!');
        }

        if (pfunc.async) {
            inyield = getJSMethodCall(
                [pfunc._ctrl, 'send'],
                [this.argument.toJS(o)]
                );
        } else {
            inyield = (!this.argument) ? null : this.argument.toJS(o);
        }


        return new js.YieldExpression(inyield, this.delegate)
            .from(this);
    }
}

export class AwaitExpression extends Expression {
    constructor(argument) {
        super(argument);
        
        this.argument = argument;
    }

    _toJS(o) {
        let pfunc = this.getParentFunction();
        if (pfunc === null || !pfunc.async) {
            this.error("Await expression only allowed in async function!");
        }

        return new js.YieldExpression(this.argument.toJS())
            .from(this);
    }
}

export class ArrayExpression extends Expression {
    constructor(elements) {
        super();
        
        this.elements = elements;
    }

    _toJS(o) {
        let array = [];
        for (let element of this.elements) {
            array.push(element.toJS(o));
        }
        return new js.ArrayExpression(array)
            .from(this);
    }
}

export class ObjectExpression extends Expression {
    constructor(properties) {
        super();
        
        this.properties = properties;
    }

    _toJS(o) {
        let props = [];
        for (let prop of this.properties) {
            props.push(prop.toJS(o));
        }

        return new js.ObjectExpression(props)
            .from(this);
    }
}

export class Assignable extends Node {

}



export class Property extends Node {
    constructor(key, value, kind = 'init') {
        super();
        
        this.key = key;
        this.value = value;
        this.kind = kind;
    }

    _toJS(o) {
        return new js.Property(
            this.key.toJS(o),
            this.value.toJS(o),
            this.kind
            ).from(this);
    }
}

export class SpreadElement extends Node {
    constructor(value) {
        super();
        
        this.value = value;
    }

    _toJS(o) {
        return new js.SpreadElement(this.value.toJS(o))
            .from(this);
    }
}




export class Pattern extends Node {
    * extractVariables() {
        throw new Error('Not implemented yet');
    }

    extractAssigns(target) {
        throw new Error('Not implemented yet');
    }
}

export class SpreadPattern extends Pattern {
    constructor(pattern) {
        super();
        
        this.pattern = pattern;
    }

    * extractVariables() {
        if (this.pattern instanceof Identifier) {
            yield this.pattern.name;
        } else if (this.pattern instanceof Pattern) {
            yield* this.pattern.extractVariables();
        } else this.pattern.error('Token not allowed in Property alias!');
    }
}

export class PropertyAlias extends Pattern {
    constructor(identifier, pattern) {
        super();
        
        this.identifier = identifier;
        this.pattern = pattern;
    }

    * extractVariables() {
        if (this.pattern instanceof Identifier) {
            yield this.pattern.name;
        } else if (this.pattern instanceof Pattern) {
            yield* this.pattern.extractVariables();
        } else this.pattern.error('Token not allowed in Property alias!');
    }
}

export class ArrayPattern extends Pattern {
    constructor(patterns) {
        super();
        
        this.patterns = patterns;
    }

    hasSplat() {
        let i = 0;
        for (let param of this.patterns) {
            if (param instanceof SpreadPattern) {
                return i;
            }

            i++;
        }

        return -1;
    }

    * extractVariables() {
        for (let pattern of this.patterns) {
            if (pattern instanceof Identifier) {
                yield pattern.name;
            } else if (pattern instanceof Pattern) {
                yield* pattern.extractVariables();
            } else pattern.error(`Token not allowed in ArrayPattern`);
        }
    }


    // extracts the individual extract or assign statements from an array pattern
    * extractAssigns(target, declare=true, def = null) {
        let
        itervar = nuVar('iterator'),
        nextval = new js.MemberExpression(
            getJSMethodCall([itervar, 'next'], []),
            new js.Identifier('value')
        );
        
        if (declare) yield new js.VariableDeclarator(new js.Identifier(itervar), getJSIterable(target));
        else yield new js.AssignmentExpression('=', new js.Identifier(itervar), getJSIterable(target));
        for (let pattern of this.patterns) {
            if (pattern instanceof Identifier) {
                if (declare) yield new js.VariableDeclarator(pattern, nextval);
                else yield new js.AssignmentExpression('=', pattern, nextval);
            } else if (
                pattern instanceof ArrayPattern ||
                pattern instanceof ObjectPattern) {
                    
                var identifier;
                if (declare) {
                    identifier = new js.Identifier(nuVar('ph'));
                    yield new js.VariableDeclarator(identifier, nextval);
                } else {
                    const [name] = this.getOpvars(1);
                    const identifier = new js.Identifier(name);
                    yield new js.AssignmentExpression('=', identifier, nextval);
                }

                yield* pattern.extractAssigns(identifier, declare);
                
                if (!declare) {
                    this.freeOpvars([identifier.name]);
                }
            } else {
                pattern.error('Invalid pattern for assignment type!');
            }
        }
    }
}

export class ObjectPattern extends Pattern {
    constructor(patterns) {
        super();
        
        this.patterns = patterns;
    }

    * extractVariables() {
        for (let pattern of this.patterns) {
            if (pattern instanceof Identifier) {
                yield pattern.name;
            } else if (pattern instanceof Pattern) {
                yield* pattern.extractVariables();
            } else pattern.error('Token not allowed in ObjectPattern');
        }
    }

    * extractAssigns(target, declare = true, def = null) {
        for (let pattern of this.patterns) {
            if (pattern instanceof Identifier) {
                let access = new js.Identifier(pattern.name);
                if (declare) yield new js.VariableDeclarator(
                    access,
                    new js.MemberExpression(target, access));
                else if (declare) yield new js.VariableDeclarator(
                    '=',
                    access,
                    new js.MemberExpression(target, access));
            }

            // must be fixed
            if (pattern instanceof PropertyAlias) {
                let me = new js.MemberExpression(target, pattern.identifier);
                if (pattern.pattern instanceof Identifier) {
                    if (declare) yield new js.VariableDeclarator(
                        pattern.pattern,
                        me);
                    else yield new js.AssignmentExpression(
                        '=',
                        pattern.pattern,
                        me);
                } else if (
                    pattern.pattern instanceof ObjectPattern ||
                    pattern.pattern instanceof ArrayPattern) {

                    yield* pattern.pattern.extractAssigns(me);
                }
            }
        }
    }
}

export class DefaultPattern extends Pattern {
    constructor(pattern, expression) {
        super();
        
        this.pattern = pattern;
        this.expression = expression;
    }

    * extractAssigns(jsVal, declare = true) {
        if (this.pattern instanceof Identifier) {
            
        }
    }

    * extractVariables() {
        if (this.pattern instanceof Identifier) {
            yield this.pattern.name;
        } else if (this.pattern instanceof Pattern) {
            yield* this.pattern.extractVariables();
        } else this.pattern.error('Token not allowed in ObjectPattern');
    }
}

export class Super extends Statement {
    _toJS(o) {
        return new js.Super().from(this);
    }
}

export class ClassExpression extends Expression {
	constructor(identifier = null, superClass = null, body = []) {
		super();
		
				
		this.identifier = identifier;
		this.superClass = superClass;
		this.body = body;
	}
	
	_toJS(o) {
	    let body = [], props = [], statprops = [];
	    
	    for (let line of this.body) {
	        if (line instanceof MethodDefinition) {
	            
	            if (line.value.async) {
	                // async methods are not supported in classes so instead they have 
	                // to be added to the list of prototype properties
	                let bin = line.static ? statprops : props;
	                if (line.kind !== "method") {
	                    line.error(
	                        `"${line.kind}" method type not allowed as async in class definitions!`
	                        );
	                }
	                
                    bin.push(
                        new js.Property(
                            line.key,
                            line.value.toJS(o)
                            )
                        );
	            } else
	                body.push(line.toJS(o));
	        } else if (line instanceof ClassProperty) {
	            props.push(line.toJS(o));
	        } else {
	            line.error('Class body item unrecognized!');
	        }
	    }
	    
	    // create class
	    let superClass  = defined(this.superClass) ? this.superClass.toJS(o) : null;
	    let cls         = new js.ClassExpression(null, superClass, body);
	    
	    if (props.length === 0 && statprops.length === 0) {
	        if (defined(this.identifier)) {
	            return getJSAssign(this.identifier.name, cls, 'const')
                    .from(this);
	        } else {
	            return cls.from(this);
	        }
	    } else {
	        let rapper = getJSMethodCall([LIB, 'classify'], [
	            cls,
	            new js.ObjectExpression(props)
	        ]);
	        
	        if (statprops.length > 0) {
	            rapper.arguments.push(
	                new js.ObjectExpression(statprops)
	                );
	        }
	        
	        if (defined(this.identifier)) {
	            return getJSAssign(this.identifier.name, rapper, 'const')
                    .from(this);
	        } else {
	            return rapper.from(this);
	        }
	    }
	}
	
	* extractVariables() {
	    if (defined(this.identifier)) {
	        yield this.identifier.name;
	    } else {
	        this.error('Cannot extract name from anonymous class!');
	    }
	}
}

export class MethodDefinition extends Node {
	constructor(key, value, kind = "method", isStatic = false, computed = false) {
		super();
		
				
		this.key = key;
		this.value = value;
		this.kind = kind;
		this.static = isStatic;
		this.computed = computed;
	}
	
	_toJS(o) {
	    return new js.MethodDefinition(
	        this.key.toJS(o),
	        this.value.toJS(o),
	        this.kind,
	        this.computed,
	        this.static
	        ).from(this);
	}
}

export class ClassProperty extends Node {
    constructor(key, value, computed = false) {
        super();
                
        this.key = key;
        this.value = value;
        this.computed = computed;
    }
    
    _toJS(o) {
        return new js.Property(
            this.key.toJS(o),
            this.value.toJS(o),
            this.computed
            ).from(this);
    }
}


export class FunctionDeclaration extends Declaration {
    constructor(identifier, func) {
        super();
                
        this.identifier = identifier;
        this.func = func;
    }
    
    _toJS(o) {
        if (this.parent instanceof Property)
            return new js.Property(
                this.identifier,
                this.func.toJS(o)
                ).from(this);
        else
            return getJSDeclare(
                this.identifier,
                this.func.toJS(o), 
                'const'
                ).from(this);
    }
    
    * extractVariables() {
        // yields only the function name
        yield this.identifier.name;
        return;
    }
}


export class FunctionExpression extends Expression {
    constructor(params, body, bound = false, modifier = '') {
        super();
        
        this.params = params;
        this.body = body;
        this.bound = bound;
        this.modifier = modifier;
    }

    hasSplat() {
        let i = 0;
        for (let param of this.params) {
            if (param instanceof SpreadPattern) {
                return i;
            }

            i++;
        }

        return -1;
    }

    _toJS(o) {
        let fn;
        
        if (this.modifier === '*') {
            fn = this.generatorToJs(o);
        } else if (this.modifier === '~') {
            fn = this.asyncToJs(o);
        } else if (this.modifier === '~*') {
            fn = this.asyncGeneratorToJs(o);
        } else {
            fn = this.regularToJs(o);
        }
        
        // if function is bound return <function expression>.bind(this)
        if (this.bound) {
            return new js.CallExpression(
                new js.MemberExpression(fn, new js.Identifier('bind')),
                [new js.ThisExpression()]
                ).from(this);
        } else {
            return fn.from(this);
        }
    }

    * walkParams() {
        for (let param of this.params) {
            let gen = this.body.walk();
            let skip = undefined;
            while (true) {
                let ctrl = gen.next(skip);
                if (ctrl.done)
                    return;
                const node = ctrl.value;

                if (node instanceof FunctionExpression) {
                    skip = true;
                } else {
                    skip = undefined;
                }

                yield node;
            }
        }
    }

    * walkBody() {
        let gen = this.body.walk();
        let skip = undefined;
        while (true) {
            let ctrl = gen.next(skip);
            if (ctrl.done)
                return;
            const node = ctrl.value;

            if (node instanceof FunctionExpression) {
                skip = true;
            } else {
                skip = undefined;
            }

            yield node;
        }
    }

    * walkFunction() {
        yield* this.walkParams();
        yield* this.walkBody();
    }

    // processes parameters of the function, and take care of patterns in the body
    processParams(o) {
        let i = 0, body = [], params = [];

        for (let pram of this.params) {
            let param, def = null;
            if (pram instanceof DefaultPattern) {
                param = pram.pattern;
                def = pram.expression;
            } else {
                param = pram;
            }
            
            if (param instanceof Identifier) {
                params.push(param.toJS(o));
                if (def !== null) {
                    body.push(
                        getJSAssign(
                            param.name,
                            getJSConditional(param.name, def.toJS(o))
                            )
                        );
                }
                i++;
                continue;
            }

            if (param instanceof ArrayPattern || param instanceof ObjectPattern) {
                let ph = nuVar('patternPlaceholder');
                params.push(new js.Identifier(ph));
                if (def !== null) {
                    body.push(
                        getJSAssign(
                            ph,
                            getJSConditional(ph, def.toJS(o))
                            )
                        );
                }
                body.push(getJSDeclare(param, new js.Identifier(ph), 'const'));

                i++;
                continue;
            }

            if (param instanceof SpreadPattern) {
                body.push(getJSDeclare(param.pattern, getJSMethodCall(
                    [LIB, 'restargs'],
                    [new js.Identifier('arguments'), new js.Literal(i)]),
                    'const'
                ));

                break;
            }

            param.error('This should not be here!');
        }

        return {params, prebody: body};
    }

    regularToJs(o, noparams = false) {
        let body = this.body.toJS(o);
        if (!(body instanceof js.BlockStatement)) {
            const instructions = [
                new js.ReturnStatement(body)
            ];
            body = new js.BlockStatement(instructions);
        }

        let i = 0;
        

        if (noparams) {
            var [params, prebody] = [[], []];
        } else {
            var {params, prebody} = this.processParams(o);
        }

        body.body.prepend(statement(prebody));
        return new js.FunctionExpression(
            null,
            params,
            body,
            null);
    }

    generatorToJs(o, noparams = false) {
        let jsnode = this.regularToJs(o, noparams);
        jsnode.generator = true;
        return jsnode;
    }

    asyncToJs(o, noparams = false) {
        return getJSMethodCall([LIB, 'async'], [this.generatorToJs(o, noparams)]);
    }

    asyncGeneratorToJs(o, noparams = false) {
        let ctrlVar = this._ctrl = nuVar('observableController');

        let ctrl = getJSAssign(
            ctrlVar, 
            getJSMethodCall([LIB, 'getObservableCtrl'], []), 
            'const');
        let mem = new js.AssignmentExpression(
            '=',
            getJSMemberExpression([ctrlVar, 'code']),
            new js.CallExpression(
                new js.MemberExpression(
                    this.asyncToJs(o, true), 
                    new js.Identifier("bind")
                    ),
                [new js.ThisExpression()]
                )
            );
        let ret = new js.ReturnStatement(getJSMemberExpression([
            ctrlVar,
            'observable'
        ]));

        let {params, prebody} = this.processParams(o);
        let block = new js.BlockStatement([ctrl, mem, ret].map(el => {
            if (el instanceof js.Expression) {
                return new js.ExpressionStatement(el);
            } else {
                return el;
            }
        }));

        if (noparams) {
            params = [];
            prebody = [];
        }

        block.body.prepend(prebody);

        return new js.FunctionExpression(
            null,
            params,
            block);
    }

    get async() {
        return this.modifier.includes('~');
    }

    get generator() {
        return this.modifier.includes('*');
    }
}

export class SequenceExpression extends Expression {
    constructor(expressions) {
        super();
        
        this.expressions = expressions;
    }
}

export class UnaryExpression extends Expression {
    constructor(operator, argument, prefix = true) {
        super();
            
        this.operator = operator;
        this.argument = argument;
        this.prefix = prefix;
    }
    
    _toJS(o) {
        var operator;
        if (this.operator in convert) {
            operator = convert[this.operator];
        } else {
            operator = this.operator;
        }
        
        if (!unaryOperators.has(operator)) {
            this.error('Invalid unary operator!');
        }
        
        return new js.UnaryExpression(operator, this.prefix, this.argument.toJS(o))
            .from(this);
    }
}

const smoothOperators = {
    '//=': function(left, right) {
        return getJSMethodCall(
            ['Math', 'floor'],
            [new js.BinaryExpression('/', left, right)]
            );
    },
    '^=': function(left, right) {
        return getJSMethodCall(
            ['Math', 'pow'],
            [left, right]
            );
    }
};

export class BinaryExpression extends Expression {
    constructor(operator, left, right) {
        super();
        
        this.operator = operator;
        this.left = left;
        this.right = right;
    }

    _toJS(o) {
        let left = this.left.toJS(o);
        let right = this.right.toJS(o);
        let operator;

        if (this.operator in convert) {
            return new js.BinaryExpression(
                convert[this.operator],
                left,
                right
                ).from(this);
        }

        if ((this.operator + '=') in smoothOperators) {
            let fn = smoothOperators[this.operator + '='];
            return fn(left, right).from(this);
        }
        
        return new js.BinaryExpression(this.operator, left, right)
            .from(this);
    }
}

// this is different from other operaetor expressions cause
// bizubee supports chaining of comparisons as in if 1 < c < 10 do ...
export class ComparativeExpression extends Expression {
    constructor(operator, left, right) {
        super();
                
        this.operators = [operator];
        this.operands = [left, right];
    }
    
    // used by the parser to chain additional operators/operands to expression
    chain(operator, expression) {
        
        this.operators.push(operator);
        this.operands.push(expression);
        return this;
    }
    
    _toJS(o) {
        const [opid]    = this.getOpvars(1);
        const opvar     = new js.Identifier(opid);
        
        let
        left    = null,
        right   = null,
        prev    = null,
        out     = null
        ;
        
        
        for (let i = 0; i < this.operators.length; i++) {
            const lastiter = (i + 1 === this.operators.length);
            let
            jsRight,
            compare,
            originalOp = this.operators[i],
            op = (originalOp in convert) ? convert[originalOp] : originalOp
            ;
            
            left    = prev || this.operands[i].toJS(o);
            right   = this.operands[i + 1].toJS(o);
            
            if (right instanceof js.Identifier) {
                jsRight = right.toJS(o);
                prev = jsRight;
            } else {
                // the last expression will only be evaluated once, so no need to save it in opvar
                // otherwise we must save it to prevent reevaluation
                jsRight = (lastiter) ? right : new js.AssignmentExpression(
                    '=',
                    opvar,
                    right
                    );
                prev = opvar;
            }
            
            // the actual comparison expression
            compare = new js.BinaryExpression(
                op,
                left,
                jsRight
                );
            
            // at first the lefthand operand in the && expression is the initial comparison
            // after that it is always the previous && expression
            out = (out === null) 
            ? compare
            : new js.LogicalExpression(
                '&&',
                out,
                compare
                )
            ;
        }
        
        return out.from(this);
    }
}

export class AssignmentExpression extends Expression {
    constructor(operator, left, right) {
        super();
        
        this.operator = assertAssignmentOperator(operator);
        this.left = left;
        this.right = right;
    }

    _toJS(o) {
        if (this.left instanceof Identifier ||
            this.left instanceof MemberExpression) {
            let rightHandSide;
            if (this.operator in smoothOperators) {
                let trans = smoothOperators[this.operator];
                let left = this.left.toJS(o);
                let right = trans(left, this.right.toJS(o));
               
                return new js.AssignmentExpression('=', left, right)
                    .from(this);
            } else {
                return new js.AssignmentExpression(
                    this.operator,
                    this.left.toJS(o),
                    this.right.toJS(o)
                    ).from(this);
            }
        } else if (this.left instanceof Pattern) {
            if (this.operator !== '=') {
                this.left.error('Patterns not allowed with assignment type');
            }
            
            let nvar = nuVar('patternPlaceholder'), arr = [new getJSAssign(nvar, this.right)];
            for (let assign of this.left.extractAssigns(
                new js.Identifier(nvar))) {
                arr.push(assign);
            }

            return arr;
        } else {
            this.left.error('Invalid assignable!');
        }
    }
}

export class UpdateExpression extends Expression {
    constructor(operator, argument, prefix) {
        super();
        
        this.operator = assertUpdateOperator(operator);
        this.argument = argument;
        this.prefix = prefix;
    }
}

export class LogicalExpression extends Expression {
    constructor(operator, left, right) {
        super();
        
        this.operator = operator;
        this.left = left;
        this.right = right;
    }
    
    _toJS(o) {
        return new js.LogicalExpression(
            this.operator,
            this.left.toJS(o),
            this.right.toJS(o)
            ).from(this);
    }
}


export class CallExpression extends Expression {
    constructor(callee, args, isNew = false, doubtful = false) {
        super();
        
        this.callee = callee;
        this.arguments = args;
        this.isNew = isNew;
        this.doubtful = doubtful;
    }

    _toJS(o) {
        var
        args = [],
        callee = this.callee.toJS(o),
        ctor = this.isNew ? js.NewExpression : js.CallExpression;
        
        for (var argument of this.arguments) {
            args.push(argument.toJS(o));
        }
        
        if (this.doubtful) {
            let [opvar] = this.getOpvars(1);
            let left    = getJSAssign(opvar, callee);
            let undie   = new js.Identifier('undefined');
            
            let node    = new js.ConditionalExpression(
                new js.BinaryExpression('===', left, undie),
                undie,
                new ctor(left.left, args)
                );
            
            
            this.freeOpvars([opvar]);
            return node.from(this);
        } else {
            return new ctor(callee, args).from(this);            
        }
    }
}

export class NewExpression extends CallExpression {

}

export class MemberExpression extends Expression {
    // doubtful parameter is true if there there are question marks involved
    constructor(object, property, computed = false, doubtful = false) {
        super();
        
        this.object = object;
        this.property = property;
        this.computed = computed;
        this.doubtful = doubtful;
    }

    _toJS(o) {
        if (!this.doubtful) {
            let object = this.object.toJS(o);
            let right = this.property.toJS(o);
            return new js.MemberExpression(object, right, this.computed)
                .from(this);
        } else {
            let [opvar] = this.getOpvars(1);
            let left    = getJSAssign(opvar, this.object.toJS(o));
            let undie   = new js.Identifier('undefined');
            
            let node    = new js.ConditionalExpression(
                new js.BinaryExpression('===', left, undie),
                undie,
                new js.MemberExpression(left.left, this.property.toJS(o), this.computed)
                );
            
            
            this.freeOpvars([opvar]);
            return node.from(this);
        }
    }
}

export class DefinedExpression extends Expression {
    constructor(expression) {
        super();
                
        this.expression = expression;
    }
    
    _toJS(o) {
        return new js.BinaryExpression(
            '!==',
            this.expression.toJS(o),
            new js.Identifier('undefined')
            ).from(this);
    }
}

export class SwitchCase extends Node {
    constructor(test, consequent) {
        super();
        
        this.test = test;
        this.consequent = consequent;
    }
}

// the catch part of try-catch
export class CatchClause extends Node {
    constructor(param, body) {
        super();
        
        this.param = param;
        this.body = body;
    }
    
    _toJS(o) {
        if (this.param instanceof Identifier) {
            return new js.CatchClause(
                this.param.toJS(o),
                this.body.toJS(o)
                ).from(this);
        } else if (this.param instanceof Pattern) {
            // same usual trickery to support error destructuring in catch clause
            let placeholder     = nuVar('patternPlaceholder');
            let holderVar       = new js.Identifier(placeholder);
            let declarations    = getJSDeclare(this.param, holderVar, 'const');
            let block           = this.body.toJS(o);
            
            block.body.unshift(declarations);
            return new js.CatchClause(holderVar, block)
                .from(this);
        }
        
        this.param.error('Unrecognized parameter type!');
    }
}

export class Identifier extends Expression {
    constructor(name, process = true) {
        super();

        forbid(name);
        this.name = name;
    }

    _toJS(o) {
        return new js.Identifier(this.name)
            .from(this);
    }
}

export class Literal extends Expression {
    constructor(value) {
        super();

        this.value = value;
    }
}

export class TemplateString extends Expression {
    
    // removes unnecessary escapes from string literals being translated to JS
    static removeEscapes(string) {
        const buff = []
        var escapeMode = false;
        for (var c of string) {
            if (escapeMode) {
                escapeMode = false;
                if (stringEscapeTable.hasOwnProperty(c)) {
                    buff.push(stringEscapeTable[c]);
                } else {
                    buff.push(c);
                }
            } else {
                if (c === '\\') {
                    escapeMode = true;
                    continue;
                } else {
                    buff.push(c);
                }
            }
        }
        
        return buff.join('');
    }
    
    constructor(value, parts) {
        super(value);
        const parser = require('./parser');
        
        this.parts = [];
        for (var part of parts) {
            // parts alternate between strings and arrays of tokens
            if (part instanceof Array) {
                // if part is Array of tokens, parse then search for Expression in AST
                // and reasign parent to this TemplateString
                
                var ctrl = parser.parseRawTokens(part, {});
                if (ctrl.tree.body.length === 1) {
                    const node = ctrl.tree.body[0];
                    if (node instanceof ExpressionStatement) {
                        const expr = node.expression;
                                                this.parts.push(expr);
                    } else {
                        this.parts.push(null);
                    }
                } else {
                    this.parts.push(null);
                }
            } else {
                this.parts.push(part);
            }
        }
    }
    
    _toJS(o) {
        const ctor = this.constructor;
        if (this.parts.length === 1) {              // if there is no interpolation
            return new js.Literal(ctor.removeEscapes(this.parts[0]))
                .from(this);
        } else if (this.parts.length > 2) {             // if interpolation exists in string
            let add = new js.BinaryExpression(
                '+',
                new js.Literal(ctor.removeEscapes(this.parts[0])),      // cause the first part is always a string
                this.parts[1].toJS(o)               // second part is an interpolation
                );
            for (var i = 2; i < this.parts.length; i++) {
                const part = this.parts[i];
                if (part === null) {                // if interpolated expression is invalid it is set to null in `parts`
                    this.error('Only single expressions allowed per interpolation!');
                }
                
                // parts alternate between expression and string
                if (part instanceof Expression) {
                    add = new js.BinaryExpression(
                        '+',
                        add,
                        part.toJS(o)
                        );
                } else if (part.constructor === String) {
                    add = new js.BinaryExpression(
                        '+',
                        add,
                        new js.Literal(
                            this.constructor.removeEscapes(part)
                            )
                        );
                } else {
                    part.error('Interpolated value not expression!');
                }
            }
            
            return add.from(this);
        } else {
            this.error('Internal compiler error!');
        }
    }
}

// a raw single quoted string
export class StringLiteral extends Literal {
    constructor(value) {
        super(value.substring(1, value.length - 1));
    }

    _toJS(o) {
        return new js.Literal(this.value)
            .from(this);
    }
}

export class NumberLiteral extends Literal {
    constructor(value) {
        super(value);
    }

    _toJS(o) {
        return new js.Literal(+this.value)
            .from(this);
    }
}

export class ModuleSpecifier extends Statement {
    constructor(local) {
        super();
                this.local = local;
    }
}


export class ModuleDeclaration extends Statement {

}


export class ImportSpecifier extends ModuleSpecifier {
    constructor(imported, local = null) {
        super(local || imported);
        
        this.imported = imported;
    }
}

export class ImportNamespaceSpecifier extends ModuleSpecifier {
}

export class ImportDefaultSpecifier extends ModuleSpecifier {
}

export class ImportDeclaration extends ModuleDeclaration {
    constructor(specifiers, source) {
        super();
        
        this.specifiers = specifiers;
        this.path = source;
    }

    requireDefault() {
        return new js.MemberExpression(
            this.require(),
            getJSMemberExpression([LIB, 'symbols', 'default']),
            true
            ).from(this);
    }

    // generate require code for 
    require() {
        return getJSMethodCall([LIB, 'require'], [
            new js.Literal(+globalHash(this.program.resolve(this.path)))
        ]);
    }


    _toJS(o) {
        const support = o.importVar || globalVar('bzbSupportLib');
        const requiring = this.require();

        const declarators = [];
        let ivar;
        if (this.specifiers.length === 1) {
            ivar = requiring;
        } else {
            ivar = new js.Identifier(nuVar('imports'));

            declarators.push(
                new js.VariableDeclarator(
                    ivar,
                    requiring
                    )
                );
        }

        for (var specifier of this.specifiers) {
            if (specifier instanceof ImportDefaultSpecifier) {
                declarators.push(
                    new js.VariableDeclarator(
                        new js.Identifier(specifier.local.name),
                        new js.MemberExpression(
                            ivar,
                            getJSMemberExpression([
                                support,
                                'symbols',
                                'default'
                                ]),
                            true
                            )
                        )
                    );
            } else if (specifier instanceof ImportNamespaceSpecifier) {
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
                        new js.MemberExpression(ivar, specifier.imported)
                        )
                    );
            }
        }
        
        return new js.VariableDeclaration(
            declarators,
            'const'
            ).from(this);
    }
}

class ExportDeclaration extends ModuleDeclaration {

}

export class ExportSpecifier extends ModuleSpecifier {
    constructor(local, exported = null) {
        super(local);
        
        this.exported = exported || local;
    }
}

export class ExportNamedDeclaration extends ExportDeclaration {
    constructor(declaration, specifiers, source = null) {
        super();
        
        this.declaration = declaration;
        this.specifiers = specifiers;
        this.path = source;
    }

    _toJS(o) {
        const lines = [];
        const gvar = o.exportVar || globalVar('exports');
        if (this.declaration === null) {
            for (var specifier of this.specifiers) {
                lines.push(
                    new js.ExpressionStatement(
                        new js.AssignmentExpression(
                            '=',
                            getJSMemberExpression(
                                [gvar, specifier.exported.name]
                                ),
                            new js.Identifier(specifier.local.name)
                            )
                        ).from(this)
                    );
            }
        } else {
            const declaration = this.declaration;
            if (declaration instanceof VariableDeclaration) {
                lines.push(declaration.toJS(o));
                for (var name of declaration.extractVariables()) {
                    lines.push(
                        new js.ExpressionStatement(
                            new js.AssignmentExpression(
                                '=',
                                getJSMemberExpression(
                                    [gvar, name]
                                    ),
                                new js.Identifier(name)
                                )
                            ).from(this)
                        );                    
                }
            } else {
                let name = declaration.identifier.name;
                if (declaration instanceof FunctionDeclaration) {
                    const scope = this.program;
                    
                    if (scope._funcDeclarations.has(name)) {
                        declaration.error('Cannot declare function more than once!');
                    }
                    
                    scope._funcDeclarations.set(
                        name,
                        declaration.func.toJS(o)
                        );
                } else {
                    lines.push(declaration.toJS(o));
                }

                lines.push(
                    new js.ExpressionStatement(
                        new js.AssignmentExpression(
                            '=',
                            getJSMemberExpression([gvar, name]),
                            new js.Identifier(name)
                            )
                        ).from(this)
                    );
            }
        }

        return lines;
    }
}


export class ExportDefaultDeclaration extends ExportDeclaration {
    constructor(declaration) {
        super();
        
        this.declaration = declaration;
    }

    _toJS(o) {
        const exportVar = o.exportVar || globalVar('exports');
        const bzbVar = LIB;
        if (this.declaration instanceof Expression) {
            return new js.ExpressionStatement(
                new js.AssignmentExpression(
                    '=',
                    new js.MemberExpression(
                        new js.Identifier(exportVar),
                        getJSMemberExpression([
                            bzbVar,
                            'symbols',
                            'default'
                            ]),
                        true
                        ),
                    line.declaration
                    )
                ).from(this);
        } else {
            const name = this.declaration.identifier.name;
            if (this.declaration instanceof FunctionDeclaration) {
                const scope = this.program;
                
                if (scope._funcDeclarations.has(name)) {
                    this.declaration.error('Cannot declare function more than once!');
                }
                
                scope._funcDeclarations.set(
                    name,
                    this.declaration.func.toJS(o)
                    );

                return new js.ExpressionStatement(
                    new js.AssignmentExpression(
                        '=',
                        new js.MemberExpression(
                            new js.Identifier(exportVar),
                            getJSMemberExpression([
                                bzbVar,
                                'symbols',
                                'default'
                                ]),
                            true
                            ),
                        new js.Identifier(name)
                        ),
                    ).from(this);
            } else {
                return [
                    this.declaration.toJS(o),
                    new js.ExpressionStatement(
                        new js.AssignmentExpression(
                            '=',
                            new js.MemberExpression(
                                new js.Identifier(exportVar),
                                getJSMemberExpression([
                                    bzbVar,
                                    'symbols',
                                    'default'
                                    ])
                                ),
                                true
                            ),
                            new js.Identifier(name)
                        ).from(this)
                ]
            }
        }
    }
}

export class ValueExpression extends Expression {
    constructor(statement) {
        super();
        this.statement = statement;
    }

    _toJS(o) {
        const parentFunc = this.getParentFunction();
        const body = this.statement.toJS(o);
        var block = (body instanceof Array)?
            new js.BlockStatement(body) :
            new js.BlockStatement([body]);

        if (parentFunc === null || parentFunc.modifier === '') {
            return new js.CallExpression(
                new js.FunctionExpression(
                    null,
                    [],
                    block
                    ),
                []
                );
        } else {
            return new js.YieldExpression(
                new js.CallExpression(
                    new js.FunctionExpression(
                        null,
                        [],
                        block,
                        true
                        ),
                    []
                    ),
                true
                );
        }
    }
}


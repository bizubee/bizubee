
import * as js from './js-nodes';
import escodegen from 'escodegen';
import pathlib from 'path'
import fs from 'fs';
import {addSpacing, repeat} from './format';
import {Lines, Line} from './errors';
import {Queue} from './collectibles';

const acorn = require("acorn");
const ext = require("./lib").extension;
const _ = null;

const PKEY = Symbol('Program key');
const OKEY = Symbol('Options key');

const IGNORE = Symbol('Ingorable properties');

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

const PATH_MAP = new Map();
const PARENT_KEY = Symbol('parent');
const POSITION_KEY = Symbol('position');

const vars = new Set();
const nodeQueue = new Queue();

let LIB, EXP, DEFAULT, MAX_LEAD = '', PATHN = 0;

function getLibn(path) {
    if (PATH_MAP.has(path)) {
        return PATH_MAP.get(path);
    } else {
        PATH_MAP.set(path, PATHN);
        return PATHN++;
    }
}

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
        while (i --> 0) {
            this.prepend(elems[i]);
        }
    } else {
        this.unshift(elems);
    }
}

function defined(val) {
    return val !== undefined && val !== null;
}

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
    return getJSMethodCall([LIB, 'last'], jsargs);
}

function nuVar(txt = 'bzbVar') {
    let variable = `${MAX_LEAD}_${txt}`;
    if (vars.has(variable)) {
        let i = 0, numeratedVar = null;
        do {
            i++;
            numeratedVar = `${variable}${i}`;
        } while (vars.has(numeratedVar));
        
        variable = numeratedVar;
    }
    
    vars.add(variable);
    return variable;
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

function setParent(subject, parent) {
    if (subject instanceof Array) {
        let i = subject.length;
        while (i --> 0) {
            setParent(subject[i], parent);            
        }
    } else if (subject instanceof Node) {
        subject[PARENT_KEY] = parent;
    }
}

function getJSVar(name, constant = false, init = null) {
    return new js.VariableDeclaration(
        [new js.AssignmentExpression(
            '=',
            new js.Identifier(name),
            init.toJS({})
        )],
        (constant) ? 'const' : 'let'
    );
}

function getJSAssign(name, value, type) {
    let id = new js.Identifier(name);
    let assign = new js.AssignmentExpression(
        '=',
        id,
        value);
    if (defined(type)) {
        return new js.VariableDeclaration(
            [new js.VariableDeclarator(id, value)],
            type);
    } else {
        return new js.AssignmentExpression(
            '=',
            new js.Identifier(name),
            value);
    }
}

function getJSDeclare(pattern, jvalue, type = 'const') {
    
    if (pattern instanceof Identifier || pattern instanceof js.Identifier) {
        return new js.VariableDeclaration([
                new js.VariableDeclarator(pattern.toJS({}), jvalue)
            ], type);
    }
    
    if (pattern instanceof String) {
        return new js.VariableDeclaration([
                new js.VariableDeclarator(new js.Identifier(pattern), jvalue)
            ], type);
    }
    
    if (pattern instanceof ArrayPattern) {
        let arr = [];
        for (let sp of pattern.extractAssigns(jvalue)) {
            arr.push(sp);
        }

        return new js.VariableDeclaration(arr, type);        
    }


    if (pattern instanceof ObjectPattern) {
        let source, arr;
        if (jvalue instanceof js.Identifier) {
            arr = [];
            source = jvalue;
        } else {
            let rvar = nuVar('patternPlaceholder');
            let idf = new js.Identifier(rvar);
            arr = [new js.VariableDeclarator(idf, jvalue)];
            source = new js.Identifier(rvar);
        }

        for (let sp of pattern.extractAssigns(source)) {
            arr.push(sp);
        }

        return new js.VariableDeclaration(arr, type);        
    }

    if (pattern instanceof Identifier) {
        return new js.VariableDeclaration([new js.VariableDeclarator(pattern, jvalue)], type);
    }

    pattern.error('Invalid declaration type!');
}

function getJSMethodCall(names, args) {
    return new js.CallExpression(
        getJSMemberExpression(names), args);
}

function getJSMemberExpression(names) {
    if (names.length === 0) {
        throw new Error('Must have at least one man!');
    } else {
        let lead = new js.Identifier(names[0]);
        for (let i = 1; i < names.length; i++) {
            lead = new js.MemberExpression(lead, new js.Identifier(names[i]));
        }

        return lead;
    }
}

function getJSIterable(target) {
    return new js.CallExpression(
        new js.MemberExpression(
            target,
            getJSMemberExpression(['Symbol', 'iterator']),
            true),
        []
        );
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

// returns 
function getJSConditional(identifier, def) {
    if (identifier instanceof js.Identifier) {
        return new js.ConditionalExpression(
            new js.BinaryExpression('===', identifier, new js.Identifier('undefined')),
            def,
            identifier
            );
    } else if (typeof identifier === 'string') {
        return getJSConditional(new js.Identifier(identifier), def);
    } else {
        throw new Error('Conditional expression must use identifier!');
    }
}

export function wrap(node) {
    if (node instanceof BlockStatement) {
        return node;
    } else {
        return new BlockStatement([node]).pos(node[POSITION_KEY]);
    }
}


export class Node {
    constructor(loc = null) {
        setParent(this, null);

        this[IGNORE] = new Set();
        this.type = this.constructor.name;
        this.loc = null;
        nodeQueue.eat(this);
    }

    getOpvars(n) {
        return this
        .getParentScope()
        .getOpvars(n);
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

    // make sure this method is implemented for all node subclasses
    toJS() {
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
        let lines = new Lines(this.source, 4), i = 0;
        let output = this.program.parameters.output;

        if (this.program.parameters.throwSyntax) {
            if (this.filename === null)
                throw new Error(`Syntax error at position ${x},${y+1} in VM:\n\t${text}`);
            else
                throw new Error(`Syntax error at position ${x},${y+1} in file '${this.filename}':\n\t${text}`);
        }
        
        if (this.filename === null) output.log(`SyntaxError: ${text}\n\ton line ${y + 1} in VM:`);
        else output.log(`SyntaxError: ${text}\n\ton line ${y + 1} in file '${this.filename}'`);
        output.log();
        output.log();


        for (let line of lines) {
            if (Math.abs(i - y) < 4) {
                output.log(`${addSpacing(i + 1, 6)}|\t\t${line.untabbed}`);

                if (i === y) {
                    let offset = line.map(x);
                    output.log(`${addSpacing('', 6)} \t\t${repeat(' ', offset)}^`);
                }
            }

            i++;
        }

        process.exit();
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

export class Scope extends Node {
    constructor(statements) {
        super();
        setParent(statements, this);
        
        this.body = statements;
        this._opvars = [];
    }

    getOpvars(n) {
       let arr = new Array(n), i = 0;
       for (let i = 0; i < n; i++) {
            if (this._opvars.length === i)
                this._opvars.push(nuVar('op'));
            
            arr[i] = new js.Identifier(this._opvars[i]);
       }
       
       return arr;
    }

    getOpvarsDeclaration() {
        let identifiers = 
            this.getOpvars(this._opvars.length);
        return new js.VariableDeclaration(identifiers, 'let');
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
            let nodes = line.toJS(o);
            if (nodes instanceof Array) {
                for (let subline of nodes) {
                    yield statement(subline);
                }
            } else if (nodes instanceof js.Expression || nodes instanceof js.Statement) {
                yield statement(nodes);
            } else {
                line.error(`Invalid object ${typeof nodes}!`);
            }
        }
    }
}

export class Program extends Scope {
    constructor(statements) {
        super(statements);
        
        this.containsMain = false;
        
        while (nodeQueue.length > 0) {
            let node = nodeQueue.crap();
            node.onASTBuild({});
        }
    }
    
    resolve(path) {
        const dir     = pathlib.dirname(this.filename);
        return pathlib.resolve(dir, `${path}.${ext}`);
    }
    
    * getImports(dir, cache = new Set()) {
        const parser = require('./parser');
        for (var statement of this.body) {
            if (statement instanceof ImportStatement) {
                const abspath   = `${pathlib.resolve(dir, statement.path)}.${ext}`;
                if (cache.has(abspath)) {
                    continue;
                }
                const ctrl      = parser.parseFile(abspath, {browser: {root: false}});
                const ndir      = pathlib.dirname(abspath);
                yield*  ctrl.tree.getImports(ndir, cache);
                yield   [abspath, ctrl.tree];
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
        const directives        = [
            statement(new js.Literal('use strict')),
            this.getOpvarsDeclaration()
        ];
        
        for (let [abspath, program] of
            this.getImports(pathlib.dirname(this.filename), cache)) {
                
            const hash = getLibn(abspath);
            modmap.set(hash, program);
        }
        EXP = nuVar('exports');
        LIB = nuVar('bzbSupportLib');
        
        directives.push(getJSDeclare(
            new js.Identifier(LIB),
            acorn.parseExpressionAt(
                fs.readFileSync('src/fragments/lib.js', 'utf8'),
                0,
                {ecmaVersion: 6}
                ),
            'const'
            ));

        for (var [key, mod] of modmap) {
            modules.push(
                new js.Property(
                    new js.Literal('' + key),
                    mod.toJS(o)
                    )
                );   
        }
        
        directives.push(statement(getJSMethodCall(
            [LIB, 'setModules'],
            [new js.ObjectExpression(modules)]
            )));
            
     
        for (let jsline of this.getJSLines(o)) {
            directives.push(jsline);
        }
     
        if (this._opvars.length === 0)
            directives[1] = new js.EmptyStatement();
            
        return new js.BlockStatement(directives);
    }
    
    compileBrowserModule(o) {
        var instructions = statement([
            this.getOpvarsDeclaration()
        ]);

        for (let jsline of this.getJSLines(o)) {
            instructions.push(jsline);
        }

        if (this._opvars.length === 0)
            instructions.shift();

        return new js.FunctionExpression(
            null,
            [new js.Identifier(EXP)],
            new js.BlockStatement(instructions)
            );
    }
    
    runtimeCompile(o) {
        LIB = nuVar('bzbSupportLib');
        EXP = nuVar('moduleExports');
        var instructions = statement([
            new js.Literal("use strict"),
            this.getOpvarsDeclaration(),
            getJSAssign(LIB, getJSMethodCall(['require'], [new js.Literal('bizubee lib')]), 'const'),
            getJSDeclare(new js.Identifier(EXP, false), getJSMethodCall([LIB, 'module'], [])),
        ]) || o.instructions;

        for (let jsline of this.getJSLines(o)) {
            instructions.push(jsline);
        }

        instructions.append(statement([
            new js.AssignmentExpression(
                '=',
                getJSMemberExpression(['module', 'exports']),
                new js.Identifier(EXP)
                )
        ]));

        instructions.append(statement(
            new js.AssignmentExpression(
                '=',
                getJSMemberExpression(['global', 'main']),
                new js.Identifier('main')
                )
            )
            );
        

        if (this._opvars.length === 0)
            instructions[1] = new js.EmptyStatement();

        return new js.Program(instructions);
    }
    
    toJS(o) {
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
    toJS(o) {
        var instructions = [] || o.instructions;
        for (let line of this.body) {
            let nodes = line.toJS(o);
            if (nodes instanceof Array) {
                for (let subline of nodes) {
                    instructions.push(subline);
                }
            } else if (nodes instanceof js.Node) {
                if (nodes instanceof js.Expression) {
                    instructions.push(statement(nodes))
                } else instructions.push(nodes);
            } else {
                this.error(`Invalid object ${typeof nodes}!`);
            }
        }
        
        if (this._opvars.length > 0)
            instructions.unshift(
                this.getOpvarsDeclaration()
                );

        return new js.BlockStatement(instructions);
    }
}

export class ExpressionStatement extends Statement {
    constructor(expression) {
        super();
        setParent(expression, this);

        this.expression = expression;
    }

    toJS(o) {
        return new js.ExpressionStatement(this.expression.toJS(o));
    }
}

// *
export class IfStatement extends Statement {
    constructor(test, consequent, alternate = null) {
        super();
        setParent([test, consequent, alternate], this);

        this.test = test;
        this.consequent = consequent;
        this.alternate = alternate;
    }

    toJS(o) {
        let test        = this.test.toJS(o);
        let consequent  = this.consequent.toJS(o);
        let alternate   = null;

        if (this.alternate !== null) 
            alternate = this.alternate.toJS(o);

        return new js.IfStatement(test, consequent, alternate);
    }

    setAlternate(alternate) {
        setParent(alternate, this);
        this.alternate = alternate;

        return this;
    }
}

// *
export class BreakStatement extends Statement {
    constructor(label = null) {
        super();
        setParent(label, this);
        this.label = label;
    }

    toJS(o) {
        return new js.BreakStatement();
    }
}

// *
export class ContinueStatement extends Statement {
    constructor(label = null) {
        super();
        setParent(label, this);
        this.label = label;
    }

    toJS(o) {
        return new js.ContinueStatement();
    }
}

// *
export class SwitchStatement extends Statement {
    constructor(discriminant, cases) {
        super();
        setParent([discriminant, cases], this);
        
        this.discriminant = discriminant;
        this.cases = cases;
    }
}

// *
export class ReturnStatement extends Statement {
    constructor(argument, after) {
        super();
        setParent(argument, this);

        this.argument = argument;
        this.after = after;
    }

    toJS(o) {
        if (defined(this.after)) {
            if (this.after instanceof ReturnStatement)
                this.after.error('Cannot return from function multiple times!');
            
            let variableName    = nuVar('returnValue');
            let variable        = new js.Identifier(variableName);
            let lines           = [
                getJSDeclare(variable, this.argument.toJS(o), 'const')
            ];
            
            lines.append(this.after.toJS(o));
            lines.append(new js.ReturnStatement(variable));
            return statement(lines);
        } else {
            if (defined(this.argument))
                return new js.ReturnStatement(this.argument.toJS(o));
            else
                return new js.ReturnStatement();
        }
    }
}


export class ThrowStatement extends Statement {
    constructor(argument) {
        super();
        setParent(argument, this);

        this.argument = argument;
    }

    toJS(o) {
        return new js.ThrowStatement(this.argument.toJS(o));
    }
}

export class TryStatement extends Statement {
    constructor(block, catchClause = null, finalizer = null) {
        super();
        setParent([block, catchClause, finalizer], this);

        this.block = block;
        this.handler = catchClause;
        this.finalizer = finalizer;
    }
    
    toJS(o) {
        let handler = (defined(this.handler)) ? this.handler.toJS(o) : null;
        let finalizer = (defined(this.finalizer)) ? this.finalizer.toJS(o) : null;
        return new js.TryStatement(
            this.block.toJS(o),
            handler,
            finalizer
            );
    }
}


export class WhileStatement extends Statement {
    constructor(test, body) {
        super();
        setParent([test, body], this);

        this.test = test;
        this.body = body;
    }

    toJS(o) {
        let test = this.test.toJS(o);
        let body = this.body.toJS(o);

        return new js.WhileStatement(test, body);
    }
}

export class ForStatement extends Statement {
    constructor(left, right, body, async = false) {
        super();
        setParent([left, right, body], this);

        this.left = left;
        this.right = right;
        this.body = body;
        this.async = async;
    }

    toJS(o) {
        if (this.async) return this.asyncToJS(o);
        else return this.syncToJS(o);
    }

    syncToJS(o) {
        let left = nuVar();
        let right = this.right.toJS(o);
        let nuleft = new js.VariableDeclaration(
            [new js.VariableDeclarator(new js.Identifier(left))],
            'let'
        );

        let jbody = this.body.toJS(o);
        let declare = getJSDeclare(this.left, new js.Identifier(left), 'const');

        jbody.body.unshift(declare);

        return new js.ForOfStatement(jbody, nuleft, right);
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

        return [
            getJSAssign(right, new js.CallExpression(
                new js.MemberExpression(
                    this.right.toJS(),
                    getJSMemberExpression([LIB, 'symbols', 'observer']),
                    true), []),
            'const'),
            new js.WhileStatement(
                new js.Literal(true),
                new js.BlockStatement(body))
        ];
    }
}

export class Declaration extends Statement {

}

export class VariableDeclaration extends Declaration {
    constructor(declarators, constant = false) {
        super();
        setParent(declarators, this);

        this.declarators = declarators;
        this.constant = constant;
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

    toJS(o) {
        let jsvars = [];
        let type = (this.constant) ? 'const' : 'let';

        for (let declarator of this.declarators) {
            jsvars = jsvars.concat(declarator.toJS(o));
        }

        return new js.VariableDeclaration(jsvars, type);
    }

    addAndReturn(assignable, assignee) {
        let declarator =
            new VariableDeclarator(assignable, assignee);

        setParent(declarator, this);

        this.declarators.push(declarator);
        return this;
    }
}

export class VariableDeclarator extends Node {
    constructor(id, init = null) {
        super();
        setParent([id, init], this);

        this.id = id;
        this.init = init;
    }

    toJS(o) {
        let init = (!!this.init) ? this.init.toJS(o) : null;
        if (this.id instanceof Pattern) {
            if (init === null)
                this.id.error('All pattern declarations must be initialized!');

            let nuvar = nuVar('patternPlaceholder');
            let arr = [new js.VariableDeclarator(new js.Identifier(nuvar), this.init.toJS(o))];

            for (let pattern of this.id.extractAssigns(new js.Identifier(nuvar))) {
                arr.push(pattern);
            }

            return arr;
        } else return new js.VariableDeclarator(this.id.toJS(o), init);
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
    toJS(o) {
        return new js.ThisExpression();
    }
}

export class YieldExpression extends Expression {
    constructor(argument = null) {
        super(argument);
        setParent(argument, this);

        this._ctrl = null;
        this.argument = argument;
    }

    toJS(o) {
        let inyield, pfunc = this.getParentFunction();
        if (pfunc === null || !pfunc.generator) {
            this.error('Yield expression only allowed inside a generator function!');
        }

        if (pfunc.async) {
            inyield = new getJSMethodCall(
                [pfunc._ctrl, 'send'],
                [this.argument.toJS(o)]
                );
        } else {
            let inyield = (!this.argument) ? null : this.argument.toJS(o);
        }


        return new js.YieldExpression(inyield, false);
    }
}

export class AwaitExpression extends Expression {
    constructor(argument) {
        super(argument);
        setParent(argument, this);

        this.argument = argument;
    }

    toJS(o) {
        let pfunc = this.getParentFunction();
        if (pfunc === null || !pfunc.async) {
            this.error("Await expression only allowed in async function!");
        }

        return new js.YieldExpression(this.argument.toJS());
    }
}

export class ArrayExpression extends Expression {
    constructor(elements) {
        super();
        setParent(elements, this);

        this.elements = elements;
    }

    toJS(o) {
        let array = [];
        for (let element of this.elements) {
            array.push(element.toJS(o));
        }
        return new js.ArrayExpression(array);
    }
}

export class ObjectExpression extends Expression {
    constructor(properties) {
        super();
        setParent(properties, this);

        this.properties = properties;
    }

    toJS(o) {
        let props = [];
        for (let prop of this.properties) {
            props.push(prop.toJS(o));
        }

        return new js.ObjectExpression(props);
    }
}

export class Assignable extends Node {

}



export class Property extends Node {
    constructor(key, value, kind = 'init') {
        super();
        setParent([key, value], this);

        this.key = key;
        this.value = value;
        this.kind = kind;
    }

    toJS(o) {
        return new js.Property(
            this.key.toJS(o),
            this.value.toJS(o),
            this.kind
            );
    }
}

export class SpreadElement extends Node {
    constructor(value) {
        super();
        setParent(value, this);

        this.value = value;
    }

    toJS(o) {
        return new js.SpreadElement(this.value.toJS(o));
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
        setParent(pattern, this);

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
        setParent([identifier, pattern], this);

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
        setParent(patterns, this);

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

    * extractAssigns(target, declare=true, def = null) {
        let itervar = nuVar('iterator');
        if (declare) yield new js.VariableDeclarator(new js.Identifier(itervar), getJSIterable(target));
        else yield new js.AssignmentExpression('=', new js.Identifier(itervar), getJSIterable(target));
        for (let pattern of this.patterns) {
            if (pattern instanceof Identifier) {
                if (declare) yield new js.VariableDeclarator(
                    pattern,
                    new js.MemberExpression(
                        getJSMethodCall([itervar, 'next'], []),
                        new js.Identifier('value')
                        )
                    );
                else yield new js.AssignmentExpression(
                    '=',
                    pattern,
                    new js.MemberExpression(
                        getJSMethodCall([itervar, 'next'], []),
                        new js.Identifier('value'))
                    );
            } else if (
                pattern instanceof ArrayPattern ||
                pattern instanceof ObjectPattern) {

                yield* pattern.extractAssigns(new js.MemberExpression(
                        getJSMethodCall([itervar, 'next'], []),
                        new js.Identifier('value'))
                    ,declare);
            } else {
                pattern.error('Invalid pattern for assignment type!');
            }
        }
    }
}

export class ObjectPattern extends Pattern {
    constructor(patterns) {
        super();
        setParent(patterns, this);

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
        setParent([pattern, expression], this);

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


export class ClassExpression extends Expression {
	constructor(id = null, superClass = null, body = []) {
		super();
		
		setParent([id, superClass, body], this);
		
		this.id = id;
		this.superClass = superClass;
		this.body = body;
	}
	
	toJS(o) {
	    let body = [], props = [];
	    
	    for (let line of this.body) {
	        if (line instanceof MethodDefinition) {
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
	    
	    if (props.length === 0) {
	        if (defined(this.id)) {
	            return getJSAssign(this.id.name, cls, 'const');
	        } else {
	            return cls;
	        }
	    } else {
	        let rapper = getJSMethodCall([LIB, 'classify'], [
	            cls,
	            new js.ObjectExpression(props)
	        ]);
	        if (defined(this.id)) {
	            return getJSAssign(this.id.name, rapper, 'const');
	        } else {
	            return rapper;
	        }
	    }
	}
	
	* extractVariables() {
	    if (defined(this.id)) {
	        yield this.id.name;
	    } else {
	        this.error('Cannot extract name from anonymous class!');
	    }
	}
}

export class MethodDefinition extends Node {
	constructor(key, value, kind = "method", computed = false, isStatic = false) {
		super();
		
		setParent([key, value], this);
		
		this.key = key;
		this.value = value;
		this.kind = kind;
		this.computed = computed;
		this.static = isStatic;
	}
	
	toJS(o) {
	    return new js.MethodDefinition(
	        this.key.toJS(o),
	        this.value.toJS(o),
	        this.kind,
	        this.computed,
	        this.static
	        );
	}
}

export class ClassProperty extends Node {
    constructor(key, value, computed = false) {
        super();
        setParent([key, value], this);
        
        this.key = key;
        this.value = value;
        this.computed = computed;
    }
    
    toJS(o) {
        return new js.Property(
            this.key.toJS(o),
            this.value.toJS(o)
            );
    }
}


export class FunctionDeclaration extends Declaration {
    constructor(identifier, func) {
        super();
        setParent([identifier, func], this);
        
        this.identifier = identifier;
        this.func = func;
    }
    
    toJS(o) {
        if (this.parent instanceof Program &&
            this.identifier.name === 'main') {
            
            this.program.containsMain = true;
        }
        
        if (this.parent instanceof Property)
            return new js.Property(
                this.identifier,
                this.func.toJS(o)
                );
        else
            return getJSDeclare(
                this.identifier,
                this.func.toJS(o), 
                'const'
                );
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
        setParent([params, body], this);

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

    toJS(o) {
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
                );
        } else {
            return fn;
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
                params.push(param.toJS({}));
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
        let {params, prebody} = this.processParams(o);
        let i = 0;
        

        if (noparams) {
            params = [];
            prebody = [];
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
        setParent(expressions, this);

        this.expressions = expressions;
    }
}

export class UnaryExpression extends Expression {
    constructor(operator, argument, prefix = true) {
        super();
        setParent(argument, this);
    
        this.operator = operator;
        this.argument = argument;
        this.prefix = prefix;
    }
    
    toJS(o) {
        var operator;
        if (this.operator in convert) {
            operator = convert[this.operator];
        } else {
            operator = this.operator;
        }
        
        if (!unaryOperators.has(operator)) {
            this.error('Invalid unary operator!');
        }
        
        return new js.UnaryExpression(operator, this.prefix, this.argument.toJS(o));
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
        setParent([left, right], this);

        this.operator = operator;
        this.left = left;
        this.right = right;
    }

    toJS(o) {
        let left = this.left.toJS(o);
        let right = this.right.toJS(o);
        let operator;

        if (this.operator in convert) {
            return new js.BinaryExpression(
                convert[this.operator],
                left,
                right
                );
        }

        if ((this.operator + '=') in smoothOperators) {
            let fn = smoothOperators[this.operator + '='];
            return fn(this.left.toJS(o), this.right.toJS(o));
        }
        
        return new js.BinaryExpression(this.operator, left, right);
    }
}

// this is different from other operaetor expressions cause
// bizubee supports chaining of comparisons as in if 1 < c < 10 do ...
export class ComparativeExpression extends Expression {
    constructor(operator, left, right) {
        super();
        setParent([left, right], this);
        
        this.operators = [operator];
        this.operands = [left, right];
    }
    
    // used by the parser to chain additional operators/operands to expression
    chain(operator, expression) {
        setParent(expression, this);

        this.operators.push(operator);
        this.operands.push(expression);
        return this;
    }
    
    toJS(o) {
        const [opvar]   = this.getOpvars(1);
        
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
        
        return out;
    }
}

export class AssignmentExpression extends Expression {
    constructor(operator, left, right) {
        super();
        setParent([left, right], this);

        this.operator = assertAssignmentOperator(operator);
        this.left = left;
        this.right = right;
    }

    toJS(o) {
        if (this.left instanceof Identifier ||
            this.left instanceof MemberExpression) {
            let rightHandSide;
            if (this.operator in smoothOperators) {
                let trans = smoothOperators[this.operator];
                let left = this.left.toJS(o);
                let right = trans(left, this.right.toJS(o));
               
                return new js.AssignmentExpression('=', left, right);
            } else {
                return new js.AssignmentExpression(
                    this.operator,
                    this.left.toJS(o),
                    this.right.toJS(o)
                    );
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
        setParent(argument, this);

        this.operator = assertUpdateOperator(operator);
        this.argument = argument;
        this.prefix = prefix;
    }
}

export class LogicalExpression extends Expression {
    constructor(operator, left, right) {
        super();
        setParent([left, right], this);

        this.operator = assertLogicalOperator(operator);
        this.left = left;
        this.right = right;
    }
}


export class CallExpression extends Expression {
    constructor(callee, args, isNew = false) {
        super();
        setParent([callee, args], this);

        this.callee = callee;
        this.arguments = args;
        this.isNew = isNew;
    }

    toJS(o) {
        let args = [], seenspread = false;
        let catlist = [];
        for (let arg of this.arguments) {
            if (arg instanceof SpreadElement) {
                if (args.length > 0) {
                    catlist.push(new js.ArrayExpression(args));
                    args = [];
                }
                
                catlist.push(arg.value);
            } else {
                args.push(arg.toJS(o));
            }
        }

        catlist.push(args);
        

        if (catlist.length === 1 && catlist[0] === args) {
            if (this.isNew)
                return new js.NewExpression(this.callee.toJS(o), args);
            else
                return new js.CallExpression(this.callee.toJS(o), args);
        } else {
            let thisv, memberv;
            let [thisVar, memberExp] = this.getOpvars(2);
            
            
            if (this.callee instanceof MemberExpression) {
                thisv = this.callee.object.toJS(o);
                memberv = new js.MemberExpression(
                    thisVar.toJS(o),
                    this.callee.property.toJS(o),
                    this.callee.computed
                    );
            } else {
                thisv = new js.Literal(null);
                memberv = this.callee.toJS(o);
            }

            if (this.isNew)
                return new getJSMethodCall([LIB, 'construct'], []);
            else {
                return last([
                    getJSAssign(thisVar.name, thisv),
                    getJSAssign(memberExp.name, memberv),
                    getJSMethodCall(
                        [
                            memberExp.name,
                            'apply'
                        ],
                        [
                            thisVar,
                            getJSMethodCall(
                                [LIB, 'concat'],
                                [new js.ArrayExpression(catlist)]
                                )
                        ]
                    )
                    ]);
            }
        }
    }
}

export class NewExpression extends CallExpression {

}

export class MemberExpression extends Expression {
    constructor(object, property, computed = false) {
        super();
        setParent([object, property], this);

        this.object = object;
        this.property = property;
        this.computed = computed;
    }

    toJS(o) {
        let object = this.object.toJS(o);
        let right = this.property.toJS(o);
        return new js.MemberExpression(object, right, this.computed);
    }
}

export class SwitchCase extends Node {
    constructor(test, consequent) {
        super();
        setParent([test, consequent], this);

        this.test = test;
        this.consequent = consequent;
    }
}

export class CatchClause extends Node {
    constructor(param, body) {
        super();
        setParent([param, body], this);

        this.param = param;
        this.body = body;
    }
    
    toJS(o) {
        if (this.param instanceof Identifier) {
            return new js.CatchClause(
                this.param.toJS(o),
                this.body.toJS(o)
                );
        } else if (this.param instanceof Pattern) {
            let placeholder     = nuVar('patternPlaceholder');
            let holderVar       = new js.Identifier(placeholder);
            let declarations    = getJSDeclare(this.param, holderVar, 'const');
            let block           = this.body.toJS(o);
            
            block.body.unshift(declarations);
            return new js.CatchClause(holderVar, block);
        }
        
        this.param.error('Unrecognized parameter type!');
    }
}

export class Identifier extends Expression {
    constructor(name, process = true) {
        super();

        if (process) knowIdLead(name);
        this.name = name;
    }

    toJS(o) {
        return new js.Identifier(this.name);
    }
}

export class Literal extends Expression {
    constructor(value) {
        super();

        this.value = value;
    }
}

export class StringLiteral extends Literal {
    constructor(value) {
        super(value);
    }
}

export class RawStringLiteral extends Literal {
    constructor(value) {
        super(value.substring(1, value.length - 1));
    }

    toJS(o) {
        return new js.Literal(this.value);
    }
}

export class NumberLiteral extends Literal {
    constructor(value) {
        super(value);
    }

    toJS(o) {
        return new js.Literal(+this.value);
    }
}



export class All extends Node {
}

export class ModuleAlias extends Node {
    constructor(origin, target) {
        super();
        setParent([origin, target], this);



        this.origin = origin;
        this.target = target;
    }
}

export class ImportStatement extends Statement {
    constructor(target, path) {
        super();
        setParent(target, this);

        this.target = target;
        this.path = path;
    }

    requireDefault() {
        return new js.MemberExpression(
            this.require(),
            getJSMemberExpression([LIB, 'symbols', 'default']),
            true
            );
    }

    // generate require code for 
    require() {
        if (this.program.parameters.browser) {
            return getJSMethodCall([LIB, 'require'], [
                new js.Literal(getLibn(this.program.resolve(this.path)))
            ]);
        }
        
        if (this.path[0] === '.') {
            return getJSMethodCall([LIB, 'require'], [
                new js.Identifier('__dirname'),
                new js.Literal(this.path)
            ]);            
        } else {
            return getJSMethodCall(['require'], new js.Literal(this.path));
        }
    }

    toJS(o) {
        
        if (this.target instanceof ModuleAlias) { 
            // for: import <somevar or wildcard> as <some var or pattern> from <path> ... cases
            
            let id = this.target.origin;
            let tg = this.target.target;

            if (id instanceof All) {
                return getJSDeclare(new js.Identifier(tg.name), this.require(), 'const');
            } else {
                if (tg instanceof Pattern) {
                    let vname = nuVar('patternPlaceholder');
                    let vvalue = new js.Identifier(vname);
                    let def = getJSDeclare(vvalue, this.requireDefault(), 'let');
                    let vars = getJSDeclare(tg, vvalue.toJS({}), 'const');
                    return [
                        def,
                        vars
                    ];
                } else {
                    return getJSDeclare(tg, this.requireDefault(), 'const');
                }
            }
        } else {
            
            // for cases like import {....} from <path>
            if (this.target instanceof Array) {
                let varname     = nuVar('imports');
                let list        = [
                    getJSDeclare(
                        new js.Identifier(varname),
                        this.require(),
                        'const'
                        )
                    ];
                for (let alias of this.target) {
                    if (alias instanceof Identifier) {
                        list.push(
                            getJSDeclare(
                                alias,
                                getJSMemberExpression([varname, alias.name]),
                                'const')
                            );
                        continue;
                    }
                    
                    // for: .. {..., someVar as someVarOrPattern,...} .. cases
                    if (alias instanceof ModuleAlias) {
                        if (alias.origin instanceof All) {
                            alias.origin.error( // can't have: import {..., * as someVarOrPattern,...} ....
                                "Wildcard not allowed in import list alias!");
                        }
                        
                        if (alias.origin instanceof Identifier ||
                            alias.origin instanceof ModuleAlias) {
                            
                            list.push(
                                getJSDeclare(
                                    alias.target,
                                    alias.origin.toJS(o),
                                    'const'
                                    )
                                );
                            
                            continue;
                        }
                        
                        alias.origin.error(
                            'Unrecognized import alias origin type!');
                    }
                }
                
                return list;
            } else if (this.target instanceof Identifier) {
                return getJSDeclare(this.target, this.requireDefault(), 'const');
            }
        }
    }
}

export class ExportStatement extends Statement {
    constructor(target, isdefault = false) {
        super();
        setParent(target, this);

        this.target = target;
        this.isdefault = isdefault;
    }

    toJS(o) {
        if (this.isdefault) {
            return new js.AssignmentExpression(
                '=',
                new js.MemberExpression(
                    new js.Identifier(EXP),
                    getJSMemberExpression([LIB, 'symbols', 'default']),
                    true
                    ),
                this.target.toJS(o)
                );
        } else {
            if (this.target instanceof Array) {
                let list = [];
                for (let alias of this.target) {
                    if (alias instanceof ModuleAlias) {
                        if (alias.origin instanceof All) {
                            alias.origin.error(
                                "Wildcard not allowed in export list alias!");
                        }
                        
                        if (alias.target instanceof Pattern) {
                            alias.target.error(
                                "Pattern not allowed as export alias target!");
                        }
                        
                        if (alias.target instanceof Identifier) {
                            list.push(new js.AssignmentExpression(
                                '=',
                                getJSMemberExpression([EXP, alias.target.name]),
                                alias.origin.toJS(o)
                                )
                            );
                        } else alias.target.error('Unrecognized token, only identifiers allowed!');
                        
                        continue;
                    }
                    
                    if (alias instanceof Identifier) {
                        list.push(new js.AssignmentExpression(
                            '=',
                            getJSMemberExpression([EXP, alias.name]),
                            alias.toJS(o)
                            )
                        );
                    }
                }
            } else {
                let list = [this.target.toJS(o)];
                for (let name of this.target.extractVariables()) {
                    let left = getJSMemberExpression([EXP, name]);
                    let right = new js.Identifier(name);
                    list.push(
                        new js.AssignmentExpression('=', left, right)
                        );
                }

                return list;
            }
        }
    }
}
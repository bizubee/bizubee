'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

var _slicedToArray = (function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i['return']) _i['return'](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError('Invalid attempt to destructure non-iterable instance'); } }; })();

exports.wrap = wrap;

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj['default'] = obj; return newObj; } }

var _jsNodes = require('./js-nodes');

var js = _interopRequireWildcard(_jsNodes);

var _escodegen = require('escodegen');

var _escodegen2 = _interopRequireDefault(_escodegen);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _format = require('./format');

var _errors = require('./errors');

var _collectibles = require('./collectibles');

var _moduleResolver = require('./module-resolver');

var _extensions = require('./extensions');

var _vargen = require('./vargen');

var _jsGen = require('./js-gen');

var _jsCompiler = require('./js-compiler');

var _jsCompiler2 = _interopRequireDefault(_jsCompiler);

var acorn = require("acorn");
var ext = require("./lib").extension;
var _ = null;

var PKEY = Symbol('Program key');
var OKEY = Symbol('Options key');

var IGNORE = Symbol('Ingorable properties');

var EMPTY = new js.EmptyStatement();
var LIB_PATH = "bizubee lib";

var binaryOperator = new Set(["==", "!=", "<", "<=", ">", ">=", "+", "-", "*", "/", "//", "%", "^", "&", "has", "is"]);

var logicalOperator = new Set(["or", "and"]);

var assignmentOperator = new Set(["=", "+=", "-=", "*=", "/=", "//=", "%=", "^=", "&="]);

var updateOperator = new Set(["++", "--"]);

var unaryOperators = new Set(['+', '-', '!']);

var convert = {
    // cuz JS's '==' operator is total sh**
    '==': '===',
    '!=': '!==',

    'OR': '||',
    'AND': '&&',
    'IS': 'instanceof',

    '&': '+'
};

var stringEscapeTable = {
    'n': '\n',
    'r': '\r',
    't': '\t',
    'b': '\b',
    'f': '\f'
};

var PATH_MAP = new Map();
var PARENT_KEY = Symbol('parent');
var POSITION_KEY = Symbol('position');

var vars = new Set();
var nodeQueue = new _collectibles.Queue();

var LIB = undefined,
    EXP = undefined,
    DEFAULT = undefined;

Array.prototype.append = function (elems) {
    if (elems instanceof Array) {
        for (var i = 0; i < elems.length; i++) {
            this.append(elems[i]);
        }
    } else {
        this.push(elems);
    }
};

Array.prototype.prepend = function (elems) {
    if (elems instanceof Array) {
        var i = elems.length;

        while (i-- > 0) {
            // while i goes to 0 prepend the elements
            this.prepend(elems[i]);
        }
    } else {
        this.unshift(elems);
    }
};

function defined(val) {
    return val !== undefined && val !== null;
}

// keeps track of underscoring necessary for util vars to avoid collisions
function knowIdLead(name) {
    var i = 0;
    while (i < name.length) {
        if (name[i] !== '_') break;

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
        throw new Error('Operator "' + operator + '" not binary!');
    }
}

function assertLogicalOperator(operator) {
    if (logicalOperator.has(operator)) {
        return operator;
    } else {
        throw new Error('Operator "' + operator + '" not logical!');
    }
}

function assertAssignmentOperator(operator) {
    if (assignmentOperator.has(operator)) {
        return operator;
    } else {
        throw new Error('Operator "' + operator + '" not assignment!');
    }
}

function assertUpdateOperator(operator) {
    if (updateOperator.has(operator)) {
        return operator;
    } else {
        throw new Error('Operator "' + operator + '" not update!');
    }
}

function setParent(subject, parent) {
    if (subject instanceof Array) {
        var i = subject.length;
        while (i-- > 0) {
            setParent(subject[i], parent);
        }
    } else if (subject instanceof Node) {
        subject[PARENT_KEY] = parent;
    }
}

function statement(jsExpr) {
    if (jsExpr instanceof Array) {
        var arr = [];
        for (var i = 0; i < jsExpr.length; i++) {
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
    return new js.CallExpression(new js.FunctionExpression(null, [], new js.BlockStatement(statements)), []);
}

function wrap(node) {
    if (node instanceof BlockStatement) {
        return node;
    } else {
        return new BlockStatement([node]).pos(node[POSITION_KEY]);
    }
}

class Node {
    constructor() {
        var loc = arguments.length <= 0 || arguments[0] === undefined ? null : arguments[0];

        setParent(this, null);

        this[IGNORE] = new Set();
        this.type = this.constructor.name;
        this.loc = null;
        this.compiled = false;
        nodeQueue.eat(this);
    }

    getOpvars(n) {
        return this.getParentScope().getOpvars(n);
    }

    freeOpvars(opvars) {
        return this.getParentScope().freeOpvars(opvars);
    }

    onASTBuild() {
        var e = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];
    }

    *walk() {
        var ignore = this[IGNORE];
        outer: for (var key in this) {
            if (ignore.has(key)) continue;

            var obj = this[key];
            if (obj instanceof Array) {
                var _iteratorNormalCompletion = true;
                var _didIteratorError = false;
                var _iteratorError = undefined;

                try {
                    for (var _iterator = obj[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                        var val = _step.value;

                        if (!(val instanceof Node)) continue outer;

                        var nosearch = yield { key: key, value: val };
                        if (nosearch) continue;

                        yield* val.walk();
                    }
                } catch (err) {
                    _didIteratorError = true;
                    _iteratorError = err;
                } finally {
                    try {
                        if (!_iteratorNormalCompletion && _iterator['return']) {
                            _iterator['return']();
                        }
                    } finally {
                        if (_didIteratorError) {
                            throw _iteratorError;
                        }
                    }
                }
            } else if (obj instanceof Node) {
                var nosearch = yield { key: key, value: obj };
                if (nosearch) continue;
                yield* obj.walk();
            }
        }
    }

    pos(left) {
        var right = arguments.length <= 1 || arguments[1] === undefined ? null : arguments[1];

        if (right === null) {
            this[POSITION_KEY] = left;
        } else {
            this[POSITION_KEY] = {
                first_column: left.first_column,
                first_line: left.first_line,
                last_column: right.last_column,
                last_line: right.last_line
            };
        }
        return this;
    }

    toJS(o) {
        if (this.compiled) {
            this.error('Cannot recompile ' + this.constructor.name + ' node!');
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
        var parent = this.parent;
        while (true) {
            if (parent instanceof Scope) {
                return parent;
            } else {
                parent = parent.parent;
            }
        }
    }

    getParentBlock() {
        var block = this.getParentScope();
        if (block instanceof Program) {
            return null;
        } else {
            return block;
        }
    }

    getParentFunction() {
        var parent = this.parent;
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
        var loc = this[POSITION_KEY];
        var x = loc.first_column,
            y = loc.first_line;
        var lines = new _errors.Lines(this.source, 4),
            i = 0;
        var output = this.program.parameters.output;

        if (this.program.parameters.throwSyntax) {
            if (this.filename === null) throw new Error('Syntax error at position ' + x + ',' + (y + 1) + ' in VM:\n\t' + text);else throw new Error('Syntax error at position ' + x + ',' + (y + 1) + ' in file \'' + this.filename + '\':\n\t' + text);
        }

        if (this.filename === null) output.log('SyntaxError: ' + text + '\n\ton line ' + (y + 1) + ' in VM:');else output.log('SyntaxError: ' + text + '\n\ton line ' + (y + 1) + ' in file \'' + this.filename + '\'');
        output.log();
        output.log();

        var _iteratorNormalCompletion2 = true;
        var _didIteratorError2 = false;
        var _iteratorError2 = undefined;

        try {
            for (var _iterator2 = lines[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                var line = _step2.value;

                if (Math.abs(i - y) < 4) {
                    output.log((0, _format.addSpacing)(i + 1, 6) + '|\t\t' + line.untabbed);

                    if (i === y) {
                        var offset = line.map(x);
                        output.log((0, _format.addSpacing)('', 6) + ' \t\t' + (0, _format.repeat)(' ', offset) + '^');
                    }
                }

                i++;
            }
        } catch (err) {
            _didIteratorError2 = true;
            _iteratorError2 = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion2 && _iterator2['return']) {
                    _iterator2['return']();
                }
            } finally {
                if (_didIteratorError2) {
                    throw _iteratorError2;
                }
            }
        }

        process.exit();
    }

    get parent() {
        return this[PARENT_KEY];
    }

    get program() {
        if (this[PKEY] !== undefined) return this[PKEY];

        var current = this;
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
        var position = this[POSITION_KEY];
        return [position.first_column, position.first_line, position.last_column, position.last_line];
    }
}

exports.Node = Node;

class Scope extends Node {
    constructor(statements) {
        super();
        setParent(statements, this);

        this.body = statements;
        this._opvars = [];
        this._forbiddenvars = new Set();
        this._funcDeclarations = new Map();
    }

    getOpvars(n) {
        var arr = [],
            i = 0;

        while (arr.length < n) {
            if (i < this._opvars.length) {
                var opvar = this._opvars[i];
                if (!this._forbiddenvars.has(opvar)) {
                    arr.push(opvar);
                    this._forbiddenvars.add(opvar);
                }
            } else {
                var opvar = (0, _vargen.nuVar)('opvar');
                this._opvars.push(opvar);
                arr.push(opvar);
                this._forbiddenvars.add(opvar);
            }
            i++;
        }

        return arr;
    }

    freeOpvars(opvars) {
        var _iteratorNormalCompletion3 = true;
        var _didIteratorError3 = false;
        var _iteratorError3 = undefined;

        try {
            for (var _iterator3 = opvars[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
                var opvar = _step3.value;

                this._forbiddenvars['delete'](opvar);
            }
        } catch (err) {
            _didIteratorError3 = true;
            _iteratorError3 = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion3 && _iterator3['return']) {
                    _iterator3['return']();
                }
            } finally {
                if (_didIteratorError3) {
                    throw _iteratorError3;
                }
            }
        }
    }

    getOpvarsDeclaration() {
        var identifiers = this._opvars.map(function (id) {
            return new js.Identifier(id);
        });
        return new js.VariableDeclaration(identifiers, 'let');
    }

    getFunctionDeclarations() {
        var declarators = [];
        var _iteratorNormalCompletion4 = true;
        var _didIteratorError4 = false;
        var _iteratorError4 = undefined;

        try {
            for (var _iterator4 = this._funcDeclarations[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
                var _step4$value = _slicedToArray(_step4.value, 2);

                var name = _step4$value[0];
                var func = _step4$value[1];

                var declarator = new js.VariableDeclarator(new js.Identifier(name), func);
                declarators.push(declarator);
            }
        } catch (err) {
            _didIteratorError4 = true;
            _iteratorError4 = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion4 && _iterator4['return']) {
                    _iterator4['return']();
                }
            } finally {
                if (_didIteratorError4) {
                    throw _iteratorError4;
                }
            }
        }

        return new js.VariableDeclaration(declarators, 'const');
    }

    [Symbol.iterator]() {
        var _this = this;

        var i = 0;
        return {
            next: function next() {
                if (i >= _this.body.length) {
                    return {
                        done: true,
                        value: undefined
                    };
                } else {
                    return {
                        done: false,
                        value: _this.body[i++]
                    };
                }
            }
        };
    }

    *getJSLines(o) {
        var _iteratorNormalCompletion5 = true;
        var _didIteratorError5 = false;
        var _iteratorError5 = undefined;

        try {

            for (var _iterator5 = this.body[Symbol.iterator](), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
                var line = _step5.value;

                // if line is a function declaration we compile the function
                // then save it in a map to be put later in a const declaration at top of
                // scope, cause all function declarations are 'bubbled' to the top of their scope

                if (line instanceof FunctionDeclaration) {

                    var _name = line.identifier.name;

                    if (this._funcDeclarations.has(_name)) {
                        line.error('Cannot declare function more than once!');
                    }

                    this._funcDeclarations.set(_name, line.func.toJS(o));

                    continue;
                }

                var nodes = line.toJS(o);
                if (nodes instanceof Array) {
                    // if the js compilation is a serialisation (array) of nodes
                    // we must yield each node of the serialization individually

                    var _iteratorNormalCompletion6 = true;
                    var _didIteratorError6 = false;
                    var _iteratorError6 = undefined;

                    try {
                        for (var _iterator6 = nodes[Symbol.iterator](), _step6; !(_iteratorNormalCompletion6 = (_step6 = _iterator6.next()).done); _iteratorNormalCompletion6 = true) {
                            var subline = _step6.value;

                            yield statement(subline);
                        }
                    } catch (err) {
                        _didIteratorError6 = true;
                        _iteratorError6 = err;
                    } finally {
                        try {
                            if (!_iteratorNormalCompletion6 && _iterator6['return']) {
                                _iterator6['return']();
                            }
                        } finally {
                            if (_didIteratorError6) {
                                throw _iteratorError6;
                            }
                        }
                    }
                } else if (nodes instanceof js.Expression || nodes instanceof js.Statement) {
                    yield statement(nodes);
                } else {
                    if (nodes instanceof js.Super) {
                        yield nodes;
                        continue;
                    }

                    line.error('Invalid object ' + typeof nodes + '!');
                }
            }
        } catch (err) {
            _didIteratorError5 = true;
            _iteratorError5 = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion5 && _iterator5['return']) {
                    _iterator5['return']();
                }
            } finally {
                if (_didIteratorError5) {
                    throw _iteratorError5;
                }
            }
        }
    }
}

exports.Scope = Scope;

class Program extends Scope {
    constructor(statements) {
        super(statements);

        this.containsMain = false;

        while (nodeQueue.length > 0) {
            var node = nodeQueue.crap();
            node.onASTBuild({});
        }
    }

    resolve(path) {
        if (path === LIB_PATH) {
            return path;
        }

        var dir = _path2['default'].dirname(this.filename);
        return _path2['default'].resolve(dir, path + '.' + ext);
    }

    *getImports() {
        var modcache = arguments.length <= 0 || arguments[0] === undefined ? new _moduleResolver.ModuleResolver(this.filename, true) : arguments[0];

        var parser = require('./parser');
        var _iteratorNormalCompletion7 = true;
        var _didIteratorError7 = false;
        var _iteratorError7 = undefined;

        try {
            for (var _iterator7 = this.body[Symbol.iterator](), _step7; !(_iteratorNormalCompletion7 = (_step7 = _iterator7.next()).done); _iteratorNormalCompletion7 = true) {
                var statement = _step7.value;

                if (statement instanceof ImportStatement) {
                    if (statement.path === LIB_PATH) {
                        continue;
                    }
                    if (modcache.cached(statement.path)) {
                        continue;
                    }

                    var base = modcache.path(statement.path);
                    var extension = (0, _extensions.findAddition)(statement.path);
                    var ctrl, gen, api;
                    if (extension === '.' + ext) {
                        ctrl = parser.parseFile('' + base + extension, {
                            browser: {
                                root: false
                            }
                        });

                        gen = ctrl.tree.getImports(modcache);
                        api = ctrl.tree;
                    } else {
                        ctrl = _jsCompiler2['default'].parse('' + base + extension);
                        gen = ctrl.getImports(modcache);
                        api = ctrl;
                    }

                    modcache.startModule(statement.path);
                    yield* gen;
                    modcache.endModule();
                    yield [modcache.path(statement.path), api];
                }
            }
        } catch (err) {
            _didIteratorError7 = true;
            _iteratorError7 = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion7 && _iterator7['return']) {
                    _iterator7['return']();
                }
            } finally {
                if (_didIteratorError7) {
                    throw _iteratorError7;
                }
            }
        }
    }

    compileBrowser(o) {
        // recursively resolve libraries

        // set var LIB to support lib at top
        // set LIB.modules to a map (key -> function)
        // run root program in sub-scope

        var modmap = new Map();
        var cache = new Set();
        var modules = [];
        var instructions = [statement(new js.Literal('use strict'))];
        var directives = [];

        (0, _vargen.globalHash)(LIB_PATH);

        var _iteratorNormalCompletion8 = true;
        var _didIteratorError8 = false;
        var _iteratorError8 = undefined;

        try {
            for (var _iterator8 = this.getImports()[Symbol.iterator](), _step8; !(_iteratorNormalCompletion8 = (_step8 = _iterator8.next()).done); _iteratorNormalCompletion8 = true) {
                var _step8$value = _slicedToArray(_step8.value, 2);

                var abspath = _step8$value[0];
                var program = _step8$value[1];

                var hash = (0, _vargen.globalHash)(abspath);
                modmap.set(hash, program);
            }
        } catch (err) {
            _didIteratorError8 = true;
            _iteratorError8 = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion8 && _iterator8['return']) {
                    _iterator8['return']();
                }
            } finally {
                if (_didIteratorError8) {
                    throw _iteratorError8;
                }
            }
        }

        EXP = (0, _vargen.globalVar)('exports');
        LIB = (0, _vargen.globalVar)('bzbSupportLib');

        instructions.push((0, _jsGen.getJSDeclare)(new js.Identifier(LIB), acorn.parseExpressionAt(_fs2['default'].readFileSync(__dirname + '/fragments/lib.js', 'utf8'), 0, { ecmaVersion: 6 }), 'const'));

        var _iteratorNormalCompletion9 = true;
        var _didIteratorError9 = false;
        var _iteratorError9 = undefined;

        try {
            for (var _iterator9 = modmap[Symbol.iterator](), _step9; !(_iteratorNormalCompletion9 = (_step9 = _iterator9.next()).done); _iteratorNormalCompletion9 = true) {
                var _step9$value = _slicedToArray(_step9.value, 2);

                var key = _step9$value[0];
                var mod = _step9$value[1];

                if (mod === null) modules.push(new js.Property(new js.Literal('' + key), new js.Identifier(LIB)));else modules.push(new js.Property(new js.Literal('' + key), mod.toJS(o)));
            }
        } catch (err) {
            _didIteratorError9 = true;
            _iteratorError9 = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion9 && _iterator9['return']) {
                    _iterator9['return']();
                }
            } finally {
                if (_didIteratorError9) {
                    throw _iteratorError9;
                }
            }
        }

        instructions.push(statement((0, _jsGen.getJSMethodCall)([LIB, 'setModules'], [new js.ObjectExpression(modules)])));

        var _iteratorNormalCompletion10 = true;
        var _didIteratorError10 = false;
        var _iteratorError10 = undefined;

        try {
            for (var _iterator10 = this.getJSLines(o)[Symbol.iterator](), _step10; !(_iteratorNormalCompletion10 = (_step10 = _iterator10.next()).done); _iteratorNormalCompletion10 = true) {
                var jsline = _step10.value;

                directives.push(jsline);
            }
        } catch (err) {
            _didIteratorError10 = true;
            _iteratorError10 = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion10 && _iterator10['return']) {
                    _iterator10['return']();
                }
            } finally {
                if (_didIteratorError10) {
                    throw _iteratorError10;
                }
            }
        }

        if (this._funcDeclarations.size > 0) directives.unshift(this.getFunctionDeclarations());
        if (this._opvars.length > 0) directives.unshift(this.getOpvarsDeclaration());

        return new js.Program([new js.ExpressionStatement(iife([].concat(instructions, [new js.BlockStatement(directives)])))]);
    }

    compileBrowserModule(o) {
        var instructions = [];

        var _iteratorNormalCompletion11 = true;
        var _didIteratorError11 = false;
        var _iteratorError11 = undefined;

        try {
            for (var _iterator11 = this.getJSLines(o)[Symbol.iterator](), _step11; !(_iteratorNormalCompletion11 = (_step11 = _iterator11.next()).done); _iteratorNormalCompletion11 = true) {
                var jsline = _step11.value;

                instructions.push(jsline);
            }
        } catch (err) {
            _didIteratorError11 = true;
            _iteratorError11 = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion11 && _iterator11['return']) {
                    _iterator11['return']();
                }
            } finally {
                if (_didIteratorError11) {
                    throw _iteratorError11;
                }
            }
        }

        if (this._funcDeclarations.size > 0) instructions.unshift(this.getFunctionDeclarations());
        if (this._opvars.length > 0) instructions.unshift(this.getOpvarsDeclaration());

        return new js.FunctionExpression(null, [new js.Identifier(EXP)], new js.BlockStatement(instructions));
    }

    runtimeCompile(o) {
        LIB = (0, _vargen.nuVar)('bzbSupportLib');
        EXP = (0, _vargen.nuVar)('moduleExports');
        var instructions = statement([new js.Literal("use strict"), (0, _jsGen.getJSAssign)(LIB, (0, _jsGen.getJSMethodCall)(['require'], [new js.Literal(LIB_PATH)]), 'const'), (0, _jsGen.getJSDeclare)(new js.Identifier(EXP, false), (0, _jsGen.getJSMethodCall)([LIB, 'module'], [])), EMPTY, EMPTY]) || o.instructions;

        var _iteratorNormalCompletion12 = true;
        var _didIteratorError12 = false;
        var _iteratorError12 = undefined;

        try {
            for (var _iterator12 = this.getJSLines(o)[Symbol.iterator](), _step12; !(_iteratorNormalCompletion12 = (_step12 = _iterator12.next()).done); _iteratorNormalCompletion12 = true) {
                var jsline = _step12.value;

                instructions.push(jsline);
            }
        } catch (err) {
            _didIteratorError12 = true;
            _iteratorError12 = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion12 && _iterator12['return']) {
                    _iterator12['return']();
                }
            } finally {
                if (_didIteratorError12) {
                    throw _iteratorError12;
                }
            }
        }

        instructions.append(statement([new js.AssignmentExpression('=', (0, _jsGen.getJSMemberExpression)(['module', 'exports']), new js.Identifier(EXP))]));

        instructions.append(statement(new js.AssignmentExpression('=', (0, _jsGen.getJSMemberExpression)(['global', 'main']), new js.Identifier('main'))));

        if (this._opvars.length > 0) instructions[3] = this.getOpvarsDeclaration();
        if (this._funcDeclarations.size > 0) instructions[4] = this.getFunctionDeclarations();

        return new js.Program(instructions);
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

exports.Program = Program;

class Statement extends Node {}

exports.Statement = Statement;

class BlockStatement extends Scope {
    _toJS(o) {
        var instructions = [] || o.instructions;
        var _iteratorNormalCompletion13 = true;
        var _didIteratorError13 = false;
        var _iteratorError13 = undefined;

        try {
            for (var _iterator13 = this.getJSLines(o)[Symbol.iterator](), _step13; !(_iteratorNormalCompletion13 = (_step13 = _iterator13.next()).done); _iteratorNormalCompletion13 = true) {
                var line = _step13.value;

                if (line instanceof js.Expression) instructions.push(statement(line));else instructions.push(line);
            }
        } catch (err) {
            _didIteratorError13 = true;
            _iteratorError13 = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion13 && _iterator13['return']) {
                    _iterator13['return']();
                }
            } finally {
                if (_didIteratorError13) {
                    throw _iteratorError13;
                }
            }
        }

        if (this._funcDeclarations.size > 0) instructions.unshift(this.getFunctionDeclarations());
        if (this._opvars.length > 0) instructions.unshift(this.getOpvarsDeclaration());

        return new js.BlockStatement(instructions);
    }
}

exports.BlockStatement = BlockStatement;

class ExpressionStatement extends Statement {
    constructor(expression) {
        super();
        setParent(expression, this);

        this.expression = expression;
    }

    _toJS(o) {
        return new js.ExpressionStatement(this.expression.toJS(o));
    }
}

// *
exports.ExpressionStatement = ExpressionStatement;

class IfStatement extends Statement {
    constructor(test, consequent) {
        var alternate = arguments.length <= 2 || arguments[2] === undefined ? null : arguments[2];

        super();
        setParent([test, consequent, alternate], this);

        this.test = test;
        this.consequent = consequent;
        this.alternate = alternate;
    }

    _toJS(o) {
        var test = this.test.toJS(o);
        var consequent = this.consequent.toJS(o);
        var alternate = null;

        if (this.alternate !== null) alternate = this.alternate.toJS(o);

        return new js.IfStatement(test, consequent, alternate);
    }

    setAlternate(alternate) {
        setParent(alternate, this);
        this.alternate = alternate;

        return this;
    }
}

// *
exports.IfStatement = IfStatement;

class BreakStatement extends Statement {
    constructor() {
        var label = arguments.length <= 0 || arguments[0] === undefined ? null : arguments[0];

        super();
        setParent(label, this);
        this.label = label;
    }

    _toJS(o) {
        return new js.BreakStatement();
    }
}

// *
exports.BreakStatement = BreakStatement;

class ContinueStatement extends Statement {
    constructor() {
        var label = arguments.length <= 0 || arguments[0] === undefined ? null : arguments[0];

        super();
        setParent(label, this);
        this.label = label;
    }

    _toJS(o) {
        return new js.ContinueStatement();
    }
}

// *
exports.ContinueStatement = ContinueStatement;

class SwitchStatement extends Statement {
    constructor(discriminant, cases) {
        super();
        setParent([discriminant, cases], this);

        this.discriminant = discriminant;
        this.cases = cases;
    }
}

// *
exports.SwitchStatement = SwitchStatement;

class ReturnStatement extends Statement {
    constructor(argument, after) {
        super();
        setParent(argument, this);

        this.argument = argument;
        this.after = after;
    }

    _toJS(o) {
        if (defined(this.after)) {
            if (this.after instanceof ReturnStatement) this.after.error('Cannot return from function multiple times!');

            var variableName = (0, _vargen.nuVar)('returnValue');
            var variable = new js.Identifier(variableName);
            var lines = [(0, _jsGen.getJSDeclare)(variable, this.argument.toJS(o), 'const')];

            lines.append(this.after.toJS(o));
            lines.append(new js.ReturnStatement(variable));
            return statement(lines);
        } else {
            if (defined(this.argument)) return new js.ReturnStatement(this.argument.toJS(o));else return new js.ReturnStatement();
        }
    }
}

exports.ReturnStatement = ReturnStatement;

class ThrowStatement extends Statement {
    constructor(argument) {
        super();
        setParent(argument, this);

        this.argument = argument;
    }

    _toJS(o) {
        return new js.ThrowStatement(this.argument.toJS(o));
    }
}

exports.ThrowStatement = ThrowStatement;

class TryStatement extends Statement {
    constructor(block) {
        var catchClause = arguments.length <= 1 || arguments[1] === undefined ? null : arguments[1];
        var finalizer = arguments.length <= 2 || arguments[2] === undefined ? null : arguments[2];

        super();
        setParent([block, catchClause, finalizer], this);

        this.block = block;
        this.handler = catchClause;
        this.finalizer = finalizer;
    }

    _toJS(o) {
        var handler = defined(this.handler) ? this.handler.toJS(o) : null;
        var finalizer = defined(this.finalizer) ? this.finalizer.toJS(o) : null;
        return new js.TryStatement(this.block.toJS(o), handler, finalizer);
    }
}

exports.TryStatement = TryStatement;

class WhileStatement extends Statement {
    constructor(test, body) {
        super();
        setParent([test, body], this);

        this.test = test;
        this.body = body;
    }

    _toJS(o) {
        var test = this.test.toJS(o);
        var body = this.body.toJS(o);

        return new js.WhileStatement(test, body);
    }
}

exports.WhileStatement = WhileStatement;

class ForStatement extends Statement {
    constructor(left, right, body) {
        var async = arguments.length <= 3 || arguments[3] === undefined ? false : arguments[3];

        super();
        setParent([left, right, body], this);

        this.left = left;
        this.right = right;
        this.body = body;
        this.async = async;
    }

    _toJS(o) {
        if (this.async) return this.asyncToJS(o);else return this.syncToJS(o);
    }

    syncToJS(o) {
        var left = (0, _vargen.nuVar)();
        var right = this.right.toJS(o);
        var nuleft = new js.VariableDeclaration([new js.VariableDeclarator(new js.Identifier(left))], 'let');

        var jbody = this.body.toJS(o);
        var declare = (0, _jsGen.getJSDeclare)(this.left, new js.Identifier(left), 'const');

        jbody.body.unshift(declare);

        return new js.ForOfStatement(jbody, nuleft, right);
    }

    asyncToJS(o) {
        var pfunc = this.getParentFunction();
        if (!pfunc.async) this.error('Cannot have for-on loop in sync function!');

        var right = (0, _vargen.nuVar)('lefthandPlaceholder'); // variable placeholder for async generator expression
        var ctrl = (0, _vargen.nuVar)('observerController'); // generator's {done(bool), value} variable
        var ctrle = (0, _jsGen.getJSAssign)(ctrl, new js.YieldExpression((0, _jsGen.getJSMethodCall)([right, 'next'], [])), 'const');

        var cond = new js.IfStatement((0, _jsGen.getJSMemberExpression)([ctrl, 'done']), new js.BreakStatement());

        var decl = (0, _jsGen.getJSDeclare)(this.left, (0, _jsGen.getJSMemberExpression)([ctrl, 'value']));

        var body = [ctrle, cond].concat(decl);
        var _iteratorNormalCompletion14 = true;
        var _didIteratorError14 = false;
        var _iteratorError14 = undefined;

        try {
            for (var _iterator14 = this.body[Symbol.iterator](), _step14; !(_iteratorNormalCompletion14 = (_step14 = _iterator14.next()).done); _iteratorNormalCompletion14 = true) {
                var line = _step14.value;

                body.append(line.toJS(o));
            }
        } catch (err) {
            _didIteratorError14 = true;
            _iteratorError14 = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion14 && _iterator14['return']) {
                    _iterator14['return']();
                }
            } finally {
                if (_didIteratorError14) {
                    throw _iteratorError14;
                }
            }
        }

        return [(0, _jsGen.getJSAssign)(right, new js.CallExpression(new js.MemberExpression(this.right.toJS(), (0, _jsGen.getJSMemberExpression)([LIB, 'symbols', 'observer']), true), []), 'const'), new js.WhileStatement(new js.Literal(true), new js.BlockStatement(body))];
    }
}

exports.ForStatement = ForStatement;

class Declaration extends Statement {}

exports.Declaration = Declaration;

class VariableDeclaration extends Declaration {
    constructor(declarators) {
        var constant = arguments.length <= 1 || arguments[1] === undefined ? false : arguments[1];

        super();
        setParent(declarators, this);

        this.declarators = declarators;
        this.constant = constant;
    }

    *extractVariables() {
        var _iteratorNormalCompletion15 = true;
        var _didIteratorError15 = false;
        var _iteratorError15 = undefined;

        try {
            for (var _iterator15 = this.declarators[Symbol.iterator](), _step15; !(_iteratorNormalCompletion15 = (_step15 = _iterator15.next()).done); _iteratorNormalCompletion15 = true) {
                var decl = _step15.value;

                var left = decl.id;

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
        } catch (err) {
            _didIteratorError15 = true;
            _iteratorError15 = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion15 && _iterator15['return']) {
                    _iterator15['return']();
                }
            } finally {
                if (_didIteratorError15) {
                    throw _iteratorError15;
                }
            }
        }
    }

    _toJS(o) {
        var jsvars = [];
        var type = this.constant ? 'const' : 'let';

        var _iteratorNormalCompletion16 = true;
        var _didIteratorError16 = false;
        var _iteratorError16 = undefined;

        try {
            for (var _iterator16 = this.declarators[Symbol.iterator](), _step16; !(_iteratorNormalCompletion16 = (_step16 = _iterator16.next()).done); _iteratorNormalCompletion16 = true) {
                var declarator = _step16.value;

                jsvars = jsvars.concat(declarator.toJS(o));
            }
        } catch (err) {
            _didIteratorError16 = true;
            _iteratorError16 = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion16 && _iterator16['return']) {
                    _iterator16['return']();
                }
            } finally {
                if (_didIteratorError16) {
                    throw _iteratorError16;
                }
            }
        }

        return new js.VariableDeclaration(jsvars, type);
    }

    addAndReturn(assignable, assignee) {
        var declarator = new VariableDeclarator(assignable, assignee);

        setParent(declarator, this);

        this.declarators.push(declarator);
        return this;
    }
}

exports.VariableDeclaration = VariableDeclaration;

class VariableDeclarator extends Node {
    constructor(id) {
        var init = arguments.length <= 1 || arguments[1] === undefined ? null : arguments[1];

        super();
        setParent([id, init], this);

        this.id = id;
        this.init = init;
    }

    _toJS(o) {
        // always return an array

        var init = !!this.init ? this.init.toJS(o) : null;
        if (this.id instanceof Pattern) {
            if (init === null) this.id.error('All pattern declarations must be initialized!');

            var nuvar = (0, _vargen.nuVar)('patternPlaceholder');
            var arr = [new js.VariableDeclarator(new js.Identifier(nuvar), init)];

            var _iteratorNormalCompletion17 = true;
            var _didIteratorError17 = false;
            var _iteratorError17 = undefined;

            try {
                for (var _iterator17 = this.id.extractAssigns(new js.Identifier(nuvar))[Symbol.iterator](), _step17; !(_iteratorNormalCompletion17 = (_step17 = _iterator17.next()).done); _iteratorNormalCompletion17 = true) {
                    var pattern = _step17.value;

                    arr.push(pattern);
                }
            } catch (err) {
                _didIteratorError17 = true;
                _iteratorError17 = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion17 && _iterator17['return']) {
                        _iterator17['return']();
                    }
                } finally {
                    if (_didIteratorError17) {
                        throw _iteratorError17;
                    }
                }
            }

            return arr;
        } else return new js.VariableDeclarator(this.id.toJS(o), init);
    }
}

exports.VariableDeclarator = VariableDeclarator;

class Expression extends Node {
    constructor() {
        super();
    }

    toStatement() {
        return new ExpressionStatement(this);
    }
}

exports.Expression = Expression;

class ThisExpression extends Expression {
    _toJS(o) {
        return new js.ThisExpression();
    }
}

exports.ThisExpression = ThisExpression;

class YieldExpression extends Expression {
    constructor() {
        var argument = arguments.length <= 0 || arguments[0] === undefined ? null : arguments[0];
        var delegate = arguments.length <= 1 || arguments[1] === undefined ? false : arguments[1];

        super(argument);
        setParent(argument, this);

        this.argument = argument;
        this.delegate = delegate;
    }

    _toJS(o) {
        var inyield = undefined,
            pfunc = this.getParentFunction();
        if (pfunc === null || !pfunc.generator) {
            this.error('Yield expression only allowed inside a generator function!');
        }

        if (pfunc.async) {
            inyield = (0, _jsGen.getJSMethodCall)([pfunc._ctrl, 'send'], [this.argument.toJS(o)]);
        } else {
            inyield = !this.argument ? null : this.argument.toJS(o);
        }

        return new js.YieldExpression(inyield, this.delegate);
    }
}

exports.YieldExpression = YieldExpression;

class AwaitExpression extends Expression {
    constructor(argument) {
        super(argument);
        setParent(argument, this);

        this.argument = argument;
    }

    _toJS(o) {
        var pfunc = this.getParentFunction();
        if (pfunc === null || !pfunc.async) {
            this.error("Await expression only allowed in async function!");
        }

        return new js.YieldExpression(this.argument.toJS());
    }
}

exports.AwaitExpression = AwaitExpression;

class ArrayExpression extends Expression {
    constructor(elements) {
        super();
        setParent(elements, this);

        this.elements = elements;
    }

    _toJS(o) {
        var array = [];
        var _iteratorNormalCompletion18 = true;
        var _didIteratorError18 = false;
        var _iteratorError18 = undefined;

        try {
            for (var _iterator18 = this.elements[Symbol.iterator](), _step18; !(_iteratorNormalCompletion18 = (_step18 = _iterator18.next()).done); _iteratorNormalCompletion18 = true) {
                var element = _step18.value;

                array.push(element.toJS(o));
            }
        } catch (err) {
            _didIteratorError18 = true;
            _iteratorError18 = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion18 && _iterator18['return']) {
                    _iterator18['return']();
                }
            } finally {
                if (_didIteratorError18) {
                    throw _iteratorError18;
                }
            }
        }

        return new js.ArrayExpression(array);
    }
}

exports.ArrayExpression = ArrayExpression;

class ObjectExpression extends Expression {
    constructor(properties) {
        super();
        setParent(properties, this);

        this.properties = properties;
    }

    _toJS(o) {
        var props = [];
        var _iteratorNormalCompletion19 = true;
        var _didIteratorError19 = false;
        var _iteratorError19 = undefined;

        try {
            for (var _iterator19 = this.properties[Symbol.iterator](), _step19; !(_iteratorNormalCompletion19 = (_step19 = _iterator19.next()).done); _iteratorNormalCompletion19 = true) {
                var prop = _step19.value;

                props.push(prop.toJS(o));
            }
        } catch (err) {
            _didIteratorError19 = true;
            _iteratorError19 = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion19 && _iterator19['return']) {
                    _iterator19['return']();
                }
            } finally {
                if (_didIteratorError19) {
                    throw _iteratorError19;
                }
            }
        }

        return new js.ObjectExpression(props);
    }
}

exports.ObjectExpression = ObjectExpression;

class Assignable extends Node {}

exports.Assignable = Assignable;

class Property extends Node {
    constructor(key, value) {
        var kind = arguments.length <= 2 || arguments[2] === undefined ? 'init' : arguments[2];

        super();
        setParent([key, value], this);

        this.key = key;
        this.value = value;
        this.kind = kind;
    }

    _toJS(o) {
        return new js.Property(this.key.toJS(o), this.value.toJS(o), this.kind);
    }
}

exports.Property = Property;

class SpreadElement extends Node {
    constructor(value) {
        super();
        setParent(value, this);

        this.value = value;
    }

    _toJS(o) {
        return new js.SpreadElement(this.value.toJS(o));
    }
}

exports.SpreadElement = SpreadElement;

class Pattern extends Node {
    *extractVariables() {
        throw new Error('Not implemented yet');
    }

    extractAssigns(target) {
        throw new Error('Not implemented yet');
    }
}

exports.Pattern = Pattern;

class SpreadPattern extends Pattern {
    constructor(pattern) {
        super();
        setParent(pattern, this);

        this.pattern = pattern;
    }

    *extractVariables() {
        if (this.pattern instanceof Identifier) {
            yield this.pattern.name;
        } else if (this.pattern instanceof Pattern) {
            yield* this.pattern.extractVariables();
        } else this.pattern.error('Token not allowed in Property alias!');
    }
}

exports.SpreadPattern = SpreadPattern;

class PropertyAlias extends Pattern {
    constructor(identifier, pattern) {
        super();
        setParent([identifier, pattern], this);

        this.identifier = identifier;
        this.pattern = pattern;
    }

    *extractVariables() {
        if (this.pattern instanceof Identifier) {
            yield this.pattern.name;
        } else if (this.pattern instanceof Pattern) {
            yield* this.pattern.extractVariables();
        } else this.pattern.error('Token not allowed in Property alias!');
    }
}

exports.PropertyAlias = PropertyAlias;

class ArrayPattern extends Pattern {
    constructor(patterns) {
        super();
        setParent(patterns, this);

        this.patterns = patterns;
    }

    hasSplat() {
        var i = 0;
        var _iteratorNormalCompletion20 = true;
        var _didIteratorError20 = false;
        var _iteratorError20 = undefined;

        try {
            for (var _iterator20 = this.patterns[Symbol.iterator](), _step20; !(_iteratorNormalCompletion20 = (_step20 = _iterator20.next()).done); _iteratorNormalCompletion20 = true) {
                var param = _step20.value;

                if (param instanceof SpreadPattern) {
                    return i;
                }

                i++;
            }
        } catch (err) {
            _didIteratorError20 = true;
            _iteratorError20 = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion20 && _iterator20['return']) {
                    _iterator20['return']();
                }
            } finally {
                if (_didIteratorError20) {
                    throw _iteratorError20;
                }
            }
        }

        return -1;
    }

    *extractVariables() {
        var _iteratorNormalCompletion21 = true;
        var _didIteratorError21 = false;
        var _iteratorError21 = undefined;

        try {
            for (var _iterator21 = this.patterns[Symbol.iterator](), _step21; !(_iteratorNormalCompletion21 = (_step21 = _iterator21.next()).done); _iteratorNormalCompletion21 = true) {
                var pattern = _step21.value;

                if (pattern instanceof Identifier) {
                    yield pattern.name;
                } else if (pattern instanceof Pattern) {
                    yield* pattern.extractVariables();
                } else pattern.error('Token not allowed in ArrayPattern');
            }
        } catch (err) {
            _didIteratorError21 = true;
            _iteratorError21 = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion21 && _iterator21['return']) {
                    _iterator21['return']();
                }
            } finally {
                if (_didIteratorError21) {
                    throw _iteratorError21;
                }
            }
        }
    }

    // extracts the individual extract or assign statements from an array pattern
    *extractAssigns(target) {
        var declare = arguments.length <= 1 || arguments[1] === undefined ? true : arguments[1];
        var def = arguments.length <= 2 || arguments[2] === undefined ? null : arguments[2];

        var itervar = (0, _vargen.nuVar)('iterator'),
            nextval = new js.MemberExpression((0, _jsGen.getJSMethodCall)([itervar, 'next'], []), new js.Identifier('value'));

        if (declare) yield new js.VariableDeclarator(new js.Identifier(itervar), (0, _jsGen.getJSIterable)(target));else yield new js.AssignmentExpression('=', new js.Identifier(itervar), (0, _jsGen.getJSIterable)(target));
        var _iteratorNormalCompletion22 = true;
        var _didIteratorError22 = false;
        var _iteratorError22 = undefined;

        try {
            for (var _iterator22 = this.patterns[Symbol.iterator](), _step22; !(_iteratorNormalCompletion22 = (_step22 = _iterator22.next()).done); _iteratorNormalCompletion22 = true) {
                var pattern = _step22.value;

                if (pattern instanceof Identifier) {
                    if (declare) yield new js.VariableDeclarator(pattern, nextval);else yield new js.AssignmentExpression('=', pattern, nextval);
                } else if (pattern instanceof ArrayPattern || pattern instanceof ObjectPattern) {

                    var identifier;
                    if (declare) {
                        identifier = new js.Identifier((0, _vargen.nuVar)('ph'));
                        yield new js.VariableDeclarator(identifier, nextval);
                    } else {
                        var _getOpvars = this.getOpvars(1);

                        var _getOpvars2 = _slicedToArray(_getOpvars, 1);

                        var _name2 = _getOpvars2[0];

                        var _identifier = new js.Identifier(_name2);
                        yield new js.AssignmentExpression('=', _identifier, nextval);
                    }

                    yield* pattern.extractAssigns(identifier, declare);

                    if (!declare) {
                        this.freeOpvars([identifier.name]);
                    }
                } else {
                    pattern.error('Invalid pattern for assignment type!');
                }
            }
        } catch (err) {
            _didIteratorError22 = true;
            _iteratorError22 = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion22 && _iterator22['return']) {
                    _iterator22['return']();
                }
            } finally {
                if (_didIteratorError22) {
                    throw _iteratorError22;
                }
            }
        }
    }
}

exports.ArrayPattern = ArrayPattern;

class ObjectPattern extends Pattern {
    constructor(patterns) {
        super();
        setParent(patterns, this);

        this.patterns = patterns;
    }

    *extractVariables() {
        var _iteratorNormalCompletion23 = true;
        var _didIteratorError23 = false;
        var _iteratorError23 = undefined;

        try {
            for (var _iterator23 = this.patterns[Symbol.iterator](), _step23; !(_iteratorNormalCompletion23 = (_step23 = _iterator23.next()).done); _iteratorNormalCompletion23 = true) {
                var pattern = _step23.value;

                if (pattern instanceof Identifier) {
                    yield pattern.name;
                } else if (pattern instanceof Pattern) {
                    yield* pattern.extractVariables();
                } else pattern.error('Token not allowed in ObjectPattern');
            }
        } catch (err) {
            _didIteratorError23 = true;
            _iteratorError23 = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion23 && _iterator23['return']) {
                    _iterator23['return']();
                }
            } finally {
                if (_didIteratorError23) {
                    throw _iteratorError23;
                }
            }
        }
    }

    *extractAssigns(target) {
        var declare = arguments.length <= 1 || arguments[1] === undefined ? true : arguments[1];
        var def = arguments.length <= 2 || arguments[2] === undefined ? null : arguments[2];
        var _iteratorNormalCompletion24 = true;
        var _didIteratorError24 = false;
        var _iteratorError24 = undefined;

        try {
            for (var _iterator24 = this.patterns[Symbol.iterator](), _step24; !(_iteratorNormalCompletion24 = (_step24 = _iterator24.next()).done); _iteratorNormalCompletion24 = true) {
                var pattern = _step24.value;

                if (pattern instanceof Identifier) {
                    var access = new js.Identifier(pattern.name);
                    if (declare) yield new js.VariableDeclarator(access, new js.MemberExpression(target, access));else if (declare) yield new js.VariableDeclarator('=', access, new js.MemberExpression(target, access));
                }

                // must be fixed
                if (pattern instanceof PropertyAlias) {
                    var me = new js.MemberExpression(target, pattern.identifier);
                    if (pattern.pattern instanceof Identifier) {
                        if (declare) yield new js.VariableDeclarator(pattern.pattern, me);else yield new js.AssignmentExpression('=', pattern.pattern, me);
                    } else if (pattern.pattern instanceof ObjectPattern || pattern.pattern instanceof ArrayPattern) {

                        yield* pattern.pattern.extractAssigns(me);
                    }
                }
            }
        } catch (err) {
            _didIteratorError24 = true;
            _iteratorError24 = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion24 && _iterator24['return']) {
                    _iterator24['return']();
                }
            } finally {
                if (_didIteratorError24) {
                    throw _iteratorError24;
                }
            }
        }
    }
}

exports.ObjectPattern = ObjectPattern;

class DefaultPattern extends Pattern {
    constructor(pattern, expression) {
        super();
        setParent([pattern, expression], this);

        this.pattern = pattern;
        this.expression = expression;
    }

    *extractAssigns(jsVal) {
        var declare = arguments.length <= 1 || arguments[1] === undefined ? true : arguments[1];

        if (this.pattern instanceof Identifier) {}
    }

    *extractVariables() {
        if (this.pattern instanceof Identifier) {
            yield this.pattern.name;
        } else if (this.pattern instanceof Pattern) {
            yield* this.pattern.extractVariables();
        } else this.pattern.error('Token not allowed in ObjectPattern');
    }
}

exports.DefaultPattern = DefaultPattern;

class Super extends Statement {
    _toJS(o) {
        return new js.Super();
    }
}

exports.Super = Super;

class ClassExpression extends Expression {
    constructor() {
        var id = arguments.length <= 0 || arguments[0] === undefined ? null : arguments[0];
        var superClass = arguments.length <= 1 || arguments[1] === undefined ? null : arguments[1];
        var body = arguments.length <= 2 || arguments[2] === undefined ? [] : arguments[2];

        super();

        setParent([id, superClass, body], this);

        this.id = id;
        this.superClass = superClass;
        this.body = body;
    }

    _toJS(o) {
        var body = [],
            props = [],
            statprops = [];

        var _iteratorNormalCompletion25 = true;
        var _didIteratorError25 = false;
        var _iteratorError25 = undefined;

        try {
            for (var _iterator25 = this.body[Symbol.iterator](), _step25; !(_iteratorNormalCompletion25 = (_step25 = _iterator25.next()).done); _iteratorNormalCompletion25 = true) {
                var line = _step25.value;

                if (line instanceof MethodDefinition) {

                    if (line.value.async) {
                        // async methods are not supported in classes so instead they have
                        // to be added to the list of prototype properties
                        var bin = line['static'] ? statprops : props;
                        if (line.kind !== "method") {
                            line.error('"' + line.kind + '" method type not allowed as async in class definitions!');
                        }

                        bin.push(new js.Property(line.key, line.value.toJS(o)));
                    } else body.push(line.toJS(o));
                } else if (line instanceof ClassProperty) {
                    props.push(line.toJS(o));
                } else {
                    line.error('Class body item unrecognized!');
                }
            }

            // create class
        } catch (err) {
            _didIteratorError25 = true;
            _iteratorError25 = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion25 && _iterator25['return']) {
                    _iterator25['return']();
                }
            } finally {
                if (_didIteratorError25) {
                    throw _iteratorError25;
                }
            }
        }

        var superClass = defined(this.superClass) ? this.superClass.toJS(o) : null;
        var cls = new js.ClassExpression(null, superClass, body);

        if (props.length === 0 && statprops.length === 0) {
            if (defined(this.id)) {
                return (0, _jsGen.getJSAssign)(this.id.name, cls, 'const');
            } else {
                return cls;
            }
        } else {
            var rapper = (0, _jsGen.getJSMethodCall)([LIB, 'classify'], [cls, new js.ObjectExpression(props)]);

            if (statprops.length > 0) {
                rapper.arguments.push(new js.ObjectExpression(statprops));
            }

            if (defined(this.id)) {
                return (0, _jsGen.getJSAssign)(this.id.name, rapper, 'const');
            } else {
                return rapper;
            }
        }
    }

    *extractVariables() {
        if (defined(this.id)) {
            yield this.id.name;
        } else {
            this.error('Cannot extract name from anonymous class!');
        }
    }
}

exports.ClassExpression = ClassExpression;

class MethodDefinition extends Node {
    constructor(key, value) {
        var kind = arguments.length <= 2 || arguments[2] === undefined ? "method" : arguments[2];
        var isStatic = arguments.length <= 3 || arguments[3] === undefined ? false : arguments[3];
        var computed = arguments.length <= 4 || arguments[4] === undefined ? false : arguments[4];

        super();

        setParent([key, value], this);

        this.key = key;
        this.value = value;
        this.kind = kind;
        this['static'] = isStatic;
        this.computed = computed;
    }

    _toJS(o) {
        return new js.MethodDefinition(this.key.toJS(o), this.value.toJS(o), this.kind, this.computed, this['static']);
    }
}

exports.MethodDefinition = MethodDefinition;

class ClassProperty extends Node {
    constructor(key, value) {
        var computed = arguments.length <= 2 || arguments[2] === undefined ? false : arguments[2];

        super();
        setParent([key, value], this);

        this.key = key;
        this.value = value;
        this.computed = computed;
    }

    _toJS(o) {
        return new js.Property(this.key.toJS(o), this.value.toJS(o), this.computed);
    }
}

exports.ClassProperty = ClassProperty;

class FunctionDeclaration extends Declaration {
    constructor(identifier, func) {
        super();
        setParent([identifier, func], this);

        this.identifier = identifier;
        this.func = func;
    }

    _toJS(o) {
        if (this.parent instanceof Program && this.identifier.name === 'main') {

            this.program.containsMain = true;
        }

        if (this.parent instanceof Property) return new js.Property(this.identifier, this.func.toJS(o));else return (0, _jsGen.getJSDeclare)(this.identifier, this.func.toJS(o), 'const');
    }

    *extractVariables() {
        // yields only the function name
        yield this.identifier.name;
        return;
    }
}

exports.FunctionDeclaration = FunctionDeclaration;

class FunctionExpression extends Expression {
    constructor(params, body) {
        var bound = arguments.length <= 2 || arguments[2] === undefined ? false : arguments[2];
        var modifier = arguments.length <= 3 || arguments[3] === undefined ? '' : arguments[3];

        super();
        setParent([params, body], this);

        this.params = params;
        this.body = body;
        this.bound = bound;
        this.modifier = modifier;
    }

    hasSplat() {
        var i = 0;
        var _iteratorNormalCompletion26 = true;
        var _didIteratorError26 = false;
        var _iteratorError26 = undefined;

        try {
            for (var _iterator26 = this.params[Symbol.iterator](), _step26; !(_iteratorNormalCompletion26 = (_step26 = _iterator26.next()).done); _iteratorNormalCompletion26 = true) {
                var param = _step26.value;

                if (param instanceof SpreadPattern) {
                    return i;
                }

                i++;
            }
        } catch (err) {
            _didIteratorError26 = true;
            _iteratorError26 = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion26 && _iterator26['return']) {
                    _iterator26['return']();
                }
            } finally {
                if (_didIteratorError26) {
                    throw _iteratorError26;
                }
            }
        }

        return -1;
    }

    _toJS(o) {
        var fn = undefined;

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
            return new js.CallExpression(new js.MemberExpression(fn, new js.Identifier('bind')), [new js.ThisExpression()]);
        } else {
            return fn;
        }
    }

    *walkParams() {
        var _iteratorNormalCompletion27 = true;
        var _didIteratorError27 = false;
        var _iteratorError27 = undefined;

        try {
            for (var _iterator27 = this.params[Symbol.iterator](), _step27; !(_iteratorNormalCompletion27 = (_step27 = _iterator27.next()).done); _iteratorNormalCompletion27 = true) {
                var param = _step27.value;

                var gen = this.body.walk();
                var skip = undefined;
                while (true) {
                    var ctrl = gen.next(skip);
                    if (ctrl.done) return;
                    var node = ctrl.value;

                    if (node instanceof FunctionExpression) {
                        skip = true;
                    } else {
                        skip = undefined;
                    }

                    yield node;
                }
            }
        } catch (err) {
            _didIteratorError27 = true;
            _iteratorError27 = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion27 && _iterator27['return']) {
                    _iterator27['return']();
                }
            } finally {
                if (_didIteratorError27) {
                    throw _iteratorError27;
                }
            }
        }
    }

    *walkBody() {
        var gen = this.body.walk();
        var skip = undefined;
        while (true) {
            var ctrl = gen.next(skip);
            if (ctrl.done) return;
            var node = ctrl.value;

            if (node instanceof FunctionExpression) {
                skip = true;
            } else {
                skip = undefined;
            }

            yield node;
        }
    }

    *walkFunction() {
        yield* this.walkParams();
        yield* this.walkBody();
    }

    // processes parameters of the function, and take care of patterns in the body
    processParams(o) {
        var i = 0,
            body = [],
            params = [];

        var _iteratorNormalCompletion28 = true;
        var _didIteratorError28 = false;
        var _iteratorError28 = undefined;

        try {
            for (var _iterator28 = this.params[Symbol.iterator](), _step28; !(_iteratorNormalCompletion28 = (_step28 = _iterator28.next()).done); _iteratorNormalCompletion28 = true) {
                var pram = _step28.value;

                var param = undefined,
                    def = null;
                if (pram instanceof DefaultPattern) {
                    param = pram.pattern;
                    def = pram.expression;
                } else {
                    param = pram;
                }

                if (param instanceof Identifier) {
                    params.push(param.toJS(o));
                    if (def !== null) {
                        body.push((0, _jsGen.getJSAssign)(param.name, (0, _jsGen.getJSConditional)(param.name, def.toJS(o))));
                    }
                    i++;
                    continue;
                }

                if (param instanceof ArrayPattern || param instanceof ObjectPattern) {
                    var ph = (0, _vargen.nuVar)('patternPlaceholder');
                    params.push(new js.Identifier(ph));
                    if (def !== null) {
                        body.push((0, _jsGen.getJSAssign)(ph, (0, _jsGen.getJSConditional)(ph, def.toJS(o))));
                    }
                    body.push((0, _jsGen.getJSDeclare)(param, new js.Identifier(ph), 'const'));

                    i++;
                    continue;
                }

                if (param instanceof SpreadPattern) {
                    body.push((0, _jsGen.getJSDeclare)(param.pattern, (0, _jsGen.getJSMethodCall)([LIB, 'restargs'], [new js.Identifier('arguments'), new js.Literal(i)]), 'const'));

                    break;
                }

                param.error('This should not be here!');
            }
        } catch (err) {
            _didIteratorError28 = true;
            _iteratorError28 = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion28 && _iterator28['return']) {
                    _iterator28['return']();
                }
            } finally {
                if (_didIteratorError28) {
                    throw _iteratorError28;
                }
            }
        }

        return { params: params, prebody: body };
    }

    regularToJs(o) {
        var noparams = arguments.length <= 1 || arguments[1] === undefined ? false : arguments[1];

        var body = this.body.toJS(o);
        var i = 0;

        if (noparams) {
            var params = [];
            var prebody = [];
        } else {
            var _processParams = this.processParams(o);

            var params = _processParams.params;
            var prebody = _processParams.prebody;
        }

        body.body.prepend(statement(prebody));
        return new js.FunctionExpression(null, params, body, null);
    }

    generatorToJs(o) {
        var noparams = arguments.length <= 1 || arguments[1] === undefined ? false : arguments[1];

        var jsnode = this.regularToJs(o, noparams);
        jsnode.generator = true;
        return jsnode;
    }

    asyncToJs(o) {
        var noparams = arguments.length <= 1 || arguments[1] === undefined ? false : arguments[1];

        return (0, _jsGen.getJSMethodCall)([LIB, 'async'], [this.generatorToJs(o, noparams)]);
    }

    asyncGeneratorToJs(o) {
        var noparams = arguments.length <= 1 || arguments[1] === undefined ? false : arguments[1];

        var ctrlVar = this._ctrl = (0, _vargen.nuVar)('observableController');

        var ctrl = (0, _jsGen.getJSAssign)(ctrlVar, (0, _jsGen.getJSMethodCall)([LIB, 'getObservableCtrl'], []), 'const');
        var mem = new js.AssignmentExpression('=', (0, _jsGen.getJSMemberExpression)([ctrlVar, 'code']), new js.CallExpression(new js.MemberExpression(this.asyncToJs(o, true), new js.Identifier("bind")), [new js.ThisExpression()]));
        var ret = new js.ReturnStatement((0, _jsGen.getJSMemberExpression)([ctrlVar, 'observable']));

        var _processParams2 = this.processParams(o);

        var params = _processParams2.params;
        var prebody = _processParams2.prebody;

        var block = new js.BlockStatement([ctrl, mem, ret].map(function (el) {
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

        return new js.FunctionExpression(null, params, block);
    }

    get async() {
        return this.modifier.includes('~');
    }

    get generator() {
        return this.modifier.includes('*');
    }
}

exports.FunctionExpression = FunctionExpression;

class SequenceExpression extends Expression {
    constructor(expressions) {
        super();
        setParent(expressions, this);

        this.expressions = expressions;
    }
}

exports.SequenceExpression = SequenceExpression;

class UnaryExpression extends Expression {
    constructor(operator, argument) {
        var prefix = arguments.length <= 2 || arguments[2] === undefined ? true : arguments[2];

        super();
        setParent(argument, this);

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

        return new js.UnaryExpression(operator, this.prefix, this.argument.toJS(o));
    }
}

exports.UnaryExpression = UnaryExpression;

var smoothOperators = {
    '//=': function _(left, right) {
        return (0, _jsGen.getJSMethodCall)(['Math', 'floor'], [new js.BinaryExpression('/', left, right)]);
    },
    '^=': function _(left, right) {
        return (0, _jsGen.getJSMethodCall)(['Math', 'pow'], [left, right]);
    }
};

class BinaryExpression extends Expression {
    constructor(operator, left, right) {
        super();
        setParent([left, right], this);

        this.operator = operator;
        this.left = left;
        this.right = right;
    }

    _toJS(o) {
        var left = this.left.toJS(o);
        var right = this.right.toJS(o);
        var operator = undefined;

        if (this.operator in convert) {
            return new js.BinaryExpression(convert[this.operator], left, right);
        }

        if (this.operator + '=' in smoothOperators) {
            var fn = smoothOperators[this.operator + '='];
            return fn(left, right);
        }

        return new js.BinaryExpression(this.operator, left, right);
    }
}

// this is different from other operaetor expressions cause
// bizubee supports chaining of comparisons as in if 1 < c < 10 do ...
exports.BinaryExpression = BinaryExpression;

class ComparativeExpression extends Expression {
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

    _toJS(o) {
        var _getOpvars3 = this.getOpvars(1);

        var _getOpvars32 = _slicedToArray(_getOpvars3, 1);

        var opid = _getOpvars32[0];

        var opvar = new js.Identifier(opid);

        var left = null,
            right = null,
            prev = null,
            out = null;

        for (var i = 0; i < this.operators.length; i++) {
            var lastiter = i + 1 === this.operators.length;
            var jsRight = undefined,
                compare = undefined,
                originalOp = this.operators[i],
                op = originalOp in convert ? convert[originalOp] : originalOp;

            left = prev || this.operands[i].toJS(o);
            right = this.operands[i + 1].toJS(o);

            if (right instanceof js.Identifier) {
                jsRight = right.toJS(o);
                prev = jsRight;
            } else {
                // the last expression will only be evaluated once, so no need to save it in opvar
                // otherwise we must save it to prevent reevaluation
                jsRight = lastiter ? right : new js.AssignmentExpression('=', opvar, right);
                prev = opvar;
            }

            // the actual comparison expression
            compare = new js.BinaryExpression(op, left, jsRight);

            // at first the lefthand operand in the && expression is the initial comparison
            // after that it is always the previous && expression
            out = out === null ? compare : new js.LogicalExpression('&&', out, compare);
        }

        return out;
    }
}

exports.ComparativeExpression = ComparativeExpression;

class AssignmentExpression extends Expression {
    constructor(operator, left, right) {
        super();
        setParent([left, right], this);

        this.operator = assertAssignmentOperator(operator);
        this.left = left;
        this.right = right;
    }

    _toJS(o) {
        if (this.left instanceof Identifier || this.left instanceof MemberExpression) {
            var rightHandSide = undefined;
            if (this.operator in smoothOperators) {
                var trans = smoothOperators[this.operator];
                var left = this.left.toJS(o);
                var right = trans(left, this.right.toJS(o));

                return new js.AssignmentExpression('=', left, right);
            } else {
                return new js.AssignmentExpression(this.operator, this.left.toJS(o), this.right.toJS(o));
            }
        } else if (this.left instanceof Pattern) {
            if (this.operator !== '=') {
                this.left.error('Patterns not allowed with assignment type');
            }

            var nvar = (0, _vargen.nuVar)('patternPlaceholder'),
                arr = [new _jsGen.getJSAssign(nvar, this.right)];
            var _iteratorNormalCompletion29 = true;
            var _didIteratorError29 = false;
            var _iteratorError29 = undefined;

            try {
                for (var _iterator29 = this.left.extractAssigns(new js.Identifier(nvar))[Symbol.iterator](), _step29; !(_iteratorNormalCompletion29 = (_step29 = _iterator29.next()).done); _iteratorNormalCompletion29 = true) {
                    var assign = _step29.value;

                    arr.push(assign);
                }
            } catch (err) {
                _didIteratorError29 = true;
                _iteratorError29 = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion29 && _iterator29['return']) {
                        _iterator29['return']();
                    }
                } finally {
                    if (_didIteratorError29) {
                        throw _iteratorError29;
                    }
                }
            }

            return arr;
        } else {
            this.left.error('Invalid assignable!');
        }
    }
}

exports.AssignmentExpression = AssignmentExpression;

class UpdateExpression extends Expression {
    constructor(operator, argument, prefix) {
        super();
        setParent(argument, this);

        this.operator = assertUpdateOperator(operator);
        this.argument = argument;
        this.prefix = prefix;
    }
}

exports.UpdateExpression = UpdateExpression;

class LogicalExpression extends Expression {
    constructor(operator, left, right) {
        super();
        setParent([left, right], this);

        this.operator = operator;
        this.left = left;
        this.right = right;
    }

    _toJS(o) {
        return new js.LogicalExpression(this.operator, this.left.toJS(o), this.right.toJS(o));
    }
}

exports.LogicalExpression = LogicalExpression;

class CallExpression extends Expression {
    constructor(callee, args) {
        var isNew = arguments.length <= 2 || arguments[2] === undefined ? false : arguments[2];
        var doubtful = arguments.length <= 3 || arguments[3] === undefined ? false : arguments[3];

        super();
        setParent([callee, args], this);

        this.callee = callee;
        this.arguments = args;
        this.isNew = isNew;
        this.doubtful = doubtful;
    }

    _toJS(o) {
        var args = [],
            callee = this.callee.toJS(o),
            ctor = this.isNew ? js.NewExpression : js.CallExpression;

        var _iteratorNormalCompletion30 = true;
        var _didIteratorError30 = false;
        var _iteratorError30 = undefined;

        try {
            for (var _iterator30 = this.arguments[Symbol.iterator](), _step30; !(_iteratorNormalCompletion30 = (_step30 = _iterator30.next()).done); _iteratorNormalCompletion30 = true) {
                var argument = _step30.value;

                args.push(argument.toJS(o));
            }
        } catch (err) {
            _didIteratorError30 = true;
            _iteratorError30 = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion30 && _iterator30['return']) {
                    _iterator30['return']();
                }
            } finally {
                if (_didIteratorError30) {
                    throw _iteratorError30;
                }
            }
        }

        if (this.doubtful) {
            var _getOpvars4 = this.getOpvars(1);

            var _getOpvars42 = _slicedToArray(_getOpvars4, 1);

            var opvar = _getOpvars42[0];

            var left = (0, _jsGen.getJSAssign)(opvar, callee);
            var undie = new js.Identifier('undefined');

            var node = new js.ConditionalExpression(new js.BinaryExpression('===', left, undie), undie, new ctor(left.left, args));

            this.freeOpvars([opvar]);
            return node;
        } else {
            return new ctor(callee, args);
        }
    }
}

exports.CallExpression = CallExpression;

class NewExpression extends CallExpression {}

exports.NewExpression = NewExpression;

class MemberExpression extends Expression {
    // doubtful parameter is true if there there are question marks involved
    constructor(object, property) {
        var computed = arguments.length <= 2 || arguments[2] === undefined ? false : arguments[2];
        var doubtful = arguments.length <= 3 || arguments[3] === undefined ? false : arguments[3];

        super();
        setParent([object, property], this);

        this.object = object;
        this.property = property;
        this.computed = computed;
        this.doubtful = doubtful;
    }

    _toJS(o) {
        if (!this.doubtful) {
            var object = this.object.toJS(o);
            var right = this.property.toJS(o);
            return new js.MemberExpression(object, right, this.computed);
        } else {
            var _getOpvars5 = this.getOpvars(1);

            var _getOpvars52 = _slicedToArray(_getOpvars5, 1);

            var opvar = _getOpvars52[0];

            var left = (0, _jsGen.getJSAssign)(opvar, this.object.toJS(o));
            var undie = new js.Identifier('undefined');

            var node = new js.ConditionalExpression(new js.BinaryExpression('===', left, undie), undie, new js.MemberExpression(left.left, this.property.toJS(o), this.computed));

            this.freeOpvars([opvar]);
            return node;
        }
    }
}

exports.MemberExpression = MemberExpression;

class DefinedExpression extends Expression {
    constructor(expression) {
        super();
        setParent(expression, this);

        this.expression = expression;
    }

    _toJS(o) {
        return new js.BinaryExpression('!==', this.expression.toJS(o), new js.Identifier('undefined'));
    }
}

exports.DefinedExpression = DefinedExpression;

class SwitchCase extends Node {
    constructor(test, consequent) {
        super();
        setParent([test, consequent], this);

        this.test = test;
        this.consequent = consequent;
    }
}

// the catch part of try-catch
exports.SwitchCase = SwitchCase;

class CatchClause extends Node {
    constructor(param, body) {
        super();
        setParent([param, body], this);

        this.param = param;
        this.body = body;
    }

    _toJS(o) {
        if (this.param instanceof Identifier) {
            return new js.CatchClause(this.param.toJS(o), this.body.toJS(o));
        } else if (this.param instanceof Pattern) {
            // same usual trickery to support error destructuring in catch clause
            var placeholder = (0, _vargen.nuVar)('patternPlaceholder');
            var holderVar = new js.Identifier(placeholder);
            var declarations = (0, _jsGen.getJSDeclare)(this.param, holderVar, 'const');
            var block = this.body.toJS(o);

            block.body.unshift(declarations);
            return new js.CatchClause(holderVar, block);
        }

        this.param.error('Unrecognized parameter type!');
    }
}

exports.CatchClause = CatchClause;

class Identifier extends Expression {
    constructor(name) {
        var process = arguments.length <= 1 || arguments[1] === undefined ? true : arguments[1];

        super();

        (0, _vargen.forbid)(name);
        this.name = name;
    }

    _toJS(o) {
        return new js.Identifier(this.name);
    }
}

exports.Identifier = Identifier;

class Literal extends Expression {
    constructor(value) {
        super();

        this.value = value;
    }
}

exports.Literal = Literal;

class TemplateString extends Expression {

    // removes unnecessary escapes from string literals being translated to JS
    static removeEscapes(string) {
        var buff = [];
        var escapeMode = false;
        var _iteratorNormalCompletion31 = true;
        var _didIteratorError31 = false;
        var _iteratorError31 = undefined;

        try {
            for (var _iterator31 = string[Symbol.iterator](), _step31; !(_iteratorNormalCompletion31 = (_step31 = _iterator31.next()).done); _iteratorNormalCompletion31 = true) {
                var c = _step31.value;

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
        } catch (err) {
            _didIteratorError31 = true;
            _iteratorError31 = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion31 && _iterator31['return']) {
                    _iterator31['return']();
                }
            } finally {
                if (_didIteratorError31) {
                    throw _iteratorError31;
                }
            }
        }

        return buff.join('');
    }

    constructor(value, parts) {
        super(value);
        var parser = require('./parser');

        this.parts = [];
        var _iteratorNormalCompletion32 = true;
        var _didIteratorError32 = false;
        var _iteratorError32 = undefined;

        try {
            for (var _iterator32 = parts[Symbol.iterator](), _step32; !(_iteratorNormalCompletion32 = (_step32 = _iterator32.next()).done); _iteratorNormalCompletion32 = true) {
                var part = _step32.value;

                // parts alternate between strings and arrays of tokens
                if (part instanceof Array) {
                    // if part is Array of tokens, parse then search for Expression in AST
                    // and reasign parent to this TemplateString

                    var ctrl = parser.parseRawTokens(part, {});
                    if (ctrl.tree.body.length === 1) {
                        var node = ctrl.tree.body[0];
                        if (node instanceof ExpressionStatement) {
                            var expr = node.expression;
                            setParent(expr, this);
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
        } catch (err) {
            _didIteratorError32 = true;
            _iteratorError32 = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion32 && _iterator32['return']) {
                    _iterator32['return']();
                }
            } finally {
                if (_didIteratorError32) {
                    throw _iteratorError32;
                }
            }
        }
    }

    _toJS(o) {
        var ctor = this.constructor;
        if (this.parts.length === 1) {
            // if there is no interpolation
            return new js.Literal(ctor.removeEscapes(this.parts[0]));
        } else if (this.parts.length > 2) {
            // if interpolation exists in string
            var add = new js.BinaryExpression('+', new js.Literal(ctor.removeEscapes(this.parts[0])), // cause the first part is always a string
            this.parts[1].toJS(o) // second part is an interpolation
            );
            for (var i = 2; i < this.parts.length; i++) {
                var part = this.parts[i];
                if (part === null) {
                    // if interpolated expression is invalid it is set to null in `parts`
                    this.error('Only single expressions allowed per interpolation!');
                }

                // parts alternate between expression and string
                if (part instanceof Expression) {
                    add = new js.BinaryExpression('+', add, part.toJS(o));
                } else if (part.constructor === String) {
                    add = new js.BinaryExpression('+', add, new js.Literal(this.constructor.removeEscapes(part)));
                } else {
                    part.error('Interpolated value not expression!');
                }
            }

            return add;
        } else {
            this.error('Internal compiler error!');
        }
    }
}

// a raw single quoted string
exports.TemplateString = TemplateString;

class StringLiteral extends Literal {
    constructor(value) {
        super(value.substring(1, value.length - 1));
    }

    _toJS(o) {
        return new js.Literal(this.value);
    }
}

exports.StringLiteral = StringLiteral;

class NumberLiteral extends Literal {
    constructor(value) {
        super(value);
    }

    _toJS(o) {
        return new js.Literal(+this.value);
    }
}

exports.NumberLiteral = NumberLiteral;

class All extends Node {}

// a <id or *> as <id> pattern
exports.All = All;

class ModuleAlias extends Node {
    constructor(origin, target) {
        super();
        setParent([origin, target], this);

        this.origin = origin;
        this.target = target;
    }
}

exports.ModuleAlias = ModuleAlias;

class ImportStatement extends Statement {
    constructor(target, path) {
        super();
        setParent(target, this);

        this.target = target;
        this.path = path;
    }

    requireDefault() {
        return new js.MemberExpression(this.require(), (0, _jsGen.getJSMemberExpression)([LIB, 'symbols', 'default']), true);
    }

    // generate require code for
    require() {
        if (this.program.parameters.browser) {
            return (0, _jsGen.getJSMethodCall)([LIB, 'require'], [new js.Literal((0, _vargen.globalHash)(this.program.resolve(this.path)))]);
        }

        if (this.path[0] === '.') {
            return (0, _jsGen.getJSMethodCall)([LIB, 'require'], [new js.Identifier('__dirname'), new js.Literal(this.path)]);
        } else {
            return (0, _jsGen.getJSMethodCall)(['require'], [new js.Literal(this.path)]);
        }
    }

    _toJS(o) {

        if (this.target instanceof ModuleAlias) {
            // for: import <somevar or wildcard> as <some var or pattern> from <path> ... cases

            var id = this.target.origin;
            var tg = this.target.target;

            if (id instanceof All) {
                return (0, _jsGen.getJSDeclare)(new js.Identifier(tg.name), this.require(), 'const');
            } else {
                if (tg instanceof Pattern) {
                    var vname = (0, _vargen.nuVar)('patternPlaceholder');
                    var vvalue = new js.Identifier(vname);
                    var def = (0, _jsGen.getJSDeclare)(vvalue, this.requireDefault(), 'let');
                    var _vars = (0, _jsGen.getJSDeclare)(tg, vvalue.toJS({}), 'const');
                    return [def, _vars];
                } else {
                    return (0, _jsGen.getJSDeclare)(tg, this.requireDefault(), 'const');
                }
            }
        } else {

            // for cases like import {....} from <path>
            if (this.target instanceof Array) {
                var varname = (0, _vargen.nuVar)('imports');
                var list = [(0, _jsGen.getJSDeclare)(new js.Identifier(varname), this.require(), 'const')];
                var _iteratorNormalCompletion33 = true;
                var _didIteratorError33 = false;
                var _iteratorError33 = undefined;

                try {
                    for (var _iterator33 = this.target[Symbol.iterator](), _step33; !(_iteratorNormalCompletion33 = (_step33 = _iterator33.next()).done); _iteratorNormalCompletion33 = true) {
                        var alias = _step33.value;

                        if (alias instanceof Identifier) {
                            list.push((0, _jsGen.getJSDeclare)(alias, (0, _jsGen.getJSMemberExpression)([varname, alias.name]), 'const'));
                            continue;
                        }

                        // for: .. {..., someVar as someVarOrPattern,...} .. cases
                        if (alias instanceof ModuleAlias) {
                            if (alias.origin instanceof All) {
                                alias.origin.error( // can't have: import {..., * as someVarOrPattern,...} ....
                                "Wildcard not allowed in import list alias!");
                            }

                            if (alias.origin instanceof Identifier || alias.origin instanceof ModuleAlias) {

                                list.push((0, _jsGen.getJSDeclare)(alias.target, alias.origin.toJS(o), 'const'));

                                continue;
                            }

                            alias.origin.error('Unrecognized import alias origin type!');
                        }
                    }
                } catch (err) {
                    _didIteratorError33 = true;
                    _iteratorError33 = err;
                } finally {
                    try {
                        if (!_iteratorNormalCompletion33 && _iterator33['return']) {
                            _iterator33['return']();
                        }
                    } finally {
                        if (_didIteratorError33) {
                            throw _iteratorError33;
                        }
                    }
                }

                return list;
            } else if (this.target instanceof Identifier) {
                return (0, _jsGen.getJSDeclare)(this.target, this.requireDefault(), 'const');
            }
        }
    }
}

exports.ImportStatement = ImportStatement;

class ExportStatement extends Statement {
    constructor(target) {
        var isdefault = arguments.length <= 1 || arguments[1] === undefined ? false : arguments[1];

        super();
        setParent(target, this);

        this.target = target;
        this.isdefault = isdefault;
    }

    _toJS(o) {
        if (this.isdefault) {
            return new js.AssignmentExpression('=', new js.MemberExpression(new js.Identifier(EXP), (0, _jsGen.getJSMemberExpression)([LIB, 'symbols', 'default']), true), this.target.toJS(o));
        } else {
            if (this.target instanceof Array) {
                var list = [];
                var _iteratorNormalCompletion34 = true;
                var _didIteratorError34 = false;
                var _iteratorError34 = undefined;

                try {
                    for (var _iterator34 = this.target[Symbol.iterator](), _step34; !(_iteratorNormalCompletion34 = (_step34 = _iterator34.next()).done); _iteratorNormalCompletion34 = true) {
                        var alias = _step34.value;

                        if (alias instanceof ModuleAlias) {
                            if (alias.origin instanceof All) {
                                alias.origin.error("Wildcard not allowed in export list alias!");
                            }

                            if (alias.target instanceof Pattern) {
                                alias.target.error("Pattern not allowed as export alias target!");
                            }

                            if (alias.target instanceof Identifier) {
                                list.push(new js.AssignmentExpression('=', (0, _jsGen.getJSMemberExpression)([EXP, alias.target.name]), alias.origin.toJS(o)));
                            } else alias.target.error('Unrecognized token, only identifiers allowed!');

                            continue;
                        }

                        if (alias instanceof Identifier) {
                            list.push(new js.AssignmentExpression('=', (0, _jsGen.getJSMemberExpression)([EXP, alias.name]), alias.toJS(o)));
                        }
                    }
                } catch (err) {
                    _didIteratorError34 = true;
                    _iteratorError34 = err;
                } finally {
                    try {
                        if (!_iteratorNormalCompletion34 && _iterator34['return']) {
                            _iterator34['return']();
                        }
                    } finally {
                        if (_didIteratorError34) {
                            throw _iteratorError34;
                        }
                    }
                }
            } else {
                var list = [];
                if (this.target instanceof FunctionDeclaration) {
                    var scope = this.getParentScope();
                    var _name3 = this.target.identifier.name;

                    if (scope._funcDeclarations.has(_name3)) {
                        this.target.error('Cannot declare function more than once!');
                    }

                    scope._funcDeclarations.set(_name3, this.target.func.toJS(o));
                } else {
                    list.push(this.target.toJS(o));
                }

                var _iteratorNormalCompletion35 = true;
                var _didIteratorError35 = false;
                var _iteratorError35 = undefined;

                try {
                    for (var _iterator35 = this.target.extractVariables()[Symbol.iterator](), _step35; !(_iteratorNormalCompletion35 = (_step35 = _iterator35.next()).done); _iteratorNormalCompletion35 = true) {
                        var _name4 = _step35.value;

                        var left = (0, _jsGen.getJSMemberExpression)([EXP, _name4]);
                        var right = new js.Identifier(_name4);
                        list.push(new js.AssignmentExpression('=', left, right));
                    }
                } catch (err) {
                    _didIteratorError35 = true;
                    _iteratorError35 = err;
                } finally {
                    try {
                        if (!_iteratorNormalCompletion35 && _iterator35['return']) {
                            _iterator35['return']();
                        }
                    } finally {
                        if (_didIteratorError35) {
                            throw _iteratorError35;
                        }
                    }
                }

                return list;
            }
        }
    }
}

exports.ExportStatement = ExportStatement;

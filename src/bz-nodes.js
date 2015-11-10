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

var acorn = require("acorn");
var ext = require("./lib").extension;
var _ = null;

var PKEY = Symbol('Program key');
var OKEY = Symbol('Options key');

var IGNORE = Symbol('Ingorable properties');

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

var PATH_MAP = new Map();
var PARENT_KEY = Symbol('parent');
var POSITION_KEY = Symbol('position');

var vars = new Set();
var nodeQueue = new _collectibles.Queue();

var LIB = undefined,
    EXP = undefined,
    DEFAULT = undefined,
    MAX_LEAD = '',
    PATHN = 0;

function getLibn(path) {
    if (PATH_MAP.has(path)) {
        return PATH_MAP.get(path);
    } else {
        PATH_MAP.set(path, PATHN);
        return PATHN++;
    }
}

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
            this.prepend(elems[i]);
        }
    } else {
        this.unshift(elems);
    }
};

function defined(val) {
    return val !== undefined && val !== null;
}

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
    return getJSMethodCall([LIB, 'last'], jsargs);
}

function nuVar() {
    var txt = arguments.length <= 0 || arguments[0] === undefined ? 'bzbVar' : arguments[0];

    var variable = MAX_LEAD + '_' + txt;
    if (vars.has(variable)) {
        var i = 0,
            numeratedVar = null;
        do {
            i++;
            numeratedVar = '' + variable + i;
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

function getJSVar(name) {
    var constant = arguments.length <= 1 || arguments[1] === undefined ? false : arguments[1];
    var init = arguments.length <= 2 || arguments[2] === undefined ? null : arguments[2];

    return new js.VariableDeclaration([new js.AssignmentExpression('=', new js.Identifier(name), init.toJS({}))], constant ? 'const' : 'let');
}

function getJSAssign(name, value, type) {
    var id = new js.Identifier(name);
    var assign = new js.AssignmentExpression('=', id, value);
    if (defined(type)) {
        return new js.VariableDeclaration([new js.VariableDeclarator(id, value)], type);
    } else {
        return new js.AssignmentExpression('=', new js.Identifier(name), value);
    }
}

function getJSDeclare(pattern, jvalue) {
    var type = arguments.length <= 2 || arguments[2] === undefined ? 'const' : arguments[2];

    if (pattern instanceof Identifier || pattern instanceof js.Identifier) {
        return new js.VariableDeclaration([new js.VariableDeclarator(pattern.toJS({}), jvalue)], type);
    }

    if (pattern instanceof String) {
        return new js.VariableDeclaration([new js.VariableDeclarator(new js.Identifier(pattern), jvalue)], type);
    }

    if (pattern instanceof ArrayPattern) {
        var arr = [];
        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
            for (var _iterator = pattern.extractAssigns(jvalue)[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                var sp = _step.value;

                arr.push(sp);
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

        return new js.VariableDeclaration(arr, type);
    }

    if (pattern instanceof ObjectPattern) {
        var source = undefined,
            arr = undefined;
        if (jvalue instanceof js.Identifier) {
            arr = [];
            source = jvalue;
        } else {
            var rvar = nuVar('patternPlaceholder');
            var idf = new js.Identifier(rvar);
            arr = [new js.VariableDeclarator(idf, jvalue)];
            source = new js.Identifier(rvar);
        }

        var _iteratorNormalCompletion2 = true;
        var _didIteratorError2 = false;
        var _iteratorError2 = undefined;

        try {
            for (var _iterator2 = pattern.extractAssigns(source)[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                var sp = _step2.value;

                arr.push(sp);
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

        return new js.VariableDeclaration(arr, type);
    }

    if (pattern instanceof Identifier) {
        return new js.VariableDeclaration([new js.VariableDeclarator(pattern, jvalue)], type);
    }

    pattern.error('Invalid declaration type!');
}

function getJSMethodCall(names, args) {
    return new js.CallExpression(getJSMemberExpression(names), args);
}

function getJSMemberExpression(names) {
    if (names.length === 0) {
        throw new Error('Must have at least one man!');
    } else {
        var lead = new js.Identifier(names[0]);
        for (var i = 1; i < names.length; i++) {
            lead = new js.MemberExpression(lead, new js.Identifier(names[i]));
        }

        return lead;
    }
}

function getJSIterable(target) {
    return new js.CallExpression(new js.MemberExpression(target, getJSMemberExpression(['Symbol', 'iterator']), true), []);
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

// returns
function getJSConditional(_x42, _x43) {
    var _again = true;

    _function: while (_again) {
        var identifier = _x42,
            def = _x43;
        _again = false;

        if (identifier instanceof js.Identifier) {
            return new js.ConditionalExpression(new js.BinaryExpression('===', identifier, new js.Identifier('undefined')), def, identifier);
        } else if (typeof identifier === 'string') {
            _x42 = new js.Identifier(identifier);
            _x43 = def;
            _again = true;
            continue _function;
        } else {
            throw new Error('Conditional expression must use identifier!');
        }
    }
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
        nodeQueue.eat(this);
    }

    getOpvars(n) {
        return this.getParentScope().getOpvars(n);
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
                var _iteratorNormalCompletion3 = true;
                var _didIteratorError3 = false;
                var _iteratorError3 = undefined;

                try {
                    for (var _iterator3 = obj[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
                        var val = _step3.value;

                        if (!(val instanceof Node)) continue outer;

                        var nosearch = yield { key: key, value: val };
                        if (nosearch) continue;

                        yield* val.walk();
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

    // make sure this method is implemented for all node subclasses
    toJS() {
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

        var _iteratorNormalCompletion4 = true;
        var _didIteratorError4 = false;
        var _iteratorError4 = undefined;

        try {
            for (var _iterator4 = lines[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
                var line = _step4.value;

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
    }

    getOpvars(n) {
        var arr = new Array(n),
            i = 0;
        for (var _i = 0; _i < n; _i++) {
            if (this._opvars.length === _i) this._opvars.push(nuVar('op'));

            arr[_i] = new js.Identifier(this._opvars[_i]);
        }

        return arr;
    }

    getOpvarsDeclaration() {
        var identifiers = this.getOpvars(this._opvars.length);
        return new js.VariableDeclaration(identifiers, 'let');
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

                var nodes = line.toJS(o);
                if (nodes instanceof Array) {
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
        var dir = _path2['default'].dirname(this.filename);
        return _path2['default'].resolve(dir, path + '.' + ext);
    }

    *getImports(dir) {
        var cache = arguments.length <= 1 || arguments[1] === undefined ? new Set() : arguments[1];

        var parser = require('./parser');
        var _iteratorNormalCompletion7 = true;
        var _didIteratorError7 = false;
        var _iteratorError7 = undefined;

        try {
            for (var _iterator7 = this.body[Symbol.iterator](), _step7; !(_iteratorNormalCompletion7 = (_step7 = _iterator7.next()).done); _iteratorNormalCompletion7 = true) {
                var statement = _step7.value;

                if (statement instanceof ImportStatement) {
                    var abspath = _path2['default'].resolve(dir, statement.path) + '.' + ext;
                    if (cache.has(abspath)) {
                        continue;
                    }
                    var ctrl = parser.parseFile(abspath, { browser: { root: false } });
                    var ndir = _path2['default'].dirname(abspath);
                    yield* ctrl.tree.getImports(ndir, cache);
                    yield [abspath, ctrl.tree];
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
        var directives = [statement(new js.Literal('use strict')), this.getOpvarsDeclaration()];

        var _iteratorNormalCompletion8 = true;
        var _didIteratorError8 = false;
        var _iteratorError8 = undefined;

        try {
            for (var _iterator8 = this.getImports(_path2['default'].dirname(this.filename), cache)[Symbol.iterator](), _step8; !(_iteratorNormalCompletion8 = (_step8 = _iterator8.next()).done); _iteratorNormalCompletion8 = true) {
                var _step8$value = _slicedToArray(_step8.value, 2);

                var abspath = _step8$value[0];
                var program = _step8$value[1];

                var hash = getLibn(abspath);
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

        EXP = nuVar('exports');
        LIB = nuVar('bzbSupportLib');

        directives.push(getJSDeclare(new js.Identifier(LIB), acorn.parseExpressionAt(_fs2['default'].readFileSync('src/fragments/lib.js', 'utf8'), 0, { ecmaVersion: 6 }), 'const'));

        var _iteratorNormalCompletion9 = true;
        var _didIteratorError9 = false;
        var _iteratorError9 = undefined;

        try {
            for (var _iterator9 = modmap[Symbol.iterator](), _step9; !(_iteratorNormalCompletion9 = (_step9 = _iterator9.next()).done); _iteratorNormalCompletion9 = true) {
                var _step9$value = _slicedToArray(_step9.value, 2);

                var key = _step9$value[0];
                var mod = _step9$value[1];

                modules.push(new js.Property(new js.Literal('' + key), mod.toJS(o)));
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

        directives.push(statement(getJSMethodCall([LIB, 'setModules'], [new js.ObjectExpression(modules)])));

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

        if (this._opvars.length === 0) directives[1] = new js.EmptyStatement();

        return new js.BlockStatement(directives);
    }

    compileBrowserModule(o) {
        var instructions = statement([this.getOpvarsDeclaration()]);

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

        if (this._opvars.length === 0) instructions.shift();

        return new js.FunctionExpression(null, [new js.Identifier(EXP)], new js.BlockStatement(instructions));
    }

    runtimeCompile(o) {
        LIB = nuVar('bzbSupportLib');
        EXP = nuVar('moduleExports');
        var instructions = statement([new js.Literal("use strict"), this.getOpvarsDeclaration(), getJSAssign(LIB, getJSMethodCall(['require'], [new js.Literal('bizubee lib')]), 'const'), getJSDeclare(new js.Identifier(EXP, false), getJSMethodCall([LIB, 'module'], []))]) || o.instructions;

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

        instructions.append(statement([new js.AssignmentExpression('=', getJSMemberExpression(['module', 'exports']), new js.Identifier(EXP))]));

        instructions.append(statement(new js.AssignmentExpression('=', getJSMemberExpression(['global', 'main']), new js.Identifier('main'))));

        if (this._opvars.length === 0) instructions[1] = new js.EmptyStatement();

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

exports.Program = Program;

class Statement extends Node {}

exports.Statement = Statement;

class BlockStatement extends Scope {
    toJS(o) {
        var instructions = [] || o.instructions;
        var _iteratorNormalCompletion13 = true;
        var _didIteratorError13 = false;
        var _iteratorError13 = undefined;

        try {
            for (var _iterator13 = this.body[Symbol.iterator](), _step13; !(_iteratorNormalCompletion13 = (_step13 = _iterator13.next()).done); _iteratorNormalCompletion13 = true) {
                var line = _step13.value;

                var nodes = line.toJS(o);
                if (nodes instanceof Array) {
                    var _iteratorNormalCompletion14 = true;
                    var _didIteratorError14 = false;
                    var _iteratorError14 = undefined;

                    try {
                        for (var _iterator14 = nodes[Symbol.iterator](), _step14; !(_iteratorNormalCompletion14 = (_step14 = _iterator14.next()).done); _iteratorNormalCompletion14 = true) {
                            var subline = _step14.value;

                            instructions.push(subline);
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
                } else if (nodes instanceof js.Node) {
                    if (nodes instanceof js.Expression) {
                        instructions.push(statement(nodes));
                    } else instructions.push(nodes);
                } else {
                    this.error('Invalid object ' + typeof nodes + '!');
                }
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

    toJS(o) {
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

    toJS(o) {
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

    toJS(o) {
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

    toJS(o) {
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

    toJS(o) {
        if (defined(this.after)) {
            if (this.after instanceof ReturnStatement) this.after.error('Cannot return from function multiple times!');

            var variableName = nuVar('returnValue');
            var variable = new js.Identifier(variableName);
            var lines = [getJSDeclare(variable, this.argument.toJS(o), 'const')];

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

    toJS(o) {
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

    toJS(o) {
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

    toJS(o) {
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

    toJS(o) {
        if (this.async) return this.asyncToJS(o);else return this.syncToJS(o);
    }

    syncToJS(o) {
        var left = nuVar();
        var right = this.right.toJS(o);
        var nuleft = new js.VariableDeclaration([new js.VariableDeclarator(new js.Identifier(left))], 'let');

        var jbody = this.body.toJS(o);
        var declare = getJSDeclare(this.left, new js.Identifier(left), 'const');

        jbody.body.unshift(declare);

        return new js.ForOfStatement(jbody, nuleft, right);
    }

    asyncToJS(o) {
        var pfunc = this.getParentFunction();
        if (!pfunc.async) this.error('Cannot have for-on loop in sync function!');

        var right = nuVar('lefthandPlaceholder'); // variable placeholder for async generator expression
        var ctrl = nuVar('observerController'); // generator's {done(bool), value} variable
        var ctrle = getJSAssign(ctrl, new js.YieldExpression(getJSMethodCall([right, 'next'], [])), 'const');

        var cond = new js.IfStatement(getJSMemberExpression([ctrl, 'done']), new js.BreakStatement());

        var decl = getJSDeclare(this.left, getJSMemberExpression([ctrl, 'value']));

        var body = [ctrle, cond].concat(decl);
        var _iteratorNormalCompletion15 = true;
        var _didIteratorError15 = false;
        var _iteratorError15 = undefined;

        try {
            for (var _iterator15 = this.body[Symbol.iterator](), _step15; !(_iteratorNormalCompletion15 = (_step15 = _iterator15.next()).done); _iteratorNormalCompletion15 = true) {
                var line = _step15.value;

                body.append(line.toJS(o));
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

        return [getJSAssign(right, new js.CallExpression(new js.MemberExpression(this.right.toJS(), getJSMemberExpression([LIB, 'symbols', 'observer']), true), []), 'const'), new js.WhileStatement(new js.Literal(true), new js.BlockStatement(body))];
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
        var _iteratorNormalCompletion16 = true;
        var _didIteratorError16 = false;
        var _iteratorError16 = undefined;

        try {
            for (var _iterator16 = this.declarators[Symbol.iterator](), _step16; !(_iteratorNormalCompletion16 = (_step16 = _iterator16.next()).done); _iteratorNormalCompletion16 = true) {
                var decl = _step16.value;

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
    }

    toJS(o) {
        var jsvars = [];
        var type = this.constant ? 'const' : 'let';

        var _iteratorNormalCompletion17 = true;
        var _didIteratorError17 = false;
        var _iteratorError17 = undefined;

        try {
            for (var _iterator17 = this.declarators[Symbol.iterator](), _step17; !(_iteratorNormalCompletion17 = (_step17 = _iterator17.next()).done); _iteratorNormalCompletion17 = true) {
                var declarator = _step17.value;

                jsvars = jsvars.concat(declarator.toJS(o));
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

    toJS(o) {
        var init = !!this.init ? this.init.toJS(o) : null;
        if (this.id instanceof Pattern) {
            if (init === null) this.id.error('All pattern declarations must be initialized!');

            var nuvar = nuVar('patternPlaceholder');
            var arr = [new js.VariableDeclarator(new js.Identifier(nuvar), this.init.toJS(o))];

            var _iteratorNormalCompletion18 = true;
            var _didIteratorError18 = false;
            var _iteratorError18 = undefined;

            try {
                for (var _iterator18 = this.id.extractAssigns(new js.Identifier(nuvar))[Symbol.iterator](), _step18; !(_iteratorNormalCompletion18 = (_step18 = _iterator18.next()).done); _iteratorNormalCompletion18 = true) {
                    var pattern = _step18.value;

                    arr.push(pattern);
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
    toJS(o) {
        return new js.ThisExpression();
    }
}

exports.ThisExpression = ThisExpression;

class YieldExpression extends Expression {
    constructor() {
        var argument = arguments.length <= 0 || arguments[0] === undefined ? null : arguments[0];

        super(argument);
        setParent(argument, this);

        this._ctrl = null;
        this.argument = argument;
    }

    toJS(o) {
        var inyield = undefined,
            pfunc = this.getParentFunction();
        if (pfunc === null || !pfunc.generator) {
            this.error('Yield expression only allowed inside a generator function!');
        }

        if (pfunc.async) {
            inyield = new getJSMethodCall([pfunc._ctrl, 'send'], [this.argument.toJS(o)]);
        } else {
            var _inyield = !this.argument ? null : this.argument.toJS(o);
        }

        return new js.YieldExpression(inyield, false);
    }
}

exports.YieldExpression = YieldExpression;

class AwaitExpression extends Expression {
    constructor(argument) {
        super(argument);
        setParent(argument, this);

        this.argument = argument;
    }

    toJS(o) {
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

    toJS(o) {
        var array = [];
        var _iteratorNormalCompletion19 = true;
        var _didIteratorError19 = false;
        var _iteratorError19 = undefined;

        try {
            for (var _iterator19 = this.elements[Symbol.iterator](), _step19; !(_iteratorNormalCompletion19 = (_step19 = _iterator19.next()).done); _iteratorNormalCompletion19 = true) {
                var element = _step19.value;

                array.push(element.toJS(o));
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

    toJS(o) {
        var props = [];
        var _iteratorNormalCompletion20 = true;
        var _didIteratorError20 = false;
        var _iteratorError20 = undefined;

        try {
            for (var _iterator20 = this.properties[Symbol.iterator](), _step20; !(_iteratorNormalCompletion20 = (_step20 = _iterator20.next()).done); _iteratorNormalCompletion20 = true) {
                var prop = _step20.value;

                props.push(prop.toJS(o));
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

    toJS(o) {
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

    toJS(o) {
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
        var _iteratorNormalCompletion21 = true;
        var _didIteratorError21 = false;
        var _iteratorError21 = undefined;

        try {
            for (var _iterator21 = this.patterns[Symbol.iterator](), _step21; !(_iteratorNormalCompletion21 = (_step21 = _iterator21.next()).done); _iteratorNormalCompletion21 = true) {
                var param = _step21.value;

                if (param instanceof SpreadPattern) {
                    return i;
                }

                i++;
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

        return -1;
    }

    *extractVariables() {
        var _iteratorNormalCompletion22 = true;
        var _didIteratorError22 = false;
        var _iteratorError22 = undefined;

        try {
            for (var _iterator22 = this.patterns[Symbol.iterator](), _step22; !(_iteratorNormalCompletion22 = (_step22 = _iterator22.next()).done); _iteratorNormalCompletion22 = true) {
                var pattern = _step22.value;

                if (pattern instanceof Identifier) {
                    yield pattern.name;
                } else if (pattern instanceof Pattern) {
                    yield* pattern.extractVariables();
                } else pattern.error('Token not allowed in ArrayPattern');
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

    *extractAssigns(target) {
        var declare = arguments.length <= 1 || arguments[1] === undefined ? true : arguments[1];
        var def = arguments.length <= 2 || arguments[2] === undefined ? null : arguments[2];

        var itervar = nuVar('iterator');
        if (declare) yield new js.VariableDeclarator(new js.Identifier(itervar), getJSIterable(target));else yield new js.AssignmentExpression('=', new js.Identifier(itervar), getJSIterable(target));
        var _iteratorNormalCompletion23 = true;
        var _didIteratorError23 = false;
        var _iteratorError23 = undefined;

        try {
            for (var _iterator23 = this.patterns[Symbol.iterator](), _step23; !(_iteratorNormalCompletion23 = (_step23 = _iterator23.next()).done); _iteratorNormalCompletion23 = true) {
                var pattern = _step23.value;

                if (pattern instanceof Identifier) {
                    if (declare) yield new js.VariableDeclarator(pattern, new js.MemberExpression(getJSMethodCall([itervar, 'next'], []), new js.Identifier('value')));else yield new js.AssignmentExpression('=', pattern, new js.MemberExpression(getJSMethodCall([itervar, 'next'], []), new js.Identifier('value')));
                } else if (pattern instanceof ArrayPattern || pattern instanceof ObjectPattern) {

                    yield* pattern.extractAssigns(new js.MemberExpression(getJSMethodCall([itervar, 'next'], []), new js.Identifier('value')), declare);
                } else {
                    pattern.error('Invalid pattern for assignment type!');
                }
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
}

exports.ArrayPattern = ArrayPattern;

class ObjectPattern extends Pattern {
    constructor(patterns) {
        super();
        setParent(patterns, this);

        this.patterns = patterns;
    }

    *extractVariables() {
        var _iteratorNormalCompletion24 = true;
        var _didIteratorError24 = false;
        var _iteratorError24 = undefined;

        try {
            for (var _iterator24 = this.patterns[Symbol.iterator](), _step24; !(_iteratorNormalCompletion24 = (_step24 = _iterator24.next()).done); _iteratorNormalCompletion24 = true) {
                var pattern = _step24.value;

                if (pattern instanceof Identifier) {
                    yield pattern.name;
                } else if (pattern instanceof Pattern) {
                    yield* pattern.extractVariables();
                } else pattern.error('Token not allowed in ObjectPattern');
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

    *extractAssigns(target) {
        var declare = arguments.length <= 1 || arguments[1] === undefined ? true : arguments[1];
        var def = arguments.length <= 2 || arguments[2] === undefined ? null : arguments[2];
        var _iteratorNormalCompletion25 = true;
        var _didIteratorError25 = false;
        var _iteratorError25 = undefined;

        try {
            for (var _iterator25 = this.patterns[Symbol.iterator](), _step25; !(_iteratorNormalCompletion25 = (_step25 = _iterator25.next()).done); _iteratorNormalCompletion25 = true) {
                var pattern = _step25.value;

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

    toJS(o) {
        var body = [],
            props = [];

        var _iteratorNormalCompletion26 = true;
        var _didIteratorError26 = false;
        var _iteratorError26 = undefined;

        try {
            for (var _iterator26 = this.body[Symbol.iterator](), _step26; !(_iteratorNormalCompletion26 = (_step26 = _iterator26.next()).done); _iteratorNormalCompletion26 = true) {
                var line = _step26.value;

                if (line instanceof MethodDefinition) {
                    body.push(line.toJS(o));
                } else if (line instanceof ClassProperty) {
                    props.push(line.toJS(o));
                } else {
                    line.error('Class body item unrecognized!');
                }
            }

            // create class
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

        var superClass = defined(this.superClass) ? this.superClass.toJS(o) : null;
        var cls = new js.ClassExpression(null, superClass, body);

        if (props.length === 0) {
            if (defined(this.id)) {
                return getJSAssign(this.id.name, cls, 'const');
            } else {
                return cls;
            }
        } else {
            var rapper = getJSMethodCall([LIB, 'classify'], [cls, new js.ObjectExpression(props)]);
            if (defined(this.id)) {
                return getJSAssign(this.id.name, rapper, 'const');
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
        var computed = arguments.length <= 3 || arguments[3] === undefined ? false : arguments[3];
        var isStatic = arguments.length <= 4 || arguments[4] === undefined ? false : arguments[4];

        super();

        setParent([key, value], this);

        this.key = key;
        this.value = value;
        this.kind = kind;
        this.computed = computed;
        this['static'] = isStatic;
    }

    toJS(o) {
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

    toJS(o) {
        return new js.Property(this.key.toJS(o), this.value.toJS(o));
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

    toJS(o) {
        if (this.parent instanceof Program && this.identifier.name === 'main') {

            this.program.containsMain = true;
        }

        if (this.parent instanceof Property) return new js.Property(this.identifier, this.func.toJS(o));else return getJSDeclare(this.identifier, this.func.toJS(o), 'const');
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
        var _iteratorNormalCompletion27 = true;
        var _didIteratorError27 = false;
        var _iteratorError27 = undefined;

        try {
            for (var _iterator27 = this.params[Symbol.iterator](), _step27; !(_iteratorNormalCompletion27 = (_step27 = _iterator27.next()).done); _iteratorNormalCompletion27 = true) {
                var param = _step27.value;

                if (param instanceof SpreadPattern) {
                    return i;
                }

                i++;
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

        return -1;
    }

    toJS(o) {
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
        var _iteratorNormalCompletion28 = true;
        var _didIteratorError28 = false;
        var _iteratorError28 = undefined;

        try {
            for (var _iterator28 = this.params[Symbol.iterator](), _step28; !(_iteratorNormalCompletion28 = (_step28 = _iterator28.next()).done); _iteratorNormalCompletion28 = true) {
                var param = _step28.value;

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

        var _iteratorNormalCompletion29 = true;
        var _didIteratorError29 = false;
        var _iteratorError29 = undefined;

        try {
            for (var _iterator29 = this.params[Symbol.iterator](), _step29; !(_iteratorNormalCompletion29 = (_step29 = _iterator29.next()).done); _iteratorNormalCompletion29 = true) {
                var pram = _step29.value;

                var param = undefined,
                    def = null;
                if (pram instanceof DefaultPattern) {
                    param = pram.pattern;
                    def = pram.expression;
                } else {
                    param = pram;
                }

                if (param instanceof Identifier) {
                    params.push(param.toJS({}));
                    if (def !== null) {
                        body.push(getJSAssign(param.name, getJSConditional(param.name, def.toJS(o))));
                    }
                    i++;
                    continue;
                }

                if (param instanceof ArrayPattern || param instanceof ObjectPattern) {
                    var ph = nuVar('patternPlaceholder');
                    params.push(new js.Identifier(ph));
                    if (def !== null) {
                        body.push(getJSAssign(ph, getJSConditional(ph, def.toJS(o))));
                    }
                    body.push(getJSDeclare(param, new js.Identifier(ph), 'const'));

                    i++;
                    continue;
                }

                if (param instanceof SpreadPattern) {
                    body.push(getJSDeclare(param.pattern, getJSMethodCall([LIB, 'restargs'], [new js.Identifier('arguments'), new js.Literal(i)]), 'const'));

                    break;
                }

                param.error('This should not be here!');
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

        return { params: params, prebody: body };
    }

    regularToJs(o) {
        var noparams = arguments.length <= 1 || arguments[1] === undefined ? false : arguments[1];

        var body = this.body.toJS(o);

        var _processParams = this.processParams(o);

        var params = _processParams.params;
        var prebody = _processParams.prebody;

        var i = 0;

        if (noparams) {
            params = [];
            prebody = [];
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

        return getJSMethodCall([LIB, 'async'], [this.generatorToJs(o, noparams)]);
    }

    asyncGeneratorToJs(o) {
        var noparams = arguments.length <= 1 || arguments[1] === undefined ? false : arguments[1];

        var ctrlVar = this._ctrl = nuVar('observableController');

        var ctrl = getJSAssign(ctrlVar, getJSMethodCall([LIB, 'getObservableCtrl'], []), 'const');
        var mem = new js.AssignmentExpression('=', getJSMemberExpression([ctrlVar, 'code']), new js.CallExpression(new js.MemberExpression(this.asyncToJs(o, true), new js.Identifier("bind")), [new js.ThisExpression()]));
        var ret = new js.ReturnStatement(getJSMemberExpression([ctrlVar, 'observable']));

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

exports.UnaryExpression = UnaryExpression;

var smoothOperators = {
    '//=': function _(left, right) {
        return getJSMethodCall(['Math', 'floor'], [new js.BinaryExpression('/', left, right)]);
    },
    '^=': function _(left, right) {
        return getJSMethodCall(['Math', 'pow'], [left, right]);
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

    toJS(o) {
        var left = this.left.toJS(o);
        var right = this.right.toJS(o);
        var operator = undefined;

        if (this.operator in convert) {
            return new js.BinaryExpression(convert[this.operator], left, right);
        }

        if (this.operator + '=' in smoothOperators) {
            var fn = smoothOperators[this.operator + '='];
            return fn(this.left.toJS(o), this.right.toJS(o));
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

    toJS(o) {
        var _getOpvars = this.getOpvars(1);

        var _getOpvars2 = _slicedToArray(_getOpvars, 1);

        var opvar = _getOpvars2[0];

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

    toJS(o) {
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

            var nvar = nuVar('patternPlaceholder'),
                arr = [new getJSAssign(nvar, this.right)];
            var _iteratorNormalCompletion30 = true;
            var _didIteratorError30 = false;
            var _iteratorError30 = undefined;

            try {
                for (var _iterator30 = this.left.extractAssigns(new js.Identifier(nvar))[Symbol.iterator](), _step30; !(_iteratorNormalCompletion30 = (_step30 = _iterator30.next()).done); _iteratorNormalCompletion30 = true) {
                    var assign = _step30.value;

                    arr.push(assign);
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

        this.operator = assertLogicalOperator(operator);
        this.left = left;
        this.right = right;
    }
}

exports.LogicalExpression = LogicalExpression;

class CallExpression extends Expression {
    constructor(callee, args) {
        var isNew = arguments.length <= 2 || arguments[2] === undefined ? false : arguments[2];

        super();
        setParent([callee, args], this);

        this.callee = callee;
        this.arguments = args;
        this.isNew = isNew;
    }

    toJS(o) {
        var args = [],
            seenspread = false;
        var catlist = [];
        var _iteratorNormalCompletion31 = true;
        var _didIteratorError31 = false;
        var _iteratorError31 = undefined;

        try {
            for (var _iterator31 = this.arguments[Symbol.iterator](), _step31; !(_iteratorNormalCompletion31 = (_step31 = _iterator31.next()).done); _iteratorNormalCompletion31 = true) {
                var arg = _step31.value;

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

        catlist.push(args);

        if (catlist.length === 1 && catlist[0] === args) {
            if (this.isNew) return new js.NewExpression(this.callee.toJS(o), args);else return new js.CallExpression(this.callee.toJS(o), args);
        } else {
            var thisv = undefined,
                memberv = undefined;

            var _getOpvars3 = this.getOpvars(2);

            var _getOpvars32 = _slicedToArray(_getOpvars3, 2);

            var thisVar = _getOpvars32[0];
            var memberExp = _getOpvars32[1];

            if (this.callee instanceof MemberExpression) {
                thisv = this.callee.object.toJS(o);
                memberv = new js.MemberExpression(thisVar.toJS(o), this.callee.property.toJS(o), this.callee.computed);
            } else {
                thisv = new js.Literal(null);
                memberv = this.callee.toJS(o);
            }

            if (this.isNew) return new getJSMethodCall([LIB, 'construct'], []);else {
                return last([getJSAssign(thisVar.name, thisv), getJSAssign(memberExp.name, memberv), getJSMethodCall([memberExp.name, 'apply'], [thisVar, getJSMethodCall([LIB, 'concat'], [new js.ArrayExpression(catlist)])])]);
            }
        }
    }
}

exports.CallExpression = CallExpression;

class NewExpression extends CallExpression {}

exports.NewExpression = NewExpression;

class MemberExpression extends Expression {
    constructor(object, property) {
        var computed = arguments.length <= 2 || arguments[2] === undefined ? false : arguments[2];

        super();
        setParent([object, property], this);

        this.object = object;
        this.property = property;
        this.computed = computed;
    }

    toJS(o) {
        var object = this.object.toJS(o);
        var right = this.property.toJS(o);
        return new js.MemberExpression(object, right, this.computed);
    }
}

exports.MemberExpression = MemberExpression;

class SwitchCase extends Node {
    constructor(test, consequent) {
        super();
        setParent([test, consequent], this);

        this.test = test;
        this.consequent = consequent;
    }
}

exports.SwitchCase = SwitchCase;

class CatchClause extends Node {
    constructor(param, body) {
        super();
        setParent([param, body], this);

        this.param = param;
        this.body = body;
    }

    toJS(o) {
        if (this.param instanceof Identifier) {
            return new js.CatchClause(this.param.toJS(o), this.body.toJS(o));
        } else if (this.param instanceof Pattern) {
            var placeholder = nuVar('patternPlaceholder');
            var holderVar = new js.Identifier(placeholder);
            var declarations = getJSDeclare(this.param, holderVar, 'const');
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

        if (process) knowIdLead(name);
        this.name = name;
    }

    toJS(o) {
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

class StringLiteral extends Literal {
    constructor(value) {
        super(value);
    }
}

exports.StringLiteral = StringLiteral;

class RawStringLiteral extends Literal {
    constructor(value) {
        super(value.substring(1, value.length - 1));
    }

    toJS(o) {
        return new js.Literal(this.value);
    }
}

exports.RawStringLiteral = RawStringLiteral;

class NumberLiteral extends Literal {
    constructor(value) {
        super(value);
    }

    toJS(o) {
        return new js.Literal(+this.value);
    }
}

exports.NumberLiteral = NumberLiteral;

class All extends Node {}

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
        return new js.MemberExpression(this.require(), getJSMemberExpression([LIB, 'symbols', 'default']), true);
    }

    // generate require code for
    require() {
        if (this.program.parameters.browser) {
            return getJSMethodCall([LIB, 'require'], [new js.Literal(getLibn(this.program.resolve(this.path)))]);
        }

        if (this.path[0] === '.') {
            return getJSMethodCall([LIB, 'require'], [new js.Identifier('__dirname'), new js.Literal(this.path)]);
        } else {
            return getJSMethodCall(['require'], new js.Literal(this.path));
        }
    }

    toJS(o) {

        if (this.target instanceof ModuleAlias) {
            // for: import <somevar or wildcard> as <some var or pattern> from <path> ... cases

            var id = this.target.origin;
            var tg = this.target.target;

            if (id instanceof All) {
                return getJSDeclare(new js.Identifier(tg.name), this.require(), 'const');
            } else {
                if (tg instanceof Pattern) {
                    var vname = nuVar('patternPlaceholder');
                    var vvalue = new js.Identifier(vname);
                    var def = getJSDeclare(vvalue, this.requireDefault(), 'let');
                    var _vars = getJSDeclare(tg, vvalue.toJS({}), 'const');
                    return [def, _vars];
                } else {
                    return getJSDeclare(tg, this.requireDefault(), 'const');
                }
            }
        } else {

            // for cases like import {....} from <path>
            if (this.target instanceof Array) {
                var varname = nuVar('imports');
                var list = [getJSDeclare(new js.Identifier(varname), this.require(), 'const')];
                var _iteratorNormalCompletion32 = true;
                var _didIteratorError32 = false;
                var _iteratorError32 = undefined;

                try {
                    for (var _iterator32 = this.target[Symbol.iterator](), _step32; !(_iteratorNormalCompletion32 = (_step32 = _iterator32.next()).done); _iteratorNormalCompletion32 = true) {
                        var alias = _step32.value;

                        if (alias instanceof Identifier) {
                            list.push(getJSDeclare(alias, getJSMemberExpression([varname, alias.name]), 'const'));
                            continue;
                        }

                        // for: .. {..., someVar as someVarOrPattern,...} .. cases
                        if (alias instanceof ModuleAlias) {
                            if (alias.origin instanceof All) {
                                alias.origin.error( // can't have: import {..., * as someVarOrPattern,...} ....
                                "Wildcard not allowed in import list alias!");
                            }

                            if (alias.origin instanceof Identifier || alias.origin instanceof ModuleAlias) {

                                list.push(getJSDeclare(alias.target, alias.origin.toJS(o), 'const'));

                                continue;
                            }

                            alias.origin.error('Unrecognized import alias origin type!');
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

                return list;
            } else if (this.target instanceof Identifier) {
                return getJSDeclare(this.target, this.requireDefault(), 'const');
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

    toJS(o) {
        if (this.isdefault) {
            return new js.AssignmentExpression('=', new js.MemberExpression(new js.Identifier(EXP), getJSMemberExpression([LIB, 'symbols', 'default']), true), this.target.toJS(o));
        } else {
            if (this.target instanceof Array) {
                var list = [];
                var _iteratorNormalCompletion33 = true;
                var _didIteratorError33 = false;
                var _iteratorError33 = undefined;

                try {
                    for (var _iterator33 = this.target[Symbol.iterator](), _step33; !(_iteratorNormalCompletion33 = (_step33 = _iterator33.next()).done); _iteratorNormalCompletion33 = true) {
                        var alias = _step33.value;

                        if (alias instanceof ModuleAlias) {
                            if (alias.origin instanceof All) {
                                alias.origin.error("Wildcard not allowed in export list alias!");
                            }

                            if (alias.target instanceof Pattern) {
                                alias.target.error("Pattern not allowed as export alias target!");
                            }

                            if (alias.target instanceof Identifier) {
                                list.push(new js.AssignmentExpression('=', getJSMemberExpression([EXP, alias.target.name]), alias.origin.toJS(o)));
                            } else alias.target.error('Unrecognized token, only identifiers allowed!');

                            continue;
                        }

                        if (alias instanceof Identifier) {
                            list.push(new js.AssignmentExpression('=', getJSMemberExpression([EXP, alias.name]), alias.toJS(o)));
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
            } else {
                var list = [this.target.toJS(o)];
                var _iteratorNormalCompletion34 = true;
                var _didIteratorError34 = false;
                var _iteratorError34 = undefined;

                try {
                    for (var _iterator34 = this.target.extractVariables()[Symbol.iterator](), _step34; !(_iteratorNormalCompletion34 = (_step34 = _iterator34.next()).done); _iteratorNormalCompletion34 = true) {
                        var _name = _step34.value;

                        var left = getJSMemberExpression([EXP, _name]);
                        var right = new js.Identifier(_name);
                        list.push(new js.AssignmentExpression('=', left, right));
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

                return list;
            }
        }
    }
}

exports.ExportStatement = ExportStatement;

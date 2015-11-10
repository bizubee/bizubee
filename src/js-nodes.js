"use strict";

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _slicedToArray = (function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; })();

var binaryOperator = new Set(["==", "!=", "===", "!==", "<", "<=", ">", ">=", "<<", ">>", ">>>", "+", "-", "*", "/", "%", "|", "^", "&", "in", "instanceof"]);

var logicalOperator = new Set(["||", "&&"]);

var assignmentOperator = new Set(["=", "+=", "-=", "*=", "/=", "%=", "<<=", ">>=", ">>>=", "|=", "^=", "&="]);

var updateOperator = new Set(["++", "--"]);

function assertBinaryOperator(operator) {
	if (binaryOperator.has(operator)) {
		return operator;
	} else {
		throw new Error("Operator \"" + operator + "\" not binary!");
	}
}

function assertLogicalOperator(operator) {
	if (logicalOperator.has(operator)) {
		return operator;
	} else {
		throw new Error("Operator \"" + operator + "\" not logical!");
	}
}

function assertAssignmentOperator(operator) {
	if (assignmentOperator.has(operator)) {
		return operator;
	} else {
		throw new Error("Operator \"" + operator + "\" not assignment!");
	}
}

function assertUpdateOperator(operator) {
	if (updateOperator.has(operator)) {
		return operator;
	} else {
		throw new Error("Operator \"" + operator + "\" not update!");
	}
}

class Node {
	constructor() {
		this.type = this.constructor.name;
		this._origin = null;
		this.loc = null;
	}

	toJS(o) {
		return this;
	}

	from(origin) {
		var _origin$position = _slicedToArray(origin.position, 4);

		var left = _origin$position[0];
		var up = _origin$position[1];
		var right = _origin$position[2];
		var down = _origin$position[3];

		this.loc = {
			source: origin.filename,
			start: {
				column: left,
				line: up
			},
			end: {
				column: right,
				line: down
			}
		};
		this._origin = origin;

		return this;
	}
}

exports.Node = Node;

class Program extends Node {
	constructor(statements) {
		super();
		this.body = statements;
	}
}

exports.Program = Program;

class Statement extends Node {}

exports.Statement = Statement;

class EmptyStatement extends Statement {}

exports.EmptyStatement = EmptyStatement;

class BlockStatement extends Statement {
	constructor(statements) {
		super();
		this.body = statements;
	}
}

exports.BlockStatement = BlockStatement;

class ExpressionStatement extends Statement {
	constructor(expression) {
		super();
		this.expression = expression;
	}
}

exports.ExpressionStatement = ExpressionStatement;

class IfStatement extends Statement {
	constructor(test, consequent, alternate) {
		super();
		this.test = test;
		this.consequent = consequent;
		this.alternate = alternate;
	}
}

exports.IfStatement = IfStatement;

class BreakStatement extends Statement {
	constructor() {
		var label = arguments.length <= 0 || arguments[0] === undefined ? null : arguments[0];

		super();
		this.label = label;
	}
}

exports.BreakStatement = BreakStatement;

class ContinueStatement extends Statement {
	constructor() {
		var label = arguments.length <= 0 || arguments[0] === undefined ? null : arguments[0];

		super();
		this.label = label;
	}
}

exports.ContinueStatement = ContinueStatement;

class SwitchStatement extends Statement {
	constructor(discriminant, cases) {
		super();
		this.discriminant = discriminant;
		this.cases = cases;
	}
}

exports.SwitchStatement = SwitchStatement;

class ReturnStatement extends Statement {
	constructor(argument) {
		super();
		this.argument = argument;
	}
}

exports.ReturnStatement = ReturnStatement;

class ThrowStatement extends Statement {
	constructor(argument) {
		super();
		this.argument = argument;
	}
}

exports.ThrowStatement = ThrowStatement;

class TryStatement extends Statement {
	constructor(block) {
		var handler = arguments.length <= 1 || arguments[1] === undefined ? null : arguments[1];
		var finalizer = arguments.length <= 2 || arguments[2] === undefined ? null : arguments[2];

		super();
		this.block = block;
		this.handler = handler;
		this.finalizer = finalizer;
	}
}

exports.TryStatement = TryStatement;

class WhileStatement extends Statement {
	constructor(test, body) {
		super();
		this.test = test;
		this.body = body;
	}
}

exports.WhileStatement = WhileStatement;

class ForStatement extends Statement {
	constructor(body) {
		var init = arguments.length <= 1 || arguments[1] === undefined ? null : arguments[1];
		var test = arguments.length <= 2 || arguments[2] === undefined ? null : arguments[2];
		var update = arguments.length <= 3 || arguments[3] === undefined ? null : arguments[3];

		super();
		this.body = body;
		this.init = init;
		this.test = test;
		this.update = update;
	}
}

exports.ForStatement = ForStatement;

class ForInStatement extends Statement {
	constructor(body, left, right) {
		super();
		this.body = body;
		this.left = left;
		this.right = right;
	}
}

exports.ForInStatement = ForInStatement;

class ForOfStatement extends ForInStatement {
	constructor(body, left, right) {
		super(body, left, right);
	}
}

exports.ForOfStatement = ForOfStatement;

class Declaration extends Statement {}

exports.Declaration = Declaration;

class VariableDeclaration extends Declaration {
	constructor(declarations, kind) {
		super();
		this.declarations = declarations;
		this.kind = kind;
	}
}

exports.VariableDeclaration = VariableDeclaration;

class VariableDeclarator extends Node {
	constructor(id) {
		var init = arguments.length <= 1 || arguments[1] === undefined ? null : arguments[1];

		super();
		this.id = id;
		this.init = init;
	}
}

exports.VariableDeclarator = VariableDeclarator;

class Expression extends Node {}

exports.Expression = Expression;

class ThisExpression extends Expression {}

exports.ThisExpression = ThisExpression;

class ArrayExpression extends Expression {
	constructor(elements) {
		super();
		this.elements = elements;
	}
}

exports.ArrayExpression = ArrayExpression;

class ObjectExpression extends Expression {
	constructor(properties) {
		super();
		this.properties = properties;
	}
}

exports.ObjectExpression = ObjectExpression;

class Property extends Node {
	constructor(key, value) {
		var kind = arguments.length <= 2 || arguments[2] === undefined ? 'init' : arguments[2];

		super();
		this.key = key;
		this.value = value;
		this.kind = kind;
	}
}

exports.Property = Property;

class FunctionExpression extends Expression {
	constructor(id, params, body) {
		var generator = arguments.length <= 3 || arguments[3] === undefined ? false : arguments[3];

		super();
		this.id = id;
		this.params = params;
		this.body = body;
		this.generator = generator;
	}
}

exports.FunctionExpression = FunctionExpression;

class ClassExpression extends Expression {
	constructor() {
		var id = arguments.length <= 0 || arguments[0] === undefined ? null : arguments[0];
		var superClass = arguments.length <= 1 || arguments[1] === undefined ? null : arguments[1];
		var body = arguments.length <= 2 || arguments[2] === undefined ? [] : arguments[2];

		super();

		this.id = id;
		this.superClass = superClass;
		this.body = new ClassBody(body);
	}
}

exports.ClassExpression = ClassExpression;

class ClassBody extends Node {
	constructor(body) {
		super();
		this.body = body;
	}
}

exports.ClassBody = ClassBody;

class MethodDefinition extends Node {
	constructor(key, value) {
		var kind = arguments.length <= 2 || arguments[2] === undefined ? "method" : arguments[2];
		var computed = arguments.length <= 3 || arguments[3] === undefined ? false : arguments[3];
		var isStatic = arguments.length <= 4 || arguments[4] === undefined ? false : arguments[4];

		super();

		this.key = key;
		this.value = value;
		this.kind = kind;
		this.computed = computed;
		this["static"] = isStatic;
	}
}

exports.MethodDefinition = MethodDefinition;

class SequenceExpression extends Expression {
	constructor(expressions) {
		super();
		this.expressions = expressions;
	}
}

exports.SequenceExpression = SequenceExpression;

class UnaryExpression extends Expression {
	constructor(operator, prefix, argument) {
		super();
		this.operator = operator;
		this.prefix = prefix;
		this.argument = argument;
	}
}

exports.UnaryExpression = UnaryExpression;

class BinaryExpression extends Expression {
	constructor(operator, left, right) {
		super();
		this.operator = operator;
		this.left = left;
		this.right = right;
	}
}

exports.BinaryExpression = BinaryExpression;

class AssignmentExpression extends Expression {
	constructor(operator, left, right) {
		super();
		this.operator = assertAssignmentOperator(operator);
		this.left = left;
		this.right = right;
	}
}

exports.AssignmentExpression = AssignmentExpression;

class UpdateExpression extends Expression {
	constructor(operator, argument, prefix) {
		super();
		this.operator = assertUpdateOperator(operator);
		this.argument = argument;
		this.prefix = prefix;
	}
}

exports.UpdateExpression = UpdateExpression;

class LogicalExpression extends Expression {
	constructor(operator, left, right) {
		super();
		this.operator = assertLogicalOperator(operator);
		this.left = left;
		this.right = right;
	}
}

exports.LogicalExpression = LogicalExpression;

class ConditionalExpression extends Expression {
	constructor(test, consequent, alternate) {
		super();
		this.test = test;
		this.consequent = consequent;
		this.alternate = alternate;
	}
}

exports.ConditionalExpression = ConditionalExpression;

class CallExpression extends Expression {
	constructor(callee, args) {
		super();
		this.callee = callee;
		this.arguments = args;
	}
}

exports.CallExpression = CallExpression;

class NewExpression extends CallExpression {}

exports.NewExpression = NewExpression;

class MemberExpression extends Expression {
	constructor(object, property) {
		var computed = arguments.length <= 2 || arguments[2] === undefined ? false : arguments[2];

		super();
		this.object = object;
		this.property = property;
		this.computed = computed;
	}
}

exports.MemberExpression = MemberExpression;

class Pattern extends Node {}

exports.Pattern = Pattern;

class SpreadElement extends Node {
	constructor(argument) {
		super();
		this.argument = argument;
	}
}

exports.SpreadElement = SpreadElement;

class SwitchCase extends Node {
	constructor(test, consequent) {
		super();
		this.test = test;
		this.consequent = consequent;
	}
}

exports.SwitchCase = SwitchCase;

class CatchClause extends Node {
	constructor(param, body) {
		super();
		this.param = param;
		this.body = body;
	}
}

exports.CatchClause = CatchClause;

class Identifier extends Pattern {
	constructor(name) {
		super();
		this.name = name;
	}
}

exports.Identifier = Identifier;

class Literal extends Expression {
	constructor(value) {
		super();
		this.value = value;
	}
}

// like properties but used in object patterns
exports.Literal = Literal;

class AssignmentProperty extends Property {
	constructor(value) {
		super();

		this.type = "Property";
		this.value = value;
		this.kind = "init";
		this.method = false;
	}
}

// ES6

exports.AssignmentProperty = AssignmentProperty;

class YieldExpression extends Expression {
	constructor(argument) {
		var delegate = arguments.length <= 1 || arguments[1] === undefined ? false : arguments[1];

		super();
		this.argument = argument;
		this.delegate = delegate;
	}
}

exports.YieldExpression = YieldExpression;

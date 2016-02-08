
"use strict";

const bz = require('./bz-nodes');
const js = require('./js-nodes');
const nuVar = require('./vargen').nuVar;

module.exports.getJSVar = (name, constant) => {
    constant = constant || false;
    return new js.VariableDeclaration(
        [new js.AssignmentExpression(
            '=',
            new js.Identifier(name),
            init.toJS({})
        )],
        (constant) ? 'const' : 'let'
    );
}

module.exports.getJSAssign = (name, value, type) => {
    let id = new js.Identifier(name);
    let assign = new js.AssignmentExpression(
        '=',
        id,
        value);
    if (type !== undefined && type !== null) {
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

module.exports.getJSDeclare = (pattern, jvalue, type) => {
    type = type || 'const';
    if (pattern instanceof bz.Identifier || pattern instanceof js.Identifier) {
        return new js.VariableDeclaration([
                new js.VariableDeclarator(pattern.toJS({}), jvalue)
            ], type);
    }
    
    if (pattern instanceof String) {
        return new js.VariableDeclaration([
                new js.VariableDeclarator(new js.Identifier(pattern), jvalue)
            ], type);
    }
    
    if (pattern instanceof bz.ArrayPattern) {
        let arr = [];
        for (let sp of pattern.extractAssigns(jvalue)) {
            arr.push(sp);
        }

        return new js.VariableDeclaration(arr, type);        
    }


    if (pattern instanceof bz.ObjectPattern) {
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

    if (pattern instanceof bzIdentifier) {
        return new js.VariableDeclaration([new js.VariableDeclarator(pattern, jvalue)], type);
    }

    pattern.error('Invalid declaration type!');
}

module.exports.getJSMethodCall = (names, args) => {
    return new js.CallExpression(
        exports.getJSMemberExpression(names), args);
}

module.exports.getJSMemberExpression = (names) => {
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

module.exports.getJSIterable = (target) => {
    return new js.CallExpression(
        new js.MemberExpression(
            target,
            exports.getJSMemberExpression(['Symbol', 'iterator']),
            true),
        []
        );
}

// returns 
module.exports.getJSConditional = (identifier, def) => {
    if (identifier instanceof js.Identifier) {
        return new js.ConditionalExpression(
            new js.BinaryExpression('===', identifier, new js.Identifier('undefined')),
            def,
            identifier
            );
    } else if (typeof identifier === 'string') {
        return exports.getJSConditional(new js.Identifier(identifier), def);
    } else {
        throw new Error('Conditional expression must use identifier!');
    }
}
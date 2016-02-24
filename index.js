#! /usr/bin/env node

"use strict";

var fs		= require('fs');
var vm      = require('vm');
var path    = require('path');
var cmd     = require('minimist');
var parser 	= require('./src/parser');
var bzbLib 	= require('./src/lib');
var lookup  = require('./src/lookup');

const ext = lookup.extension;

function stripExt(text) {
    if (text.endsWith(ext)) {
        return text.substring(0, text.length - (ext.length + 1));
    } else {
        return text;
    }
}


function has(option) {
    if (option in args) {
        return true;
    }
    
    return (short[option] in args);

}

function get(option) {
    if (option in args) {
        return args[option];
    } else {
        return args[short[option]];
    }
}

function pad(str, len) {
	str = str + "";
	if (str.length > len) {
		throw new Error('Original string cannot be longer than target!');
	} else {
		while (str.length < len) {
			str += ' ';
		}

		return str;
	}
}

function apologize(text) {
    console.log(`Sorry, ${text}!`);
    process.exit(0);
}

function showHelp(message) {
    console.log();
    console.log("Bizubee, the World's most intense programming language!");
    console.log();
    console.log();
    console.log('Usage:');
    console.log();
    console.log(`\t$ bizubee ${pad(`-c bizubee/file/path.${ext}`, 50)}# to compile file (to bizubee/file/path.${ext}.js)`);
    console.log(`\t$ bizubee ${pad(`bizubee/file/path.${ext}`, 50)}# to execute file`);
    console.log(`\t$ bizubee ${pad(`bizubee/file/path.${ext} <arguments>`, 50)}# to execute file with arguments`);
    console.log(`\t$ bizubee ${pad(`<options> bizubee/file/path.${ext} <arguments>`, 50)}# to execute file with options and with arguments passed in`);
    console.log();
    console.log();
    console.log('Options:');
    console.log();
    for (var op of ops) {
        console.log(`\t-${op[0]},\t--${pad(op[1], 10)}\t${op[2]}`);
    }
    
    process.exit(0);
}

const ops = [
    ['c', 'compile', 'Compile bisubee file and all dependencies into single file'],
    ['t', 'target', 'Specify target for file compilation output (defaults to <filename>.js)'],
    ['m', 'mapfile', 'Specify custom mapfile name when compiling'],
    ['v', 'version', 'Show version of bizubee'],
    ['h', 'help', 'Shows this list of commands and information'],
    ['a', 'ast', 'Outputs bizubee AST for given file'],
    ['A', 'ast-js', 'Outputs javascript AST for given program'],
];

const short = {}, long = {};
var oplen = -1;
for (var op of ops) {
    if (op[0] !== null) {
        short[op[0]] = op[1];
    }
    
    long[op[1]] = op[2];
}


const args = cmd(process.argv.slice(1));
for (let arg in args) {
    oplen++;
}

if (args._.length === 1 && oplen === 0) {
    showHelp();
} else {
    if (has('h')) {
        showHelp();
    }
    
    if (has('c')) {
        const relpth    = `${stripExt(get('c'))}.${ext}`;
        const abspth    = path.resolve(process.cwd(), relpth);
        const ctrl      = parser.parseFile(abspth, {
            rootfile: abspth,
            browser: {
                root: true
            }
        });
        
        if (has('a')) {
            console.log(JSON.stringify(ctrl.tree, null, 4));
            process.exit(0);
        }

        if (has('A')) {
            console.log(JSON.stringify(ctrl.getJSTree(), null, 4));
            process.exit(0);
        }


        const jstext    = ctrl.getJSText();
        const tname     = has('t') ? get('t') : `${relpth}.js`;

        if (has('m')) {
            const mappath = `${tname}.map`;
            const srcmap = ctrl.getMap(mappath);
            const mapcom = `//# sourceMappingURL=${path.basename(mappath)}`;
            fs.writeFileSync(mappath, srcmap.toString(), 'utf8');
            fs.writeFileSync(tname, `${jstext}\n\n${mapcom}`, 'utf8');            
        } else {
            fs.writeFileSync(tname, jstext, 'utf8');            
        }
        
        process.exit(0);
    }
    
    if (has('v')) {
        const text = fs.readFileSync(`${__dirname}/package.json`, 'utf8');
        const json = JSON.parse(text);
        console.log(json.version);
        process.exit(0);
    }
    
    if (args._.length > 1) {
        var pth     = path.resolve(process.cwd(), `${stripExt(args._[1])}.${ext}`);
        var result  = bzbLib.runFileInNewContext(pth, {}, false);
        result.main(args._.slice(1));
    } else {
        showHelp();
    }
}
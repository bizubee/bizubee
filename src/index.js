
import {parse} from 'bizubee-compiler'
import {run} from 'bizubee-node'
import {rollup} from 'rollup'
import rollupBizubee from 'rollup-plugin-bizubee'
import fs from 'fs'

function stripExt(text) {
    if (text.endsWith(ext)) {
        return text.substring(0, text.length - (ext.length + 1));
    } else {
        return text;
    }
}


function has(args, option) {
    if (option in args) {
        return true;
    }
    
    return (short[option] in args);

}

function get(args, option) {
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

function normalize(path) {
    const pathRegexp = /^\.?\/.*/;
    let normal = path;
    if (!pathRegexp.test(path)) { // if path doesnt start with / or ./
        normal = `./${normal}`;
    }

    if (normal.endsWith('.' + ext)) {
        return normal;
    }

    if (normal.endsWith('.js')) {
        return normal;
    }

    return `${normal}.${ext}`;
}

const ext = 'bz';

const ops = [
    ['c', 'compile', 'Compile individual bizubee file to JS'],
    ['b', 'bundle', 'Bundle bizubee file and dependencies with rollup'],
    ['v', 'version', 'Show version of bizubee'],
    ['h', 'help', 'Shows this list of commands and information'],
];

const short = {}, long = {};


export function main(args) {
    var oplen = -1;
    for (var op of ops) {
        if (op[0] !== null) {
            short[op[0]] = op[1];
        }

        long[op[1]] = op[2];
    }

    for (let arg in args) {
        oplen++;
    }

    if (args._.length === 1 && oplen === 0) {
        showHelp();
    } else {
        if (has(args, 'h')) {
            showHelp();
        }
        
        if (has(args, 'c')) {
            const source = fs.readFileSync(get(args, 'c'), 'utf8');
            console.log(parse(source));
            
            process.exit(0);
        }
        
        if (has(args, 'v')) {
            const json = require('../package.json');
            console.log(json.version);

            process.exit(0);
        }
        
        if (args._.length > 1) {
            run(normalize(args._[1]));
        } else {
            showHelp();
        }
    }
}
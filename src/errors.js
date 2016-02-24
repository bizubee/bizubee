
"use strict";

const fmt = require('./format');

class Line {
	constructor(string, tabbing) {
		let array = [];
		let offset = 0;
		for (let c of string) {
			if (c === '\t') {
				let tab = tabbing - offset % tabbing;
				offset += tab;
				array.push(fmt.repeat(' ', tab));
			} else {
				offset += 1;
				array.push(c);
			}
		}

		this._tabbed = string.split();
		this._untabbed = array;
	}

	// maps index to a line
	map(index) {
		let mi = 0;
		for (let i = 0; i < index; i++) {
			mi += this._untabbed[i].length;
		}

		return mi;
	}

	unmap(index) {
		let mi = 0;
		for (let i = 0; i < index; i++) {
			mi += this._untabbed[i].length;
			if (mi > index) {
				return i;
			}
		}

		throw new Error('Index out of range!');
	}

	get tabbed() {
		return this._tabbed.join('');
	}

	get untabbed() {
		return this._untabbed.join('');
	}
}

class Lines {
	constructor(csrc, tabbing) {
		this._csrc = csrc;
		this.tabbing = tabbing;
	}

	* [Symbol.iterator] () {
		let i = 0, line = "";
		for (let c of this._csrc) {
			if (c === '\n') {
				yield new Line(line, this.tabbing);
				line = "";
			} else {
				line += c;
			}
		}

		yield new Line(line, this.tabbing);
	}

	error(text, xy, output, raise) {
		const
			x = xy[0]
		,	y = xy[1]
		;

        let i = 0;
        let filename = this._csrc.filename || null;
        output 	= output || console;
        raise 	= !!raise

        if (raise) {
            if (filename === null)
                throw new Error(`Syntax error at position ${x},${y+1} in VM:\n\t${text}`);
            else
                throw new Error(`Syntax error at position ${x},${y+1} in file '${filename}':\n\t${text}`);
        }
        
        if (filename === null)
        	output.log(`SyntaxError: ${text}\n\ton line ${y + 1} in VM:`);
        else 
        	output.log(`SyntaxError: ${text}\n\ton line ${y + 1} in file '${filename}'`);
        output.log();
        output.log();


        for (let line of this) {
            if (Math.abs(i - y) < 6) {
                output.log(`${fmt.addSpacing(i + 1, 6)}|\t\t${line.untabbed}`);

                if (i === y) {
                    let offset = line.map(x);
                    output.log(`${fmt.addSpacing('', 6)} \t\t${fmt.repeat(' ', offset)}^`);
                }
            }

            i++;
        }

        process.exit();
	}
}

exports.Line = Line;
exports.Lines = Lines;
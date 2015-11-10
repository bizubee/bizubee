"use strict";


function Queue() {
	var
	mouth = null,
	ass = null,
	length = 0;

	function node(value) {
		return {
			value: value,
			prev: null,
			next: null,
		};
	}
	
	// consume a value into the queue
	this.eat = function(value) {
		var nd = node(value);

		if (length > 0) {
			mouth.prev = nd;
			nd.next = mouth;
			mouth = nd;
		} else {
			mouth = ass = nd;
		}

		length++;
	}

	this.vomit = function() {
		if (length === 0) {
			throw new Error("Cannot crap values out of empty queue");
		} else {
			let value = mouth.value;
			if (length === 1) {
				mouth = ass = null;	
			} else {
				mouth = mouth.next;
				mouth.prev = null;
			}
			
			length--;
			
			return value;
		}
	} 

	// defecate a value from the queue
	this.crap = function() {
		if (length === 0) {
			throw new Error("Cannot crap values out of empty queue");
		} else {
			let value = ass.value;
			if (length === 1) {
				mouth = ass = null;
			} else {
				ass = ass.prev;
				ass.next = null;
			}
	
			length--;

			return value;
		}
	}

	this.uncrap = function(value) {
		var nd = node(value);

		if (length > 0) {
			ass.next = nd;
			nd.prev = ass;
			ass = nd;
		} else {
			mouth = ass = nd;
		}

		length++;
	}

	this.get = function(i) {
		var n = 0;
		for (var nd of this) {
			if (n === i) {
				return nd;
			}
			n++;
		}
		
		throw new Error(`Index ${i} out of range!`);
	}

	this[Symbol.iterator] = function*() {
		var nd = ass;
		while (nd !== null) {
			yield nd.value;
			nd = nd.prev;
		}
	}

	Object.defineProperty(this, 'length', {
		get: function() {
			return length;
		},
		set: function(value) {
			throw new Error("Cannot set queue length!");
		}
	});
}


function DropoutQueue(size) {
	var
	start 	= 0,
	length 	= 0,
	buff 	= new Array(size);

	this.get = function(i) {
		return buff[(start + i) % size];
	}

	this.add = function(value) {
		if (length === size) {
			buff[start] = value;
			start = ++start % size;
		} else {
			buff[length] = value;
			length++;
		}
	}
}

function PeekableGenerator(gen) {
	let done = false, buff = [];
	
	this.next = function() {
		if (buff.length > 0) {
			return buff.shift();
		} else {
			if (done) {
				throw new Error('No more values in Iterator!');
			} else {
				return gen.next();
			}
		}
	}
		
	this.peek = function(n) {
		if (gen instanceof PeekableGenerator) {
			return gen.peek(n);
		}
		
		n = n || 0;
		while (n >= buff.length) {
			if (done) {
				buff.push(null)
			} else {
				let item = gen.next();
				done = item.done;
				buff.push(item);
			}
		}

		return buff[n];
	}
	
	this.peekValue = function(n) {
		try {
			let ctrl = this.peek(n);
			return ctrl.value;
		} catch (e) {
			return null;
		}
	}
	
	this[Symbol.iterator] = function() {
		return this;
	}
}

exports.PeekableGenerator = PeekableGenerator;
exports.Queue = Queue;
exports.DropoutQueue = DropoutQueue;



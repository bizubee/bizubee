
function node(value) {
	return {
		value: value,
		next: undefined,
		prev: undefined
	}
}

export function Queue() {
	var head, ass, length = 0;
	
	this.enqueue = function(value) {
		var nd = node(value);
		if (length === 0) {
			head = ass = nd;			
		} else {
 			nd.next = ass;
 			ass.prev = nd;
 			ass = nd;		
		}
		

		length += 1;
	}

	this.dequeue = function() {
		if (length === 0) {
			throw new Error("Cannot pop");
		} else {
			var rval = head.value;
			if (length === 1) {
				head = ass = undefined;				
			} else {
				head.prev.next = undefined;
				head = head.prev;
			}

			length -= 1;
			return rval;
		}
	}

	this.isEmpty = function() {
		return length === 0;
	}

	Object.defineProperty(this, "length", {
		get: function () {
			return length;
		},
		set: function (value) {
			throw new Error("Readonly property");
		}
	});
}
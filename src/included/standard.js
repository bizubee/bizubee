
function reflect() {
	return this;
}

export function range(start, end, step) {
	step = step || 1;
	var i = start, ender = {done: true};
	if (step < 0) return {
		[Symbol.iterator]: reflect,
		next() {
			if (i > end) {
				const status = {
					done: false,
					value: i
				};
				i += step;
				return status;
			} else return ender;
		}
	};
	else return {
		[Symbol.iterator]: reflect,
		next() {
			if (i < end) {
				const status = {
					done: false,
					value: i
				};
				i += step;
				return status;
			} else return ender;
		}
	};
}

export function* keys(object) {
	for (var key in object) {
		yield key;
	}
}

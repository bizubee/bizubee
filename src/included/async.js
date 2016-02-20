
export function all(...promises) {
	return Promise.all(promises);
}

export function race(...promises) {
	return Promise.race(promises);
}

export class PromiseController {
	constructor() {
		this.promise = new Promise((win, fail) => {
			this.resolve = win;
			this.reject = fail;
		});
	}
}

export default Promise
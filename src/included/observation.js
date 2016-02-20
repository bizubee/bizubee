
import blib from "bizubee lib";
import {Queue} from "collections";

export default class Observable {
	[blib.symbols.observer] () {
		return this.observe();
	}

	observe() {
		throw new Error("'observe' method must be implemented!");
	}
}


export function Observer(func) {
	var
	fulfillers 	= new Queue(),
	values		= new Queue(),
	done		= false,
	endvalue	= undefined,
	error		= false;

	function update() {
		while (!fulfillers.isEmpty() && !values.isEmpty()) {
			const
			ctrl 	= fulfillers.dequeue(),
			value 	= values.dequeue();

			ctrl.win({
				done: false,
				value: value
			});
		}
		

		if (done) {
			if (error) {
				while (!fulfillers.isEmpty()) {
					const ctrl = fulfillers.dequeue();
					ctrl.fail(endvalue);					
				}
			} else {
				const abso = {
					value: endvalue,
					done: true
				};
				Object.freeze(abso);

				while (!fulfillers.isEmpty()) {
					const ctrl = fulfillers.dequeue();
					ctrl.win(abso);
				}
			}
		}
	}

	function send(value) {
		if (done)
			throw new Error('Observer is closed, cannot send to it!');
		
		values.enqueue(value);
		update();
	}

	function close(value) {
		if (done)
			throw new Error('Observer is closed, cannot re-close it!');

		done = true;
		endvalue = value;
		update();
	}

	function raise(value) {
		if (done)
			throw new Error('Observer is closed, cannot raise error on it!');

		error = true;
		close(value);
	}

	this.next = function () {
		return new Promise((win, fail) => {
			fulfillers.enqueue({win, fail});
			update();
		});
	}

	this[blib.symbols.observer] = function() {
		return this;
	}


	func(send, close, raise);
}

export class EventObservable extends Observable {
	constructor(func) {
		super();
		var resolve, reject, done = false;

		const fire = (e) => {
			if (done) {
				throw new Error('EventObservable has died!');
			}

			for (var listener of this._listeners) {
				const listen = listener[1];
				listen(e);
			}
		}

		const finish = (val) => {
			done = true;
			this._listeners.clear();
			resolve(val);
		}

		this._id = 0;
		this._listeners = new Map();
		this._done = new Promise((win, fail) => {
			resolve = win;
			reject = fail;
		});


		func(fire, finish, reject);
	}

	addListener(func) {
		const id = this._id++;
		this._listeners.set(id, func);
		return id;
	}

	removeListener(id) {
		this._listeners.delete(id);
	}

	observe() {
		return new Observer((send, end, fail) => {
			const id = this.addListener(send);
			this._done.then(end, fail);
		});
	}

	then(onFulfilled, onRejected) {
		return this._done.then(onFulfilled, onRejected);
	}

	map(fn, endfn) {
		const builder = this.constructor;

		endfn = endfn || (e => e); 
		return new builder((send, close, error) => {
			const id = this.addListener(
				(e) => {
					send(fn(e))
				}
				);
			this._done.then(
				(val) => {
					this.removeListener(id);
					send(endfn(val));
				},
				(err) => {
					error(err)
				}
				);
		});
	}

	reduce(fn, initial, endfn) {
		endfn = endfn || (e => e); 
		return new Promise((win, fail) => {
			var accumlation = initial;
			this.addListener((e) => {
				accumlation = fn(accumlation, e);
			});

			this._done.then(
				(val) => {
					win(endfn(accumlation, val));
				},
				fail
				);
		});
	}
}



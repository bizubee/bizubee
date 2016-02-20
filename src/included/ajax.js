
import {EventObservable} from "observation";

export class Request extends EventObservable {
	constructor() {
		super((send, done, error) => {
			this._send = send;
			this._done = done;
			this._error = error;
		});

		this._xhr = new XMLHttpRequest();
		this._xhr.onprogress = send;
	}
}

export function post() {

}

export function get() {

}
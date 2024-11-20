export class KeyWatcher {
	private _callback: () => void
	private _listening: boolean

	constructor(callback: () => void) {
		this._callback = callback
		this._listening = false
	}

	public start() {
		if (this._listening) {
			return
		}
		this._listening = true

		process.stdin.on('data', (key) => {
			const char = key.toString()

			// '\u000D' is the Unicode character for Enter
			//if (char === '\u000D') {
			this._callback()
			//}

			// Ctrl+C
			if (char === '\u0003') {
				process.exit()
			}
		})
	}

	public stop() {
		if (!this._listening) {
			return
		}
		this._listening = false

		process.stdin.pause()
		process.stdin.removeAllListeners('data')
	}
}

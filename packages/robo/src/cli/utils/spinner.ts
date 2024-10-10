import { color, composeColors } from '../../core/color.js'

export class Spinner {
	private current: number
	private intervalId: NodeJS.Timeout | null
	private logs: string[]
	private message: string | null
	private text: string
	private readonly decoration: (text: string) => string
	private readonly symbols: string[]
	private readonly interval: number

	constructor(text = '', decoration = composeColors(color.bold, color.yellow)) {
		this.current = 0
		this.decoration = decoration
		this.intervalId = null
		this.logs = []
		this.symbols = ['▖', '▘', '▝', '▗']
		this.interval = 120
		this.text = text

		if (!text.includes('{{spinner}}')) {
			this.text = '{{spinner}} ' + text
		}
	}

	private clear(moveUp = false) {
		// If there's no message, don't do anything
		if (!this.message) {
			return
		}

		// Loop through each line of the message and clear it
		const lines = this.message.split('\n')
		if (this.logs.length > 0) {
			lines.push(...this.logs)
		}
		lines.forEach((line, index) => {
			process.stdout.write('\r' + ' '.repeat(line?.length))

			// Move up by default, unless it's the last line (then use moveUp param)
			if (moveUp || index < lines.length - 1) {
				process.stdout.write('\x1b[1A')
			}
		})
		if (this.logs.length > 1) {
			process.stdout.write('\x1b[1A')
		}
	}

	private render() {
		const spinner = this.renderSpinner()
		this.clear()

		this.message = this.text.replaceAll('{{spinner}}', spinner)
		process.stdout.write('\r' + this.message)
		if (this.logs.length > 0) {
			process.stdout.write('\n' + this.logs.join('\n'))
		}
		this.current = (this.current + 1) % this.symbols.length
	}

	private renderSpinner() {
		return this.decoration(this.symbols[this.current])
	}

	public getLogs() {
		return this.logs
	}

	public setLogs(...logs: string[]) {
		this.logs = logs
	}

	public setText(text: string, defaultSpinner = true) {
		this.text = text

		if (defaultSpinner && !text.includes('{{spinner}}')) {
			this.text = '{{spinner}} ' + text
		}
	}

	public start() {
		this.intervalId = setInterval(() => this.render(), this.interval)
	}

	public stop(moveUp = true, clear = true) {
		if (this.intervalId) {
			clearInterval(this.intervalId)
			this.intervalId = null
			this.render()

			if (clear) {
				this.clear(moveUp)
			}

			this.message = null
		}
	}
}

import { color, composeColors } from '../../core/color.js'

export class Spinner {
	private current: number
	private intervalId: NodeJS.Timeout | null
	private readonly symbols: string[]
	private readonly interval: number
	private readonly indent: string

	constructor(indent: string) {
		this.current = 0
		this.intervalId = null
		this.symbols = ['▖', '▘', '▝', '▗']
		this.interval = 120
		this.indent = indent
	}

	start() {
		this.intervalId = setInterval(() => {
			process.stdout.write(
				`\r${this.indent} ${composeColors(color.bold, color.yellow)(this.symbols[this.current])} Waiting for sign in...`
			)
			this.current = (this.current + 1) % this.symbols.length
		}, this.interval)
	}

	stop() {
		if (this.intervalId) {
			clearInterval(this.intervalId)
			this.intervalId = null
			process.stdout.write('\r' + ' '.repeat(process.stdout.columns)) // Clear the line
			process.stdout.write('\x1b[1A') // Move the cursor up one line
		}
	}
}

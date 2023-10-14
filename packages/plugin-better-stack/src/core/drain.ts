import { inspect } from 'node:util'
import { Logtail } from '@logtail/node'
import type { LogDrain } from '@roboplay/robo.js'

const ANSI_REGEX = new RegExp(`(${String.fromCharCode(27)}\\[[0-9;]*m)([^${String.fromCharCode(27)}]+)`, 'g')
const MAGENTA_REGEX = new RegExp(String.fromCharCode(27) + '\\[35m', 'g')
const RESET_SEQUENCE = '\x1b[0m'

export function createLogtailDrain(sourceToken: string): LogDrain {
	const logtail = new Logtail(sourceToken)

	return (level: string, ...data: unknown[]): Promise<void> => {
		// Parse data into a string
		const parts = data?.map((item) => {
			if (typeof item === 'object' || item instanceof Error || Array.isArray(item)) {
				return inspect(item, { colors: true, depth: null })
			}
			return item
		})
		const message = fixAnsi(parts?.join(' '))

		// Write to the console
		const stream = level === 'warn' || level === 'error' ? process.stderr : process.stdout
		const promises = []
		promises.push(new Promise((resolve) => stream.write(parts?.join(' ') + '\n', 'utf8', resolve)))

		// Forward to Better Stack
		switch (level) {
			case 'trace':
			case 'debug':
				promises.push(logtail.debug(message))
				break
			case 'info':
				promises.push(logtail.info(message))
				break
			case 'wait':
				promises.push(logtail.info(message))
				break
			case 'event':
				promises.push(logtail.info(message))
				break
			case 'warn':
				promises.push(logtail.warn(message))
				break
			case 'error':
				promises.push(logtail.error(message))
				break
			default:
				promises.push(logtail.log(message))
				break
		}

		return Promise.all(promises).then(() => {
			/* empty */
		})
	}
}

function fixAnsi(input: string): string {
	return (
		input
			// Magenta is not supported by Logtail; replace with blue
			?.replaceAll(MAGENTA_REGEX, '\u001B[34m')
			// Fix bold ansi codes
			?.replaceAll('\x1b[22m', '\x1b[0m')
			// Fix ansi codes that Logtail doesn't support
			?.replace(ANSI_REGEX, (_, colorCode, text) => {
				return colorCode + text + RESET_SEQUENCE
			})
	)
}

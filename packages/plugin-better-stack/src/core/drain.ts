import { inspect } from 'node:util'
import { Logtail } from '@logtail/node'
import type { LogDrain } from '@roboplay/robo.js'

export function createLogtailDrain(sourceToken?: string): LogDrain {
	if (!sourceToken) {
		throw new Error('Better Stack Logs source token is required!')
	}
	const logtail = new Logtail(sourceToken)

	return async (level: string, ...data: unknown[]): Promise<void> => {
		// Parse data into a string
		const parts = data?.map((item) => {
			if (typeof item === 'object' || item instanceof Error || Array.isArray(item)) {
				return inspect(item, { colors: true, depth: null })
			}
			return item
		})
		const message = parts?.join(' ')

		// Write to the console
		const stream = level === 'warn' || level === 'error' ? process.stderr : process.stdout
		stream.write(parts?.join(' ') + '\n', 'utf8')

		// Forward to Better Stack
		switch (level) {
			case 'trace':
			case 'debug':
				await logtail.debug(message)
				break
			case 'info':
				await logtail.info(message)
				break
			case 'wait':
				await logtail.info(message)
				break
			case 'event':
				await logtail.info(message)
				break
			case 'warn':
				await logtail.warn(message)
				break
			case 'error':
				await logtail.error(message)
				break
			default:
				await logtail.log(message)
				break
		}
	}
}

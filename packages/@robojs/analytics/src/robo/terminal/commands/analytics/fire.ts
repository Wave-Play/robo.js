/**
 * /analytics fire - Fire a custom event
 */
import { createTerminalCommandConfig } from 'robo.js'
import { Analytics } from '../../../../core/analytics.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'Fire a custom event',
	positionalArgs: true,
	options: [
		{ alias: '-d', name: '--data', description: 'Key=value pairs separated by commas', type: 'string' }
	]
} as const)

export default async function (ctx: TerminalContext<typeof config>) {
	const [eventName] = ctx.args
	const { data } = ctx.options

	if (!eventName) {
		ctx.write('  Usage: /analytics fire <event_name> [--data key=value,key=value]\n')
		return
	}

	if (!Analytics.isReady()) {
		ctx.write('  Analytics is not ready. Check your configuration.\n')
		return
	}

	let parsedData: Record<string, string> | undefined
	if (data) {
		parsedData = {}
		for (const pair of data.split(',')) {
			const [key, ...rest] = pair.split('=')
			if (key && rest.length > 0) {
				parsedData[key.trim()] = rest.join('=').trim()
			}
		}
	}

	await Analytics.event(eventName, parsedData ? { data: parsedData } : undefined)

	ctx.write(`  Event "${eventName}" fired.\n`)
}

/**
 * /analytics test - Fire a test event
 */
import { createTerminalCommandConfig } from 'robo.js'
import { Analytics } from '../../../../core/analytics.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'Fire a test event'
} as const)

export default async function (ctx: TerminalContext<typeof config>) {
	if (!Analytics.isReady()) {
		ctx.write('  Analytics is not ready. Check your configuration.\n')
		return
	}

	await Analytics.event('terminal_test', {
		data: { source: 'terminal', timestamp: Date.now() }
	})

	ctx.write('  Test event fired.\n')
}

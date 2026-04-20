/**
 * CLI Extension for `robo dev` command
 *
 * Adds the -t/--tunnel flag to expose the local server to the internet.
 * Sets __ROBO_TUNNEL_ENABLED so the start hook knows to activate the tunnel.
 * All tunnel setup logic (install, initialize, start) lives in the start hook
 * behind a Mode.isDev() guard via setupDevTunnel().
 */
import type { CliExtendConfig, CliBeforeHook } from 'robo.js'

export const config: CliExtendConfig = {
	options: [
		{
			alias: '-t',
			name: '--tunnel',
			description: 'Expose your local server to the internet',
			type: 'boolean'
		}
	],
	priority: 10
}

export const before: CliBeforeHook = async (ctx) => {
	const { tunnel } = ctx.options as { tunnel?: boolean }

	if (!tunnel) {
		return // Continue normally
	}

	// Signal to the start hook that the tunnel should be activated.
	// Setup (install, initialize, start) is handled there via setupDevTunnel(),
	// where pluginOptions and Mode.isDev() are both available.
	process.env.__ROBO_TUNNEL_ENABLED = 'true'
}

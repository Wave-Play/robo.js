/**
 * CLI Extension for `robo dev` command
 *
 * Adds the -t/--tunnel flag to expose local server to the internet.
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

	// Validate PORT is set
	if (!process.env.PORT) {
		ctx.logger.error('Cannot start tunnel without a PORT environment variable.')
		process.exit(1)
	}

	// Signal to start.ts lifecycle hook that tunnel should start.
	// Install/initialize/start are handled there so config-enabled tunnels work too.
	process.env.__ROBO_TUNNEL_ENABLED = 'true'
}

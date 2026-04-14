/**
 * /tunnel stop - Stop a running tunnel.
 *
 * Can stop a specific tunnel by ID or all running tunnels with --all.
 */
import { createTerminalCommandConfig } from 'robo.js'
import { TunnelRegistry } from '../../../../core/tunnel/registry.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'Stop a running tunnel',
	positionalArgs: true,
	options: [
		{
			alias: '-a',
			name: '--all',
			description: 'Stop all running tunnels',
			type: 'boolean',
			default: false
		}
	]
} as const)

export default async function (ctx: TerminalContext<typeof config>) {
	const { all } = ctx.options
	const [tunnelId] = ctx.args

	if (all) {
		const tunnels = await TunnelRegistry.getAll()
		if (tunnels.length === 0) {
			ctx.write('No tunnels running\n')
			return
		}

		const count = await TunnelRegistry.killAll()
		ctx.write(`Stopped ${count} tunnel${count === 1 ? '' : 's'}\n`)
		return
	}

	if (!tunnelId) {
		ctx.write('Please provide a tunnel ID or use --all\n')
		ctx.write('Run /tunnel list to see running tunnels\n')
		return
	}

	const success = await TunnelRegistry.kill(tunnelId)
	if (success) {
		ctx.write(`Stopped tunnel ${tunnelId}\n`)
	} else {
		ctx.write(`Tunnel ${tunnelId} not found or already stopped\n`)
	}
}

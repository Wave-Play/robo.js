/**
 * /tunnel list - List all running tunnels.
 *
 * Shows tunnel ID, port, URL, and uptime for each active tunnel.
 */
import { createTerminalCommandConfig } from 'robo.js'
import { TunnelRegistry } from '../../../../core/tunnel/registry.js'
import { formatAge } from '../../../../core/tunnel/utils.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'List all running tunnels'
} as const)

export default async function (ctx: TerminalContext<typeof config>) {
	const tunnels = await TunnelRegistry.getAll()

	if (tunnels.length === 0) {
		ctx.write('No tunnels running\n')
		ctx.write('Run /tunnel start to start a new tunnel\n')
		return
	}

	ctx.write(`Running tunnels (${tunnels.length}):\n\n`)
	ctx.write('ID        PORT   AGE       URL\n')
	ctx.write('\u2500'.repeat(70) + '\n')

	for (const tunnel of tunnels) {
		const age = formatAge(Date.now() - tunnel.startedAt)
		const id = tunnel.id.padEnd(8)
		const port = String(tunnel.port).padEnd(6)
		const ageStr = age.padEnd(9)

		ctx.write(`${id}  ${port} ${ageStr} ${tunnel.url}\n`)
	}

	ctx.write('\nRun /tunnel stop <id> to stop a specific tunnel\n')
	ctx.write('Run /tunnel stop --all to stop all tunnels\n')
}

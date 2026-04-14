/**
 * /server status - Show server dashboard.
 *
 * Displays server port, hostname, uptime, engine type, route count, and tunnel info.
 */
import { createTerminalCommandConfig, Manifest } from 'robo.js'
import { TunnelRegistry } from '../../../../core/tunnel/registry.js'
import { formatAge } from '../../../../core/tunnel/utils.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'Show server dashboard'
} as const)

export default async function (ctx: TerminalContext<typeof config>) {
	const server = globalThis.roboServer

	if (!server?.ready) {
		ctx.write('Server is not running\n')
		return
	}

	const port = server.port ?? '?'
	const hostname = server.hostname ?? 'localhost'
	const engineName = server.engine?.constructor?.name ?? 'Unknown'
	const uptime = server.startedAt ? formatAge(Date.now() - server.startedAt) : 'unknown'
	const routes = Manifest.routeSummariesSync('server', 'api')
	const routeCount = routes?.length ?? 0

	// Get tunnel info
	const tunnels = await TunnelRegistry.getAll()
	const tunnelCount = tunnels.length

	ctx.write('Server Dashboard\n')
	ctx.write('\u2500'.repeat(40) + '\n')
	ctx.write('\n')
	ctx.write(`  Status     ready\n`)
	ctx.write(`  Engine     ${engineName}\n`)
	ctx.write(`  Hostname   ${hostname}\n`)
	ctx.write(`  Port       ${port}\n`)
	ctx.write(`  Uptime     ${uptime}\n`)
	ctx.write(`  Routes     ${routeCount}\n`)
	ctx.write(`  Tunnels    ${tunnelCount}\n`)

	if (tunnelCount > 0) {
		ctx.write('\n')
		ctx.write('Active tunnels:\n')
		for (const tunnel of tunnels) {
			ctx.write(`  ${tunnel.url}\n`)
		}
	}

	ctx.write('\n')
}

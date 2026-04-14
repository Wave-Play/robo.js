/**
 * /tunnel start - Start a tunnel to expose your local server.
 *
 * Starts a Cloudflare Quick Tunnel in detached (background) mode.
 * The tunnel persists across terminal command invocations and can be
 * stopped with /tunnel stop.
 */
import { createTerminalCommandConfig } from 'robo.js'
import { CloudflareProvider } from '../../../../core/tunnel/providers/cloudflare.js'
import { TunnelRegistry } from '../../../../core/tunnel/registry.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'Start a tunnel to expose your local server',
	options: [
		{
			alias: '-p',
			name: '--port',
			description: 'Port to tunnel (default: PORT env or 3000)',
			type: 'number'
		}
	]
} as const)

export default async function (ctx: TerminalContext<typeof config>) {
	const { port: portOption } = ctx.options

	// Determine port: option > PORT env > 3000
	const defaultPort = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000
	const port = portOption ?? defaultPort

	// Create CloudflareProvider
	const provider = new CloudflareProvider()

	// Check if cloudflared is installed
	if (!provider.isInstalled()) {
		ctx.write('Installing cloudflared...\n')
		await provider.install()
	}

	// Check for existing tunnel on the same port
	const existingTunnels = await TunnelRegistry.getAll()
	const existingTunnel = existingTunnels.find((t) => t.port === port)

	if (existingTunnel) {
		ctx.write(`Tunnel already running on port ${port}\n`)
		ctx.write(`  ID:  ${existingTunnel.id}\n`)
		ctx.write(`  URL: ${existingTunnel.url}\n`)
		ctx.write(`\nStop it first: /tunnel stop ${existingTunnel.id}\n`)
		return
	}

	// Start tunnel in detached mode
	const localUrl = `http://localhost:${port}`
	ctx.write(`Starting tunnel to ${localUrl}...\n`)

	try {
		const instance = await provider.start(localUrl, { detached: true })

		if (!instance.url) {
			ctx.write('Failed to get tunnel URL\n')
			return
		}

		if (!instance.process.pid) {
			ctx.write('Failed to get tunnel process ID\n')
			return
		}

		// Register in storage for later management
		let record
		try {
			record = await TunnelRegistry.register({
				pid: instance.process.pid,
				port,
				url: instance.url,
				startedAt: Date.now(),
				provider: 'cloudflare'
			})
		} catch (registerError) {
			// Kill the orphaned tunnel since we can't track it
			instance.process.kill('SIGTERM')
			const message = registerError instanceof Error ? registerError.message : String(registerError)
			ctx.write(`Failed to register tunnel: ${message}\n`)
			return
		}

		// Release the child process handle so it runs independently
		instance.process.unref()

		ctx.write(`\n  ${instance.url}\n\n`)
		ctx.write(`Tunnel ID: ${record.id}\n`)
		ctx.write(`Run /tunnel stop ${record.id} to stop\n`)
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		ctx.write(`Failed to start tunnel: ${message}\n`)
	}
}

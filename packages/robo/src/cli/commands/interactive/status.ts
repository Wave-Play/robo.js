/**
 * /status command — Show system status and info.
 */

import path from 'node:path'
import { color } from '../../../core/color.js'
import { Mode } from '../../../core/mode.js'
import { formatHeader, formatTable } from '../../utils/cli-output.js'
import { packageJson } from '../../utils/utils.js'
import type { CliCommandContext } from '../../utils/cli-commands.js'

export async function handler(_args: string[], ctx: CliCommandContext) {
	const projectName = path.basename(process.cwd())
	const mode = Mode.get()
	const cliMode = process.env.ROBO_DEV === 'true' ? 'dev' : 'start'
	const nodeVersion = process.version
	const pid = process.pid
	const isRunning = ctx.runtime?.isRunning() ?? false

	// Calculate uptime
	const uptimeMs = process.uptime() * 1000
	const uptime = formatUptime(uptimeMs)

	// Plugin count
	const plugins = ctx.config.plugins ?? []
	const pluginCount = plugins.length

	// Flashcore adapter type
	const adapterType = ctx.config.flashcore?.keyv ? 'keyv (custom)' : 'file (default)'

	const entries: [string, string][] = [
		['Project', color.cyan(projectName)],
		['Robo.js', `v${packageJson.version}`],
		['Mode', Mode.color(mode)],
		['CLI', cliMode],
		['Node.js', nodeVersion],
		['PID', String(pid)],
		['Uptime', uptime],
		['Status', isRunning ? color.green('running') : color.yellow('stopped')],
		['Plugins', String(pluginCount)],
		['Flashcore', adapterType]
	]

	process.stdout.write('\n' + formatHeader('Status') + '\n' + formatTable(entries) + '\n\n')
}

function formatUptime(ms: number): string {
	const seconds = Math.floor(ms / 1000)
	const minutes = Math.floor(seconds / 60)
	const hours = Math.floor(minutes / 60)

	if (hours > 0) {
		return `${hours}h ${minutes % 60}m ${seconds % 60}s`
	}
	if (minutes > 0) {
		return `${minutes}m ${seconds % 60}s`
	}
	return `${seconds}s`
}

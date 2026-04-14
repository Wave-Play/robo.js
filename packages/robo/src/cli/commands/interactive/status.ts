/**
 * /status command — Show system status and info.
 *
 * In interactive mode, uses the expandable drawer for a compact inline display.
 * In non-interactive mode, prints a table to stdout.
 */

import path from 'node:path'
import { color } from '../../../core/color.js'
import { Mode } from '../../../core/mode.js'
import { formatHeader, formatTable } from '../../utils/cli-output.js'
import { packageJson } from '../../utils/utils.js'
import type { CliCommandContext } from '../../utils/cli-commands.js'

export async function handler(_args: string[], ctx: CliCommandContext) {
	const interactiveCli = await import('../../utils/interactive-cli.js')

	if (interactiveCli.isActive()) {
		// Build drawer content lines
		const lines = buildDrawerLines(ctx, interactiveCli)
		interactiveCli.showDrawer(lines)
		return
	}

	// Non-interactive fallback: print table to stdout
	const entries = buildStatusEntries(ctx)
	process.stdout.write('\n' + formatHeader('Status') + '\n' + formatTable(entries) + '\n\n')
}

function buildStatusEntries(ctx: CliCommandContext): [string, string][] {
	const projectName = path.basename(process.cwd())
	const mode = Mode.get()
	const cliMode = process.env.ROBO_DEV === 'true' ? 'dev' : 'start'
	const nodeVersion = process.version
	const pid = process.pid
	const isRunning = ctx.runtime?.isRunning() ?? false
	const uptimeMs = process.uptime() * 1000
	const uptime = formatUptime(uptimeMs)
	const plugins = ctx.config.plugins ?? []
	const pluginCount = plugins.length
	const adapterType = ctx.config.flashcore?.keyv ? 'keyv (custom)' : 'file (default)'

	return [
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
}

function buildDrawerLines(ctx: CliCommandContext, interactiveCli: typeof import('../../utils/interactive-cli.js')): string[] {
	const projectName = path.basename(process.cwd())
	const mode = Mode.get()
	const isRunning = ctx.runtime?.isRunning() ?? false
	const uptimeMs = process.uptime() * 1000
	const uptime = formatUptime(uptimeMs)
	const plugins = ctx.config.plugins ?? []

	const lines: string[] = []

	// Status line
	const statusStr = isRunning ? color.green('running') : color.yellow('stopped')
	lines.push(`${color.dim('Status')}     ${statusStr} ${color.dim('\u00b7')} uptime ${uptime}`)

	// Project info
	lines.push(`${color.dim('Project')}    ${color.cyan(projectName)} ${color.dim('\u00b7')} ${Mode.color(mode)} ${color.dim('\u00b7')} v${packageJson.version}`)

	// Status items from plugins (bot tag, server URL, etc.) — one per row
	const statusItems = interactiveCli.getStatusItems() as Map<string, { value: string; priority: number }>
	if (statusItems.size > 0) {
		let first = true
		for (const [, { value }] of statusItems) {
			const label = first ? color.dim('Services') : '        '
			lines.push(`${label}   ${value}`)
			first = false
		}
	}

	// Plugin statuses
	const pluginStatuses = interactiveCli.getPluginStatuses() as Map<string, string>
	if (pluginStatuses.size > 0) {
		const parts: string[] = []
		for (const [name, s] of pluginStatuses) {
			const short = interactiveCli.inferShortName(name)
			if (s === 'ready') parts.push(color.green('\u2713') + ' ' + short)
			else if (s === 'error') parts.push(color.red('\u2717') + ' ' + short)
			else parts.push(color.yellow('\u23F3') + ' ' + short)
		}
		lines.push(`${color.dim('Plugins')}    ${parts.join('  ')}`)
	} else if (plugins.length > 0) {
		lines.push(`${color.dim('Plugins')}    ${plugins.length} installed`)
	}

	return lines
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

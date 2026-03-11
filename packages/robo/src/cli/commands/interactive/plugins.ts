/**
 * /plugins command — List installed plugins.
 */

import { color } from '../../../core/color.js'
import { formatHeader, formatTable, formatValue } from '../../utils/cli-output.js'
import type { CliCommandContext } from '../../utils/cli-commands.js'
import type { Plugin } from '../../../types/index.js'

export async function handler(args: string[], ctx: CliCommandContext) {
	const subcommand = args[0]

	if (subcommand === 'info') {
		return pluginInfo(args.slice(1), ctx)
	}

	if (subcommand && subcommand !== 'info') {
		process.stdout.write(
			`\n${formatHeader('Usage:')}\n` +
				'  /plugins              List all plugins\n' +
				'  /plugins info <name>  Show plugin details\n\n'
		)
		return
	}

	return listPlugins(ctx)
}

function listPlugins(ctx: CliCommandContext) {
	const plugins = ctx.config.plugins ?? []

	if (plugins.length === 0) {
		process.stdout.write('\n' + color.dim('No plugins installed.') + '\n\n')
		return
	}

	const entries: [string, string][] = plugins.map((p: Plugin) => {
		if (typeof p === 'string') {
			return [color.cyan(p), color.dim('default')]
		}

		const [name, options] = p
		const hasOptions = options != null && typeof options === 'object' && Object.keys(options).length > 0
		return [color.cyan(name), hasOptions ? color.green('configured') : color.dim('default')]
	})

	process.stdout.write(
		'\n' +
			formatHeader('Plugins') +
			color.dim(` (${plugins.length})`) +
			'\n' +
			formatTable(entries) +
			'\n\n'
	)
}

function pluginInfo(args: string[], ctx: CliCommandContext) {
	if (args.length === 0) {
		process.stdout.write('Usage: /plugins info <name>\n')
		return
	}

	const searchName = args[0]
	const plugins = ctx.config.plugins ?? []

	const found = plugins.find((p: Plugin) => {
		const name = typeof p === 'string' ? p : p[0]
		return name === searchName || name.endsWith(`/${searchName}`)
	})

	if (!found) {
		process.stdout.write(color.dim(`Plugin "${searchName}" not found.`) + '\n')
		return
	}

	if (typeof found === 'string') {
		process.stdout.write(
			'\n' +
				formatHeader(found) +
				'\n' +
				formatTable([['Options', color.dim('default (none)')]]) +
				'\n\n'
		)
		return
	}

	const [name, options, metaOptions] = found
	const entries: [string, string][] = [['Name', color.cyan(name)]]

	if (options != null && typeof options === 'object') {
		for (const [key, value] of Object.entries(options as Record<string, unknown>)) {
			entries.push([`  ${key}`, formatValue(value)])
		}
	} else {
		entries.push(['Options', color.dim('default (none)')])
	}

	if (metaOptions) {
		if (metaOptions.failSafe != null) {
			entries.push(['failSafe', String(metaOptions.failSafe)])
		}
		if (metaOptions.hookPriority != null) {
			entries.push(['hookPriority', formatValue(metaOptions.hookPriority)])
		}
	}

	process.stdout.write('\n' + formatHeader(name) + '\n' + formatTable(entries) + '\n\n')
}

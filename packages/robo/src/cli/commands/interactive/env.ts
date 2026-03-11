/**
 * /env command — Show loaded environment variables.
 */

import { color } from '../../../core/color.js'
import { Env } from '../../../core/env.js'
import { formatHeader, formatTable, maskSensitive } from '../../utils/cli-output.js'
import type { CliCommandContext } from '../../utils/cli-commands.js'

export async function handler(args: string[], _ctx: CliCommandContext) {
	const subcommand = args[0]

	if (subcommand === 'get') {
		return envGet(args.slice(1))
	}

	if (subcommand && subcommand !== 'get') {
		process.stdout.write(
			`\n${formatHeader('Usage:')}\n` +
				'  /env                List all .env variables (masked)\n' +
				'  /env get <key>      Show a specific variable\n' +
				'  /env get <key> --raw  Show unmasked value\n\n'
		)
		return
	}

	return listEnv()
}

function listEnv() {
	const data = Env.data()

	if (!data || Object.keys(data).length === 0) {
		process.stdout.write('\n' + color.dim('No .env variables loaded.') + '\n\n')
		return
	}

	const keys = Object.keys(data).sort()
	const entries: [string, string][] = keys.map((k) => [color.cyan(k), maskSensitive(k, data[k] ?? '')])

	process.stdout.write(
		'\n' +
			formatHeader('Environment Variables') +
			color.dim(` (${keys.length})`) +
			'\n' +
			formatTable(entries) +
			'\n\n'
	)
}

function envGet(args: string[]) {
	if (args.length === 0) {
		process.stdout.write('Usage: /env get <key> [--raw]\n')
		return
	}

	const key = args[0]
	const showRaw = args.includes('--raw')
	const data = Env.data()
	const value = data?.[key] ?? process.env[key]

	if (value === undefined) {
		process.stdout.write(color.dim(`Variable "${key}" is not set.`) + '\n')
		return
	}

	const display = showRaw ? value : maskSensitive(key, value)
	process.stdout.write(`\n  ${color.cyan(key)} = ${display}\n\n`)
}

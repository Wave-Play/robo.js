/**
 * /state command — Inspect and modify runtime state.
 */

import { color } from '../../../core/color.js'
import { formatHeader, formatTable, formatValue } from '../../utils/cli-output.js'
import type { CliCommandContext } from '../../utils/cli-commands.js'
import type { RuntimeProvider } from '../../utils/cli-runtime-provider.js'

export async function handler(args: string[], ctx: CliCommandContext) {
	const runtime = ctx.runtime
	if (!runtime) {
		process.stdout.write('Runtime provider not available.\n')
		return
	}

	const subcommand = args[0]

	if (!subcommand) {
		return listState(runtime)
	}

	switch (subcommand) {
		case 'get':
			return getStateValue(args.slice(1), runtime)
		case 'set':
			return setStateValue(args.slice(1), runtime)
		case 'delete':
			return deleteStateKey(args.slice(1), runtime)
		case 'forks':
			return listForks(runtime)
		default:
			process.stdout.write(
				`\n${formatHeader('Usage:')}\n` +
					'  /state              List all state keys\n' +
					'  /state get <key>    Show a specific value\n' +
					'  /state set <k> <v>  Set a value (JSON or string)\n' +
					'  /state delete <key> Remove a key\n' +
					'  /state forks        List registered forks\n\n'
			)
	}
}

async function listState(runtime: RuntimeProvider) {
	if (!runtime.isRunning()) {
		process.stdout.write(color.yellow('Robo is not running.') + '\n')
		return
	}

	const state = await runtime.getState()
	if (!state) {
		process.stdout.write(color.yellow('Could not retrieve state.') + '\n')
		return
	}

	// Filter out internal keys
	const keys = Object.keys(state).filter((k) => !k.startsWith('__robo_'))

	if (keys.length === 0) {
		process.stdout.write('\n' + color.dim('State is empty.') + '\n\n')
		return
	}

	const entries: [string, string][] = keys.sort().map((k) => [color.cyan(k), formatValue(state[k])])

	process.stdout.write(
		'\n' + formatHeader('State') + color.dim(` (${keys.length} key${keys.length === 1 ? '' : 's'})`) + '\n' + formatTable(entries) + '\n\n'
	)
}

async function getStateValue(args: string[], runtime: RuntimeProvider) {
	if (args.length === 0) {
		process.stdout.write('Usage: /state get <key>\n')
		return
	}

	if (!runtime.isRunning()) {
		process.stdout.write(color.yellow('Robo is not running.') + '\n')
		return
	}

	const key = args[0]
	const value = await runtime.getStateValue(key)

	if (value === null || value === undefined) {
		process.stdout.write(color.dim(`No value found for "${key}".`) + '\n')
		return
	}

	process.stdout.write(`\n  ${color.cyan(key)} = ${formatValue(value)}\n\n`)
}

async function setStateValue(args: string[], runtime: RuntimeProvider) {
	if (args.length < 2) {
		process.stdout.write('Usage: /state set <key> <value>\n')
		return
	}

	if (!runtime.isRunning()) {
		process.stdout.write(color.yellow('Robo is not running.') + '\n')
		return
	}

	const key = args[0]
	const rawValue = args.slice(1).join(' ')
	let value: unknown

	try {
		value = JSON.parse(rawValue)
	} catch {
		value = rawValue
	}

	const success = await runtime.setStateValue(key, value)

	if (success) {
		process.stdout.write(`  ${color.green('Set')} ${color.cyan(key)} = ${formatValue(value)}\n`)
	} else {
		process.stdout.write(color.red('Failed to set state value.') + '\n')
	}
}

async function deleteStateKey(args: string[], runtime: RuntimeProvider) {
	if (args.length === 0) {
		process.stdout.write('Usage: /state delete <key>\n')
		return
	}

	if (!runtime.isRunning()) {
		process.stdout.write(color.yellow('Robo is not running.') + '\n')
		return
	}

	const key = args[0]
	const success = await runtime.deleteStateKey(key)

	if (success) {
		process.stdout.write(`  ${color.green('Deleted')} ${color.cyan(key)}\n`)
	} else {
		process.stdout.write(color.red('Failed to delete state key.') + '\n')
	}
}

async function listForks(runtime: RuntimeProvider) {
	if (!runtime.isRunning()) {
		process.stdout.write(color.yellow('Robo is not running.') + '\n')
		return
	}

	const forks = await runtime.getStateForks()

	if (!forks || forks.length === 0) {
		process.stdout.write('\n' + color.dim('No state forks registered.') + '\n\n')
		return
	}

	const lines = forks.sort().map((f) => `  ${color.cyan(f)}`)
	process.stdout.write(
		'\n' +
			formatHeader('State Forks') +
			color.dim(` (${forks.length})`) +
			'\n' +
			lines.join('\n') +
			'\n\n'
	)
}

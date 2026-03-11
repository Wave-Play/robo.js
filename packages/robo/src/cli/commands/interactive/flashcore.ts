/**
 * /flashcore command — Inspect and modify Flashcore storage.
 */

import { color } from '../../../core/color.js'
import { formatHeader, formatValue } from '../../utils/cli-output.js'
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
		process.stdout.write(
			`\n${formatHeader('Usage:')}\n` +
				'  /flashcore get <key>    Get a value\n' +
				'  /flashcore set <k> <v>  Set a value (JSON or string)\n' +
				'  /flashcore delete <key> Delete a key\n' +
				'  /flashcore has <key>    Check if a key exists\n\n' +
				color.dim('  Note: Key enumeration is not available — the underlying\n') +
				color.dim('  adapter does not guarantee a scan/list method.\n\n')
		)
		return
	}

	switch (subcommand) {
		case 'get':
			return flashcoreGet(args.slice(1), runtime)
		case 'set':
			return flashcoreSet(args.slice(1), runtime)
		case 'delete':
			return flashcoreDelete(args.slice(1), runtime)
		case 'has':
			return flashcoreHas(args.slice(1), runtime)
		default:
			process.stdout.write(`Unknown subcommand "${subcommand}". Type /flashcore for usage.\n`)
	}
}

async function flashcoreGet(args: string[], runtime: RuntimeProvider) {
	if (args.length === 0) {
		process.stdout.write('Usage: /flashcore get <key>\n')
		return
	}

	const key = args[0]
	const value = await runtime.flashcoreGet(key)

	if (value === null || value === undefined) {
		process.stdout.write(color.dim(`No value found for "${key}".`) + '\n')
		return
	}

	process.stdout.write(`\n  ${color.cyan(key)} = ${formatValue(value)}\n\n`)
}

async function flashcoreSet(args: string[], runtime: RuntimeProvider) {
	if (args.length < 2) {
		process.stdout.write('Usage: /flashcore set <key> <value>\n')
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

	const success = await runtime.flashcoreSet(key, value)

	if (success) {
		process.stdout.write(`  ${color.green('Set')} ${color.cyan(key)} = ${formatValue(value)}\n`)
	} else {
		process.stdout.write(color.red('Failed to set Flashcore value.') + '\n')
	}
}

async function flashcoreDelete(args: string[], runtime: RuntimeProvider) {
	if (args.length === 0) {
		process.stdout.write('Usage: /flashcore delete <key>\n')
		return
	}

	const key = args[0]
	const success = await runtime.flashcoreDelete(key)

	if (success) {
		process.stdout.write(`  ${color.green('Deleted')} ${color.cyan(key)}\n`)
	} else {
		process.stdout.write(color.red('Failed to delete Flashcore key.') + '\n')
	}
}

async function flashcoreHas(args: string[], runtime: RuntimeProvider) {
	if (args.length === 0) {
		process.stdout.write('Usage: /flashcore has <key>\n')
		return
	}

	const key = args[0]
	const exists = await runtime.flashcoreHas(key)

	if (exists) {
		process.stdout.write(`  ${color.cyan(key)} ${color.green('exists')}\n`)
	} else {
		process.stdout.write(`  ${color.cyan(key)} ${color.dim('not found')}\n`)
	}
}

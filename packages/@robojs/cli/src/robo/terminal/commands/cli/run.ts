/**
 * /cli run <command> [args...] - Run a CLI command inline.
 *
 * Resolves the command handler from the build output,
 * parses options, and executes it within the dev terminal.
 */
import path from 'node:path'
import { createTerminalCommandConfig, Manifest } from 'robo.js'
import { parseCliOptions } from 'robo.js/cli.js'
import { logger } from 'robo.js/logger.js'
import type { TerminalContext } from 'robo.js'
import type { CliCommandConfig } from 'robo.js/cli.js'

const cliLogger = logger.fork('cli')

export const config = createTerminalCommandConfig({
	description: 'Run a CLI command',
	positionalArgs: true
} as const)

export default async function (ctx: TerminalContext<typeof config>) {
	if (!ctx.args.length) {
		ctx.write('Usage: /cli run <command> [args...]\n')
		ctx.write('Example: /cli run hello --name Robo\n')
		return
	}

	const summaries = await Manifest.routeSummaries('cli', 'cli')

	if (summaries.length === 0) {
		ctx.write('No CLI commands registered\n')
		return
	}

	// Build a set of known command keys for matching
	const knownKeys = new Set(summaries.map((s) => s.key))

	// Match longest command key from args (try 3 tokens, then 2, then 1)
	let matchedKey: string | null = null
	let matchedTokens = 0

	for (let i = Math.min(3, ctx.args.length); i >= 1; i--) {
		const candidate = ctx.args.slice(0, i).join(' ')
		if (knownKeys.has(candidate)) {
			matchedKey = candidate
			matchedTokens = i
			break
		}
	}

	if (!matchedKey) {
		ctx.write(`Unknown command: ${ctx.args[0]}\n`)
		ctx.write('Use /cli list to see available commands\n')
		return
	}

	// Find the matching summary
	const summary = summaries.find((s) => s.key === matchedKey)!
	const remainingArgs = ctx.args.slice(matchedTokens)

	// Resolve handler path from build output
	const handlerPath = path.join(process.cwd(), '.robo', 'build', summary.path)

	try {
		// Dynamic import with cache-busting for HMR
		const mod = await import(`file://${handlerPath}?t=${Date.now()}`)

		if (typeof mod.default !== 'function') {
			ctx.write(`Command "${matchedKey}" does not export a handler function\n`)
			return
		}

		// Read config for option definitions
		const cmdConfig = mod.config as CliCommandConfig | undefined
		const optionDefs = cmdConfig?.options ?? []

		// Parse remaining args
		const { parsedOptions, positionalArgs, errors } = parseCliOptions(remainingArgs, optionDefs)

		if (errors.length > 0) {
			for (const error of errors) {
				ctx.write(`${error}\n`)
			}
			return
		}

		// Construct CLI context
		const cliContext = {
			args: positionalArgs,
			options: parsedOptions,
			logger: cliLogger,
			cwd: process.cwd(),
			argv: remainingArgs
		}

		// Execute the handler
		await mod.default(cliContext)
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code === 'ERR_MODULE_NOT_FOUND') {
			ctx.write(`Command "${matchedKey}" not found in build output\n`)
			ctx.write('Try running "robo build" first\n')
		} else {
			ctx.write(`Error running "${matchedKey}": ${error instanceof Error ? error.message : String(error)}\n`)
			cliLogger.error(error)
		}
	}
}

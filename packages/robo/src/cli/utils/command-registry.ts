/**
 * Command Registry for Lazy Loading CLI Commands
 *
 * This module stores command metadata without importing the actual command implementations.
 * Commands are lazy-loaded only when executed, reducing CLI startup time significantly.
 */

import { Command } from './cli-handler.js'
import type { CliContext, CliExtensionEntry, CliOptionConfig } from '../../types/cli.js'

export interface CommandOption {
	alias: string
	name: string
	description: string
}

export interface CommandMetadata {
	name: string
	description: string
	options: CommandOption[]
	positionalArgs?: boolean
	modulePath: string
	/** For commands with subcommands that need lazy loading of the whole module */
	hasSubcommands?: boolean
}

/**
 * All command metadata - defined inline to avoid importing command modules.
 * This allows the CLI to know about all commands without loading their implementations.
 */
export const COMMANDS: CommandMetadata[] = [
	{
		name: 'add',
		description: 'Adds a plugin to your Robo.',
		options: [
			{ alias: '-f', name: '--force', description: 'forcefully install & register packages' },
			{ alias: '-ns', name: '--no-seed', description: 'skip the seeding of files from the plugin' },
			{ alias: '-s', name: '--silent', description: 'do not print anything' },
			{ alias: '-t', name: '--trigger', description: 'setup hook trigger context (add or create)' },
			{ alias: '-v', name: '--verbose', description: 'print more information for debugging' },
			{ alias: '-y', name: '--yes', description: 'auto-accept seed files' }
		],
		positionalArgs: true,
		modulePath: '../commands/add.js'
	},
	{
		name: 'remove',
		description: 'Removes a plugin from your Robo',
		options: [
			{ alias: '-f', name: '--force', description: 'forcefully remove & unregister packages' },
			{ alias: '-s', name: '--silent', description: 'do not print anything' },
			{ alias: '-v', name: '--verbose', description: 'print more information for debugging' }
		],
		positionalArgs: true,
		modulePath: '../commands/remove.js'
	},
	{
		name: 'build',
		description: 'Builds your Robo for production.',
		options: [
			{ alias: '-d', name: '--dev', description: 'build for development' },
			{ alias: '-m', name: '--mode', description: 'specify the mode(s) to run in (dev, beta, prod, etc...)' },
			{ alias: '-s', name: '--silent', description: 'do not print anything' },
			{ alias: '-v', name: '--verbose', description: 'print more information for debugging' },
			{ alias: '-w', name: '--watch', description: 'watch for changes and rebuild' },
			{ alias: '-h', name: '--help', description: 'Shows the available command options' }
		],
		positionalArgs: true,
		hasSubcommands: true,
		modulePath: '../commands/build/index.js'
	},
	{
		name: 'start',
		description: 'Starts your Robo in production mode.',
		options: [
			{ alias: '-id', name: '--instance-id', description: 'specify the instance ID to use' },
			{ alias: '-l', name: '--log-level', description: 'specify the log level to use (debug, info, warn, error)' },
			{ alias: '-m', name: '--mode', description: 'specify the mode(s) to run in (dev, beta, prod, etc...)' },
			{ alias: '-h', name: '--help', description: 'Shows the available command options' },
			{ alias: '-s', name: '--silent', description: 'do not print anything' },
			{ alias: '-v', name: '--verbose', description: 'print more information for debugging' }
		],
		modulePath: '../commands/start.js'
	},
	{
		name: 'dev',
		description: 'Ready, set, code your Robo to life! Starts development mode.',
		options: [
			{ alias: '-h', name: '--help', description: 'Shows the available command options' },
			{ alias: '-H', name: '--hmr', description: 'Enable hot module replacement for handlers (experimental)' },
			{ alias: '-id', name: '--instance-id', description: 'specify the instance ID to use' },
			{ alias: '-l', name: '--log-level', description: 'specify the log level to use (debug, info, warn, error)' },
			{ alias: '-m', name: '--mode', description: 'specify the mode(s) to run in (dev, beta, prod, etc...)' },
			{ alias: '-s', name: '--silent', description: 'do not print anything' },
			{ alias: '-v', name: '--verbose', description: 'print more information for debugging' }
		],
		modulePath: '../commands/dev.js'
	},
	{
		name: 'deploy',
		description: 'Deploys your Robo to RoboPlay!',
		options: [
			{ alias: '-s', name: '--silent', description: 'do not print anything' },
			{ alias: '-v', name: '--verbose', description: 'print more information for debugging' },
			{ alias: '-h', name: '--help', description: 'Shows the available command options' }
		],
		modulePath: '../commands/deploy.js'
	},
	{
		name: 'sync',
		description: 'Syncs the Robo with the latest plugins and configurations',
		options: [
			{ alias: '-s', name: '--silent', description: 'do not print anything' },
			{ alias: '-v', name: '--verbose', description: 'print more information for debugging' },
			{ alias: '-h', name: '--help', description: 'Shows the available command options' }
		],
		modulePath: '../commands/sync.js'
	},
	{
		name: 'upgrade',
		description: 'Upgrades your Robo to the latest version',
		options: [
			{ alias: '-f', name: '--force', description: 'forcefully install' },
			{ alias: '-ns', name: '--no-self-check', description: 'do not check for updates to Sage CLI' },
			{ alias: '-s', name: '--silent', description: 'do not print anything' },
			{ alias: '-v', name: '--verbose', description: 'print more information for debugging' }
		],
		modulePath: '../commands/upgrade.js'
	},
	{
		name: 'login',
		description: 'Sign in to your RoboPlay account',
		options: [
			{ alias: '-s', name: '--silent', description: 'do not print anything' },
			{ alias: '-v', name: '--verbose', description: 'print more information for debugging' },
			{ alias: '-h', name: '--help', description: 'Shows the available command options' }
		],
		modulePath: '../commands/login.js'
	},
	{
		name: 'logout',
		description: 'Sign out of your RoboPlay account',
		options: [
			{ alias: '-s', name: '--silent', description: 'do not print anything' },
			{ alias: '-v', name: '--verbose', description: 'print more information for debugging' },
			{ alias: '-h', name: '--help', description: 'Shows the available command options' }
		],
		modulePath: '../commands/logout.js'
	},
	{
		name: 'cloud',
		description: 'Manage your cloud deployments',
		options: [],
		hasSubcommands: true,
		modulePath: '../commands/cloud/index.js'
	},
	{
		name: 'cli',
		description: 'Inspect CLI commands and extensions from plugins.',
		options: [{ alias: '-i', name: '--inspect', description: 'Show all registered CLI commands and extensions' }],
		positionalArgs: true,
		modulePath: '../commands/cli.js'
	},
	{
		name: 'logs',
		description: 'View and search local log files.',
		options: [
			{ alias: '-j', name: '--json', description: 'output logs as NDJSON (one JSON object per line)' },
			{ alias: '-l', name: '--level', description: 'filter by minimum log level (trace, debug, info, warn, error)' },
			{ alias: '-p', name: '--source', description: 'filter by source/plugin name (e.g., discordjs, api)' },
			{ alias: '-g', name: '--grep', description: 'filter log messages by text or regex pattern' },
			{ alias: '-m', name: '--mode', description: 'which mode logs to read (development, production, etc.)' },
			{ alias: '-n', name: '--limit', description: 'maximum number of lines to output' },
			{ alias: '-t', name: '--tail', description: 'watch for new log entries (stream mode)' },
			{ alias: '-s', name: '--session', description: 'view specific session (current, previous, or index number)' },
			{ alias: '-S', name: '--sessions', description: 'list all available log sessions', type: 'boolean' },
			{ alias: '-T', name: '--since', description: 'show logs since time (e.g., "1h", "30m", ISO timestamp)' },
			{ alias: '-h', name: '--help', description: 'Shows the available command options' }
		],
		modulePath: '../commands/logs.js'
	},
	{
		name: 'inspect',
		description: 'Display project structure, plugins, routes, and configuration.',
		options: [
			{ alias: '-j', name: '--json', description: 'output as structured JSON' },
			{ alias: '-m', name: '--mode', description: 'which mode manifest to inspect (development, production, etc.)' },
			{ alias: '-h', name: '--help', description: 'Shows the available command options' }
		],
		modulePath: '../commands/inspect.js'
	},
	{
		name: 'skills',
		description: 'Manage AI coding skills from plugins.',
		options: [],
		hasSubcommands: true,
		modulePath: '../commands/skills/index.js'
	}
]

/**
 * Creates a Command instance that lazy-loads its handler when executed.
 * The command metadata (name, description, options) is set immediately,
 * but the actual handler code is only imported when the command runs.
 *
 * Also integrates with CLI extensions to allow plugins to inject options
 * and before/after hooks into core commands.
 */
export function createLazyCommand(meta: CommandMetadata): Command {
	const cmd = new Command(meta.name).description(meta.description)

	// Add all options
	for (const opt of meta.options) {
		cmd.option(opt.alias, opt.name, opt.description)
	}

	// Enable positional args if specified
	if (meta.positionalArgs) {
		cmd.positionalArgs(true)
	}

	// Suppress unknown option warnings for initial parse since extensions may add more options
	// The lazy handler will re-parse with extension options
	cmd.suppressUnknownWarnings(true)

	// For commands with subcommands, we need to load the full module
	// and re-parse arguments through it so subcommands are properly routed
	if (meta.hasSubcommands) {
		// Subcommand names must pass through as positional args to reach the handler
		cmd.positionalArgs(true)

		cmd.handler(async (context: CliContext) => {
			const module = await import(meta.modulePath)
			const loadedCommand = module.default as Command

			// Re-parse through the loaded command to properly route subcommands
			// The context.args may contain subcommand names that need routing
			// Combine args and reconstruct argv for re-parsing
			const argsToReparse = [...context.args, ...context.argv.filter((a) => a.startsWith('-'))]

			// Check if first arg is a subcommand of the loaded command
			const firstArg = context.args[0]
			const subCommand = loadedCommand.getChildCommands().find((cmd) => cmd.getName() === firstArg)

			if (subCommand) {
				// Route to the subcommand with remaining args
				const remainingArgs = argsToReparse.slice(1)
				await loadedCommand.parse([firstArg, ...remainingArgs])
			} else if (context.argv.some((a) => a === '--help' || a === '-h')) {
				// Delegate help to loaded command which knows about subcommands
				await loadedCommand.parse(argsToReparse)
			} else if (loadedCommand.getHandler()) {
				// No subcommand match, call the parent handler
				return loadedCommand.getHandler()!(context)
			}
		})
	} else {
		// Simple lazy handler - just load and execute with extension support
		cmd.handler(async (context: CliContext) => {
			// Load CLI extensions for this command
			const { loadCliManifest, getExtensions, loadCliExtension } = await import('./cli-loader.js')
			const manifest = await loadCliManifest()

			let extensions: CliExtensionEntry[] = []
			if (manifest) {
				extensions = getExtensions(manifest, meta.name)

				// Re-parse context.options to include extension options
				// This allows extension-provided options to be parsed correctly
				if (extensions.length > 0) {
					const extensionOptions: CliOptionConfig[] = []
					for (const ext of extensions) {
						if (ext.options) {
							extensionOptions.push(...ext.options)
						}
					}

					// Re-parse with extension options
					if (extensionOptions.length > 0) {
						const { parseCliOptions } = await import('./cli-shared.js')
						const allOptions = [...meta.options, ...extensionOptions]
						const { parsedOptions } = parseCliOptions(context.argv, allOptions)
						context.options = parsedOptions
					}
				}
			}

			// Load environment variables before running extension hooks
			// This ensures plugins can access env vars like DISCORD_TOKEN in their before hooks
			const { Env } = await import('../../core/env.js')
			const { resolveCliMode } = await import('../../core/mode.js')
			// Infer default mode from command name - dev uses development, others use production
			// This ensures the correct .env.{mode} file is loaded before the command handler runs
			const inferredMode = meta.name === 'dev' ? 'development' : 'production'
			const envMode = resolveCliMode((context.options as Record<string, unknown>).mode as string | undefined) ?? inferredMode
			await Env.load({ mode: envMode })

			// Run before hooks (highest priority first, already sorted)
			for (const ext of extensions) {
				if (ext.hasBefore) {
					const loaded = await loadCliExtension(ext)
					if (loaded?.before) {
						const result = await loaded.before(context)
						if (result === false) {
							return // Command aborted by before hook
						}
					}
				}
			}

			// Load and execute the actual command handler
			const module = await import(meta.modulePath)
			const loadedCommand = module.default as Command
			const handlerResult = await loadedCommand.getHandler()!(context)
			context.result = handlerResult

			// Run after hooks (lowest priority first, reverse order)
			for (const ext of [...extensions].reverse()) {
				if (ext.hasAfter) {
					const loaded = await loadCliExtension(ext)
					if (loaded?.after) {
						await loaded.after(context)
					}
				}
			}

			return handlerResult
		})
	}

	return cmd
}

/**
 * Get metadata for a specific command by name.
 */
export function getCommandMetadata(name: string): CommandMetadata | undefined {
	return COMMANDS.find((cmd) => cmd.name === name)
}

/**
 * Get all command metadata (useful for help display).
 */
export function getAllCommands(): CommandMetadata[] {
	return COMMANDS
}

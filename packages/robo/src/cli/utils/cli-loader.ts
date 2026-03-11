/**
 * CLI Loader Utility
 *
 * Loads and executes CLI commands and extensions at runtime.
 * Handles manifest loading, command resolution, and extension hook execution.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { logger as createLogger } from '../../core/logger.js'
import { color } from '../../core/color.js'
import { Env } from '../../core/env.js'
import { Mode, resolveCliMode } from '../../core/mode.js'
// Note: config loading removed - using filesystem-based plugin discovery instead
import {
	pathExists,
	getPluginCliDir,
	getProjectCliDir,
	getPluginTerminalDir,
	getProjectTerminalDir,
	scanCommands,
	scanExtensions,
	scanTerminalCommands,
	mergeExtensions,
	applySubcommands,
	PROJECT_PRIORITY_BOOST,
	DEFAULT_HELP_OPTION,
	parseCliOptions
} from './cli-shared.js'
import type {
	CliAfterHook,
	CliBeforeHook,
	CliCommandEntry,
	CliContext,
	CliExtensionEntry,
	CliHandler,
	CliManifest,
	CliOptionConfig,
	LoadedCliCommand,
	LoadedCliExtension,
	TerminalCommandEntry,
	TerminalContext
} from '../../types/cli.js'
import type { Config } from '../../types/config.js'
import type { RuntimeProvider } from './cli-runtime-provider.js'

const logger = createLogger().fork('cli')

/** Standard exit codes */
const EXIT_SUCCESS = 0
const EXIT_ERROR = 1

/**
 * CLI manifest cache.
 */
let cachedManifest: CliManifest | null = null

/**
 * Load the CLI manifest.
 * Uses mode-agnostic location (.robo/manifest/cli/@.json).
 * Falls back to runtime discovery if no manifest exists.
 */
export async function loadCliManifest(): Promise<CliManifest | null> {
	if (cachedManifest) {
		return cachedManifest
	}

	// Mode-agnostic CLI manifest path
	const manifestPath = path.join(process.cwd(), '.robo', 'manifest', 'cli', '@.json')

	try {
		const content = await fs.readFile(manifestPath, 'utf-8')
		const parsed = JSON.parse(content) as CliManifest
		// Ensure terminal field exists (backward compat with older manifests)
		if (!parsed.terminal) {
			parsed.terminal = {}
		}
		cachedManifest = parsed
		return cachedManifest
	} catch {
		// No manifest - try runtime discovery
		cachedManifest = await discoverCliAtRuntime()
		return cachedManifest
	}
}

/**
 * Valid file extensions for plugin config files.
 */
const PLUGIN_FILE_EXTENSIONS = /\.(ts|tsx|mjs|js|cjs)$/

/**
 * Discover plugin names by scanning config/plugins/ directory structure.
 * No config loading required - plugin names are implied by file paths.
 *
 * Directory structure maps to plugin names:
 * - config/plugins/robojs/mock.ts → @robojs/mock
 * - config/plugins/myorg/custom.ts → @myorg/custom
 * - config/plugins/plugin-ai.ts → plugin-ai
 */
export async function discoverPluginsFromFilesystem(): Promise<string[]> {
	const pluginNames: string[] = []
	const pluginsDir = path.join(process.cwd(), 'config', 'plugins')

	try {
		const entries = await fs.readdir(pluginsDir, { withFileTypes: true })

		for (const entry of entries) {
			if (entry.isDirectory()) {
				// Scoped package: config/plugins/robojs/ → @robojs/*
				const scopeDir = path.join(pluginsDir, entry.name)
				try {
					const scopeEntries = await fs.readdir(scopeDir)
					for (const scopeEntry of scopeEntries) {
						if (!scopeEntry.match(PLUGIN_FILE_EXTENSIONS)) continue
						const baseName = scopeEntry.replace(PLUGIN_FILE_EXTENSIONS, '')
						pluginNames.push(`@${entry.name}/${baseName}`)
					}
				} catch {
					// Failed to read scope directory - skip
				}
			} else if (entry.name.match(PLUGIN_FILE_EXTENSIONS)) {
				// Non-scoped: config/plugins/plugin-ai.ts → plugin-ai
				const baseName = entry.name.replace(PLUGIN_FILE_EXTENSIONS, '')
				pluginNames.push(baseName)
			}
		}
	} catch {
		// No plugins directory - that's fine
	}

	logger.debug(`Filesystem plugin discovery: found ${pluginNames.length} plugins`)
	return pluginNames
}

/**
 * Discover CLI commands at runtime by scanning plugins and project.
 * Uses filesystem-based plugin discovery - no config loading required.
 */
async function discoverCliAtRuntime(): Promise<CliManifest | null> {
	const commands: Record<string, CliCommandEntry> = {}
	const allExtensions: Record<string, CliExtensionEntry[]>[] = []
	const allSubcommandMaps: Map<string, string[]>[] = []

	try {
		// 1. Discover plugins from config/plugins/ directory structure
		// No config loading needed - just scan file names
		const pluginNames = await discoverPluginsFromFilesystem()
		logger.debug(`Runtime CLI discovery: Found ${pluginNames.length} plugins from filesystem`)

		// 2. Scan each plugin's CLI directory (in parallel)
		const pluginResults = await Promise.all(
			pluginNames.map(async (pluginName) => {
				const cliDir = await getPluginCliDir(pluginName)
				if (!cliDir) return null

				const result: {
					commands: Record<string, CliCommandEntry>
					subcommandMap: Map<string, string[]>
					extensions: Record<string, CliExtensionEntry[]>
				} = {
					commands: {},
					subcommandMap: new Map(),
					extensions: {}
				}

				// Scan commands and extensions in parallel
				const commandsDir = path.join(cliDir, 'commands')
				const extendDir = path.join(cliDir, 'extend')

				const [hasCommands, hasExtensions] = await Promise.all([
					pathExists(commandsDir),
					pathExists(extendDir)
				])

				const tasks: Promise<void>[] = []

				if (hasCommands) {
					tasks.push(
						scanCommands(commandsDir, pluginName, { cacheBust: true }).then(({ commands: pluginCommands, subcommandMap }) => {
							result.commands = pluginCommands
							result.subcommandMap = subcommandMap
						})
					)
				}

				if (hasExtensions) {
					tasks.push(
						scanExtensions(extendDir, pluginName, { cacheBust: true }).then((exts) => {
							result.extensions = exts
						})
					)
				}

				await Promise.all(tasks)
				return result
			})
		)

		// Merge results from all plugins
		for (const result of pluginResults) {
			if (!result) continue

			// Merge commands (respecting priority)
			for (const [cmdPath, entry] of Object.entries(result.commands)) {
				const existing = commands[cmdPath]
				if (!existing || entry.priority >= existing.priority) {
					commands[cmdPath] = entry
				}
			}
			allSubcommandMaps.push(result.subcommandMap)
			if (Object.keys(result.extensions).length > 0) {
				allExtensions.push(result.extensions)
			}
		}

		// 3. Scan project's own CLI directory (with priority boost)
		const projectCliDir = getProjectCliDir()
		if (await pathExists(projectCliDir)) {
			const commandsDir = path.join(projectCliDir, 'commands')
			if (await pathExists(commandsDir)) {
				const { commands: projectCommands, subcommandMap } = await scanCommands(commandsDir, null, {
					priorityBoost: PROJECT_PRIORITY_BOOST,
					cacheBust: true
				})

				// Project commands override plugins
				for (const [cmdPath, entry] of Object.entries(projectCommands)) {
					const existing = commands[cmdPath]
					if (existing && existing.plugin) {
						logger.debug(`Project command "${cmdPath}" shadows plugin command from ${existing.plugin}`)
					}
					commands[cmdPath] = entry
				}
				allSubcommandMaps.push(subcommandMap)
			}

			const extendDir = path.join(projectCliDir, 'extend')
			if (await pathExists(extendDir)) {
				const exts = await scanExtensions(extendDir, null, {
					priorityBoost: PROJECT_PRIORITY_BOOST,
					cacheBust: true
				})
				allExtensions.push(exts)
			}
		}

		// Apply subcommands to commands
		for (const subcommandMap of allSubcommandMaps) {
			applySubcommands(commands, subcommandMap)
		}

		// Generate parent commands for orphan subcommands
		generateParentCommands(commands)

		// Merge and sort extensions
		const extensions = mergeExtensions(...allExtensions)

		// 4. Discover terminal commands from plugins and project
		const terminal: Record<string, TerminalCommandEntry> = {}
		const terminalSubcommandMaps: Map<string, string[]>[] = []

		// Scan plugin terminal directories
		const terminalResults = await Promise.all(
			pluginNames.map(async (pluginName) => {
				const terminalDir = await getPluginTerminalDir(pluginName)
				if (!terminalDir) return null
				return scanTerminalCommands(terminalDir, pluginName, { cacheBust: true })
			})
		)

		for (const result of terminalResults) {
			if (!result) continue
			for (const [cmdPath, entry] of Object.entries(result.commands)) {
				const existing = terminal[cmdPath]
				if (!existing || entry.priority >= existing.priority) {
					terminal[cmdPath] = entry
				}
			}
			terminalSubcommandMaps.push(result.subcommandMap)
		}

		// Scan project terminal directory
		const projectTerminalDir = getProjectTerminalDir()
		if (await pathExists(projectTerminalDir)) {
			const { commands: projectTerminal, subcommandMap } = await scanTerminalCommands(projectTerminalDir, null, {
				priorityBoost: PROJECT_PRIORITY_BOOST,
				cacheBust: true
			})

			for (const [cmdPath, entry] of Object.entries(projectTerminal)) {
				terminal[cmdPath] = entry
			}
			terminalSubcommandMaps.push(subcommandMap)
		}

		// Apply subcommands to terminal commands
		for (const subcommandMap of terminalSubcommandMaps) {
			applySubcommands(terminal, subcommandMap)
		}

		// Generate parent commands for orphan terminal subcommands
		generateParentCommands(terminal)

		// Return null if nothing found
		const hasCliContent = Object.keys(commands).length > 0 || Object.keys(extensions).length > 0
		const hasTerminalContent = Object.keys(terminal).length > 0

		if (!hasCliContent && !hasTerminalContent) {
			return null
		}

		logger.debug(
			`Runtime CLI discovery: Found ${Object.keys(commands).length} commands, ` +
			`${Object.keys(extensions).length} extension targets, ` +
			`${Object.keys(terminal).length} terminal commands`
		)
		return { commands, extensions, terminal }
	} catch (error) {
		logger.debug('Runtime CLI discovery failed:', error)
		return null
	}
}

/**
 * Generate parent commands for orphan subcommands.
 * E.g., if "tunnel start" exists but "tunnel" doesn't, create a parent command.
 */
function generateParentCommands(commands: Record<string, CliCommandEntry | TerminalCommandEntry>): void {
	const generatedParents = new Set<string>()

	// Process commands from deepest to shallowest to ensure children are generated first
	const originalPaths = Object.keys(commands)
	const sortedPaths = [...originalPaths].sort((a, b) => b.split(' ').length - a.split(' ').length)

	for (const cmdPath of sortedPaths) {
		const parts = cmdPath.split(' ')
		if (parts.length < 2) continue

		// Check all parent paths (from deepest to shallowest)
		for (let i = parts.length - 1; i >= 1; i--) {
			const parentPath = parts.slice(0, i).join(' ')

			// Skip if parent already exists or we've already generated it
			if (commands[parentPath] || generatedParents.has(parentPath)) continue

			// Find all direct children of this parent (including generated ones)
			const currentPaths = Object.keys(commands)
			const children = currentPaths
				.filter((p) => {
					const pParts = p.split(' ')
					return pParts.length === i + 1 && p.startsWith(parentPath + ' ')
				})
				.map((p) => p.split(' ').pop()!)

			// Get plugin from first child (for source attribution)
			const firstChildPath = currentPaths.find((p) => p.startsWith(parentPath + ' '))
			const plugin = firstChildPath ? commands[firstChildPath].plugin : null

			// Create auto-generated parent command
			commands[parentPath] = {
				path: '', // No actual file
				plugin,
				description: `${parts[i - 1]} commands`,
				priority: 0,
				subcommands: children
			}
			generatedParents.add(parentPath)
		}
	}
}

/**
 * Clear the manifest cache (useful for dev mode reloading).
 */
export function clearCliManifestCache(): void {
	cachedManifest = null
}

/**
 * Load a CLI command handler from a file.
 */
export async function loadCliCommand(entry: CliCommandEntry): Promise<LoadedCliCommand | null> {
	// Handle auto-generated parent commands (no path)
	if (!entry.path) {
		return {
			config: {
				description: entry.description,
				options: entry.options,
				positionalArgs: entry.positionalArgs,
				priority: entry.priority
			},
			plugin: entry.plugin,
			handler: createAutoParentHandler(entry)
		}
	}

	try {
		const module = await import(pathToFileURL(entry.path).href)

		if (typeof module.default !== 'function') {
			logger.error(`CLI command at ${entry.path} is missing default handler export`)
			return null
		}

		return {
			config: {
				description: entry.description,
				options: entry.options,
				positionalArgs: entry.positionalArgs,
				priority: entry.priority
			},
			plugin: entry.plugin,
			handler: module.default as CliHandler
		}
	} catch (error) {
		logger.error(`Failed to load CLI command from ${entry.path}:`, error)
		return null
	}
}

/**
 * Create a handler for auto-generated parent commands.
 */
function createAutoParentHandler(entry: CliCommandEntry): CliHandler {
	return ({ logger: log }) => {
		if (entry.subcommands && entry.subcommands.length > 0) {
			const commandName = Object.entries(cachedManifest?.commands ?? {}).find(
				([, e]) => e === entry
			)?.[0] ?? 'command'

			log.log(`Available subcommands for "${commandName}":`)
			for (const sub of entry.subcommands) {
				const subEntry = cachedManifest?.commands[`${commandName} ${sub}`]
				const desc = subEntry?.description ? ` - ${subEntry.description}` : ''
				log.log(`  robo ${commandName} ${sub}${desc}`)
			}
			log.log('')
			log.log('Use --help with any subcommand for more details.')
		}
	}
}

/**
 * Load a CLI extension from a file.
 */
export async function loadCliExtension(entry: CliExtensionEntry): Promise<LoadedCliExtension | null> {
	try {
		const module = await import(pathToFileURL(entry.path).href)

		return {
			config: {
				options: entry.options,
				priority: entry.priority
			},
			plugin: entry.plugin,
			before: typeof module.before === 'function' ? (module.before as CliBeforeHook) : undefined,
			after: typeof module.after === 'function' ? (module.after as CliAfterHook) : undefined
		}
	} catch (error) {
		logger.error(`Failed to load CLI extension from ${entry.path}:`, error)
		return null
	}
}

/**
 * Find a command in the manifest by path.
 * Returns the entry if found, null otherwise.
 */
export function findCommand(manifest: CliManifest, commandPath: string): CliCommandEntry | null {
	return manifest.commands[commandPath] ?? null
}

/**
 * Get extensions for a command.
 * Matches both the exact command path and parent commands.
 * E.g., for "tunnel start", returns extensions for both "tunnel start" and "tunnel".
 * Deduplicates extensions by path to avoid running the same extension twice.
 */
export function getExtensions(manifest: CliManifest, commandPath: string): CliExtensionEntry[] {
	const extensions: CliExtensionEntry[] = []
	const seenPaths = new Set<string>()

	// Helper to add extensions without duplicates
	const addExtensions = (exts: CliExtensionEntry[]) => {
		for (const ext of exts) {
			if (!seenPaths.has(ext.path)) {
				extensions.push(ext)
				seenPaths.add(ext.path)
			}
		}
	}

	// Check exact match first
	if (manifest.extensions[commandPath]) {
		addExtensions(manifest.extensions[commandPath])
	}

	// Check parent commands (e.g., "tunnel" for "tunnel start")
	const parts = commandPath.split(' ')
	for (let i = parts.length - 1; i > 0; i--) {
		const parentPath = parts.slice(0, i).join(' ')
		if (manifest.extensions[parentPath]) {
			addExtensions(manifest.extensions[parentPath])
		}
	}

	// Sort by priority (highest first)
	return extensions.sort((a, b) => b.priority - a.priority)
}

/**
 * Merge options from extensions with core command options.
 * Automatically adds default --help option unless already defined.
 */
export function mergeOptions(
	coreOptions: CliOptionConfig[] = [],
	extensions: CliExtensionEntry[]
): CliOptionConfig[] {
	const merged = [...coreOptions]
	const seenAliases = new Set(coreOptions.map((o) => o.alias))
	const seenNames = new Set(coreOptions.map((o) => o.name))

	// Add default help option if not already defined
	if (!seenAliases.has(DEFAULT_HELP_OPTION.alias) && !seenNames.has(DEFAULT_HELP_OPTION.name)) {
		merged.push(DEFAULT_HELP_OPTION)
		seenAliases.add(DEFAULT_HELP_OPTION.alias)
		seenNames.add(DEFAULT_HELP_OPTION.name)
	}

	for (const ext of extensions) {
		if (!ext.options) continue

		for (const option of ext.options) {
			// Check for conflicts
			if (seenAliases.has(option.alias)) {
				logger.warn(
					`Option alias "${option.alias}" from ${ext.plugin ?? 'project'} conflicts with existing option. Skipping.`
				)
				continue
			}
			if (seenNames.has(option.name)) {
				logger.warn(
					`Option "${option.name}" from ${ext.plugin ?? 'project'} conflicts with existing option. Skipping.`
				)
				continue
			}

			merged.push(option)
			seenAliases.add(option.alias)
			seenNames.add(option.name)
		}
	}

	return merged
}

/**
 * Execute a plugin CLI command with extensions.
 */
export async function executePluginCommand(
	entry: CliCommandEntry,
	extensions: CliExtensionEntry[],
	args: string[]
): Promise<void> {
	// Load the command
	const command = await loadCliCommand(entry)
	if (!command) {
		logger.error('Failed to load command')
		await logger.flush()
		process.exit(EXIT_ERROR)
	}

	// Load extensions
	const loadedExtensions: LoadedCliExtension[] = []
	for (const ext of extensions) {
		const loaded = await loadCliExtension(ext)
		if (loaded) {
			loadedExtensions.push(loaded)
		}
	}

	// Merge options
	const mergedOptions = mergeOptions(command.config.options, extensions)

	// Parse arguments
	const { parsedOptions, positionalArgs, errors } = parseCliOptions(args, mergedOptions)

	// Check for help flag first
	if (parsedOptions.help) {
		showCommandHelp(entry, extensions, mergedOptions)
		process.exit(EXIT_SUCCESS)
	}

	// Check for validation errors
	if (errors.length > 0) {
		for (const error of errors) {
			logger.error(error)
		}
		console.log('')
		logger.info(`Use ${color.bold('--help')} to see available options.`)
		await logger.flush()
		process.exit(EXIT_ERROR)
	}

	// Create context
	const context: CliContext = {
		args: positionalArgs,
		options: parsedOptions,
		logger: command.plugin ? createLogger().fork(command.plugin) : logger,
		cwd: process.cwd(),
		argv: args
	}

	try {
		// Run before hooks (highest priority first)
		for (const ext of loadedExtensions) {
			if (ext.before) {
				const result = await ext.before(context)
				if (result === false) {
					logger.debug(`Command aborted by before hook from ${ext.plugin ?? 'project'}`)
					process.exit(EXIT_SUCCESS)
				}
			}
		}

		// Run the command handler and capture result
		const handlerResult = await command.handler(context)
		context.result = handlerResult

		// Run after hooks (lowest priority first, so reverse order)
		for (const ext of [...loadedExtensions].reverse()) {
			if (ext.after) {
				await ext.after(context)
			}
		}
	} catch (error) {
		// Handle command execution errors gracefully
		if (error instanceof Error) {
			logger.error(`Command failed: ${error.message}`)
			logger.debug('Stack trace:', error.stack)
		} else {
			logger.error('Command failed with an unknown error')
		}
		await logger.flush()
		process.exit(EXIT_ERROR)
	}
}

/**
 * Show help for a plugin command.
 */
function showCommandHelp(
	entry: CliCommandEntry,
	extensions: CliExtensionEntry[],
	mergedOptions: CliOptionConfig[]
): void {
	const commandName = Object.entries(cachedManifest?.commands ?? {}).find(
		([, e]) => e.path === entry.path || e === entry
	)?.[0]

	// Usage line
	const hasOptions = mergedOptions.length > 0
	const hasSubcommands = entry.subcommands && entry.subcommands.length > 0
	let usage = `robo ${commandName}`
	if (hasSubcommands) {
		usage += ' <subcommand>'
	}
	if (hasOptions) {
		usage += ' [options]'
	}

	console.log(color.blue(`\n Command: robo ${commandName}`))
	console.log(` Description: ${entry.description}`)
	console.log(color.dim(` Usage: ${usage}`))

	if (entry.plugin) {
		console.log(` Source: ${entry.plugin}`)
	}

	if (mergedOptions.length > 0) {
		console.log(color.green(`\n Options:`))

		// Separate core and extension options
		const coreOptions = entry.options ?? []
		const coreAliases = new Set(coreOptions.map((o) => o.alias))

		for (const opt of mergedOptions) {
			// Skip source tag for default help option and core options
			const isDefaultHelp = opt.alias === DEFAULT_HELP_OPTION.alias && opt.name === DEFAULT_HELP_OPTION.name
			const isExtension = !coreAliases.has(opt.alias) && !isDefaultHelp
			const source = isExtension
				? extensions.find((e) => e.options?.some((o) => o.alias === opt.alias))?.plugin ?? 'project'
				: null

			const sourceTag = source ? color.dim(` (from: ${source})`) : ''
			const requiredTag = opt.required ? color.red(' [required]') : ''
			const defaultTag = opt.default !== undefined ? color.dim(` (default: ${opt.default})`) : ''
			console.log(`   ${color.green(opt.alias)}, ${color.green(opt.name)}: ${opt.description}${requiredTag}${defaultTag}${sourceTag}`)
		}
	}

	if (hasSubcommands) {
		console.log(color.cyan(`\n Subcommands:`))
		for (const sub of entry.subcommands!) {
			const subEntry = cachedManifest?.commands[`${commandName} ${sub}`]
			const desc = subEntry?.description ? color.dim(` - ${subEntry.description}`) : ''
			console.log(`   ${sub}${desc}`)
		}
	}

	console.log('')
}

/**
 * Show error for unknown command with suggestions.
 */
export async function showUnknownCommandError(commandPath: string, manifest: CliManifest | null): Promise<void> {
	console.log('')
	logger.error(color.red(`The command "${commandPath}" does not exist.`))

	if (manifest && Object.keys(manifest.commands).length > 0) {
		// Find similar commands
		const allCommands = Object.keys(manifest.commands)
		const similar = allCommands.filter(
			(cmd) => cmd.includes(commandPath) || commandPath.includes(cmd.split(' ')[0])
		)

		if (similar.length > 0) {
			console.log(color.dim(`\nDid you mean one of these?`))
			for (const cmd of similar.slice(0, 3)) {
				console.log(`  robo ${cmd}`)
			}
		}

		console.log(color.dim(`\nPlugin commands available:`))
		for (const cmd of allCommands.slice(0, 5)) {
			const entry = manifest.commands[cmd]
			const source = entry.plugin ? `[${entry.plugin}]` : '[project]'
			console.log(`  robo ${cmd} ${color.dim(source)}`)
		}
		if (allCommands.length > 5) {
			console.log(color.dim(`  ... and ${allCommands.length - 5} more`))
		}
	}

	console.log('')
	logger.info(`Try ${color.bold(color.blue('robo --help'))} to see all available commands.`)
	console.log('')
	await logger.flush()
	process.exit(EXIT_ERROR)
}

/**
 * Run extension hooks for a core command.
 * Call this at the start of a core command handler to run before/after hooks.
 *
 * @param commandName - The name of the core command (e.g., 'dev', 'build')
 * @param args - Positional arguments
 * @param options - Parsed options
 * @param handler - The original handler function to wrap
 */
export async function runWithExtensions<T = unknown>(
	commandName: string,
	args: string[],
	options: Record<string, unknown>,
	handler: () => Promise<T> | T
): Promise<T | undefined> {
	// Load manifest
	const manifest = await loadCliManifest()

	if (!manifest) {
		// No manifest, just run the handler
		return await handler()
	}

	// Get extensions for this command (now supports nested command paths)
	const extensions = getExtensions(manifest, commandName)

	if (extensions.length === 0) {
		// No extensions, just run the handler
		return await handler()
	}

	// Load extensions
	const loadedExtensions: LoadedCliExtension[] = []
	for (const ext of extensions) {
		const loaded = await loadCliExtension(ext)
		if (loaded) {
			loadedExtensions.push(loaded)
		}
	}

	// Create context with appropriate logger
	const context: CliContext = {
		args,
		options,
		logger,
		cwd: process.cwd(),
		argv: process.argv.slice(2)
	}

	// Load environment variables before running extension hooks
	// This ensures plugins can access env vars like DISCORD_TOKEN in their before hooks
	const envMode = resolveCliMode(options.mode as string | undefined) ?? Mode.get()
	await Env.load({ mode: envMode })

	// Run before hooks (highest priority first, already sorted)
	for (const ext of loadedExtensions) {
		if (ext.before) {
			const result = await ext.before(context)
			if (result === false) {
				logger.debug(`Command "${commandName}" aborted by before hook from ${ext.plugin ?? 'project'}`)
				return undefined
			}
		}
	}

	// Run the original handler and capture result
	const handlerResult = await handler()
	context.result = handlerResult

	// Run after hooks (lowest priority first, reverse order)
	for (const ext of [...loadedExtensions].reverse()) {
		if (ext.after) {
			await ext.after(context)
		}
	}

	return handlerResult
}

/**
 * Get merged options for a core command including extensions.
 * Call this to get the full list of options including plugin-provided ones.
 *
 * @param commandName - The name of the core command
 * @param coreOptions - The core command's options
 */
export async function getMergedOptionsForCommand(
	commandName: string,
	coreOptions: CliOptionConfig[] = []
): Promise<CliOptionConfig[]> {
	const manifest = await loadCliManifest()

	if (!manifest) {
		return coreOptions
	}

	const extensions = getExtensions(manifest, commandName)
	return mergeOptions(coreOptions, extensions)
}

// =========================================================================
// Terminal Command Loading
// =========================================================================

/**
 * Load the terminal commands section from the CLI manifest.
 * Falls back to runtime discovery if no manifest exists.
 */
export async function loadTerminalManifest(): Promise<Record<string, TerminalCommandEntry> | null> {
	const manifest = await loadCliManifest()

	if (!manifest) {
		return null
	}

	return manifest.terminal && Object.keys(manifest.terminal).length > 0 ? manifest.terminal : null
}

/**
 * Context needed for terminal command registration.
 */
export interface TerminalRegistrationContext {
	config: Config
	runtime?: RuntimeProvider
}

/**
 * Build lazy terminal commands from the manifest for interactive CLI registration.
 * Returns an array of LazyCliCommand objects that can be passed to registerTerminal().
 * Only top-level commands are returned; subcommands are dispatched by the parent handler.
 */
export function buildTerminalCommands(
	terminal: Record<string, TerminalCommandEntry>,
	ctx: TerminalRegistrationContext
): Array<import('./cli-commands.js').LazyCliCommand> {
	const result: Array<import('./cli-commands.js').LazyCliCommand> = []

	for (const [commandPath, entry] of Object.entries(terminal)) {
		const parts = commandPath.split(' ')

		// Only register top-level commands; subcommands are dispatched by parent
		if (parts.length > 1) {
			continue
		}

		const name = parts[0]

		result.push({
			name,
			description: entry.description,
			load: async () => ({
				handler: createTerminalHandler(commandPath, entry, terminal, ctx)
			})
		})
	}

	return result
}

/**
 * Create a handler function for a terminal command entry.
 * Handles both direct commands and parent commands with subcommands.
 */
function createTerminalHandler(
	commandPath: string,
	entry: TerminalCommandEntry,
	allTerminal: Record<string, TerminalCommandEntry>,
	ctx: TerminalRegistrationContext
): (args: string[], cmdCtx: import('./cli-commands.js').CliCommandContext) => void | Promise<void> {
	return async (args: string[]) => {
		// Check if the first arg is a subcommand
		if (args.length > 0 && entry.subcommands?.includes(args[0])) {
			const subName = args[0]
			const subPath = `${commandPath} ${subName}`
			const subEntry = allTerminal[subPath]

			if (subEntry) {
				// Recursively handle (supports nested subcommands)
				const subHandler = createTerminalHandler(subPath, subEntry, allTerminal, ctx)
				return subHandler(args.slice(1), {} as import('./cli-commands.js').CliCommandContext)
			}
		}

		// No subcommand match — execute this command
		if (!entry.path) {
			// Auto-generated parent command: list subcommands
			process.stdout.write(`Available subcommands for /${commandPath}:\n`)
			if (entry.subcommands) {
				for (const sub of entry.subcommands) {
					const subEntry = allTerminal[`${commandPath} ${sub}`]
					const desc = subEntry?.description ? ` - ${subEntry.description}` : ''
					process.stdout.write(`  /${commandPath} ${sub}${desc}\n`)
				}
			}
			process.stdout.write('\n')
			return
		}

		// Parse options
		const options = entry.options ?? []
		const { parsedOptions, positionalArgs, errors } = parseCliOptions(args, options)

		if (errors.length > 0) {
			for (const error of errors) {
				process.stdout.write(`Error: ${error}\n`)
			}
			return
		}

		// Build terminal context
		const terminalCtx: TerminalContext = {
			args: positionalArgs,
			options: parsedOptions,
			config: ctx.config,
			runtime: ctx.runtime,
			write: (text: string) => process.stdout.write(text)
		}

		// Dynamically import and execute the handler
		try {
			const module = await import(pathToFileURL(entry.path).href)

			if (typeof module.default !== 'function') {
				process.stdout.write(`Terminal command at ${entry.path} is missing default handler\n`)
				return
			}

			await module.default(terminalCtx)
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			process.stdout.write(`Error executing /${commandPath}: ${message}\n`)
			logger.debug('Terminal command error:', error)
		}
	}
}

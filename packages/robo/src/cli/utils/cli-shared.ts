/**
 * CLI Shared Utilities
 *
 * Common discovery and scanning logic used by both build-time and runtime CLI discovery.
 * Reduces code duplication between cli-discovery.ts and cli-loader.ts.
 */

import type { Dirent } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { logger as createLogger } from '../../core/logger.js'
import { RoboPaths } from '../../core/paths.js'
import type { CliCommandEntry, CliExtensionEntry, CliOptionConfig, TerminalCommandEntry } from '../../types/cli.js'

const logger = createLogger().fork('cli')

/** Priority boost applied to project commands over plugin commands */
export const PROJECT_PRIORITY_BOOST = 100

/** Default help option added to all CLI commands */
export const DEFAULT_HELP_OPTION: CliOptionConfig = {
	alias: '-h',
	name: '--help',
	description: 'Shows the available command options',
	type: 'boolean'
}

/**
 * Check if a path exists.
 */
export async function pathExists(p: string): Promise<boolean> {
	try {
		await fs.access(p)
		return true
	} catch {
		return false
	}
}

/**
 * Get possible CLI directory paths for a plugin.
 * Plugins don't use mode-specific builds - they're pre-built.
 */
export function getPluginCliPaths(pluginName: string): string[] {
	return [
		path.join(RoboPaths.pluginBuild(pluginName), 'robo', 'cli'),
		path.join(process.cwd(), 'node_modules', pluginName, 'dist', 'robo', 'cli')
	]
}

/**
 * Get the CLI directory path for a plugin.
 */
export async function getPluginCliDir(pluginName: string): Promise<string | null> {
	for (const cliDir of getPluginCliPaths(pluginName)) {
		if (await pathExists(cliDir)) {
			return cliDir
		}
	}
	return null
}

/**
 * Get the project CLI directory path.
 * Uses mode-specific build directory: .robo/build/{mode}/robo/cli
 *
 * @param mode - Runtime mode for mode-specific path resolution (defaults to 'production')
 */
export function getProjectCliDir(mode?: string): string {
	return path.join(RoboPaths.build(mode ?? 'production'), 'robo', 'cli')
}

export interface ScanOptions {
	/** Whether to require config export (build-time: true, runtime: false for flexibility) */
	requireConfig?: boolean
	/** Priority boost to add (used for project commands) */
	priorityBoost?: number
	/** Enable cache busting for imports (useful in dev mode) */
	cacheBust?: boolean
}

/**
 * Import a module with optional cache busting.
 */
async function importModule(filePath: string, cacheBust: boolean): Promise<Record<string, unknown>> {
	let importPath = pathToFileURL(filePath).href
	if (cacheBust) {
		importPath += `?t=${Date.now()}`
	}
	return await import(importPath)
}

/**
 * Validate and extract option config from a module.
 */
function validateOptions(options: unknown): CliOptionConfig[] | undefined {
	if (!Array.isArray(options)) {
		return undefined
	}

	return options.filter((opt): opt is CliOptionConfig => {
		if (typeof opt !== 'object' || opt === null) {
			return false
		}
		const o = opt as Record<string, unknown>
		// Must have alias and name as strings
		if (typeof o.alias !== 'string' || typeof o.name !== 'string') {
			logger.debug('Invalid option: missing alias or name')
			return false
		}
		// Validate alias format (-x or -abc) - must start with single dash, at least 2 chars
		if (!o.alias.startsWith('-') || o.alias.startsWith('--') || o.alias.length < 2) {
			logger.debug(`Invalid option alias format: ${o.alias} (expected -x or -abc format)`)
			return false
		}
		// Validate name format (--name)
		if (!o.name.startsWith('--') || o.name.length < 4) {
			logger.debug(`Invalid option name format: ${o.name} (expected --name with at least 2 chars)`)
			return false
		}
		return true
	})
}

/**
 * Recursively scan commands directory to discover commands.
 * Returns commands indexed by command path (e.g., 'tunnel start').
 */
export async function scanCommands(
	dir: string,
	pluginName: string | null,
	options: ScanOptions = {}
): Promise<{ commands: Record<string, CliCommandEntry>; subcommandMap: Map<string, string[]> }> {
	const commands: Record<string, CliCommandEntry> = {}
	const subcommandMap = new Map<string, string[]>()

	await scanCommandsRecursive(dir, '', pluginName, commands, subcommandMap, options)

	return { commands, subcommandMap }
}

async function scanCommandsRecursive(
	dir: string,
	prefix: string,
	pluginName: string | null,
	commands: Record<string, CliCommandEntry>,
	subcommandMap: Map<string, string[]>,
	options: ScanOptions
): Promise<void> {
	const { requireConfig = false, priorityBoost = 0, cacheBust = false } = options

	let entries: Dirent[]
	try {
		entries = await fs.readdir(dir, { withFileTypes: true })
	} catch (error) {
		logger.debug(`Failed to read commands directory ${dir}:`, error)
		return
	}

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name)

		if (entry.isDirectory()) {
			// Recurse into subdirectory with prefix
			const subPrefix = prefix ? `${prefix} ${entry.name}` : entry.name
			await scanCommandsRecursive(fullPath, subPrefix, pluginName, commands, subcommandMap, options)
		} else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
			const baseName = entry.name.replace(/\.(js|mjs)$/, '')

			// Skip top-level index, use index in subdirs as parent command
			if (baseName === 'index' && !prefix) continue

			const commandPath = baseName === 'index' ? prefix : prefix ? `${prefix} ${baseName}` : baseName

			try {
				const module = await importModule(fullPath, cacheBust)
				const config = module.config as
					| { description?: string; options?: unknown; priority?: number; positionalArgs?: boolean }
					| undefined

				// Check if config is required
				if (requireConfig && !config) {
					logger.warn(`CLI command at ${fullPath} is missing 'config' export`)
					continue
				}

				// Validate handler exists
				if (typeof module.default !== 'function') {
					logger.debug(`CLI command at ${fullPath} is missing default handler export`)
					continue
				}

				const basePriority = config?.priority ?? 0
				const priority = basePriority + priorityBoost

				// Check for existing command with higher priority
				const existing = commands[commandPath]
				if (existing && existing.priority > priority) {
					logger.debug(
						`CLI command "${commandPath}" from ${pluginName ?? 'project'} skipped (lower priority than ${existing.plugin ?? 'project'})`
					)
					continue
				}

				if (existing && existing.priority === priority && existing.plugin !== pluginName) {
					logger.warn(
						`CLI command "${commandPath}" defined by both ${existing.plugin ?? 'project'} and ${pluginName ?? 'project'}. Using ${pluginName ?? 'project'}.`
					)
				}

				commands[commandPath] = {
					path: fullPath,
					plugin: pluginName,
					description: config?.description ?? '',
					priority,
					options: validateOptions(config?.options),
					positionalArgs: config?.positionalArgs
				}

				// Track subcommands for parent commands
				if (prefix) {
					// This is a subcommand - register it with parent
					const parentParts = prefix.split(' ')
					for (let i = 0; i < parentParts.length; i++) {
						const parentPath = parentParts.slice(0, i + 1).join(' ')
						const childName = i === parentParts.length - 1 ? baseName : parentParts[i + 1]

						if (!subcommandMap.has(parentPath)) {
							subcommandMap.set(parentPath, [])
						}
						const subs = subcommandMap.get(parentPath)!
						if (baseName !== 'index' && !subs.includes(childName)) {
							subs.push(childName)
						}
					}
				}
			} catch (error) {
				logger.debug(`Failed to load CLI command from ${fullPath}:`, error)
			}
		}
	}
}

/**
 * Scan extensions directory to discover command extensions.
 * Returns extensions indexed by target command path.
 * Supports nested folders: extend/cloud/status.ts → "cloud status"
 */
export async function scanExtensions(
	dir: string,
	pluginName: string | null,
	options: ScanOptions = {}
): Promise<Record<string, CliExtensionEntry[]>> {
	const extensions: Record<string, CliExtensionEntry[]> = {}
	await scanExtensionsRecursive(dir, '', pluginName, extensions, options)
	return extensions
}

async function scanExtensionsRecursive(
	dir: string,
	prefix: string,
	pluginName: string | null,
	extensions: Record<string, CliExtensionEntry[]>,
	options: ScanOptions
): Promise<void> {
	const { requireConfig = false, priorityBoost = 0, cacheBust = false } = options

	let entries: Dirent[]
	try {
		entries = await fs.readdir(dir, { withFileTypes: true })
	} catch (error) {
		logger.debug(`Failed to read extensions directory ${dir}:`, error)
		return
	}

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name)

		if (entry.isDirectory()) {
			// Recurse into subdirectory with prefix
			const subPrefix = prefix ? `${prefix} ${entry.name}` : entry.name
			await scanExtensionsRecursive(fullPath, subPrefix, pluginName, extensions, options)
		} else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
			const baseName = entry.name.replace(/\.(js|mjs)$/, '')

			// Build target command from path: extend/cloud/status.ts → "cloud status"
			const targetCommand = prefix ? `${prefix} ${baseName}` : baseName

			try {
				const module = await importModule(fullPath, cacheBust)
				const config = module.config as { options?: unknown; priority?: number } | undefined

				if (requireConfig && !config) {
					logger.warn(`CLI extension at ${fullPath} is missing 'config' export`)
					continue
				}

				if (!extensions[targetCommand]) {
					extensions[targetCommand] = []
				}

				const basePriority = config?.priority ?? 0

				extensions[targetCommand].push({
					path: fullPath,
					plugin: pluginName,
					priority: basePriority + priorityBoost,
					options: validateOptions(config?.options),
					hasBefore: typeof module.before === 'function',
					hasAfter: typeof module.after === 'function'
				})
			} catch (error) {
				logger.debug(`Failed to load CLI extension from ${fullPath}:`, error)
			}
		}
	}
}

/**
 * Merge extensions from multiple sources, sorting by priority.
 */
export function mergeExtensions(
	...sources: Record<string, CliExtensionEntry[]>[]
): Record<string, CliExtensionEntry[]> {
	const merged: Record<string, CliExtensionEntry[]> = {}

	for (const source of sources) {
		for (const [target, exts] of Object.entries(source)) {
			if (!merged[target]) {
				merged[target] = []
			}
			merged[target].push(...exts)
		}
	}

	// Sort all extensions by priority (highest first)
	for (const target of Object.keys(merged)) {
		merged[target].sort((a, b) => b.priority - a.priority)
	}

	return merged
}

/**
 * Apply subcommand map to command entries.
 */
export function applySubcommands(
	commands: Record<string, { subcommands?: string[] }>,
	subcommandMap: Map<string, string[]>
): void {
	for (const [cmdPath, subs] of subcommandMap) {
		if (commands[cmdPath]) {
			commands[cmdPath].subcommands = subs
		}
	}
}

/**
 * Parse a string value to its appropriate type.
 * Returns { value, error } to allow validation feedback.
 */
function parseValue(
	value: string,
	type: CliOptionConfig['type'],
	optionName: string
): { value: unknown; error?: string } {
	if (type === 'number') {
		// Reject empty strings
		if (value.trim() === '') {
			return { value: undefined, error: `Missing value for ${optionName}` }
		}
		const num = Number(value)
		// Reject NaN and Infinity values
		if (Number.isNaN(num) || !Number.isFinite(num)) {
			return { value: undefined, error: `Invalid number for ${optionName}: "${value}"` }
		}
		return { value: num }
	}
	if (type === 'boolean') {
		// Handle string boolean values
		const lower = value.toLowerCase()
		if (lower === 'true' || lower === '1' || lower === 'yes') {
			return { value: true }
		}
		if (lower === 'false' || lower === '0' || lower === 'no') {
			return { value: false }
		}
		// If not a recognized boolean string, treat as truthy (presence = true)
		return { value: true }
	}
	return { value }
}

export interface ParseCliOptionsConfig {
	/**
	 * When true, non-option arguments following an option are consumed as part of its value.
	 * E.g., `--comment this is my comment` becomes { comment: "this is my comment" }
	 * Default: false
	 */
	allowSpacesInOptions?: boolean
	/**
	 * When true, suppress warnings for unknown options.
	 * Useful for initial parsing when extensions may add additional options.
	 * Default: false
	 */
	suppressUnknownWarnings?: boolean
}

/**
 * Parse options from command line arguments.
 * Supports:
 * - Long options: --option value, --option=value
 * - Short options: -o value, -o=value
 * - Double-dash separator: -- (everything after is positional)
 * - Multi-word values when allowSpacesInOptions is enabled
 * Warns about unknown options and validates required options.
 */
export function parseCliOptions(
	args: string[],
	options: CliOptionConfig[],
	config: ParseCliOptionsConfig = {}
): { parsedOptions: Record<string, unknown>; positionalArgs: string[]; errors: string[] } {
	const { allowSpacesInOptions = false, suppressUnknownWarnings = false } = config
	const parsedOptions: Record<string, unknown> = {}
	const positionalArgs: string[] = []
	const errors: string[] = []
	let i = 0
	let endOfOptions = false // Track if we've seen --

	// Set defaults
	for (const opt of options) {
		if (opt.default !== undefined) {
			const key = opt.name.replace(/^--/, '')
			parsedOptions[key] = opt.default
		}
	}

	while (i < args.length) {
		const arg = args[i]

		// Handle -- separator (everything after is positional)
		if (arg === '--' && !endOfOptions) {
			endOfOptions = true
			i++
			continue
		}

		// After --, treat everything as positional
		if (endOfOptions) {
			positionalArgs.push(arg)
			i++
			continue
		}

		if (arg.startsWith('--')) {
			// Check for --option=value syntax
			const equalsIndex = arg.indexOf('=')
			let optionName: string
			let inlineValue: string | undefined

			if (equalsIndex !== -1) {
				optionName = arg.slice(0, equalsIndex)
				inlineValue = arg.slice(equalsIndex + 1)
			} else {
				optionName = arg
			}

			const option = options.find((opt) => opt.name === optionName)
			if (option) {
				const key = optionName.slice(2)

				if (inlineValue !== undefined) {
					// --option=value syntax
					const { value, error } = parseValue(inlineValue, option.type, optionName)
					if (error) {
						errors.push(error)
					} else {
						parsedOptions[key] = value
					}
					i++
				} else if (option.type === 'boolean' || i + 1 >= args.length || args[i + 1].startsWith('-')) {
					parsedOptions[key] = true
					i++
				} else if (allowSpacesInOptions) {
					// Consume all following non-option arguments as value
					let value = args[i + 1]
					i += 2
					while (i < args.length && !args[i].startsWith('-')) {
						value += ` ${args[i]}`
						i++
					}
					const { value: parsed, error } = parseValue(value, option.type, optionName)
					if (error) {
						errors.push(error)
					} else {
						parsedOptions[key] = parsed
					}
				} else {
					const rawValue = args[i + 1]
					const { value, error } = parseValue(rawValue, option.type, optionName)
					if (error) {
						errors.push(error)
					} else {
						parsedOptions[key] = value
					}
					i += 2
				}
			} else {
				// Unknown option - warn and skip both option and its potential value
				if (!suppressUnknownWarnings) {
					logger.warn(`Unknown option: ${optionName}`)
				}
				i++
				// If there's a value that looks like a value (not another option), skip it too
				if (inlineValue === undefined && i < args.length && !args[i].startsWith('-')) {
					logger.debug(`Skipping value for unknown option: ${args[i]}`)
					i++
				}
			}
		} else if (arg.startsWith('-') && arg.length > 1 && !arg.startsWith('--')) {
			// Handle short option with = syntax: -p=8080
			const equalsIndex = arg.indexOf('=')
			let optionAlias: string
			let inlineValue: string | undefined

			if (equalsIndex !== -1) {
				optionAlias = arg.slice(0, equalsIndex)
				inlineValue = arg.slice(equalsIndex + 1)
			} else {
				optionAlias = arg
			}

			const option = options.find((opt) => opt.alias === optionAlias)
			if (option) {
				const key = option.name.slice(2)

				if (inlineValue !== undefined) {
					// -o=value syntax
					const { value, error } = parseValue(inlineValue, option.type, option.name)
					if (error) {
						errors.push(error)
					} else {
						parsedOptions[key] = value
					}
					i++
				} else if (option.type === 'boolean' || i + 1 >= args.length || args[i + 1].startsWith('-')) {
					parsedOptions[key] = true
					i++
				} else if (allowSpacesInOptions) {
					// Consume all following non-option arguments as value
					let value = args[i + 1]
					i += 2
					while (i < args.length && !args[i].startsWith('-')) {
						value += ` ${args[i]}`
						i++
					}
					const { value: parsed, error } = parseValue(value, option.type, option.name)
					if (error) {
						errors.push(error)
					} else {
						parsedOptions[key] = parsed
					}
				} else {
					const rawValue = args[i + 1]
					const { value, error } = parseValue(rawValue, option.type, option.name)
					if (error) {
						errors.push(error)
					} else {
						parsedOptions[key] = value
					}
					i += 2
				}
			} else {
				// Unknown short option - warn and skip both option and its potential value
				if (!suppressUnknownWarnings) {
					logger.warn(`Unknown option: ${optionAlias}`)
				}
				i++
				// If there's a value that looks like a value (not another option), skip it too
				if (inlineValue === undefined && i < args.length && !args[i].startsWith('-')) {
					logger.debug(`Skipping value for unknown option: ${args[i]}`)
					i++
				}
			}
		} else {
			positionalArgs.push(arg)
			i++
		}
	}

	// Validate required options
	for (const opt of options) {
		if (opt.required) {
			const key = opt.name.replace(/^--/, '')
			if (parsedOptions[key] === undefined) {
				errors.push(`Required option missing: ${opt.name} (${opt.alias})`)
			}
		}
	}

	return { parsedOptions, positionalArgs, errors }
}

// =========================================================================
// Terminal Command Scanning
// =========================================================================

/**
 * Get possible terminal command directory paths for a plugin.
 * Plugins don't use mode-specific builds - they're pre-built.
 */
export function getPluginTerminalPaths(pluginName: string): string[] {
	return [
		path.join(RoboPaths.pluginBuild(pluginName), 'robo', 'terminal', 'commands'),
		path.join(process.cwd(), 'node_modules', pluginName, 'dist', 'robo', 'terminal', 'commands')
	]
}

/**
 * Get the terminal command directory path for a plugin.
 */
export async function getPluginTerminalDir(pluginName: string): Promise<string | null> {
	for (const terminalDir of getPluginTerminalPaths(pluginName)) {
		if (await pathExists(terminalDir)) {
			return terminalDir
		}
	}
	return null
}

/**
 * Get the project terminal command directory path.
 * Uses mode-specific build directory: .robo/build/{mode}/robo/terminal/commands
 *
 * @param mode - Runtime mode for mode-specific path resolution (defaults to 'production')
 */
export function getProjectTerminalDir(mode?: string): string {
	return path.join(RoboPaths.build(mode ?? 'production'), 'robo', 'terminal', 'commands')
}

/**
 * Recursively scan terminal commands directory to discover commands.
 * Returns commands indexed by command path (e.g., 'tunnel start').
 *
 * Shares the same scanning logic as CLI commands since both use the same
 * config/handler module convention.
 */
export async function scanTerminalCommands(
	dir: string,
	pluginName: string | null,
	options: ScanOptions = {}
): Promise<{ commands: Record<string, TerminalCommandEntry>; subcommandMap: Map<string, string[]> }> {
	const commands: Record<string, TerminalCommandEntry> = {}
	const subcommandMap = new Map<string, string[]>()

	await scanTerminalCommandsRecursive(dir, '', pluginName, commands, subcommandMap, options)

	return { commands, subcommandMap }
}

async function scanTerminalCommandsRecursive(
	dir: string,
	prefix: string,
	pluginName: string | null,
	commands: Record<string, TerminalCommandEntry>,
	subcommandMap: Map<string, string[]>,
	options: ScanOptions
): Promise<void> {
	const { requireConfig = false, priorityBoost = 0, cacheBust = false } = options

	let entries: Dirent[]
	try {
		entries = await fs.readdir(dir, { withFileTypes: true })
	} catch (error) {
		logger.debug(`Failed to read terminal commands directory ${dir}:`, error)
		return
	}

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name)

		if (entry.isDirectory()) {
			// Recurse into subdirectory with prefix
			const subPrefix = prefix ? `${prefix} ${entry.name}` : entry.name
			await scanTerminalCommandsRecursive(fullPath, subPrefix, pluginName, commands, subcommandMap, options)
		} else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
			const baseName = entry.name.replace(/\.(js|mjs)$/, '')

			// Skip top-level index, use index in subdirs as parent command
			if (baseName === 'index' && !prefix) continue

			const commandPath = baseName === 'index' ? prefix : prefix ? `${prefix} ${baseName}` : baseName

			try {
				const module = await importModule(fullPath, cacheBust)
				const config = module.config as
					| { description?: string; options?: unknown; priority?: number; positionalArgs?: boolean }
					| undefined

				// Check if config is required
				if (requireConfig && !config) {
					logger.warn(`Terminal command at ${fullPath} is missing 'config' export`)
					continue
				}

				// Validate handler exists
				if (typeof module.default !== 'function') {
					logger.debug(`Terminal command at ${fullPath} is missing default handler export`)
					continue
				}

				const basePriority = config?.priority ?? 0
				const priority = basePriority + priorityBoost

				// Check for existing command with higher priority
				const existing = commands[commandPath]
				if (existing && existing.priority > priority) {
					logger.debug(
						`Terminal command "${commandPath}" from ${pluginName ?? 'project'} skipped (lower priority than ${existing.plugin ?? 'project'})`
					)
					continue
				}

				if (existing && existing.priority === priority && existing.plugin !== pluginName) {
					logger.warn(
						`Terminal command "${commandPath}" defined by both ${existing.plugin ?? 'project'} and ${pluginName ?? 'project'}. Using ${pluginName ?? 'project'}.`
					)
				}

				commands[commandPath] = {
					path: fullPath,
					plugin: pluginName,
					description: config?.description ?? '',
					priority,
					options: validateOptions(config?.options),
					positionalArgs: config?.positionalArgs
				}

				// Track subcommands for parent commands
				if (prefix) {
					const parentParts = prefix.split(' ')
					for (let i = 0; i < parentParts.length; i++) {
						const parentPath = parentParts.slice(0, i + 1).join(' ')
						const childName = i === parentParts.length - 1 ? baseName : parentParts[i + 1]

						if (!subcommandMap.has(parentPath)) {
							subcommandMap.set(parentPath, [])
						}
						const subs = subcommandMap.get(parentPath)!
						if (baseName !== 'index' && !subs.includes(childName)) {
							subs.push(childName)
						}
					}
				}
			} catch (error) {
				logger.debug(`Failed to load terminal command from ${fullPath}:`, error)
			}
		}
	}
}

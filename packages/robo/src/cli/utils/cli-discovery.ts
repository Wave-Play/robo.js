/**
 * CLI Discovery Utility
 *
 * Discovers CLI commands and extensions from plugins and the current project.
 * CLI commands are located in /src/robo/cli/commands/
 * CLI extensions are located in /src/robo/cli/extend/
 */

import path from 'node:path'
import { logger } from '../../core/logger.js'
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
	PROJECT_PRIORITY_BOOST
} from './cli-shared.js'
import type { PluginData } from '../../types/common.js'
import type { CliCommandEntry, CliExtensionEntry, CliManifest, TerminalCommandEntry } from '../../types/cli.js'

/**
 * Discover all CLI commands and extensions from plugins.
 */
export async function discoverPluginCli(
	plugins: Map<string, PluginData>
): Promise<{ commands: Record<string, CliCommandEntry>; extensions: Record<string, CliExtensionEntry[]> }> {
	const commands: Record<string, CliCommandEntry> = {}
	const allExtensions: Record<string, CliExtensionEntry[]>[] = []
	const allSubcommandMaps: Map<string, string[]>[] = []
	const loggerInstance = logger()

	for (const [pluginName] of plugins) {
		const cliDir = await getPluginCliDir(pluginName)

		if (!cliDir) {
			continue
		}

		loggerInstance.debug(`Discovering CLI from plugin: ${pluginName}`)

		// Scan commands
		const commandsDir = path.join(cliDir, 'commands')
		if (await pathExists(commandsDir)) {
			const { commands: pluginCommands, subcommandMap } = await scanCommands(commandsDir, pluginName, {
				requireConfig: true
			})

			// Merge commands (respecting priority)
			for (const [cmdPath, entry] of Object.entries(pluginCommands)) {
				const existing = commands[cmdPath]
				if (!existing || entry.priority > existing.priority) {
					commands[cmdPath] = entry
				} else if (entry.priority === existing.priority) {
					loggerInstance.warn(
						`CLI command "${cmdPath}" defined by both ${existing.plugin} and ${pluginName}. Using ${existing.plugin}.`
					)
				}
			}
			allSubcommandMaps.push(subcommandMap)
		}

		// Scan extensions
		const extendDir = path.join(cliDir, 'extend')
		if (await pathExists(extendDir)) {
			const exts = await scanExtensions(extendDir, pluginName, { requireConfig: true })
			allExtensions.push(exts)
		}
	}

	// Apply subcommands to commands
	for (const subcommandMap of allSubcommandMaps) {
		applySubcommands(commands, subcommandMap)
	}

	// Merge and sort extensions
	const extensions = mergeExtensions(...allExtensions)

	return { commands, extensions }
}

/**
 * Discover CLI commands and extensions from the current project.
 *
 * @param mode - Build mode for mode-specific path resolution (defaults to 'production')
 */
export async function discoverProjectCli(mode?: string): Promise<{
	commands: Record<string, CliCommandEntry>
	extensions: Record<string, CliExtensionEntry[]>
}> {
	const cliDir = getProjectCliDir(mode)

	if (!(await pathExists(cliDir))) {
		return { commands: {}, extensions: {} }
	}

	const commands: Record<string, CliCommandEntry> = {}
	const allSubcommandMaps: Map<string, string[]>[] = []

	// Scan commands with priority boost
	const commandsDir = path.join(cliDir, 'commands')
	if (await pathExists(commandsDir)) {
		const { commands: projectCommands, subcommandMap } = await scanCommands(commandsDir, null, {
			requireConfig: true,
			priorityBoost: PROJECT_PRIORITY_BOOST
		})
		Object.assign(commands, projectCommands)
		allSubcommandMaps.push(subcommandMap)
	}

	// Apply subcommands
	for (const subcommandMap of allSubcommandMaps) {
		applySubcommands(commands, subcommandMap)
	}

	// Scan extensions with priority boost
	let extensions: Record<string, CliExtensionEntry[]> = {}
	const extendDir = path.join(cliDir, 'extend')
	if (await pathExists(extendDir)) {
		extensions = await scanExtensions(extendDir, null, {
			requireConfig: true,
			priorityBoost: PROJECT_PRIORITY_BOOST
		})
	}

	return { commands, extensions }
}

// =========================================================================
// Terminal Command Discovery
// =========================================================================

/**
 * Discover terminal commands from plugins.
 */
export async function discoverPluginTerminal(
	plugins: Map<string, PluginData>
): Promise<Record<string, TerminalCommandEntry>> {
	const commands: Record<string, TerminalCommandEntry> = {}
	const allSubcommandMaps: Map<string, string[]>[] = []
	const loggerInstance = logger()

	for (const [pluginName] of plugins) {
		const terminalDir = await getPluginTerminalDir(pluginName)

		if (!terminalDir) {
			continue
		}

		loggerInstance.debug(`Discovering terminal commands from plugin: ${pluginName}`)

		const { commands: pluginCommands, subcommandMap } = await scanTerminalCommands(terminalDir, pluginName, {
			requireConfig: true
		})

		// Merge commands (respecting priority)
		for (const [cmdPath, entry] of Object.entries(pluginCommands)) {
			const existing = commands[cmdPath]
			if (!existing || entry.priority > existing.priority) {
				commands[cmdPath] = entry
			} else if (entry.priority === existing.priority) {
				loggerInstance.warn(
					`Terminal command "${cmdPath}" defined by both ${existing.plugin} and ${pluginName}. Using ${existing.plugin}.`
				)
			}
		}
		allSubcommandMaps.push(subcommandMap)
	}

	// Apply subcommands to commands
	for (const subcommandMap of allSubcommandMaps) {
		applySubcommands(commands, subcommandMap)
	}

	return commands
}

/**
 * Discover terminal commands from the current project.
 *
 * @param mode - Build mode for mode-specific path resolution (defaults to 'production')
 */
export async function discoverProjectTerminal(
	mode?: string
): Promise<Record<string, TerminalCommandEntry>> {
	const terminalDir = getProjectTerminalDir(mode)

	if (!(await pathExists(terminalDir))) {
		return {}
	}

	const { commands, subcommandMap } = await scanTerminalCommands(terminalDir, null, {
		requireConfig: true,
		priorityBoost: PROJECT_PRIORITY_BOOST
	})

	applySubcommands(commands, subcommandMap)

	return commands
}

/**
 * Discover all terminal commands from plugins and project.
 * Project commands have implicit higher priority over plugins.
 *
 * @param plugins - Plugin data map
 * @param mode - Build mode for mode-specific path resolution (defaults to 'production')
 */
export async function discoverAllTerminal(
	plugins: Map<string, PluginData>,
	mode?: string
): Promise<Record<string, TerminalCommandEntry>> {
	const loggerInstance = logger()

	// Discover from plugins first
	const pluginTerminal = await discoverPluginTerminal(plugins)

	// Discover from project (can override plugins)
	const projectTerminal = await discoverProjectTerminal(mode)

	// Merge (project overrides plugins due to priority boost)
	const terminal: Record<string, TerminalCommandEntry> = { ...pluginTerminal }
	for (const [commandPath, entry] of Object.entries(projectTerminal)) {
		const existing = terminal[commandPath]
		if (existing && existing.plugin) {
			loggerInstance.warn(
				`Terminal command "${commandPath}" defined in project shadows plugin command from ${existing.plugin}`
			)
		}
		terminal[commandPath] = entry
	}

	return terminal
}

// =========================================================================
// Combined Discovery
// =========================================================================

/**
 * Discover all CLI commands and extensions from plugins and project.
 * Project commands/extensions have implicit higher priority over plugins.
 *
 * @param plugins - Plugin data map
 * @param mode - Build mode for mode-specific path resolution (defaults to 'production')
 */
export async function discoverAllCli(plugins: Map<string, PluginData>, mode?: string): Promise<CliManifest> {
	const loggerInstance = logger()

	// Discover from plugins first
	const { commands: pluginCommands, extensions: pluginExtensions } = await discoverPluginCli(plugins)

	// Discover from project (can override plugins)
	const { commands: projectCommands, extensions: projectExtensions } = await discoverProjectCli(mode)

	// Merge commands (project overrides plugins due to priority boost)
	const commands: Record<string, CliCommandEntry> = { ...pluginCommands }
	for (const [commandPath, entry] of Object.entries(projectCommands)) {
		const existing = commands[commandPath]
		if (existing && existing.plugin) {
			loggerInstance.warn(
				`CLI command "${commandPath}" defined in project shadows plugin command from ${existing.plugin}`
			)
		}
		// Project commands always win (they have priority boost)
		commands[commandPath] = entry
	}

	// Merge extensions (project extensions go first due to priority boost)
	const extensions = mergeExtensions(projectExtensions, pluginExtensions)

	// Discover terminal commands
	const terminal = await discoverAllTerminal(plugins, mode)

	return { commands, extensions, terminal }
}

/**
 * Runtime discovery for development mode.
 * Scans TypeScript source files directly without requiring a build.
 *
 * @param plugins - Plugin data map
 * @param mode - Build mode for mode-specific path resolution (defaults to 'production')
 */
export async function discoverCliDevMode(plugins: Map<string, PluginData>, mode?: string): Promise<CliManifest> {
	const loggerInstance = logger()

	// In dev mode, check if source directory exists
	const sourceCliDir = path.join(process.cwd(), 'src', 'robo', 'cli')

	// For now, fall back to build directory discovery
	// Full dev mode support with TypeScript compilation will be added later
	if (await pathExists(sourceCliDir)) {
		loggerInstance.debug('CLI dev mode: source directory found, but TypeScript JIT not yet implemented')
	}

	// Use build directory discovery as fallback
	return discoverAllCli(plugins, mode)
}

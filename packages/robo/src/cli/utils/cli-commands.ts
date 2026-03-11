/**
 * Lightweight command registry for `/`-prefixed interactive CLI commands.
 */

import type { Config } from '../../types/index.js'
import type { RuntimeProvider } from './cli-runtime-provider.js'

export interface CliCommand {
	name: string
	description: string
	handler: (args: string[], ctx: CliCommandContext) => void | Promise<void>
}

export interface CliCommandContext {
	config: Config
	registerCommand: (cmd: CliCommand) => void
	unregisterCommand: (name: string) => void
	runtime?: RuntimeProvider
}

export interface LazyCliCommand {
	name: string
	description: string
	load: () => Promise<{ handler: CliCommand['handler'] }>
}

const commands = new Map<string, CliCommand>()
const terminalCommandNames = new Set<string>()

export function register(command: CliCommand) {
	commands.set(command.name, command)
}

/**
 * Register a lazy-loaded command. The handler module is dynamically
 * imported only on first invocation.
 */
export function registerLazy(cmd: LazyCliCommand) {
	commands.set(cmd.name, {
		name: cmd.name,
		description: cmd.description,
		handler: async (args, ctx) => {
			const mod = await cmd.load()
			return mod.handler(args, ctx)
		}
	})
}

export function unregister(name: string) {
	commands.delete(name)
}

/**
 * Execute a slash command. Returns true if command was found.
 */
export async function execute(input: string, ctx: CliCommandContext): Promise<boolean> {
	const trimmed = input.trim()
	if (!trimmed.startsWith('/')) {
		return false
	}

	const parts = trimmed.slice(1).split(/\s+/).filter(Boolean)
	if (parts.length === 0) {
		return false
	}
	const name = parts[0]
	const args = parts.slice(1)

	const command = commands.get(name)
	if (!command) {
		return false
	}

	await command.handler(args, ctx)
	return true
}

export function getSuggestions(partial: string): string[] {
	const prefix = partial.startsWith('/') ? partial.slice(1) : partial
	return Array.from(commands.keys()).filter((name) => name.startsWith(prefix))
}

export function clear() {
	commands.clear()
}

export function getCommands(): CliCommand[] {
	return Array.from(commands.values())
}

/**
 * Register a lazy-loaded terminal command and track it for selective cleanup.
 * Terminal commands come from the file-based convention system (src/robo/terminal/commands/).
 * Skips registration if a non-terminal command with the same name already exists
 * to prevent overwriting built-in commands.
 */
export function registerTerminal(cmd: LazyCliCommand) {
	// Don't overwrite built-in commands (only overwrite other terminal commands)
	if (commands.has(cmd.name) && !terminalCommandNames.has(cmd.name)) {
		return
	}
	terminalCommandNames.add(cmd.name)
	registerLazy(cmd)
}

/**
 * Clear all terminal commands without touching built-in commands.
 * Used during dev-mode rebuilds to re-register terminal commands from fresh manifests.
 */
export function clearTerminalCommands() {
	for (const name of terminalCommandNames) {
		commands.delete(name)
	}
	terminalCommandNames.clear()
}

/**
 * Interactive CLI orchestrator. Ties together scroll regions, stdout interception,
 * stdin handling, and slash commands into a cohesive interactive terminal experience.
 *
 * When TTY is not available (CI, piped output, etc.), this is a no-op —
 * all output passes through normally with zero impact.
 */

import * as regions from './terminal-regions.js'
import * as interceptor from './stdout-interceptor.js'
import * as commandRegistry from './cli-commands.js'
import type { CliCommand, CliCommandContext } from './cli-commands.js'
import type { RuntimeProvider } from './cli-runtime-provider.js'
import type { Config } from '../../types/index.js'

export interface InteractiveCliOptions {
	config: Config
	commands?: CliCommand[]
	runtime?: RuntimeProvider
	onExit?: () => Promise<void>
}

let active = false
let inputBuffer = ''
let status = 'ready'
let commandHistory: string[] = []
let historyIndex = -1
let options: InteractiveCliOptions | null = null
let escapeBuffer = ''
let escapeTimeout: ReturnType<typeof setTimeout> | null = null
let cleanedUp = false
let isExiting = false
let isExecutingCommand = false

function shouldSkip(): boolean {
	if (!process.stdout.isTTY || !process.stdin.isTTY) {
		return true
	}
	if ((process.stdout.rows || 0) < 10 || (process.stdout.columns || 0) < 40) {
		return true
	}
	if (process.env.CI) {
		return true
	}
	if (process.env.ROBO_NON_INTERACTIVE) {
		return true
	}
	return false
}

export function start(opts: InteractiveCliOptions) {
	if (active) {
		return
	}
	if (shouldSkip()) {
		return
	}

	// Reset all state for a clean session
	inputBuffer = ''
	status = 'ready'
	commandHistory = []
	historyIndex = -1
	escapeBuffer = ''
	isExiting = false
	isExecutingCommand = false
	options = opts
	active = true
	cleanedUp = false

	// Set up stdout interception first
	interceptor.install((data: string, _stream: 'stdout' | 'stderr') => {
		regions.writeToLogRegion(data)
	})

	// Set up scroll regions (uses interceptor.writeRaw internally)
	regions.setup((data: string) => {
		interceptor.writeRaw(data, 'stdout')
	})

	// Render initial input
	renderInput()

	// Register built-in commands
	commandRegistry.register({
		name: 'help',
		description: 'List available commands',
		handler: () => {
			const cmds = commandRegistry.getCommands()
			const lines = cmds.map((c) => `  /${c.name} - ${c.description}`)
			process.stdout.write('\nAvailable commands:\n' + lines.join('\n') + '\n\n')
		}
	})

	commandRegistry.register({
		name: 'clear',
		description: 'Clear the log region',
		handler: () => {
			regions.clearLogContent()
		}
	})

	// Register additional commands
	if (opts.commands) {
		for (const cmd of opts.commands) {
			commandRegistry.register(cmd)
		}
	}

	// Enter raw mode for character-by-character input
	try {
		process.stdin.setRawMode(true)
	} catch {
		// Raw mode not supported despite isTTY — bail out cleanly
		regions.teardown()
		interceptor.uninstall()
		active = false
		return
	}
	process.stdin.resume()
	process.stdin.setEncoding('utf8')
	process.stdin.on('data', onStdinData)

	// Re-render input area on resize (scroll region is updated by terminal-regions)
	process.stdout.on('resize', onResize)

	// Cleanup on process exit and termination signals
	process.on('exit', cleanup)
	process.on('SIGTERM', onTermSignal)
	process.on('SIGHUP', onTermSignal)
}

export async function stop() {
	if (!active) {
		return
	}

	setStatus('stopped')
	active = false
	cleanup()
}

export function isActive(): boolean {
	return active
}

export function registerCommand(cmd: CliCommand) {
	commandRegistry.register(cmd)
}

export function setStatus(newStatus: string) {
	status = newStatus
	if (active) {
		renderInput()
	}
}

function renderInput() {
	regions.renderInputRegion(inputBuffer, status, getCommandHint(inputBuffer))
}

function getCommandHint(input: string): string {
	if (!input.startsWith('/')) {
		return ''
	}

	const partial = input.slice(1).toLowerCase()
	const commands = commandRegistry.getCommands()
	const matches = partial
		? commands.filter((c) => c.name.toLowerCase().startsWith(partial))
		: commands

	if (matches.length === 0) {
		return ''
	}

	if (matches.length === 1) {
		return `  /${matches[0].name} \u2014 ${matches[0].description}`
	}

	return '  ' + matches.map((c) => `/${c.name}`).join(' \u00b7 ')
}

export function getOutputCallback(): ((data: string, stream: 'stdout' | 'stderr') => void) | undefined {
	if (!active) {
		return undefined
	}
	return (data: string, _stream: 'stdout' | 'stderr') => {
		if (active) {
			regions.writeToLogRegion(data)
		}
	}
}

function cleanup() {
	if (cleanedUp) {
		return
	}
	cleanedUp = true

	// Restore stdin
	if (process.stdin.isTTY) {
		process.stdin.removeListener('data', onStdinData)
		try {
			process.stdin.setRawMode(false)
		} catch {
			// May fail if stdin is already destroyed
		}
		process.stdin.pause()
	}

	process.stdout.removeListener('resize', onResize)

	// Teardown regions FIRST (while writeRaw still has access to original writer)
	regions.teardown()

	// Then restore stdout/stderr
	interceptor.uninstall()

	process.removeListener('exit', cleanup)
	process.removeListener('SIGTERM', onTermSignal)
	process.removeListener('SIGHUP', onTermSignal)

	if (escapeTimeout) {
		clearTimeout(escapeTimeout)
		escapeTimeout = null
	}

	commandRegistry.clear()
	options = null
}

function onTermSignal() {
	cleanup()
	process.exit(0)
}

function onResize() {
	if (active) {
		renderInput()
	}
}

function onStdinData(data: string) {
	if (!active) return

	for (let i = 0; i < data.length; i++) {
		if (!active) return
		const char = data[i]

		// Handle escape sequences (arrow keys, function keys, etc.)
		if (escapeBuffer.length > 0) {
			if (escapeTimeout) {
				clearTimeout(escapeTimeout)
				escapeTimeout = null
			}

			escapeBuffer += char

			if (escapeBuffer.length === 2 && char === '[') {
				// CSI sequence started — keep accumulating
				continue
			}

			if (escapeBuffer.length === 2 && char === 'O') {
				// SS3 sequence started — keep accumulating
				continue
			}

			if (escapeBuffer.length === 2) {
				// Not CSI or SS3 — discard escape sequence
				escapeBuffer = ''
				// Fall through to process char normally
			} else if (escapeBuffer.length >= 3) {
				const code = char.charCodeAt(0)
				// CSI/SS3 sequences end with a byte in range 0x40-0x7E (@ through ~)
				if (code >= 0x40 && code <= 0x7e) {
					handleEscapeSequence(escapeBuffer)
					escapeBuffer = ''
				}
				// Otherwise keep accumulating (parameter/intermediate bytes 0x20-0x3F)
				continue
			}

			if (escapeBuffer.length > 0) {
				continue
			}
		}

		if (char === '\x1b') {
			escapeBuffer = '\x1b'
			escapeTimeout = setTimeout(() => {
				escapeBuffer = ''
				escapeTimeout = null
			}, 50)
			continue
		}

		// Ctrl+C
		if (char === '\x03') {
			handleExit().catch(() => process.exit(1))
			return
		}

		// Enter
		if (char === '\r' || char === '\n') {
			handleEnter().catch(() => {})
			continue
		}

		// Backspace
		if (char === '\x7f' || char === '\b') {
			if (inputBuffer.length > 0) {
				inputBuffer = inputBuffer.slice(0, -1)
				renderInput()
			}
			continue
		}

		// Printable characters
		if (char >= ' ') {
			inputBuffer += char
			renderInput()
		}
	}
}

function handleEscapeSequence(seq: string) {
	// Up arrow
	if (seq === '\x1b[A') {
		if (commandHistory.length > 0 && historyIndex < commandHistory.length - 1) {
			historyIndex++
			inputBuffer = commandHistory[commandHistory.length - 1 - historyIndex]
			renderInput()
		}
		return
	}

	// Down arrow
	if (seq === '\x1b[B') {
		if (historyIndex > 0) {
			historyIndex--
			inputBuffer = commandHistory[commandHistory.length - 1 - historyIndex]
		} else {
			historyIndex = -1
			inputBuffer = ''
		}
		renderInput()
		return
	}

	// All other escape sequences (Delete, Home, End, F-keys, etc.) are ignored
}

async function handleEnter() {
	if (isExecutingCommand) {
		return
	}

	const input = inputBuffer.trim()
	inputBuffer = ''
	historyIndex = -1
	renderInput()

	if (!input) {
		return
	}

	// Only add slash commands to history
	if (!input.startsWith('/')) {
		return
	}

	commandHistory.push(input)
	if (commandHistory.length > 100) {
		commandHistory.shift()
	}

	const ctx: CliCommandContext = {
		config: options?.config ?? ({} as Config),
		registerCommand: commandRegistry.register,
		unregisterCommand: commandRegistry.unregister,
		runtime: options?.runtime
	}

	isExecutingCommand = true
	try {
		const found = await commandRegistry.execute(input, ctx)
		if (!found) {
			process.stdout.write(`Unknown command: ${input}. Type /help for available commands.\n`)
		}
	} catch (err) {
		process.stdout.write(`Command error: ${err}\n`)
	} finally {
		isExecutingCommand = false
		renderInput()
	}
}

async function handleExit() {
	if (isExiting) {
		// Second Ctrl+C — force exit immediately
		process.exit(1)
	}
	isExiting = true
	setStatus('stopping')

	try {
		if (options?.onExit) {
			await options.onExit()
		} else {
			process.exit(0)
		}
	} catch {
		process.exit(1)
	}
}

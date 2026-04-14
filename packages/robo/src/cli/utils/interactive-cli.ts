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
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import type { CliCommand, CliCommandContext } from './cli-commands.js'
import type { RuntimeProvider } from './cli-runtime-provider.js'
import type { Config } from '../../types/index.js'
import { getShellName, IS_WINDOWS } from './utils.js'

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

// Plugin startup progress
let pluginStatuses = new Map<string, 'starting' | 'ready' | 'error'>()
let totalPlugins = 0
let startupComplete = false

// Status items from plugins (persistent hint line content)
let statusItems = new Map<string, { value: string; priority: number }>()

// Transient notifications
let transientMessage: string | null = null
let transientTimeout: ReturnType<typeof setTimeout> | null = null

// Tips
let tipTimeout: ReturnType<typeof setTimeout> | null = null
let lastInputTime = Date.now()

// Drawer
let drawerContent: string[] | null = null

// Shell delegation
let shellProcess: ChildProcess | null = null
let shellOutputBuffer: string[] = []
let shellOutputDrawerOpen = false
let shellOutputFlushTimer: ReturnType<typeof setTimeout> | null = null
let shellOutputPendingLines: string[] = []
const SHELL_BUFFER_MAX = 1000
const SHELL_FLUSH_INTERVAL = 100

const TIPS = [
	'Type /help to see available commands',
	'Type /status to see system info',
	'Type /restart for a full rebuild',
	'Type /clear to clear the log',
	'Run shell commands directly \u2014 e.g., ls, npm test',
]
const TIP_IDLE_DELAY = 30_000 // 30 seconds

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

	// Reset status tracking
	pluginStatuses = new Map()
	totalPlugins = 0
	startupComplete = false
	statusItems = new Map()
	transientMessage = null
	transientTimeout = null
	drawerContent = null
	lastInputTime = Date.now()
	shellProcess = null
	shellOutputBuffer = []
	shellOutputDrawerOpen = false
	shellOutputPendingLines = []
	if (shellOutputFlushTimer) {
		clearTimeout(shellOutputFlushTimer)
		shellOutputFlushTimer = null
	}

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

	commandRegistry.register({
		name: 'output',
		description: 'Toggle shell output drawer',
		handler: () => {
			if (shellOutputDrawerOpen) {
				hideDrawer()
				return
			}
			if (shellOutputBuffer.length === 0) {
				process.stdout.write('No shell output to display.\n')
				return
			}
			shellOutputDrawerOpen = true
			updateOutputDrawer()
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

	// Start idle tip timer
	resetIdleTimer()
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

// ─── Status tracking (called from dev.ts) ────────────────────────

/** Called by dev.ts when a status-progress event arrives from the spirit */
export function setPluginProgress(plugin: string, pluginStatus: 'starting' | 'ready' | 'error', total?: number) {
	if (total !== undefined) totalPlugins = total

	// Handle zero-plugin case: no start hooks to track, go straight to ready
	if (totalPlugins === 0 && total !== undefined) {
		setStatus('ready')
		startupComplete = true
		if (active) renderInput()
		return
	}

	pluginStatuses.set(plugin, pluginStatus)

	// Count ready/error plugins
	const completed = Array.from(pluginStatuses.values()).filter((s) => s !== 'starting').length

	// Update the status badge with progress
	if (completed < totalPlugins) {
		setStatus(`starting ${completed}/${totalPlugins}`)
	} else if (totalPlugins > 0) {
		setStatus('ready')
	}

	// Update startup display completion (bidirectional — resets if totalPlugins increases)
	startupComplete = completed >= totalPlugins && totalPlugins > 0

	if (active) renderInput()
}

/** Called by dev.ts when a status-set event arrives from the spirit */
export function setStatusItem(key: string, value: string, priority = 100) {
	statusItems.set(key, { value, priority })
	if (active) renderInput()
}

/** Called by dev.ts when a status-remove event arrives */
export function removeStatusItem(key: string) {
	statusItems.delete(key)
	if (active) renderInput()
}

/** Called by dev.ts when a status-flash event arrives */
export function flashNotification(message: string, duration = 3000) {
	if (transientTimeout) clearTimeout(transientTimeout)
	transientMessage = message
	if (active) renderInput()
	transientTimeout = setTimeout(() => {
		transientMessage = null
		transientTimeout = null
		if (active) renderInput()
	}, duration)
}

/** Reset status state on rebuild */
export function resetStatus() {
	pluginStatuses = new Map()
	totalPlugins = 0
	startupComplete = false
	statusItems = new Map()
	if (transientTimeout) {
		clearTimeout(transientTimeout)
		transientTimeout = null
	}
	transientMessage = null
}

/** Expand the input region to show drawer content */
export function showDrawer(lines: string[]) {
	drawerContent = lines
	regions.expandRegion(lines)
	regions.renderDrawerContent(lines)
	renderInput()
}

/** Check if the drawer is currently open */
export function isDrawerOpen(): boolean {
	return drawerContent !== null
}

/** Collapse the drawer back to normal */
export function hideDrawer() {
	if (!drawerContent) return
	drawerContent = null
	shellOutputDrawerOpen = false
	cancelDrawerFlush()
	regions.collapseRegion()
	renderInput()
}

/** Get all status items (for /status command) */
export function getStatusItems(): Map<string, { value: string; priority: number }> {
	return statusItems
}

/** Get plugin startup progress (for /status command) */
export function getPluginStatuses(): Map<string, 'starting' | 'ready' | 'error'> {
	return pluginStatuses
}

// ─── Rendering ───────────────────────────────────────────────────

function renderInput() {
	const badgeColor = getBadgeColor(status)
	// Suppress hint when drawer is open — the drawer already shows status info
	const hint = drawerContent ? '' : getHintContent(inputBuffer)
	regions.renderInputRegion(inputBuffer, status, hint, badgeColor)
}

const SHELL_NAMES = new Set(['zsh', 'bash', 'sh', 'fish', 'dash', 'ksh', 'csh', 'tcsh', 'cmd', 'powershell', 'pwsh'])

function getBadgeColor(s: string): string {
	if (s === 'ready') return 'green'
	if (s === 'error') return 'red'
	if (s.startsWith('starting') || s === 'building' || s === 'restarting') return 'yellow'
	if (s === 'stopping' || s === 'stopped') return 'dim'
	if (SHELL_NAMES.has(s)) return 'cyan'
	return 'dim'
}

function getHintContent(input: string): string {
	// Layer 0: Shell command hint (non-slash input)
	if (input.length > 0 && !input.startsWith('/')) {
		return '  \x1b[2mpress Enter to run as shell command\x1b[0m'
	}

	// Layer 1: Command hints (user is actively typing a slash command)
	if (input.startsWith('/')) {
		return getCommandHint(input)
	}

	// Layer 2: Transient notifications (auto-dismissing)
	if (transientMessage) {
		return '  ' + transientMessage
	}

	// Layer 3: During startup — show plugin progress inline
	if (!startupComplete && pluginStatuses.size > 0) {
		return formatStartupProgress()
	}

	// Layer 4: Persistent status items (URLs, bot tag)
	if (statusItems.size > 0) {
		const formatted = formatStatusItems()
		if (formatted) return formatted
	}

	// Layer 5: Tips (when idle for 30s+)
	if (shouldShowTip()) {
		return formatTip()
	}

	return ''
}

function getCommandHint(input: string): string {
	if (!input.startsWith('/')) {
		return ''
	}

	const partial = input.slice(1).toLowerCase()
	const commands = commandRegistry.getCommands()

	// Check if user typed a full command name + space — show subcommands
	const spaceIdx = partial.indexOf(' ')
	if (spaceIdx > 0) {
		const parentName = partial.slice(0, spaceIdx)
		const subPartial = partial.slice(spaceIdx + 1)
		const parent = commands.find((c) => c.name.toLowerCase() === parentName)

		if (parent?.subcommands?.length) {
			const subMatches = subPartial
				? parent.subcommands.filter((s) => s.toLowerCase().startsWith(subPartial))
				: parent.subcommands

			if (subMatches.length === 0) return ''
			return '  ' + subMatches.map((s) => `/${parent.name} ${s}`).join(' \u00b7 ')
		}
		return ''
	}

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

function formatStartupProgress(): string {
	const parts: string[] = []
	for (const [name, s] of pluginStatuses) {
		const short = inferShortName(name)
		if (s === 'ready') parts.push(`\x1b[32m\u2713\x1b[0m \x1b[2m${short}\x1b[0m`)
		else if (s === 'error') parts.push(`\x1b[31m\u2717\x1b[0m \x1b[2m${short}\x1b[0m`)
		else parts.push(`\x1b[33m\u23F3\x1b[0m \x1b[2m${short}\x1b[0m`)
	}
	return '  ' + parts.join('  ')
}

function formatStatusItems(): string {
	// Only show items with priority <= 10 (hint-line items)
	// Sort by priority (lowest first) and take top 3
	const hintItems = Array.from(statusItems.entries())
		.filter(([, item]) => item.priority <= 10)
		.sort((a, b) => a[1].priority - b[1].priority)
		.slice(0, 3)
		.map(([, item]) => dimForHintLine(item.value))

	if (hintItems.length === 0) return ''
	return '  ' + hintItems.join('  \u00b7  ')
}

/**
 * Dim only the colored parts of status text for the hint line.
 * Foreground color codes get \x1b[2m (dim) prepended so colors appear muted.
 * Foreground resets (\x1b[39m) become \x1b[22;90m to clear dim and restore
 * the hint line's gray baseline.
 */
function dimForHintLine(s: string): string {
	return s
		.replace(/\x1b\[(3[0-8](?:;[0-9;]+)?|9[0-7])m/g, '\x1b[2m\x1b[$1m')
		.replace(/\x1b\[39m/g, '\x1b[22;90m')
}

/** Convert plugin package name to short display name */
export function inferShortName(packageName: string): string {
	// @robojs/server → server
	if (packageName.startsWith('@')) {
		const parts = packageName.split('/')
		return parts[parts.length - 1]
	}
	// plugin-api → api
	if (packageName.startsWith('plugin-')) {
		return packageName.replace('plugin-', '')
	}
	return packageName
}

// ─── Tips ────────────────────────────────────────────────────────

function resetIdleTimer() {
	lastInputTime = Date.now()
	if (tipTimeout) {
		clearTimeout(tipTimeout)
		tipTimeout = null
	}
	// Schedule a re-render after idle delay to show tip
	tipTimeout = setTimeout(() => {
		if (active) renderInput()
	}, TIP_IDLE_DELAY)
}

function shouldShowTip(): boolean {
	return status === 'ready' && Date.now() - lastInputTime >= TIP_IDLE_DELAY
}

function formatTip(): string {
	const index = Math.floor(Date.now() / TIP_IDLE_DELAY) % TIPS.length
	return '  \x1b[2m\u{1F4A1} ' + TIPS[index] + '\x1b[0m'
}

// ─── Output callback ────────────────────────────────────────────

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

// ─── Lifecycle ───────────────────────────────────────────────────

function cleanup() {
	if (cleanedUp) {
		return
	}
	cleanedUp = true

	// Kill any running shell process
	if (shellProcess) {
		try {
			shellProcess.kill('SIGTERM')
		} catch {
			// Already exited
		}
		shellProcess = null
	}
	cancelDrawerFlush()

	// Clear timers
	if (transientTimeout) {
		clearTimeout(transientTimeout)
		transientTimeout = null
	}
	if (tipTimeout) {
		clearTimeout(tipTimeout)
		tipTimeout = null
	}

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
		if (drawerContent) {
			regions.expandRegion(drawerContent)
			regions.renderDrawerContent(drawerContent)
		}
		renderInput()
	}
}

// ─── Input handling ──────────────────────────────────────────────

function onStdinData(data: string) {
	if (!active) return

	// Any input resets the idle timer and dismisses non-pinned drawers
	resetIdleTimer()
	if (drawerContent && !shellOutputDrawerOpen) {
		hideDrawer()
	}

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
			if (shellProcess) {
				// Kill the running shell command instead of exiting Robo
				try {
					if (IS_WINDOWS) {
						spawn('taskkill', ['/pid', String(shellProcess.pid), '/T', '/F'], { stdio: 'ignore' })
					} else {
						shellProcess.kill('SIGINT')
					}
				} catch {
					// Already exited
				}
				process.stdout.write('\x1b[2m(command interrupted)\x1b[0m\n')
				continue
			}
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
		flashNotification('Command running \u2014 Ctrl+C to interrupt', 2000)
		return
	}

	const input = inputBuffer.trim()
	inputBuffer = ''
	historyIndex = -1
	renderInput()

	if (!input) {
		return
	}

	isExecutingCommand = true

	// Shell command delegation for non-slash input
	if (!input.startsWith('/')) {
		commandHistory.push(input)
		if (commandHistory.length > 100) {
			commandHistory.shift()
		}
		try {
			await executeShellCommand(input)
		} finally {
			isExecutingCommand = false
			renderInput()
		}
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

// ─── Shell delegation ────────────────────────────────────────────

async function executeShellCommand(input: string) {
	shellOutputBuffer = []

	// Show shell name badge while command runs
	const shellName = getShellName()
	setStatus(shellName)

	// Log the command being run
	process.stdout.write(`\x1b[2m$ ${input}\x1b[0m\n`)

	return new Promise<void>((resolve) => {
		let child: ChildProcess
		try {
			child = spawn(input, {
				shell: true,
				stdio: 'pipe',
				env: { ...process.env, FORCE_COLOR: '1' }
			})
		} catch (err) {
			process.stdout.write(`\x1b[31mFailed to run command: ${err}\x1b[0m\n`)
			setStatus('error')
			setTimeout(() => {
				if (status === 'error') setStatus('ready')
			}, 2000)
			resolve()
			return
		}
		shellProcess = child
		let settled = false

		const handleOutput = (data: Buffer) => {
			const text = data.toString()

			// Always write to log region (visible immediately)
			process.stdout.write(text)

			// Buffer for later /output review
			const lines = text.split(/\r?\n/)
			for (let j = 0; j < lines.length; j++) {
				// Skip trailing empty string from split
				if (j === lines.length - 1 && lines[j].length === 0) break
				shellOutputBuffer.push(lines[j])
			}
			// Cap buffer size
			if (shellOutputBuffer.length > SHELL_BUFFER_MAX) {
				shellOutputBuffer = shellOutputBuffer.slice(-SHELL_BUFFER_MAX)
			}

			// Queue drawer update if open
			if (shellOutputDrawerOpen) {
				shellOutputPendingLines.push(...lines.filter((l) => l.length > 0))
				scheduleDrawerFlush()
			}
		}

		if (child.stdout) child.stdout.on('data', handleOutput)
		if (child.stderr) child.stderr.on('data', handleOutput)

		child.on('close', (code) => {
			if (settled) return
			settled = true
			shellProcess = null

			if (code !== 0 && code !== null) {
				setStatus('error')
				// Flash error for 2 seconds then restore ready
				setTimeout(() => {
					if (status === 'error') {
						setStatus('ready')
					}
				}, 2000)
			} else {
				setStatus('ready')
			}

			// Final drawer update if open
			if (shellOutputDrawerOpen) {
				cancelDrawerFlush()
				updateOutputDrawer()
			}

			resolve()
		})

		child.on('error', (err) => {
			if (settled) return
			settled = true
			shellProcess = null
			process.stdout.write(`\x1b[31mFailed to run command: ${err.message}\x1b[0m\n`)
			setStatus('error')
			setTimeout(() => {
				if (status === 'error') {
					setStatus('ready')
				}
			}, 2000)
			resolve()
		})
	})
}

function scheduleDrawerFlush() {
	if (shellOutputFlushTimer) return
	shellOutputFlushTimer = setTimeout(flushDrawerOutput, SHELL_FLUSH_INTERVAL)
}

function cancelDrawerFlush() {
	if (shellOutputFlushTimer) {
		clearTimeout(shellOutputFlushTimer)
		shellOutputFlushTimer = null
	}
	shellOutputPendingLines = []
}

function flushDrawerOutput() {
	shellOutputFlushTimer = null
	shellOutputPendingLines = []
	if (shellOutputDrawerOpen) {
		updateOutputDrawer()
	}
}

function updateOutputDrawer() {
	const termRows = process.stdout.rows || 24
	const maxDrawerLines = Math.max(1, termRows - regions.BASE_INPUT_HEIGHT - regions.MIN_SCROLL_HEIGHT)
	const visibleLines = shellOutputBuffer.slice(-maxDrawerLines)

	// Format lines with dim styling and truncate to terminal width (ANSI-aware)
	const cols = process.stdout.columns || 80
	const formatted = visibleLines.map((line) => {
		const truncated = regions.truncateAnsi(line, cols - 4)
		return `\x1b[2m${truncated}\x1b[0m`
	})

	const oldLineCount = drawerContent?.length ?? 0
	drawerContent = formatted

	if (oldLineCount === 0) {
		// First time opening — need full expand
		regions.expandRegion(formatted)
		regions.renderDrawerContent(formatted)
	} else {
		regions.updateDrawerInPlace(oldLineCount, formatted)
	}

	renderInput()
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

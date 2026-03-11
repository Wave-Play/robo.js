/**
 * ANSI scroll region manager for splitting the terminal into a log area (top)
 * and a pinned input area (bottom).
 *
 * Uses DECSTBM (Set Top and Bottom Margins) escape sequences to create a
 * scrolling region for log output while keeping the input prompt fixed.
 */

const INPUT_HEIGHT = 4 // top divider + prompt + bottom divider + spacing
const MIN_SCROLL_HEIGHT = 2
const DIVIDER_CHAR = '\u2500'
const CHEVRON = '\u276f' // ❯

type WriteRawFn = (data: string) => void

let rows = 0
let cols = 0
let scrollBottom = 0
let writeRaw: WriteRawFn
let writeBuffer = ''
let flushScheduled = false
let flushHandle: ReturnType<typeof setImmediate> | null = null
let isSetup = false
let cursorRow = 0
let cursorColumn = 0
let logLinesWritten = 0

function getTerminalSize(): { rows: number; cols: number } {
	return {
		rows: process.stdout.rows || 24,
		cols: process.stdout.columns || 80
	}
}

function scheduleFlush() {
	if (flushScheduled) {
		return
	}
	flushScheduled = true
	flushHandle = setImmediate(flushBuffer)
}

function flushBuffer() {
	flushScheduled = false
	flushHandle = null
	if (!writeBuffer || !isSetup) {
		return
	}

	const data = writeBuffer
	writeBuffer = ''

	// Move to scroll region bottom, write data, then return cursor to tracked position
	try {
		writeRaw(`\x1b[${scrollBottom};1H${data}\x1b[${cursorRow};${cursorColumn}H`)

		// Track lines written so /clear knows how many rows contain log output
		for (let i = 0; i < data.length; i++) {
			if (data[i] === '\n') logLinesWritten++
		}
	} catch {
		// Terminal write failed — attempt to restore cursor
		try {
			writeRaw(`\x1b[${cursorRow};${cursorColumn}H`)
		} catch {
			// Terminal state is unrecoverable
		}
	}
}

export function setup(rawWriter: WriteRawFn) {
	if (isSetup) {
		return
	}

	writeRaw = rawWriter
	const size = getTerminalSize()
	rows = size.rows
	cols = size.cols
	scrollBottom = rows - INPUT_HEIGHT

	if (scrollBottom < MIN_SCROLL_HEIGHT) {
		// Terminal too small for scroll regions — skip setup
		return
	}

	// Initialize cursor tracking to prompt position
	cursorRow = rows - 2
	cursorColumn = 3 // After "❯ "

	// Push existing terminal content up to make room for the input area.
	// Without this, the input region rendering clears lines that may still
	// contain recently-printed messages (e.g. the startup banner).
	writeRaw(`\x1b[${rows};1H` + '\n'.repeat(INPUT_HEIGHT))

	// Set scroll region to top portion
	writeRaw(`\x1b[1;${scrollBottom}r`)

	// Move cursor to prompt row
	writeRaw(`\x1b[${cursorRow};${cursorColumn}H`)

	isSetup = true

	// Flush any data that was buffered before setup completed
	if (writeBuffer) {
		scheduleFlush()
	}

	// Listen for resize
	process.stdout.on('resize', onResize)
}

export function teardown() {
	if (!isSetup) {
		return
	}

	process.stdout.removeListener('resize', onResize)

	// Cancel any pending setImmediate flush
	if (flushHandle) {
		clearImmediate(flushHandle)
		flushHandle = null
	}

	// Flush pending writes synchronously BEFORE disabling
	if (writeBuffer) {
		const data = writeBuffer
		writeBuffer = ''
		try {
			writeRaw(`\x1b[${scrollBottom};1H${data}`)
		} catch {
			// Best effort
		}
	}
	writeBuffer = ''

	flushScheduled = false
	isSetup = false

	// Reset scroll region
	writeRaw('\x1b[r')

	// Move cursor below everything
	writeRaw(`\x1b[${rows};1H\n`)
}

export function writeToLogRegion(data: string) {
	writeBuffer += data
	if (isSetup) {
		scheduleFlush()
	}
}

export function clearLogContent() {
	if (!isSetup || logLinesWritten === 0) {
		return
	}

	// Only clear rows that contain log output, preserving pre-existing content
	// (e.g. the startup banner) at the top of the scroll region.
	const rowsToClear = Math.min(logLinesWritten, scrollBottom)
	const startRow = scrollBottom - rowsToClear + 1
	let clearStr = ''
	for (let i = startRow; i <= scrollBottom; i++) {
		clearStr += `\x1b[${i};1H\x1b[2K`
	}
	writeRaw(clearStr)
	logLinesWritten = 0
}

export function renderInputRegion(inputText: string, status: string, hint?: string) {
	if (!isSetup) {
		return
	}

	const divider = DIVIDER_CHAR.repeat(cols)
	const statusBadge = `[${status}]`
	const maxPromptLen = Math.max(4, cols - statusBadge.length - 1)
	const fullPrompt = `${CHEVRON} ${inputText}`
	const prompt = fullPrompt.length > maxPromptLen ? fullPrompt.slice(fullPrompt.length - maxPromptLen) : fullPrompt
	const availableWidth = cols - prompt.length
	const paddedStatus = availableWidth >= statusBadge.length ? statusBadge.padStart(availableWidth) : ''
	const promptRow = rows - 2
	const cursorCol = prompt.length + 1
	const hintContent = hint ? `\x1b[90m${hint.slice(0, cols)}\x1b[0m` : ''

	// Track cursor position so flushBuffer can restore it reliably
	cursorRow = promptRow
	cursorColumn = cursorCol

	// Top divider, prompt with dimmed status, bottom divider, hint or empty spacing
	writeRaw(
		`\x1b[${rows - 3};1H\x1b[2K\x1b[90m${divider}\x1b[0m` +
		`\x1b[${promptRow};1H\x1b[2K${prompt}\x1b[2m${paddedStatus}\x1b[0m` +
		`\x1b[${rows - 1};1H\x1b[2K\x1b[90m${divider}\x1b[0m` +
		`\x1b[${rows};1H\x1b[2K${hintContent}` +
		`\x1b[${cursorRow};${cursorColumn}H`
	)
}

function onResize() {
	const size = getTerminalSize()
	const newScrollBottom = size.rows - INPUT_HEIGHT

	if (newScrollBottom < MIN_SCROLL_HEIGHT) {
		return
	}

	rows = size.rows
	cols = size.cols
	scrollBottom = newScrollBottom

	// Clear rows below new scroll bottom (old input area artifacts)
	for (let i = scrollBottom + 1; i <= rows; i++) {
		writeRaw(`\x1b[${i};1H\x1b[2K`)
	}

	// Redefine scroll region
	writeRaw(`\x1b[1;${scrollBottom}r`)
}

export function isActive() {
	return isSetup
}

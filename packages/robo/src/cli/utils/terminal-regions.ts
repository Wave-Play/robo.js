/**
 * ANSI scroll region manager for splitting the terminal into a log area (top)
 * and a pinned input area (bottom).
 *
 * Uses DECSTBM (Set Top and Bottom Margins) escape sequences to create a
 * scrolling region for log output while keeping the input prompt fixed.
 */

export const BASE_INPUT_HEIGHT = 5 // top divider + prompt + bottom divider + hint + padding
export const MIN_SCROLL_HEIGHT = 2
const DIVIDER_CHAR = '\u2500'
const CHEVRON = '\u276f' // ❯

/**
 * Truncate a string that may contain ANSI escape sequences to a maximum
 * visible width. Walks the string character-by-character, tracking whether
 * the current position is inside an escape sequence, and only counting
 * visible characters toward the limit. Never slices through an escape
 * sequence, so the returned string always leaves the terminal in a clean
 * state (the caller wraps the result in its own color codes).
 */
export function truncateAnsi(str: string, maxVisible: number): string {
	let visible = 0
	let i = 0
	while (i < str.length && visible < maxVisible) {
		if (str[i] === '\x1b' && str[i + 1] === '[') {
			// Skip the entire CSI sequence (ESC [ <params> <letter>)
			i += 2
			while (i < str.length && !(str.charCodeAt(i) >= 0x40 && str.charCodeAt(i) <= 0x7e)) {
				i++
			}
			if (i < str.length) i++ // skip the terminating letter
		} else {
			visible++
			i++
		}
	}
	return str.slice(0, i)
}

/** ANSI color codes for status badge coloring */
const BADGE_COLORS: Record<string, string> = {
	green: '\x1b[32m',
	red: '\x1b[31m',
	yellow: '\x1b[33m',
	dim: '\x1b[2m',
	cyan: '\x1b[36m'
}

type WriteRawFn = (data: string) => void

let rows = 0
let cols = 0
let scrollBottom = 0
let currentInputHeight = BASE_INPUT_HEIGHT
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
	currentInputHeight = BASE_INPUT_HEIGHT
	scrollBottom = rows - currentInputHeight

	if (scrollBottom < MIN_SCROLL_HEIGHT) {
		// Terminal too small for scroll regions — skip setup
		return
	}

	// Initialize cursor tracking to prompt position (scrollBottom + 2 = prompt row)
	cursorRow = scrollBottom + 2
	cursorColumn = 3 // After "❯ "

	// Push existing terminal content up to make room for the input area.
	// Without this, the input region rendering clears lines that may still
	// contain recently-printed messages (e.g. the startup banner).
	writeRaw(`\x1b[${rows};1H` + '\n'.repeat(currentInputHeight))

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

export function renderInputRegion(inputText: string, status: string, hint?: string, badgeColor?: string) {
	if (!isSetup) {
		return
	}

	const divider = DIVIDER_CHAR.repeat(cols)
	const statusBadge = `[${status}]`
	const maxPromptLen = Math.max(4, cols - statusBadge.length - 1)
	const fullPrompt = `${CHEVRON} ${inputText}`
	const prompt = fullPrompt.length > maxPromptLen ? fullPrompt.slice(fullPrompt.length - maxPromptLen) : fullPrompt
	const availableWidth = cols - prompt.length
	const colorOpen = badgeColor && BADGE_COLORS[badgeColor] ? BADGE_COLORS[badgeColor] : '\x1b[2m'
	const coloredBadge = availableWidth >= statusBadge.length
		? `${colorOpen}${statusBadge.padStart(availableWidth)}\x1b[0m`
		: ''
	// Use scrollBottom-relative positions so the input area shifts when the drawer expands
	const topDividerRow = scrollBottom + 1
	const promptRow = scrollBottom + 2
	const bottomDividerRow = scrollBottom + 3
	const cursorCol = prompt.length + 1
	const hintContent = hint
		? `\x1b[90m${truncateAnsi(hint, cols)}\x1b[0m`
		: ''

	// Track cursor position so flushBuffer can restore it reliably
	cursorRow = promptRow
	cursorColumn = cursorCol

	// Top divider, prompt with colored status badge, bottom divider, hint, padding row
	const hintRow = rows - 1
	writeRaw(
		`\x1b[${topDividerRow};1H\x1b[2K\x1b[90m${divider}\x1b[0m` +
		`\x1b[${promptRow};1H\x1b[2K${prompt}${coloredBadge}` +
		`\x1b[${bottomDividerRow};1H\x1b[2K\x1b[90m${divider}\x1b[0m` +
		`\x1b[${hintRow};1H\x1b[2K${hintContent}` +
		`\x1b[${rows};1H\x1b[2K` +
		`\x1b[${cursorRow};${cursorColumn}H`
	)
}

function onResize() {
	const size = getTerminalSize()
	const newScrollBottom = size.rows - currentInputHeight

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

/**
 * Expand the input region to display drawer content below the prompt.
 * Scrolls log content up into the terminal's scrollback buffer so it is
 * never destroyed — users can scroll up to see it.
 */
export function expandRegion(extraLines: string[]) {
	if (!isSetup) return

	const extraHeight = extraLines.length
	// Hint row is suppressed when drawer is open, so subtract 1 from base height
	const newHeight = BASE_INPUT_HEIGHT - 1 + extraHeight
	const newScrollBottom = rows - newHeight

	if (newScrollBottom < MIN_SCROLL_HEIGHT) return // terminal too small

	// Scroll log content up within the scroll region to preserve it in scrollback
	const linesToScroll = scrollBottom - newScrollBottom
	if (linesToScroll > 0) {
		writeRaw(`\x1b[${scrollBottom};1H` + '\n'.repeat(linesToScroll))
	}

	currentInputHeight = newHeight
	scrollBottom = newScrollBottom

	// Redefine scroll region
	writeRaw(`\x1b[1;${scrollBottom}r`)

	// Clear the input + drawer area
	for (let i = scrollBottom + 1; i <= rows; i++) {
		writeRaw(`\x1b[${i};1H\x1b[2K`)
	}
}

/**
 * Collapse the drawer back to the default input height.
 */
export function collapseRegion() {
	if (!isSetup) return

	// Calculate how many rows are being reclaimed before updating state
	const reclaimedRows = currentInputHeight - BASE_INPUT_HEIGHT

	// Clear the old input + drawer area before expanding scroll region
	for (let i = scrollBottom + 1; i <= rows; i++) {
		writeRaw(`\x1b[${i};1H\x1b[2K`)
	}

	currentInputHeight = BASE_INPUT_HEIGHT
	scrollBottom = rows - currentInputHeight

	// Redefine scroll region (reclaims drawer rows for future log output)
	writeRaw(`\x1b[1;${scrollBottom}r`)

	// Scroll the region down (SD sequence) to push the blank reclaimed rows
	// to the top and fill the bottom with log content — eliminates the visual
	// gap between the last log line and the input area
	if (reclaimedRows > 0) {
		writeRaw(`\x1b[${reclaimedRows}T`)
	}
}

/**
 * Render drawer content lines below the bottom divider (between it and the hint).
 */
export function renderDrawerContent(lines: string[]) {
	if (!isSetup) return

	// Drawer lines start after the bottom divider (scrollBottom + 4)
	for (let i = 0; i < lines.length; i++) {
		const row = scrollBottom + 4 + i
		if (row >= rows) break // don't overwrite padding row (hint is suppressed when drawer is open)
		writeRaw(`\x1b[${row};1H\x1b[2K  ${lines[i]}`)
	}

	// Restore cursor to prompt
	writeRaw(`\x1b[${cursorRow};${cursorColumn}H`)
}

/**
 * Update drawer content in-place when the line count hasn't changed.
 * Avoids calling expandRegion() which scrolls log content, reducing churn
 * during live shell output updates.
 */
export function updateDrawerInPlace(oldLineCount: number, newLines: string[]) {
	if (!isSetup) return

	if (newLines.length === oldLineCount) {
		// Same line count — just overwrite the drawer content
		renderDrawerContent(newLines)
	} else {
		// Line count changed — need to re-expand
		expandRegion(newLines)
		renderDrawerContent(newLines)
	}
}

export function isActive() {
	return isSetup
}

/**
 * Monkey-patches process.stdout.write and process.stderr.write to route
 * all main-thread output through a callback. Preserves original references
 * for raw (bypass) writes used by terminal-regions for ANSI sequences.
 */

type WriteCallback = (data: string, stream: 'stdout' | 'stderr') => void

let originalStdoutWrite: typeof process.stdout.write | null = null
let originalStderrWrite: typeof process.stderr.write | null = null
let installed = false
let inCallback = false

export function install(onWrite: WriteCallback) {
	if (installed) {
		return
	}

	originalStdoutWrite = process.stdout.write.bind(process.stdout)
	originalStderrWrite = process.stderr.write.bind(process.stderr)

	process.stdout.write = function (chunk: unknown, ...args: unknown[]): boolean {
		const str = typeof chunk === 'string'
			? chunk
			: Buffer.isBuffer(chunk)
				? chunk.toString()
				: chunk instanceof Uint8Array
					? Buffer.from(chunk).toString()
					: String(chunk)

		if (!inCallback) {
			inCallback = true
			try {
				onWrite(str, 'stdout')
			} catch {
				// Swallow errors to avoid crashing callers of write()
			} finally {
				inCallback = false
			}
		}

		// Check if a callback was passed and invoke it
		const cb = typeof args[0] === 'function' ? args[0] : typeof args[1] === 'function' ? args[1] : null
		if (cb) {
			process.nextTick(cb as (error?: Error | null) => void)
		}

		return true
	} as typeof process.stdout.write

	process.stderr.write = function (chunk: unknown, ...args: unknown[]): boolean {
		const str = typeof chunk === 'string'
			? chunk
			: Buffer.isBuffer(chunk)
				? chunk.toString()
				: chunk instanceof Uint8Array
					? Buffer.from(chunk).toString()
					: String(chunk)

		if (!inCallback) {
			inCallback = true
			try {
				onWrite(str, 'stderr')
			} catch {
				// Swallow errors to avoid crashing callers of write()
			} finally {
				inCallback = false
			}
		}

		const cb = typeof args[0] === 'function' ? args[0] : typeof args[1] === 'function' ? args[1] : null
		if (cb) {
			process.nextTick(cb as (error?: Error | null) => void)
		}

		return true
	} as typeof process.stderr.write

	installed = true
}

export function uninstall() {
	if (!installed) {
		return
	}

	if (originalStdoutWrite) {
		process.stdout.write = originalStdoutWrite as typeof process.stdout.write
	}
	if (originalStderrWrite) {
		process.stderr.write = originalStderrWrite as typeof process.stderr.write
	}

	originalStdoutWrite = null
	originalStderrWrite = null
	installed = false
}

export function writeRaw(data: string, stream: 'stdout' | 'stderr' = 'stdout') {
	const writer = stream === 'stdout' ? originalStdoutWrite : originalStderrWrite

	if (writer) {
		writer(data)
	} else {
		// Fallback if not installed — write directly to the real stream
		if (stream === 'stdout') {
			process.stdout.write(data)
		} else {
			process.stderr.write(data)
		}
	}
}

export function isInstalled() {
	return installed
}

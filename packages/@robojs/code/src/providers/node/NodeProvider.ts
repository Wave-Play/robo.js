/**
 * Node.js ExecutionProvider implementation for @robojs/code SDK
 *
 * Secondary provider for CI testing and Node.js environments.
 * Uses child_process for command execution with separate stdout/stderr.
 */

import { spawn, type ChildProcess } from 'child_process'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'
import type { ExecutionProvider } from '../../types/execution.js'
import type {
	DirEntry,
	FileStat,
	RunOptions,
	RunResult,
	SearchOptions,
	SearchResult,
	SnapshotOptions,
	TerminalChunk,
	TerminalSessionHandle
} from '../../types/terminal.js'
import { CodeAgentError } from '../../errors/index.js'
import { validatePathWithPolicy, normalizePath, matchesDenyPath } from '../utils/path.js'
import { TerminalBuffer, TerminalBufferManager, type TruncationEvent } from '../utils/buffer.js'
import { codeLogger } from '../../core/logger.js'

/**
 * Configuration for NodeProvider
 */
export interface NodeProviderConfig {
	/**
	 * Root directory for file operations
	 */
	rootDir: string

	/**
	 * Paths to deny access to
	 */
	denyPaths?: string[]

	/**
	 * Maximum bytes to buffer from terminal output
	 */
	maxBufferedTerminalBytes?: number

	/**
	 * Callback for truncation events
	 */
	onTruncate?: (event: TruncationEvent) => void
}

/**
 * Internal session state
 */
interface SessionState {
	handle: TerminalSessionHandle
	process: ChildProcess
	buffer: TerminalBuffer
	aborted: boolean
	exitPromise: Promise<number>
}

/**
 * Node.js implementation of ExecutionProvider
 */
export class NodeProvider implements ExecutionProvider {
	private readonly rootDir: string
	private readonly denyPaths: string[]
	private readonly maxBufferedTerminalBytes: number
	private readonly onTruncate?: (event: TruncationEvent) => void
	private readonly sessions: Map<string, SessionState> = new Map()
	private readonly bufferManager: TerminalBufferManager
	private sessionCounter: number = 0

	constructor(config: NodeProviderConfig) {
		this.rootDir = path.resolve(config.rootDir)
		this.denyPaths = config.denyPaths || []
		this.maxBufferedTerminalBytes = config.maxBufferedTerminalBytes || 5_000_000
		this.onTruncate = config.onTruncate
		this.bufferManager = new TerminalBufferManager(this.maxBufferedTerminalBytes, this.onTruncate)
	}

	/**
	 * Resolve a virtual path to an absolute filesystem path
	 */
	private resolvePath(virtualPath: string): string {
		const normalized = validatePathWithPolicy(virtualPath, this.denyPaths)
		// Remove leading slash and join with root
		const relativePath = normalized.startsWith('/') ? normalized.slice(1) : normalized
		return path.join(this.rootDir, relativePath)
	}

	/**
	 * Convert an absolute path back to a virtual path
	 */
	private toVirtualPath(absolutePath: string): string {
		const relative = path.relative(this.rootDir, absolutePath)
		return '/' + relative.replace(/\\/g, '/')
	}

	// =========================================================================
	// File Operations
	// =========================================================================

	async readFile(filePath: string): Promise<string> {
		const absPath = this.resolvePath(filePath)
		try {
			return await fs.readFile(absPath, 'utf-8')
		} catch (error) {
			throw new CodeAgentError('EXECUTION_FAILED', `Failed to read file: ${filePath}`, {
				cause: error as Error,
				details: { path: filePath }
			})
		}
	}

	async writeFile(filePath: string, content: string): Promise<void> {
		const absPath = this.resolvePath(filePath)
		try {
			// Ensure parent directory exists
			await fs.mkdir(path.dirname(absPath), { recursive: true })
			await fs.writeFile(absPath, content, 'utf-8')
		} catch (error) {
			throw new CodeAgentError('EXECUTION_FAILED', `Failed to write file: ${filePath}`, {
				cause: error as Error,
				details: { path: filePath }
			})
		}
	}

	async deletePath(filePath: string, opts?: { recursive?: boolean }): Promise<void> {
		const absPath = this.resolvePath(filePath)
		try {
			await fs.rm(absPath, { recursive: opts?.recursive || false })
		} catch (error) {
			throw new CodeAgentError('EXECUTION_FAILED', `Failed to delete path: ${filePath}`, {
				cause: error as Error,
				details: { path: filePath }
			})
		}
	}

	async exists(filePath: string): Promise<boolean> {
		const absPath = this.resolvePath(filePath)
		try {
			await fs.access(absPath)
			return true
		} catch {
			return false
		}
	}

	async readdir(dirPath: string, opts?: { recursive?: boolean }): Promise<DirEntry[]> {
		const absPath = this.resolvePath(dirPath)
		const entries: DirEntry[] = []

		const readDir = async (currentPath: string, _basePath: string) => {
			const items = await fs.readdir(currentPath, { withFileTypes: true })

			for (const item of items) {
				const itemPath = path.join(currentPath, item.name)
				const virtualPath = this.toVirtualPath(itemPath)

				// Skip denied paths
				if (matchesDenyPath(virtualPath, this.denyPaths)) {
					continue
				}

				entries.push({
					name: item.name,
					path: virtualPath,
					isDirectory: item.isDirectory(),
					isFile: item.isFile()
				})

				if (opts?.recursive && item.isDirectory()) {
					await readDir(itemPath, virtualPath)
				}
			}
		}

		try {
			await readDir(absPath, dirPath)
			return entries
		} catch (error) {
			throw new CodeAgentError('EXECUTION_FAILED', `Failed to read directory: ${dirPath}`, {
				cause: error as Error,
				details: { path: dirPath }
			})
		}
	}

	async mkdir(dirPath: string, opts?: { recursive?: boolean }): Promise<void> {
		const absPath = this.resolvePath(dirPath)
		try {
			await fs.mkdir(absPath, { recursive: opts?.recursive || false })
		} catch (error) {
			throw new CodeAgentError('EXECUTION_FAILED', `Failed to create directory: ${dirPath}`, {
				cause: error as Error,
				details: { path: dirPath }
			})
		}
	}

	async stat(filePath: string): Promise<FileStat> {
		const absPath = this.resolvePath(filePath)
		try {
			const stats = await fs.stat(absPath)
			return {
				size: stats.size,
				mtimeMs: stats.mtimeMs,
				isDirectory: stats.isDirectory()
			}
		} catch (error) {
			throw new CodeAgentError('EXECUTION_FAILED', `Failed to stat path: ${filePath}`, {
				cause: error as Error,
				details: { path: filePath }
			})
		}
	}

	async search(pattern: string, opts?: SearchOptions): Promise<SearchResult[]> {
		const results: SearchResult[] = []
		const searchPath = opts?.path ? this.resolvePath(opts.path) : this.rootDir
		const maxResults = opts?.maxResults || 100

		const searchDir = async (currentPath: string) => {
			if (results.length >= maxResults) return

			let items: fsSync.Dirent[]
			try {
				items = await fs.readdir(currentPath, { withFileTypes: true })
			} catch {
				return
			}

			for (const item of items) {
				if (results.length >= maxResults) break

				const itemPath = path.join(currentPath, item.name)
				const virtualPath = this.toVirtualPath(itemPath)

				// Skip denied paths
				if (matchesDenyPath(virtualPath, this.denyPaths)) {
					continue
				}

				if (item.isDirectory()) {
					// Skip node_modules for performance
					if (item.name === 'node_modules') continue
					await searchDir(itemPath)
				} else if (item.isFile()) {
					// Check if filename matches pattern
					if (this.matchesPattern(item.name, pattern, opts?.glob)) {
						const result: SearchResult = { path: virtualPath }

						// Include content matches if requested
						if (opts?.includeContent) {
							try {
								const content = await fs.readFile(itemPath, 'utf-8')
								const matches = this.findMatches(content, pattern)
								if (matches.length > 0) {
									result.matches = matches
								}
							} catch {
								// Skip binary or unreadable files
							}
						}

						results.push(result)
					}
				}
			}
		}

		try {
			await searchDir(searchPath)
			return results
		} catch (error) {
			throw new CodeAgentError('EXECUTION_FAILED', `Search failed`, {
				cause: error as Error,
				details: { pattern, opts }
			})
		}
	}

	private matchesPattern(filename: string, pattern: string, glob?: string): boolean {
		// Simple pattern matching
		const lowerName = filename.toLowerCase()
		const lowerPattern = pattern.toLowerCase()

		// If glob is specified, use it
		if (glob) {
			return this.matchGlob(filename, glob)
		}

		// Otherwise check if filename contains pattern
		return lowerName.includes(lowerPattern)
	}

	private matchGlob(filename: string, glob: string): boolean {
		// Simple glob matching (supports * and ?)
		const regex = new RegExp(
			'^' +
				glob
					.replace(/[.+^${}()|[\]\\]/g, '\\$&')
					.replace(/\*/g, '.*')
					.replace(/\?/g, '.') +
				'$',
			'i'
		)
		return regex.test(filename)
	}

	private findMatches(content: string, pattern: string): Array<{ line: number; column: number; text: string }> {
		const matches: Array<{ line: number; column: number; text: string }> = []
		const lines = content.split('\n')
		const lowerPattern = pattern.toLowerCase()

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]
			const lowerLine = line.toLowerCase()
			let column = lowerLine.indexOf(lowerPattern)

			while (column !== -1) {
				matches.push({
					line: i + 1,
					column: column + 1,
					text: line.trim()
				})
				column = lowerLine.indexOf(lowerPattern, column + 1)
			}
		}

		return matches
	}

	async snapshot(opts?: SnapshotOptions): Promise<Record<string, string>> {
		const files: Record<string, string> = {}
		const maxBytes = opts?.maxBytes || 2_000_000
		let totalBytes = 0

		const paths = opts?.paths || ['/']
		const excludePatterns = opts?.excludePatterns || ['node_modules', '.git']

		const readDir = async (currentPath: string) => {
			if (totalBytes >= maxBytes) return

			const absPath = this.resolvePath(currentPath)
			let items: fsSync.Dirent[]

			try {
				items = await fs.readdir(absPath, { withFileTypes: true })
			} catch {
				return
			}

			for (const item of items) {
				if (totalBytes >= maxBytes) break

				const virtualPath = normalizePath(currentPath + '/' + item.name)

				// Skip excluded patterns
				if (excludePatterns.some((p) => item.name === p || virtualPath.includes('/' + p + '/'))) {
					continue
				}

				// Skip denied paths
				if (matchesDenyPath(virtualPath, this.denyPaths)) {
					continue
				}

				if (item.isDirectory()) {
					await readDir(virtualPath)
				} else if (item.isFile()) {
					try {
						const itemAbsPath = path.join(absPath, item.name)
						const content = await fs.readFile(itemAbsPath, 'utf-8')
						const contentBytes = Buffer.byteLength(content, 'utf-8')

						if (totalBytes + contentBytes <= maxBytes) {
							files[virtualPath] = content
							totalBytes += contentBytes
						}
					} catch {
						// Skip binary or unreadable files
					}
				}
			}
		}

		for (const p of paths) {
			await readDir(p)
		}

		return files
	}

	// =========================================================================
	// Command Execution
	// =========================================================================

	async run(command: string, args: string[], opts?: RunOptions): Promise<RunResult> {
		return new Promise((resolve, reject) => {
			const cwd = opts?.cwd ? this.resolvePath(opts.cwd) : this.rootDir
			const env = { ...process.env, ...opts?.env }

			codeLogger.debug(`Running command: ${command} ${args.join(' ')}`)

			const child = spawn(command, args, {
				cwd,
				env,
				shell: false // No shell interpolation
			})

			let stdout = ''
			let stderr = ''
			let output = ''

			child.stdout?.on('data', (data) => {
				const text = data.toString()
				stdout += text
				output += text
			})

			child.stderr?.on('data', (data) => {
				const text = data.toString()
				stderr += text
				output += text
			})

			// Handle timeout
			let timeoutId: NodeJS.Timeout | undefined
			if (opts?.timeout) {
				timeoutId = setTimeout(() => {
					child.kill('SIGTERM')
					reject(new CodeAgentError('TIMEOUT', `Command timed out after ${opts.timeout}ms`))
				}, opts.timeout)
			}

			// Handle abort signal
			if (opts?.signal) {
				opts.signal.addEventListener('abort', () => {
					child.kill('SIGTERM')
					reject(new CodeAgentError('ABORT', 'Command was aborted'))
				})
			}

			child.on('error', (error) => {
				if (timeoutId) clearTimeout(timeoutId)
				reject(
					new CodeAgentError('EXECUTION_FAILED', `Failed to execute command: ${command}`, {
						cause: error,
						details: { command, args }
					})
				)
			})

			child.on('close', (code) => {
				if (timeoutId) clearTimeout(timeoutId)
				resolve({
					exitCode: code ?? -1,
					output,
					stdout,
					stderr
				})
			})
		})
	}

	async *runStream(command: string, args: string[], opts?: RunOptions): AsyncIterable<TerminalChunk> {
		const cwd = opts?.cwd ? this.resolvePath(opts.cwd) : this.rootDir
		const env = { ...process.env, ...opts?.env }
		const sessionId = `stream-${++this.sessionCounter}`
		const buffer = this.bufferManager.getOrCreate(sessionId, this.maxBufferedTerminalBytes)

		codeLogger.debug(`Streaming command: ${command} ${args.join(' ')}`)

		const child = spawn(command, args, {
			cwd,
			env,
			shell: false
		})

		// Create async iterators from streams
		const chunks: TerminalChunk[] = []
		let resolveNext: (() => void) | null = null
		let done = false

		const pushChunk = (chunk: TerminalChunk) => {
			chunks.push(chunk)
			if (resolveNext) {
				const resolver = resolveNext
				resolveNext = null
				resolver()
			}
		}

		child.stdout?.on('data', (data) => {
			const text = data.toString()
			buffer.append(text)
			pushChunk({ type: 'output', stream: 'stdout', text })
		})

		child.stderr?.on('data', (data) => {
			const text = data.toString()
			buffer.append(text)
			pushChunk({ type: 'output', stream: 'stderr', text })
		})

		// Handle timeout
		let timeoutId: NodeJS.Timeout | undefined
		if (opts?.timeout) {
			timeoutId = setTimeout(() => {
				child.kill('SIGTERM')
				pushChunk({ type: 'exit', exitCode: -1 })
				done = true
			}, opts.timeout)
		}

		// Handle abort signal
		if (opts?.signal) {
			opts.signal.addEventListener('abort', () => {
				child.kill('SIGTERM')
				pushChunk({ type: 'exit', exitCode: -1 })
				done = true
			})
		}

		child.on('error', () => {
			if (timeoutId) clearTimeout(timeoutId)
			pushChunk({ type: 'exit', exitCode: -1 })
			done = true
		})

		child.on('close', (code) => {
			if (timeoutId) clearTimeout(timeoutId)
			pushChunk({ type: 'exit', exitCode: code ?? -1 })
			done = true
			this.bufferManager.remove(sessionId)
		})

		// Yield chunks as they arrive
		while (!done || chunks.length > 0) {
			if (chunks.length > 0) {
				yield chunks.shift()!
			} else if (!done) {
				await new Promise<void>((resolve) => {
					resolveNext = resolve
				})
			}
		}
	}

	// =========================================================================
	// Session Management
	// =========================================================================

	async startSession(command: string, args: string[], opts?: RunOptions): Promise<TerminalSessionHandle> {
		const cwd = opts?.cwd ? this.resolvePath(opts.cwd) : this.rootDir
		const env = { ...process.env, ...opts?.env }
		const sessionId = `session-${++this.sessionCounter}-${Date.now()}`

		codeLogger.debug(`Starting session: ${sessionId} - ${command} ${args.join(' ')}`)

		const child = spawn(command, args, {
			cwd,
			env,
			shell: false,
			detached: false
		})

		const handle: TerminalSessionHandle = {
			id: sessionId,
			pid: child.pid
		}

		const buffer = this.bufferManager.getOrCreate(sessionId, this.maxBufferedTerminalBytes)

		const exitPromise = new Promise<number>((resolve) => {
			child.on('close', (code) => {
				resolve(code ?? -1)
			})
			child.on('error', () => {
				resolve(-1)
			})
		})

		const session: SessionState = {
			handle,
			process: child,
			buffer,
			aborted: false,
			exitPromise
		}

		this.sessions.set(sessionId, session)

		// Collect output into buffer
		child.stdout?.on('data', (data) => {
			buffer.append(data.toString())
		})

		child.stderr?.on('data', (data) => {
			buffer.append(data.toString())
		})

		return handle
	}

	async *streamSession(handle: TerminalSessionHandle): AsyncIterable<TerminalChunk> {
		const session = this.sessions.get(handle.id)
		if (!session) {
			throw new CodeAgentError('INVALID_STATE', `Session not found: ${handle.id}`)
		}

		const chunks: TerminalChunk[] = []
		let resolveNext: (() => void) | null = null
		let done = false

		const pushChunk = (chunk: TerminalChunk) => {
			chunks.push(chunk)
			if (resolveNext) {
				const resolver = resolveNext
				resolveNext = null
				resolver()
			}
		}

		session.process.stdout?.on('data', (data) => {
			pushChunk({ type: 'output', stream: 'stdout', text: data.toString() })
		})

		session.process.stderr?.on('data', (data) => {
			pushChunk({ type: 'output', stream: 'stderr', text: data.toString() })
		})

		session.process.on('close', (code) => {
			pushChunk({ type: 'exit', exitCode: code ?? -1 })
			done = true
		})

		session.process.on('error', () => {
			pushChunk({ type: 'exit', exitCode: -1 })
			done = true
		})

		// Check if already exited
		if (session.process.exitCode !== null) {
			yield { type: 'exit', exitCode: session.process.exitCode }
			return
		}

		// Yield chunks as they arrive
		while (!done || chunks.length > 0) {
			if (chunks.length > 0) {
				yield chunks.shift()!
			} else if (!done) {
				await new Promise<void>((resolve) => {
					resolveNext = resolve
				})
			}
		}
	}

	async stopSession(handle: TerminalSessionHandle): Promise<void> {
		const session = this.sessions.get(handle.id)
		if (!session) {
			return // Already stopped or never existed
		}

		codeLogger.debug(`Stopping session: ${handle.id}`)

		session.aborted = true

		// Kill the process
		if (session.process.pid && !session.process.killed) {
			try {
				session.process.kill('SIGTERM')

				// Wait for graceful shutdown, then force kill
				const timeout = setTimeout(() => {
					if (!session.process.killed) {
						session.process.kill('SIGKILL')
					}
				}, 5000)

				await session.exitPromise
				clearTimeout(timeout)
			} catch {
				// Process may have already exited
			}
		}

		// Cleanup
		this.sessions.delete(handle.id)
		this.bufferManager.remove(handle.id)
	}

	/**
	 * Stop all active sessions
	 */
	async stopAllSessions(): Promise<void> {
		const handles = Array.from(this.sessions.values()).map((s) => s.handle)
		await Promise.all(handles.map((h) => this.stopSession(h)))
	}

	/**
	 * Get the number of active sessions
	 */
	getActiveSessionCount(): number {
		return this.sessions.size
	}
}

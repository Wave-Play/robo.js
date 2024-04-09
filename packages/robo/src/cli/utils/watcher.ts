import { promises as fs, watch, FSWatcher } from 'node:fs'
import path from 'node:path'
import { logger } from '../../core/logger.js'
import { hasProperties } from './utils.js'

// Defining the possible values for file changes.
type ChangeType = 'added' | 'removed' | 'changed'

export interface Change {
	changeType: ChangeType
	filePath: string
}

// The interface for options parameter allowing to exclude certain directories.
interface Options {
	exclude?: string[]
}

// The interface for the callback function.
interface Callback {
	(changeType: ChangeType, filePath: string): void
}

// Watcher class will monitor files and directories for changes.
export default class Watcher {
	// Map to keep track of FSWatcher instances for each watched file.
	private watchers: Map<string, FSWatcher> = new Map()
	// Map to keep track of last modification date for each watched file.
	private watchedFiles: Map<string, Date> = new Map()
	// A flag to avoid triggering callbacks on the initial setup.
	private isFirstTime = true
	private debouncer: Debouncer

	// Initialize with paths to watch and options.
	constructor(private paths: string[], private options: Options) {}

	// Start the watcher. Files are read, and callbacks are set up.
	async start(callback: (changes: Change[]) => Promise<void>) {
		this.debouncer = new Debouncer(callback)

		await Promise.all(
			this.paths.map((filePath) => {
				return this.watchPath(filePath, this.options, (changeType, filePath) => {
					this.debouncer.addChange({ changeType, filePath })
				})
			})
		)
		// After setting up, mark this as no longer the first time.
		this.isFirstTime = false
	}

	// Stop the watcher. Close all FSWatcher instances and clear the map.
	stop() {
		this.watchers.forEach((watcher) => {
			watcher.close()
		})
		this.watchers.clear()
	}

	// Retry function that repeats a promise-returning function up to a number of times.
	private async retry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
		try {
			return await fn()
		} catch (err) {
			if (retries === 0) {
				throw err
			}
			await new Promise((resolve) => setTimeout(resolve, 1000))
			return await this.retry(fn, retries - 1)
		}
	}

	// Set up watching a path. Recursively applies to directories, unless excluded by options.
	private async watchPath(targetPath: string, options: Options, callback: Callback) {
		const stats = await fs.lstat(targetPath)

		// If the path is excluded, do not watch it.
		if (options.exclude?.includes(targetPath)) {
			return
		}

		if (stats.isFile()) {
			// If a file, start watching the file.
			this.watchFile(targetPath, callback)
			// Fire the callback if not first time.
			if (!this.isFirstTime) {
				callback('added', targetPath)
			}
		} else if (
			stats.isDirectory() &&
			(!options.exclude ||
				(!options.exclude.includes(path.basename(targetPath)) && !options.exclude.includes(targetPath)))
		) {
			// If a directory, read all the contents and watch them.
			const files = await this.retry(() => fs.readdir(targetPath, { withFileTypes: true }))

			for (const file of files) {
				const filePath = path.join(targetPath, file.name)
				await this.watchPath(filePath, options, callback)
			}

			// Watch the directory for new files and rename events.
			const watcher = watch(targetPath, async (event, filename) => {
				if (filename) {
					const newFilePath = path.join(targetPath, filename)
					if (event === 'rename') {
						try {
							await fs.access(newFilePath, fs.constants.F_OK)
							// If the file still exists under the new path, it was added or moved/renamed to this path.
							if (!this.watchers.has(newFilePath)) {
								await this.watchPath(newFilePath, options, callback)
								if (!this.isFirstTime) {
									callback('added', newFilePath)
								}
							} else {
								// The file was moved or renamed within this directory. The old path will not exist anymore.
								const watcher = this.watchers.get(newFilePath)
								if (watcher) {
									watcher.close()
								}
								this.watchers.delete(newFilePath)
								// Re-establish the watcher on the new path.
								await this.watchPath(newFilePath, options, callback)
							}
						} catch (e) {
							// If the file does not exist anymore, it was removed.
							if (hasProperties<{ code: unknown }>(e, ['code']) && e.code === 'ENOENT') {
								const watcher = this.watchers.get(newFilePath)
								if (watcher) {
									callback('removed', newFilePath)
									watcher.close()
									this.watchers.delete(newFilePath)
								}
							} else {
								logger.error(`Unable to access file: ${newFilePath}`)
							}
						}
					}
				}
			})

			this.watchers.set(targetPath, watcher)
		} else if (stats.isSymbolicLink()) {
			// If a symlink, resolve the real path and watch that.
			const realPath = await fs.realpath(targetPath)
			await this.watchPath(realPath, options, callback)
		}
	}

	// Watch a single file. Set up the FSWatcher and callback for changes.
	private watchFile(filePath: string, callback: Callback) {
		const watcher = watch(filePath, async (event) => {
			if (event === 'rename') {
				// If the file still exists, it was not moved or renamed, but rather a new file was added.
				try {
					await this.retry(() => fs.access(filePath, fs.constants.F_OK))
					if (!this.isFirstTime) {
						callback('added', filePath)
					}
				} catch (e) {
					// If the file does not exist anymore, it was moved or renamed.
					if (hasProperties<{ code: unknown }>(e, ['code']) && e.code === 'ENOENT') {
						const watcher = this.watchers.get(filePath)
						if (watcher) {
							callback('removed', filePath)
							watcher.close()
							this.watchers.delete(filePath)
						}
					} else {
						logger.error(`Unable to access file: ${filePath}`)
					}
				}
			} else if (event === 'change') {
				// If the file changed, check the modification time and trigger the callback if it's a new change.
				const stat = await fs.lstat(filePath)
				if (this.watchedFiles.get(filePath)?.getTime() !== stat.mtime.getTime()) {
					this.watchedFiles.set(filePath, stat.mtime)
					if (!this.isFirstTime) {
						callback('changed', filePath)
					}
				}
			}
		})

		this.watchers.set(filePath, watcher)
	}
}

/**
 * Groups multiple changes into a single callback invocation.
 * This is useful where multiple changes can be triggered in quick succession.
 */
class Debouncer {
	private callback: (changes: Change[]) => void
	private wait: number
	private timerId: NodeJS.Timeout | null
	private changes: Map<string, Change>

	constructor(callback: (changes: Change[]) => void, wait = 100) {
		this.callback = callback
		this.wait = wait
		this.timerId = null
		this.changes = new Map()
	}

	addChange(change: Change) {
		this.changes.set(change.filePath, change)
		this.startTimer()
	}

	startTimer() {
		if (this.timerId !== null) {
			clearTimeout(this.timerId)
		}
		this.timerId = setTimeout(() => this.invokeCallback(), this.wait)
	}

	invokeCallback() {
		this.callback(Array.from(this.changes.values()))
		this.changes.clear()
	}
}

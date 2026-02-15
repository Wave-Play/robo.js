/**
 * TempFileManager
 *
 * Manages temporary file modifications for HMR tests.
 * Automatically restores original content after tests.
 */
import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * Manages temporary file modifications for HMR tests.
 * Tracks all changes and can restore original state.
 */
export class TempFileManager {
	private originals = new Map<string, string>()
	private created = new Set<string>()

	/**
	 * Modify a file's content. Original is stored for restoration.
	 *
	 * @param filePath - Path to the file to modify (relative or absolute)
	 * @param modifier - Function that receives original content and returns modified content
	 *
	 * @example
	 * ```typescript
	 * await files.modify('src/api/health.ts', content =>
	 *   content.replace("'ok'", "'modified'")
	 * )
	 * ```
	 */
	async modify(filePath: string, modifier: (content: string) => string): Promise<void> {
		const absPath = path.resolve(filePath)

		// Read current file content
		const currentContent = await fs.readFile(absPath, 'utf-8')

		// Store original if not already stored (for restoration later)
		if (!this.originals.has(absPath)) {
			this.originals.set(absPath, currentContent)
		}

		// Apply modifier to CURRENT content, not original
		const modified = modifier(currentContent)
		await fs.writeFile(absPath, modified)

		// Brief delay for watcher to detect change
		// Keep short so waitForHmrReload() can catch the reload
		await sleep(50)
	}

	/**
	 * Create a new temporary file.
	 *
	 * @param filePath - Path where to create the file
	 * @param content - Content to write to the file
	 *
	 * @example
	 * ```typescript
	 * await files.createTemp('src/api/new-route.ts', `
	 *   export default () => ({ message: 'Hello!' })
	 * `)
	 * ```
	 */
	async createTemp(filePath: string, content: string): Promise<void> {
		const absPath = path.resolve(filePath)
		await fs.mkdir(path.dirname(absPath), { recursive: true })
		await fs.writeFile(absPath, content)
		this.created.add(absPath)
		// Brief delay for watcher to detect change
		await sleep(50)
	}

	/**
	 * Delete a file temporarily (will be restored if it existed originally).
	 *
	 * @param filePath - Path to the file to delete
	 *
	 * @example
	 * ```typescript
	 * await files.deleteTemp('src/api/temp-route.ts')
	 * ```
	 */
	async deleteTemp(filePath: string): Promise<void> {
		const absPath = path.resolve(filePath)

		// Store original if exists and not already stored
		if (!this.originals.has(absPath)) {
			try {
				this.originals.set(absPath, await fs.readFile(absPath, 'utf-8'))
			} catch {
				// File doesn't exist, nothing to restore
			}
		}

		await fs.unlink(absPath).catch(() => {})
		// Brief delay for watcher to detect change
		await sleep(50)
	}

	/**
	 * Restore all modified files and delete created files.
	 * Call this in afterAll() or afterEach() to clean up.
	 *
	 * @example
	 * ```typescript
	 * afterAll(async () => {
	 *   await files.restoreAll()
	 * })
	 * ```
	 */
	async restoreAll(): Promise<void> {
		// Restore modified files
		for (const [filePath, content] of this.originals) {
			try {
				await fs.writeFile(filePath, content)
			} catch {
				// File path may no longer exist if parent directory was deleted
			}
		}
		this.originals.clear()

		// Delete created files
		for (const filePath of this.created) {
			await fs.unlink(filePath).catch(() => {})
		}
		this.created.clear()

		// Brief delay for watcher to settle
		await sleep(100)
	}

	/**
	 * Check if any modifications are pending restoration.
	 */
	hasPendingChanges(): boolean {
		return this.originals.size > 0 || this.created.size > 0
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * TempFileManager
 *
 * Manages temporary file modifications for HMR tests.
 * Automatically restores original content after tests.
 */
import fs from 'node:fs/promises'
import path from 'node:path'

export class TempFileManager {
	private originals = new Map<string, string>()
	private created = new Set<string>()

	async modify(filePath: string, modifier: (content: string) => string): Promise<void> {
		const absPath = path.resolve(filePath)
		const currentContent = await fs.readFile(absPath, 'utf-8')

		if (!this.originals.has(absPath)) {
			this.originals.set(absPath, currentContent)
		}

		const modified = modifier(currentContent)
		await fs.writeFile(absPath, modified)
		await sleep(50)
	}

	async createTemp(filePath: string, content: string): Promise<void> {
		const absPath = path.resolve(filePath)
		await fs.mkdir(path.dirname(absPath), { recursive: true })
		await fs.writeFile(absPath, content)
		this.created.add(absPath)
		await sleep(50)
	}

	async deleteTemp(filePath: string): Promise<void> {
		const absPath = path.resolve(filePath)

		if (!this.originals.has(absPath)) {
			try {
				this.originals.set(absPath, await fs.readFile(absPath, 'utf-8'))
			} catch {
				// File doesn't exist
			}
		}

		await fs.unlink(absPath).catch(() => {})
		await sleep(50)
	}

	async restoreAll(): Promise<void> {
		for (const [filePath, content] of this.originals) {
			try {
				await fs.writeFile(filePath, content)
			} catch {
				// Parent may not exist
			}
		}
		this.originals.clear()

		for (const filePath of this.created) {
			await fs.unlink(filePath).catch(() => {})
		}
		this.created.clear()
		await sleep(100)
	}

	hasPendingChanges(): boolean {
		return this.originals.size > 0 || this.created.size > 0
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

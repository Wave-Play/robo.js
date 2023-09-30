import fs from 'node:fs/promises'
import path from 'node:path'
import pLimit from './utils.js'
import { ALLOWED_EXTENSIONS } from '../../core/constants.js'

// Limit the number of concurrent file system operations
// This is to avoid hitting the OS's file descriptor limit
const concurrencyLimit = 100
const limit = pLimit(concurrencyLimit)

export async function hasFilesRecursively(dirPath: string): Promise<boolean> {
	let entries
	try {
		entries = await fs.readdir(dirPath, { withFileTypes: true })
	} catch (err) {
		return false
	}

	const results = await Promise.all(
		entries.map((entry) =>
			limit(async () => {
				if (entry.isFile()) {
					return ALLOWED_EXTENSIONS.includes(path.extname(entry.name))
				}
				if (entry.isDirectory()) {
					const subdirPath = path.join(dirPath, entry.name)
					return await hasFilesRecursively(subdirPath)
				}
				return false
			})
		)
	)

	return results.some((result) => result)
}

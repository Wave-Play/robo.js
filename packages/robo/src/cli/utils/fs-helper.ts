import fs from 'node:fs/promises'
import path from 'node:path'
import { ALLOWED_EXTENSIONS } from '../../core/constants.js'

export async function hasFilesRecursively(dirPath: string): Promise<boolean> {
	let entries
	try {
		entries = await fs.readdir(dirPath, { withFileTypes: true })
	} catch {
		return false
	}

	// Check files first (fast path — no recursion needed)
	for (const entry of entries) {
		if (entry.isFile() && ALLOWED_EXTENSIONS.includes(path.extname(entry.name))) {
			return true
		}
	}

	// Then recurse into subdirectories, short-circuiting on first match
	for (const entry of entries) {
		if (entry.isDirectory()) {
			if (await hasFilesRecursively(path.join(dirPath, entry.name))) {
				return true
			}
		}
	}

	return false
}

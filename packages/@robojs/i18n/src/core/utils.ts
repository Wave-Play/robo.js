import { readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Recursively gets all file paths from the given directory.
 *
 * @param dirPath The starting directory path
 * @param fileList Internal use: the array of collected file paths
 * @returns Array of absolute file paths
 */
export function getAllFilePaths(dirPath: string, fileList: string[] = []): string[] {
	const entries = readdirSync(dirPath, { withFileTypes: true })

	for (const entry of entries) {
		const fullPath = join(dirPath, entry.name)

		if (entry.isDirectory()) {
			getAllFilePaths(fullPath, fileList)
		} else {
			fileList.push(fullPath)
		}
	}

	return fileList
}

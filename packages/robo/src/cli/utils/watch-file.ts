import { logger } from '../../core/logger.js'
import { hasProperties } from './utils.js'
import { rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const WatchFile = { clean, set }

async function clean() {
	const watchFile = path.join(process.cwd(), '.robo', 'watch.json')

	try {
		const exists = await stat(watchFile)

		if (exists.isFile()) {
			await rm(watchFile)
		}
	} catch (e) {
		if (hasProperties<{ code: unknown }>(e, ['code']) && e.code !== 'ENOENT') {
			logger.warn(`Failed to clean up watch file! Please delete it manually at ${watchFile}`)
		}
	}
}

async function set(data: unknown) {
	const watchFile = path.join(process.cwd(), '.robo', 'watch.json')
	const watchContents = JSON.stringify(data, null, '\t')

	await writeFile(watchFile, watchContents)
}

import { logger } from '../core/logger.js'
import { hasProperties } from '../cli/utils/utils.js'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * Silent miniaturized version of Flashcore for internal Robo usage.
 */
export const Nanocore = { get, remove, set, update }

async function get(key: string) {
	const nanoFile = path.join(process.cwd(), '.robo', key + '.json')

	try {
		const exists = await stat(nanoFile)

		if (exists.isFile()) {
			const data = await readFile(nanoFile, 'utf-8')
			return JSON.parse(data)
		}
	} catch (e) {
		if (hasProperties<{ code: unknown }>(e, ['code']) && e.code !== 'ENOENT') {
			logger.debug(`Failed to get Nanocore key "${key}".`)
		}
	}

	return undefined
}

async function remove(key: string) {
	const nanoFile = path.join(process.cwd(), '.robo', key + '.json')

	try {
		const exists = await stat(nanoFile)

		if (exists.isFile()) {
			await rm(nanoFile)
		}
	} catch (e) {
		if (hasProperties<{ code: unknown }>(e, ['code']) && e.code !== 'ENOENT') {
			logger.debug(`Failed to remove Nanocore key "${key}". Please delete it manually at ${nanoFile}`)
		}
	}
}

async function set(key: string, data: unknown) {
	const nanoFile = path.join(process.cwd(), '.robo', key + '.json')

	try {
		await mkdir(path.dirname(nanoFile), { recursive: true })
		await writeFile(nanoFile, JSON.stringify(data, null, '\t'))
	} catch (e) {
		logger.debug(`Failed to set Nanocore key "${key}".`)
	}
}

async function update(key: string, data: Record<string, unknown>) {
	try {
		const existing = (await get(key)) ?? {}
		await set(key, { ...existing, ...data })
	} catch (e) {
		logger.debug(`Failed to update Nanocore key "${key}".`)
	}
}

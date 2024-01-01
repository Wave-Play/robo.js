import { logger } from '../core/logger.js'
import { mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readFile, unlink, writeFile } from 'node:fs/promises'
import type { User } from './types.js'

export const RoboPlaySession = {
	clear,
	get,
	save
}

interface Session {
	user: User
	userToken: string
}

async function clear() {
	// Find the session file
	const sessionPath = path.join(os.homedir(), '.robo', 'roboplay', 'session.json')
	logger.debug(`Clearing session file at ${sessionPath}`)

	// Sad face... goodbye session file!
	await unlink(sessionPath)
}

async function get() {
	// Find the session file
	const sessionPath = path.join(os.homedir(), '.robo', 'roboplay', 'session.json')
	logger.debug(`Reading RoboPlay session file at ${sessionPath}`)

	// Read the session file
	try {
		const sessionData = await readFile(sessionPath, 'utf-8')
		const session = JSON.parse(sessionData) as Session

		return session
	} catch (error) {
		logger.debug(`No RoboPlay session found.`)
		return null
	}
}

interface SaveOptions {
	user: User
	userToken: string
}

async function save(options: SaveOptions) {
	const { user, userToken } = options

	// Save to home directory
	const sessionPath = path.join(os.homedir(), '.robo', 'roboplay', 'session.json')
	logger.debug(`Writing session file to ${sessionPath}`)

	// Let's write the session file!
	mkdirSync(path.dirname(sessionPath), { recursive: true })
	await writeFile(sessionPath, JSON.stringify({ user, userToken }, null, 2))
	logger.debug(`Session file written successfully!`)
}

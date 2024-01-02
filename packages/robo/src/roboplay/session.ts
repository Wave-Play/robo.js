import { color } from '../core/color.js'
import { logger } from '../core/logger.js'
import { mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readFile, unlink, writeFile } from 'node:fs/promises'
import type { Robo, User } from './types.js'

export const RoboPlaySession = {
	clear,
	get,
	link,
	save
}

interface Session {
	linkedProjects: Record<string, string>
	robos: Robo[]
	user: User
	userToken: string
}

/**
 * Clear the RoboPlay session from the home directory.
 */
async function clear() {
	// Find the session file
	const sessionPath = path.join(os.homedir(), '.robo', 'roboplay', 'session.json')
	logger.debug(`Clearing session file at ${sessionPath}`)

	// Sad face... goodbye session file!
	await unlink(sessionPath)
}

/**
 * Get the RoboPlay session from the home directory.
 */
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

/**
 * Link the current project to a Robo in the RoboPlay session.
 */
async function link(roboId: string) {
	// Get the current session
	const session = await get()
	if (!session) {
		throw new Error(`No RoboPlay session found. Please sign in with ${color.bold('robo login')}.`)
	}

	// Make sure the ID specified is valid
	const robo = session.robos.find((robo) => robo.id === roboId)
	if (!robo) {
		throw new Error(`No Robo found with ID ${color.bold(roboId)}.`)
	}

	// Make sure the current directory is a Robo project by checking for the dependency
	const packageJsonPath = path.join(process.cwd(), 'package.json')
	const packageJson = JSON.parse((await readFile(packageJsonPath, 'utf-8')) ?? '{}')
	if (!packageJson.dependencies?.['@roboplay/robo.js']) {
		throw new Error(`This directory is not a Robo project.`)
	}

	// Add the robo to the session
	logger.debug(`Linking Robo ${roboId} to ${process.cwd()}`)
	session.linkedProjects[roboId] = process.cwd()

	// Save the session
	await save(session)
}

/**
 * Save the RoboPlay session to the home directory.
 */
async function save(session: Session) {
	// Save to home directory
	const sessionPath = path.join(os.homedir(), '.robo', 'roboplay', 'session.json')
	logger.debug(`Writing session file to ${sessionPath}`)

	// Let's write the session file!
	mkdirSync(path.dirname(sessionPath), { recursive: true })
	await writeFile(sessionPath, JSON.stringify(session, null, 2))
	logger.debug(`Session file written successfully!`)
}

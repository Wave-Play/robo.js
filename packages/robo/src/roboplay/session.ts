import { color } from '../core/color.js'
import { logger } from '../core/logger.js'
import { getRoboPackageJson, packageJson } from '../cli/utils/utils.js'
import { mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readFile, unlink, writeFile } from 'node:fs/promises'
import type { Pod, Robo, User } from './types.js'

export const RoboPlaySession = {
	clear,
	get,
	link,
	save
}

interface Session {
	linkedProjects: Record<
		string,
		{
			podId: string | null
			roboId: string | null
		}
	>
	pods: Pod[]
	robos: Robo[]
	roboVersion: string
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

		// Clear unsupported session data
		if (isUnsupportedSessionData(session)) {
			logger.info(`Session data is out of date. Clearing...`)
			await clear()
			return null
		}

		return session
	} catch (error) {
		logger.debug(`No RoboPlay session found.`)
		return null
	}
}

/**
 * Whether the local session data is unsupported in the current version of Robo.
 * For example, session data before we added the `roboVersion` property.
 */
function isUnsupportedSessionData(session: Session): boolean {
	if (!session.roboVersion) {
		return true
	}

	return false
}

/**
 * Link the current project to a Pod in the RoboPlay session.
 */
async function link(podId: string) {
	// Get the current session
	const session = await get()
	if (!session) {
		throw new Error(`No RoboPlay session found. Please sign in with ${color.bold('robo login')}.`)
	}

	// Make sure the ID specified is valid
	const pod = session.pods.find((pod) => pod.id === podId)
	if (!pod) {
		throw new Error(`No Pod found with ID ${color.bold(podId)}.`)
	}

	// Make sure the current directory is a Robo project by checking for the dependency
	const packageJson = await getRoboPackageJson()

	if (!packageJson.dependencies?.['robo.js']) {
		throw new Error(`This directory is not a Robo project.`)
	}

	// Add the robo to the session
	logger.debug(`Linking ${process.cwd()} to Pod ${podId}...`)
	session.linkedProjects[process.cwd()] = {
		podId: podId,
		roboId: null
	}

	// Save the session
	await save(session)
}

/**
 * Save the RoboPlay session to the home directory.
 */
async function save(session: Omit<Session, 'roboVersion'>) {
	// Save to home directory
	const sessionPath = path.join(os.homedir(), '.robo', 'roboplay', 'session.json')
	logger.debug(`Writing session file to ${sessionPath}`)

	// Let's write the session file!
	mkdirSync(path.dirname(sessionPath), { recursive: true })
	await writeFile(
		sessionPath,
		JSON.stringify(
			{
				roboVersion: packageJson.version,
				...session
			},
			null,
			2
		)
	)
	logger.debug(`Session file written successfully!`)
}

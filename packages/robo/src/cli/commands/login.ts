import { Command } from '../utils/cli-handler.js'
import { env } from '../../core/env.js'
import { logger } from '../../core/logger.js'
import { RoboPlay } from '../utils/roboplay.js'
import { color, composeColors } from '../../core/color.js'
import { Spinner } from '../utils/spinner.js'
import { copyToClipboard, openBrowser, sleep } from '../utils/utils.js'
import { KeyWatcher } from '../utils/key-watcher.js'
import { mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { writeFile } from 'node:fs/promises'

const command = new Command('login')
	.description('Sign in to your RoboPlay account')
	.option('-s', '--silent', 'do not print anything')
	.option('-v', '--verbose', 'print more information for debugging')
	.option('-h', '--help', 'Shows the available command options')
	.handler(loginAction)
export default command

const Indent = '   '

interface LoginCommandOptions {
	silent?: boolean
	verbose?: boolean
}

async function loginAction(_args: string[], options: LoginCommandOptions) {
	// Create a logger
	logger({
		enabled: !options.silent,
		level: options.verbose ? 'debug' : 'info'
	}).log('\n' + Indent, `Welcome to ${color.bold('RoboPlay')} ✨`)

	// Prepare OAuth session
	const oauthSession = await RoboPlay.OAuth.create()
	const url = env.roboplay.frontend + `/auth/cli?token=${oauthSession.token}`
	let sessionStatus = oauthSession.status

	// Copy pairing code to clipboard and print user instructions
	copyToClipboard(oauthSession.pairingCode)
	const cta = composeColors(color.bold, color.cyan)('Press Enter')

	logger.log('\n' + Indent, color.bold('🔒 For your security, please use an auth code.'))
	logger.log(Indent, `Your auth code is: ${composeColors(color.bold, color.cyan)(oauthSession.pairingCode)}`)

	logger.log('\n' + Indent, color.bold('🌐 Ready to start your journey?'))
	logger.log(Indent, `${cta} to open your web browser...`)

	logger.log('\n' + Indent, color.bold('🔗 Prefer to navigate manually?'))
	logger.log(Indent, composeColors(color.underline, color.blue)(url), '\n')

	const spinner = new Spinner(Indent)
	spinner.start()

	// Open browser on key press (Enter)
	const keyWatcher = new KeyWatcher(() => {
		spinner.stop()
		logger.log('\x1b[2A\x1b[J')
		logger.log('\n' + Indent, color.dim('Opening browser...'), '\n')
		openBrowser(url)

		spinner.start()
	})
	keyWatcher.start()

	// Wait for OAuth session to be authorized
	while (!['Authorized', 'Expired', 'Invalid', 'Used'].includes(sessionStatus)) {
		await sleep(4000)
		const pollResult = await RoboPlay.OAuth.poll({ token: oauthSession.token })
		sessionStatus = pollResult.status
	}

	// Stop loading spinner and key watcher
	spinner.stop()
	keyWatcher.stop()

	// Show error if session is either expired, invalid or used
	logger.debug(`Completed OAuth session status: ${sessionStatus}`)
	const badColor = composeColors(color.bold, color.red)
	if (['Expired', 'Invalid', 'Used'].includes(sessionStatus)) {
		logger.error(`This OAuth session is ${badColor(sessionStatus.toLowerCase())}. Please try again.`)
		return
	}

	// Verify OAuth session
	const verifyResult = await RoboPlay.OAuth.verify({
		pairingCode: oauthSession.pairingCode,
		secret: oauthSession.secret,
		token: oauthSession.token
	})

	// Show error if verification failed
	if (!verifyResult.success || !verifyResult.user || !verifyResult.userToken) {
		logger.error(`Failed to verify OAuth session with status:`, badColor(verifyResult.status))
		return
	}

	// Write the user and user token to ~/.robo/roboplay/session.json
	// Use Node's fs module to write the file to the user's home directory
	const session = {
		user: verifyResult.user,
		userToken: verifyResult.userToken
	}
	const sessionPath = path.join(os.homedir(), '.robo', 'roboplay', 'session.json')
	logger.debug(`Writing session file to ${sessionPath}`)

	// Let's write the session file!
	mkdirSync(path.dirname(sessionPath), { recursive: true })
	await writeFile(sessionPath, JSON.stringify(session, null, 2))
	logger.debug(`Session file written successfully!`)
	logger.ready('\n' + Indent, `🎉 You are now logged in as ${color.bold(verifyResult.user.displayName ?? verifyResult.user.email)}.`)
}

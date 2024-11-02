import { Command } from '../utils/cli-handler.js'
import { logger } from '../../core/logger.js'
import { RoboPlay } from '../../roboplay/client.js'
import { color, composeColors } from '../../core/color.js'
import { Spinner } from '../utils/spinner.js'
import { openBrowser, sleep } from '../utils/utils.js'
import { KeyWatcher } from '../utils/key-watcher.js'
import { RoboPlaySession } from '../../roboplay/session.js'

const command = new Command('login')
	.description('Sign in to your RoboPlay account')
	.option('-s', '--silent', 'do not print anything')
	.option('-v', '--verbose', 'print more information for debugging')
	.option('-h', '--help', 'Shows the available command options')
	.handler(loginAction)
export default command

const Indent = '   '
const OAuthTimeout = 10 * 60 * 1000 // 10 minutes

interface LoginCommandOptions {
	silent?: boolean
	verbose?: boolean
}

async function loginAction(_args: string[], options: LoginCommandOptions) {
	// Create a logger
	logger({
		enabled: !options.silent,
		level: options.verbose ? 'debug' : 'info'
	})

	// Prepare OAuth session
	const oauthSession = await RoboPlay.OAuth.create()
	let sessionStatus = oauthSession.status

	if (!oauthSession.success) {
		logger.error(oauthSession.error)
		return
	}

	// Print user instructions
	const cta = composeColors(color.bold, color.cyan)('Press Enter')

	logger.log('\n' + Indent, `Welcome to ${color.bold('RoboPlay')} ✨`)
	//logger.log('\n' + Indent, color.bold('🔒 For your security, please use an auth code.'))
	//logger.log(Indent, `Your auth code is: ${composeColors(color.bold, color.cyan)(oauthSession.pairingCode)}`)

	logger.log('\n' + Indent, color.bold('🌐 Ready to start your journey?'))
	logger.log(Indent, `${cta} to open your web browser...`)

	logger.log('\n' + Indent, color.bold('🔗 Prefer to navigate manually?'))
	logger.log(Indent, composeColors(color.underline, color.blue)(oauthSession.url), '\n')

	const spinner = new Spinner(Indent + ` {{spinner}} Waiting for sign in...`)
	spinner.start()

	// Open browser on key press (Enter)
	const keyWatcher = new KeyWatcher(() => {
		spinner.stop()
		logger.log('\x1b[2A\x1b[J')
		logger.log('\n' + Indent, color.dim('Opening browser...'), '\n')
		openBrowser(oauthSession.url)

		spinner.start()
	})
	keyWatcher.start()

	// Wait for OAuth session to be authorized
	const pollStart = Date.now()
	while (!['Authorized', 'Expired', 'Invalid', 'Used'].includes(sessionStatus)) {
		await sleep(4000)
		const pollResult = await RoboPlay.OAuth.poll({ token: oauthSession.token })
		sessionStatus = pollResult.status

		// Timeout after 10 minutes
		if (Date.now() - pollStart > OAuthTimeout) {
			spinner.stop()
			keyWatcher.stop()
			logger.error(`Timed out waiting for OAuth session to be authorized.`)
			return
		}
	}

	// Stop the fancy loading stuff so we can continue
	spinner.stop()
	keyWatcher.stop()

	// Show error if session was unsuccessful
	logger.debug(`Completed OAuth session status: ${sessionStatus}`)
	const badColor = composeColors(color.bold, color.red)
	if (['Expired', 'Invalid', 'Used'].includes(sessionStatus)) {
		logger.error(`This OAuth session is ${badColor(sessionStatus.toLowerCase())}. Please try again.`)
		return
	}

	// Verify OAuth session
	const verifyResult = await RoboPlay.OAuth.verify({
		secret: oauthSession.secret,
		token: oauthSession.token
	})

	// Show error if verification failed
	if (!verifyResult.success || !verifyResult.user || !verifyResult.userToken) {
		logger.error(`Failed to verify OAuth session with status:`, badColor(verifyResult.status))
		return
	}

	// Get the user's Pods
	const pods = await RoboPlay.Pod.list({
		bearerToken: verifyResult.userToken,
		userId: verifyResult.user.id
	})

	// Save the session globally
	await RoboPlaySession.save({
		linkedProjects: {},
		pods: pods.data,
		robos: [],
		user: verifyResult.user,
		userToken: verifyResult.userToken
	})

	// Link the current project to a Pod
	// TODO: Only link projects not already linked to prevent overwriting
	const pod = pods.data[0]
	await RoboPlaySession.link(pod.id)
	logger.log('\n' + Indent, `Linked project to Pod ${composeColors(color.bold, color.cyan)(pod.name)}.`)

	// Ta-dah!
	const userName = verifyResult.user.displayName ?? verifyResult.user.email
	logger.log('\n' + Indent, color.green(`🎉 You are now signed in as ${color.bold(userName)}.\n`))
}

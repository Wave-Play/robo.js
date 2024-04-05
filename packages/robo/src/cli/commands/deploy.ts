import { Command } from '../utils/cli-handler.js'
import { logger } from '../../core/logger.js'
import { color, composeColors } from '../../core/color.js'
import { compressDirectory } from '../utils/compress.js'
import { loadConfig } from '../../core/config.js'
import { KeyWatcher } from '../utils/key-watcher.js'
import { Spinner } from '../utils/spinner.js'
import { cleanTempDir, getPodStatusColor, getRoboPackageJson, openBrowser } from '../utils/utils.js'
import { RoboPlay } from '../../roboplay/client.js'
import { streamDeployment } from '../../roboplay/deploy.js'
import { RoboPlaySession } from '../../roboplay/session.js'
import path from 'node:path'
import type { DeploymentStep, Pod } from '../../roboplay/types.js'

const Highlight = composeColors(color.bold, color.cyan)
const Indent = ' '.repeat(3)
const Space = ' '.repeat(8)

const command = new Command('deploy')
	.description('Deploys your bot to RoboPlay!')
	.option('-s', '--silent', 'do not print anything')
	.option('-v', '--verbose', 'print more information for debugging')
	.option('-h', '--help', 'Shows the available command options')
	.handler(deployAction)
export default command

interface DeployCommandOptions {
	silent?: boolean
	verbose?: boolean
}

async function deployAction(_args: string[], options: DeployCommandOptions) {
	// Create a logger
	logger({
		enabled: !options.silent,
		level: options.verbose ? 'debug' : 'info'
	})

	// Validate session
	const session = await RoboPlaySession.get()
	const pod = session?.pods?.[0]

	if (!session || !pod) {
		logger.error(`You must be logged in to deploy to RoboPlay. Run ${Highlight('robo login')} to get started.`)
		return
	}

	// Sorry, only bots are supported right now!
	const config = await loadConfig()

	if (config.experimental?.disableBot) {
		logger.warn('Sorry, only bots are supported right now!')
		return
	}

	// Prepare fancy formatting
	const spinner = new Spinner()
	const roboPackageJson = await getRoboPackageJson()
	const roboName = roboPackageJson?.name ?? 'unknown'

	logger.log('\n' + Indent, `Thank you for using ${color.bold('RoboPlay')} ✨`)

	// Prepare deployment
	logger.log('\n' + Indent, color.bold(`🔒 Initiating deployment for ${Highlight(roboName)}`))
	spinner.setText(`${Indent} {{spinner}}  Requesting builder access...\n`)
	spinner.start()

	const deployResult = await RoboPlay.Deploy.create({ bearerToken: session.userToken })
	const { deploy, error, upload, signature, success, url } = deployResult

	spinner.stop(false)
	logger.debug(`Deployment result:`, deployResult)
	if (success) {
		logger.log('\r' + Indent, '   Builder access granted successfully')
	} else {
		logger.error(error)
		return
	}

	// Open browser on key press (Enter)
	const keyWatcher = new KeyWatcher(() => {
		spinner.getLogs().forEach(() => {
			process.stdout.write('\x1b[1A')
		})
		spinner.setLogs(`${Indent}    ${color.dim('Opening browser...')}`)
		openBrowser(url)
	})

	try {
		logger.log('\n' + Indent, color.bold('📦 Uploading bundle'))
		spinner.setText(`${Indent} {{spinner}}  Compressing project files...\n`)
		spinner.start()

		// Create bundle
		const bundle = await createBundle()
		spinner.setText(`${Indent} {{spinner}}  4% uploaded...\n`)

		// Upload using assigned upload URL
		logger.debug(`Uploading bundle...`)
		try {
			await RoboPlay.Deploy.upload({
				bundlePath: bundle,
				uploadKey: upload.key,
				uploadToken: upload.token,
				uploadUrl: upload.url
			})
		} catch (e) {
			// Notify RoboPlay of upload failure
			await updateDeployment(deploy.id, session.userToken, 'upload-failed')
			throw e
		}

		spinner.stop(false)
		logger.log('\r' + Indent, '   Transmission complete', Space)

		// Deploy to Pod
		logger.log('\n' + Indent, color.bold(`🚀 Deploying to pod ${Highlight(pod.name)}`))
		const spinnerOptions: UpdateDeploymentSpinnerOptions = { podStatus: null, steps: {}, url }
		updateDeploymentSpinner(spinner, spinnerOptions)

		// Stream deployment status
		keyWatcher.start()
		spinner.start()
		streamDeployment({ deploymentId: deploy.id, signature }, (error, data) => {
			// Handle error
			if (error) {
				keyWatcher.stop()
				spinner.stop(false)
				logger.log('\n')
				logger.error(error)
				process.exit(1)
			}

			// Update spinner with new status
			if (data.podStatus) {
				spinnerOptions.podStatus = data.podStatus
			}

			if (data.deployment?.steps) {
				spinnerOptions.steps.init = data.deployment.steps.find((step) => step.name === 'init')?.status
				spinnerOptions.steps.build = data.deployment.steps.find((step) => step.name === 'build')?.status
				spinnerOptions.steps.deploy = data.deployment.steps.find((step) => step.name === 'deploy')?.status
			}

			updateDeploymentSpinner(spinner, spinnerOptions)

			// Exit when deployment is done (completed or failed)
			if (['Completed', 'Failed'].includes(data.deployment?.status)) {
				keyWatcher.stop()
				spinner.stop(false)
				updateDeploymentSpinner(null, spinnerOptions)
				const emoji = data.deployment?.status === 'Completed' ? '🎉' : '❌'
				logger.log(Indent, emoji, color.bold(`Deployment ${data.deployment?.status.toLowerCase()}!${Space}${Space}\n`))

				process.exit(data.deployment?.status === 'Completed' ? 0 : 1)
			}
		})

		// Load real Pod status
		await Promise.all([
			loadPodStatus(pod.id, session.userToken, spinner, spinnerOptions),
			updateDeployment(deploy.id, session.userToken, 'upload-success')
		])
	} catch (e) {
		keyWatcher.stop()
		spinner.stop(false)
		logger.log('\n')
		logger.error(e)
	} finally {
		// Clean up temp files
		logger.debug(`Cleaning up temporary files...`)
		await cleanTempDir()
	}
}

async function createBundle() {
	logger.debug(`Creating bundle...`)
	try {
		const currentTime = new Date().toISOString().split('.')[0].replace(/[:-]/g, '')
		const projectName = path.basename(process.cwd()).toLowerCase()
		const fileName = `${projectName}-${currentTime}.robopack`
		const outputPath = path.join(process.cwd(), '.robo', 'temp', fileName)

		// Bundle the current working directory
		await compressDirectory(process.cwd(), outputPath, [
			'.git',
			'node_modules',
			`.robo${path.sep}build`,
			`.robo${path.sep}temp`
		])

		logger.debug(`Created bundle:`, outputPath)
		return outputPath
	} catch (error) {
		logger.error('Error bundling directory:', error)
	}
}

async function loadPodStatus(
	podId: string,
	bearerToken: string,
	spinner: Spinner,
	spinnerOptions: UpdateDeploymentSpinnerOptions
) {
	const podStatus = await RoboPlay.Pod.status({ bearerToken: bearerToken, podId })

	if (podStatus.success) {
		spinnerOptions.podStatus = podStatus.status
	} else {
		spinnerOptions.podStatus = podStatus.error as Pod['status']
	}

	updateDeploymentSpinner(spinner, spinnerOptions)
}

async function updateDeployment(deployId: string, bearerToken: string, event: 'upload-success' | 'upload-failed') {
	const result = await RoboPlay.Deploy.update({ bearerToken, deployId, event })

	if (!result.success) {
		throw new Error(result.error)
	}
}

interface UpdateDeploymentSpinnerOptions {
	podStatus: Pod['status'] | null
	steps: {
		init?: DeploymentStep['status']
		build?: DeploymentStep['status']
		deploy?: DeploymentStep['status']
	}
	url?: string
}
function updateDeploymentSpinner(spinner: Spinner | null, options: UpdateDeploymentSpinnerOptions) {
	const { podStatus, steps, url } = options
	const queryIndex = url.indexOf('?') // TODO: Remove cleanup once RoboPlay re-uses session
	const cleanUrl = url?.substring(0, queryIndex !== -1 ? queryIndex : url.length)
	const podSpinner = podStatus ? '' : '{{spinner}} '
	const podStatusColor = podStatus ? getPodStatusColor(podStatus) : color.yellow
	const text =
		`${Indent}    Pod status: ${podSpinner}${composeColors(
			color.bold,
			podStatusColor
		)(podStatus ?? 'Checking...')}${Space}` +
		`\n\n${Indent}    ${color.bold('Deployment Progress:')}` +
		`\n${Indent}    - Preparing: ${getStepStatus(steps.init)}${Space}` +
		`\n${Indent}    - Building: ${getStepStatus(steps.build)}${Space}` +
		`\n${Indent}    - Deploying: ${getStepStatus(steps.deploy)}${Space}` +
		`\n\n${Indent}    ${color.bold('Track live status:')}` +
		`\n${Indent}    ${color.blue(cleanUrl)}` +
		(spinner ? `\n\n${Indent}    ${Highlight('Press Enter')} to open status page.\n` : '\n')

	if (spinner) {
		spinner.setText(text, false)
	} else {
		logger.log('\r' + text)
	}
}

function getStepStatus(status: DeploymentStep['status']) {
	switch (status) {
		case 'Completed':
			return composeColors(color.bold, color.green)('✔ Done')
		case 'Failed':
			return composeColors(color.bold, color.red)('✖ Failed')
		case 'Running':
			return '{{spinner}} ' + composeColors(color.bold, color.yellow)('In Progress')
		default:
			return composeColors(color.bold, color.dim)('Pending')
	}
}

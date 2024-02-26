import { Command } from '../utils/cli-handler.js'
import { logger } from '../../core/logger.js'
import { color, composeColors } from '../../core/color.js'
import { compressDirectory } from '../utils/compress.js'
import { KeyWatcher } from '../utils/key-watcher.js'
import { Spinner } from '../utils/spinner.js'
import { cleanTempDir, getPodStatusColor, getRoboPackageJson, openBrowser } from '../utils/utils.js'
import { RoboPlay } from '../../roboplay/client.js'
import { RoboPlaySession } from '../../roboplay/session.js'
import path from 'node:path'
import type { Pod } from '../../roboplay/types.js'

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
	const { deploy, error, upload, success, url } = deployResult

	spinner.stop(false)
	logger.debug(`Deployment result:`, deployResult)
	if (success) {
		logger.log('\r' + Indent, '   Builder access granted successfully')
	} else {
		logger.error(error)
		return
	}

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
		logger.log('\r' + Indent, '   Transmission complete')

		// Deploy to Pod
		logger.log('\n' + Indent, color.bold(`🚀 Deploying to pod ${Highlight(pod.name)}`))

		// Print deployment job info
		logger.info(
			`${color.green('✔')} Your Robo will be online in a few minutes! You can check the status with`,
			color.bold('robo cloud status'),
			`\n`
		)
		if (url) {
			logger.info(`Build details: ${composeColors(color.bold, color.underline, color.blue)(url)}\n`)
		}
	} catch (e) {
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
	url?: string
}
function updateDeploymentSpinner(spinner: Spinner, options: UpdateDeploymentSpinnerOptions) {
	const { podStatus, url } = options
	const podSpinner = podStatus ? '' : '{{spinner}} '
	const podStatusColor = podStatus ? getPodStatusColor(podStatus) : color.yellow

	spinner.setText(
		`${Indent}    Pod status: ${podSpinner}${composeColors(
			color.bold,
			podStatusColor
		)(podStatus ?? 'Checking...')}${Space}` +
			`\n\n${Indent}    ${color.bold('Deployment Progress:')}` +
			`\n${Indent}    - Preparing: ${composeColors(color.bold, color.green)('✔ Done')}${Space}` +
			`\n${Indent}    - Building: {{spinner}} ${composeColors(color.bold, color.yellow)('In Progress')}${Space}` +
			`\n${Indent}    - Deploying: ${composeColors(color.bold, color.dim)('Pending')}${Space}` +
			`\n\n${Indent}    ${color.bold('Track live status:')}` +
			`\n${Indent}    ${color.blue(url)}` +
			`\n\n${Indent}    ${Highlight('Press Enter')} to open status page.\n`
	)
}

import { Command } from '../utils/cli-handler.js'
import { logger } from '../../core/logger.js'
import { color, composeColors } from '../../core/color.js'
import { compressDirectory } from '../utils/compress.js'
import { cleanTempDir } from '../utils/utils.js'
import { RoboPlay } from '../../roboplay/client.js'
import { RoboPlaySession } from '../../roboplay/session.js'
import path from 'node:path'

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
	}).info(`Deploying to ${color.bold('RoboPlay')} ✨`)
	logger.warn(`Thank you for trying Robo.js! This is a pre-release version, so please let us know of issues on GitHub.`)

	// Validate session
	const session = await RoboPlaySession.get()
	if (!session) {
		logger.error(
			`You must be logged in to deploy to RoboPlay. Run ${composeColors(
				color.bold,
				color.cyan
			)('robo login')} to get started.`
		)
		return
	}

	// Prepare deployment
	const deployResult = await RoboPlay.Deploy.create({ bearerToken: session.userToken })
	const { deploy, error, upload, success, url } = deployResult
	logger.debug(`Deployment result:`, deployResult)
	if (!success) {
		logger.error(error)
		return
	}

	try {
		// Create bundle
		logger.event(`Compressing project files and uploading to ${color.bold('RoboPlay')}...`)
		const bundle = await createBundle()

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
			await RoboPlay.Deploy.update({
				bearerToken: session.userToken,
				deployId: deploy.id,
				event: 'upload-failed'
			})
			throw e
		}

		// Notify RoboPlay of upload success
		logger.debug(`Notifying RoboPlay of upload result...`)
		const updateResult = await RoboPlay.Deploy.update({
			bearerToken: session.userToken,
			deployId: deploy.id,
			event: 'upload-success'
		})

		if (!updateResult.success) {
			logger.error(updateResult.error)
			return
		}

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

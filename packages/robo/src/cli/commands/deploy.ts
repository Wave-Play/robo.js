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
	logger.log('')
	const deploy = await RoboPlay.Deploy.create({ bearerToken: session.userToken })
	if (!deploy.success) {
		logger.error(deploy.error)
		return
	}

	try {
		// Create bundle
		logger.event(`Compressing project files and uploading to ${color.bold('RoboPlay')}...`)
		const bundle = await createBundle()

		// Upload using assigned upload URL
		await RoboPlay.Deploy.upload({
			bundlePath: bundle,
			uploadKey: deploy.upload.key,
			uploadToken: deploy.upload.token,
			uploadUrl: deploy.upload.url
		})

		// Notify RoboPlay of upload result
		await RoboPlay.Deploy.update({
			bearerToken: session.userToken,
			deployId: deploy.deploy.id
		})

		// Print deployment job info
		logger.info(`${color.green('✔')} Uploaded to ${color.bold('RoboPlay')}!\n`)
		const buildDetails = `https://roboplay.dev/builds/${deploy.deploy.id}`
		logger.info(`Build details: ${composeColors(color.bold, color.underline, color.blue)(buildDetails)}\n`)
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
		await compressDirectory('.', outputPath, ['.git', 'node_modules', '.robo/build', '.robo/temp'])

		logger.debug(`Created bundle:`, outputPath)
		return outputPath
	} catch (error) {
		logger.error('Error bundling directory:', error)
	}
}

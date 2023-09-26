import { Command } from '../utils/cli-handler.js'
import { logger } from '../../core/logger.js'
import { color, composeColors } from '../../core/color.js'
import { uploadToBackblazeB2 } from '../utils/upload.js'
import path from 'node:path'
import { env } from '../../core/env.js'
import { compressDirectory } from '../utils/compress.js'
import { cleanTempDir } from '../utils/utils.js';

const command = new Command('deploy')
	.description('Deploys your bot to RoboPlay!')
	.option('-s', '--silent', 'do not print anything')
	.option('-v', '--verbose', 'print more information for debugging')
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

	try {
		// Prepare to upload project (bundle & create job)
		logger.log('')
		logger.event(`Compressing project files and uploading to ${color.bold('RoboPlay')}...`)
		const bundle = await createBundle()
		const deploy = await createDeployment()

		// Upload using assigned upload URL
		await uploadBundle(bundle, deploy)

		// Notify RoboPlay of upload result
		await notifyUpload(deploy)

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

interface DeployResult {
	deploy: {
		id: string
	}
	upload: {
		key: string
		token: string
		url: string
	}
}
async function createDeployment() {
	logger.debug(`Preparing deployment job...`)
	const response = await fetch(env.roboplay.api + '/deploy', {
		method: 'POST'
	})
	return (await response.json()) as DeployResult
}

async function uploadBundle(bundlePath: string, deploy: DeployResult) {
	logger.debug(`Uploading bundle...`)
	await uploadToBackblazeB2(deploy.upload.url, deploy.upload.token, bundlePath, deploy.upload.key)
}

async function notifyUpload(deploy: DeployResult) {
	logger.debug(`Notifying RoboPlay of upload...`)
	const response = await fetch(env.roboplay.api + '/deploy/' + deploy.deploy.id, {
		method: 'PUT'
	})
	logger.debug(`Notify result:`, response)
}

import { env } from '../env.js'
import { CommitData, filterCommitedTemplates, getAllTemplates, RootDir } from '../utils.js'
import { exec } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { color, logger } from 'robo.js'

const execAsync = promisify(exec)

const Exclude = `'.robo/**' 'node_modules/**' '.DS_Store' '.env'`

start()
	.then((result) => {
		const { failed, success, time } = result

		if (success.length > 0) {
			logger.ready(success.length, `template${success.length === 1 ? '' : 's'} zipped and uploaded to B2 in ${time}ms`)
		}
		if (failed.length > 0) {
			logger.error(`Failed to zip ${failed.length} templates:`, failed)
		}
		if (success.length === 0 && failed.length === 0) {
			logger.warn('No templates zipped')
		}
	})
	.catch((error) => {
		logger.error(error)
		process.exit(1)
	})

async function start() {
	logger({
		level: env.get('robo.logLevel')
	}).event('Zipping template projects...')
	const startTime = Date.now()
	const success: string[] = []
	const failed: string[] = []

	// Get the commits from the push object
	const { commits } = JSON.parse(env.get('github.pushObject')) as CommitData
	const templates = await getAllTemplates()
	logger.debug('Commits:', commits)
	logger.debug('Templates:', templates)
	logger.info('Checking', commits.length, 'commits...')

	await Promise.all(
		commits.map(async (commit) => {
			// Get the committed files and determine which templates to zip
			const commitId = commit.id

			// Filter the templates to zip
			const templatesToZip = await filterCommitedTemplates(commitId, templates)

			if (!templatesToZip) {
				return
			}

			logger.debug(`Zipping ${templatesToZip.size} templates:`, templatesToZip)

			await Promise.all(
				[...templatesToZip].map(async (template) => {
					try {
						const templateChunks = template.split('/')
						const templateName = templateChunks.pop()
						const templatePath = path.join(RootDir, template)
						const outputDir = path.join(RootDir, 'temp', 'zip', templateChunks.join(path.sep))
						const outputZip = path.join(outputDir, `${templateName}.zip`)

						if (!existsSync(outputDir)) {
							await mkdir(outputDir, { recursive: true })
						}

						// we are using the zip package from ubuntu (easier to deal with)
						logger.info(`Zipping ${templatePath} into ${outputZip}`)
						const command = `zip -r ${outputZip} . -x ${Exclude}`
						logger.debug(color.bold(`> ${command}`))
						const { stderr, stdout } = await execAsync(command, { cwd: templatePath })

						if (stderr) {
							throw new Error(stderr)
						}

						logger.debug(stdout)
						success.push(template)
					} catch (error) {
						logger.error(error)
						failed.push(template)
					}
				})
			)
		})
	)

	// Upload the zipped templates to B2
	// We're using b2 because it is fast and the CLI is just too good
	if (success.length > 0) {
		logger.info(`Uploading to B2...`)
		const { stderr, stdout } = await execAsync(`b2 sync ../temp/zip/templates b2://${env.get('b2.bucket')}/`)
		logger.debug(stdout)

		if (stderr) {
			logger.error(stderr)
		} else {
			logger.info('Successfully uploaded to B2')
		}
	}

	return {
		failed: failed,
		success: success,
		time: Date.now() - startTime
	}
}

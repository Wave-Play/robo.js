import { env } from '../env.js'
import {
	CommitData,
	createBranch,
	createPullRequest,
	filterCommitedTemplates,
	getAllTemplates,
	getBranchSha,
	RootDir,
	uploadFileToGitHub
} from '../utils.js'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { logger, color } from 'robo.js'

start()
	.then((result) => {
		const { failed, success, time } = result

		if (success.length > 0) {
			logger.ready(success.length, `Dependencies upgrade in ${time}ms`)
		}
		if (failed.length > 0) {
			logger.error(`Failed to upgrade dependencies of: ${failed.length} templates`, failed)
		}
		if (success.length === 0 && failed.length === 0) {
			logger.warn('No dependencies upgraded !')
		}
	})
	.catch((error) => {
		logger.error(error)
		process.exit(1)
	})

export async function start() {
	logger({
		level: env.get('robo.logLevel')
	}).event('SAGE: Upgrading template dependencies...')

	const startTime = Date.now()
	const success: string[] = []
	const failed: string[] = []

	// Get the commits from the push object
	const { commits } = JSON.parse(env.get('github.pushObject')) as CommitData

	const templates = await getAllTemplates()

	logger.debug('Commits:', commits)
	logger.debug('Templates:', templates)
	logger.info('Checking', commits.length, 'commits...')

	await Promise.allSettled(
		commits.map(async (commit) => {
			// Get the committed files and determine which templates to upgrade
			const commitId = commit.id

			// Get templates to upgrade
			let templatesToUpgrade = await filterCommitedTemplates(commitId, templates)

			if (!templatesToUpgrade) {
				return
			} else if (env.get('debug') === 'true') {
				// Re-create set with limited templates
				const templateValues = templatesToUpgrade.values()
				templatesToUpgrade = new Set([templateValues.next().value, templateValues.next().value])
				logger.debug('Debug mode enabled, only upgrading one template:', templatesToUpgrade)
			}
			logger.wait('Building core Robo.js dependency..')
			await Promise.allSettled(
				[...templatesToUpgrade].map(async (template) => {
					const templateLogger = logger.fork(template.replace('templates/', ''))

					try {
						logger.wait('Installing dependencies for', template)
						const templatePath = path.join(RootDir, template)
						const installTemplate = spawn('npm', ['install'], {
							cwd: templatePath
						})

						installTemplate.stdout?.on('data', (data) => {
							templateLogger.debug(color.dim(data.toString()))
						})
						installTemplate.stderr?.on('data', (data) => {
							templateLogger.error(color.dim(data.toString()))
						})

						await new Promise((resolve, reject) => {
							installTemplate.on('close', (code) => {
								if (code === 0) {
									resolve(code)
								} else {
									reject(new Error(`Install process exited with code ${code}`))
								}
							})
						})

						logger.ready('Finished installing dependencies for', template)
						logger.info('Running sage upgrade...')
						//const sageExecutable = path.join(process.cwd(), '..', 'packages', 'sage', 'dist', 'index.js')

						// TODO: Once JSON mode is out switch to it
						templateLogger.debug('> npx -y @roboplay/sage@latest upgrade -y --verbose')
						const updateTemplate = spawn('npx', ['-y', '@roboplay/sage@latest', 'upgrade', '-y', '--verbose'], {
							cwd: templatePath
						})

						let stdoutData = ''
						let stderrData = ''

						updateTemplate.stdout?.on('data', (data) => {
							stdoutData += data.toString()
							templateLogger.debug(color.dim(data.toString()))
						})

						updateTemplate.stderr?.on('data', (data) => {
							stderrData += data.toString()
							templateLogger.error(color.dim(data.toString()))
						})

						await new Promise<void>((resolve, reject) => {
							updateTemplate.on('close', (code) => {
								if (code !== 0) {
									return reject(new Error(stderrData || `Process exited with code ${code}`))
								}
								if (stdoutData.includes('No dependencies')) {
									templateLogger.info('There were no updates, aborting...')
									return resolve()
								}
								resolve()
							})
						})
						templateLogger.info('Finished running sage upgrade...')

						// we might want to be able to pass the branch we are currently originating from
						templateLogger.info('Getting branch sha...')
						const sha = await getBranchSha()
						if (!sha) {
							throw new Error('Could not get branch sha .')
						}
						const branchName = template
						templateLogger.info('Creating branch...')

						// finish implementation in createBranch.
						const branch = await createBranch(branchName, sha)

						if (branch.status === '422') {
							templateLogger.warn('Branch already exists no need to re-create <3')
						}
						templateLogger.info('Uploading package.json to github...')

						await uploadFileToGitHub(branchName, path.join(templatePath, 'package.json'))

						// we upload package-lock because david and marc said I need to owo kawaiiiineeee
						await uploadFileToGitHub(branchName, path.join(templatePath, 'package-lock.json'))

						await createPullRequest(
							`templates(${template.replace('templates/', '')}): updated robo dependencies`,
							branchName,
							'main',
							`Automated PR for... Branch: ${branchName}`
						)

						templateLogger.ready('All done!')
						success.push(template)
					} catch (error) {
						templateLogger.error(template, error)
						failed.push(template)
					}
				})
			)
		})
	)

	return {
		failed: failed,
		success: success,
		time: Date.now() - startTime
	}
}

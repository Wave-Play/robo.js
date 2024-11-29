import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { logger, Env } from 'robo.js'
import path from 'node:path'
import {
	CommitData,
	createBranch,
	createPullRequest,
	env,
	filterCommitedTemplates,
	getAllTemplates,
	getBranchSha,
	RootDir,
	uploadFileToGitHub
} from './utils'

Env.loadSync()
const execAsync = promisify(exec)

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

	await Promise.all(
		commits.map(async (commit) => {
			// Get the committed files and determine which templates to upgrade
			const commitId = commit.id

			// Get templates to upgrade
			const templatesToUpgrade = await filterCommitedTemplates(commitId, templates)

			if (!templatesToUpgrade) {
				return
			}
			logger.debug('Building Robo..')

			const roboPath = path.join(process.cwd(), '..', 'packages', 'robo')
			const robo = await execAsync(`pnpm install && pnpm run build`, { cwd: roboPath })

			if (robo.stderr) {
				throw new Error(robo.stderr)
			}
			logger.debug('Finished building robo...')

			logger.debug('Building sage...')

			const sagePath = path.join(process.cwd(), '..', 'packages', 'sage')
			const sage = await execAsync(`pnpm install && pnpm run build`, { cwd: sagePath })

			if (sage.stderr) {
				throw new Error(sage.stderr)
			}
			logger.debug('Finished building sage...')

			await Promise.all(
				[...templatesToUpgrade].map(async (template) => {
					try {
						const templatePath = path.join(RootDir, template)

						logger.debug('Installing... template')
						const installTemplate = await execAsync(`npm install`, {
							cwd: templatePath
						})

						if (installTemplate.stderr) {
							throw new Error(installTemplate.stderr)
						}
						logger.debug('Finished installing... template')

						logger.debug('Running sage upgrade...')
						const sageExecutable = path.join(process.cwd(), '..', 'packages', 'sage', 'dist', 'index.js')
						const updateTemplate = await execAsync(`node ${sageExecutable} upgrade -y`, {
							cwd: templatePath
						})

						if (updateTemplate.stderr) {
							throw new Error(updateTemplate.stderr)
						}
						logger.debug('Finished running sage upgrade...')

						// we might want to be able to pass the branch we are currently originating from
						logger.debug('Getting branch sha...')
						const sha = await getBranchSha()
						if (!sha) {
							throw new Error('Could not get branch sha .')
						}
						const branchName = `chore/${template}`
						logger.debug('Creating branch...')

						const branch = await createBranch(branchName, sha)

						if (!branch) {
							throw new Error('Could not create branch')
						}
						logger.debug('Uploading package.json to github...')

						await uploadFileToGitHub(branchName, path.join(templatePath, 'package.json'))

						const prBranch = await createPullRequest(
							`Branch: ${branchName}`,
							branchName,
							'main',
							`Automated PR for... Branch: ${branchName}`
						)

						if (!prBranch) {
							throw new Error('Could not create PR !')
						}

						logger.debug('All done ! PR created and Ready to be merged UwU ')
						success.push(template)
					} catch (error) {
						logger.error(error)
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

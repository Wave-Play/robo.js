import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { logger } from 'robo.js'
import path from 'node:path'
import {
	CommitData,
	createBranch,
	env,
	filterCommitedTemplates,
	getAllTemplates,
	getBranchSha,
	RootDir,
	uploadFileToGitHub
} from './utils'

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

			await Promise.all(
				[...templatesToUpgrade].map(async (template) => {
					try {
						const templatePath = path.join(RootDir, template)

						const install = await execAsync('pnpm install', { cwd: templatePath })

						if (install.stderr) {
							throw new Error(install.stderr)
						}

						logger.debug(install.stdout)

						const sage = await execAsync('sage upgrade -y', { cwd: templatePath })

						if (sage.stderr) {
							throw new Error(sage.stderr)
						}

						// we might want to be able to pass the branch we are currently originating from
						const sha = await getBranchSha()
						if (!sha) {
							throw new Error('Could not get branch sha .')
						}
						const branchName = `chore(upgrade): ${template}`
						const branch = await createBranch(branchName, sha)

						if (!branch) {
							throw new Error('Could not create branch')
						}

						await uploadFileToGitHub(branchName, path.join(templatePath, 'package.json'))

						logger.debug(sage.stdout)
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

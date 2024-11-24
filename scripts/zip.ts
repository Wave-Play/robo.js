import { execSync } from 'node:child_process'
import fs from 'node:fs'
import { Env, logger } from 'robo.js'

// Prepare the environment (good for testing)
Env.loadSync()
const env = new Env({
	b2: {
		bucket: {
			default: 'robo-templates',
			env: 'B2_BUCKET'
		}
	},
	github: {
		pushObject: {
			env: 'GITHUB_PUSH_OBJECT'
		},
		repo: {
			default: 'Wave-Play/robo.js',
			env: 'REPO_DATA'
		},
		token: {
			env: 'GH_TOKEN'
		}
	}
})

const Repo = {
	Owner: env.get('github.repo').split('/')[0],
	Name: env.get('github.repo').split('/')[1]
}

start()
	.then((result) => {
		const { failed, success, time } = result
		logger.ready(success.length, `template${success.length === 1 ? '' : 's'} zipped and uploaded to B2 in ${time}ms`)

		if (failed.length > 0) {
			logger.warn('Failed:', failed)
		}
	})
	.catch((error) => {
		logger.error(error)
		process.exit(1)
	})

async function start() {
	logger.event('Zipping template projects...')
	const startTime = Date.now()
	const { commits } = JSON.parse(env.get('github.pushObject'))
	const templates = await getAllTemplates()
	const success: string[] = []
	const failed: string[] = []
	logger.info('Commits:', commits)
	logger.info('Templates:', templates)

	if (commits.length > 0) {
		await Promise.all(
			commits.map(async (commit) => {
				const id = commit.id
				const committedFiles = await getCommittedFiles(id)

				if (committedFiles.length > 0) {
					const templatesToZip: string[] = []
					for (let i = 0; i < committedFiles.length; ++i) {
						for (let j = 0; j < templates.length; ++j) {
							if (committedFiles[i].filename.includes(templates[j])) {
								templatesToZip.push(templates[j])
							}
						}
					}

					if (templatesToZip.length > 0) {
						templatesToZip.forEach((template) => {
							try {
								const templateName = template.split('/')[template.split('/').length - 1]
								const templatePath = template.slice(10)

								const outputDir = `../temp/zip/${templatePath.replace(`/${templateName}`, '')}`
								const outputZip = `${outputDir}/${templateName}.zip`

								if (!fs.existsSync(outputDir)) {
									fs.mkdirSync(outputDir, { recursive: true })
								}

								// we are using the zip package from ubuntu (easier to deal with)
								execSync(`zip -r ${outputZip} ../templates/${templatePath}`)

								// sync sends the folder at once
								// we are using b2 because it is fast and the CLI is just too good.
								execSync(`b2 sync ../temp/zip b2://${env.get('b2.bucket')}/`)
								success.push(template)
							} catch (error) {
								logger.error(error)
								failed.push(template)
							}
						})
					}
				} else {
					logger.error('Not committed file and Job still ran?')
				}
			})
		)
	}

	return {
		failed: failed,
		success: success,
		time: Date.now() - startTime
	}
}

async function getAllTemplates() {
	const paths = ['discord-activities', 'discord-bots', 'plugins', 'web-apps']
	const templates: string[] = []
	for (const path of paths) {
		const url = `https://api.github.com/repos/${Repo.Owner}/${Repo.Name}/contents/templates/${path}`
		const response = await fetch(url, {
			headers: {
				Authorization: `token ${env.get('github.token')}`
			}
		})
		const data = await response.json()
		templates.push(...data.filter((item) => item.type === 'dir').map((folder) => folder.path))
	}

	return templates
}

async function getCommittedFiles(id) {
	const url = `https://api.github.com/repos/${Repo.Owner}/${Repo.Name}/commits/${id}`
	const response = await fetch(url, {
		headers: {
			Authorization: `token ${env.get('github.token')}`
		}
	})

	const json = await response.json()
	const files = json.files
	logger.info('Committed files:', files)

	return files.filter((file) => {
		return file.filename.startsWith('templates')
	})
}

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import { Env, logger } from 'robo.js'

// Prepare the environment (good for testing)
Env.loadSync()
const env = new Env({
	b2: {
		bucket: {
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
	.then(() => logger.ready('Template projects zipped and uploaded to B2'))
	.catch((error) => {
		logger.error(error)
		process.exit(1)
	})

async function start() {
	logger.event('Zipping template projects...')
	const { commits } = JSON.parse(env.get('github.pushObject'))
	const templates = await getAllTemplates()
	logger.info('Commits:', commits)
	logger.info('Templates:', templates)

	if (commits.length > 0) {
		commits.forEach(async (commit) => {
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
						const templateName = template.split('/')[template.split('/').length - 1]
						const templatePath = template.slice(10)

						const outputDir = `zips/${templatePath.replace(`/${templateName}`, '')}`
						const outputZip = `${outputDir}/${templateName}`

						if (!fs.existsSync(outputDir)) {
							fs.mkdirSync(outputDir, { recursive: true })
						}

						// we are using the zip package from ubuntu (easier to deal with)
						execSync(`zip -r ${outputZip} templates/${templatePath}`)

						// sync sends the folder at once
						// we are using b2 because it is fast and the CLI is just too good.
						execSync(`b2 sync zips/ b2://${env.get('b2.bucket')}/`)
					})
				}
			} else {
				logger.error('Not committed file and Job still ran?')
			}
		})
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

	return files.filter((file) => {
		return file.filename.startsWith('templates')
	})
}

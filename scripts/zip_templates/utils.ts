import { Env } from 'robo.js'
import { logger } from 'robo.js'
import path from 'node:path'
import { readFileSync } from 'node:fs'

Env.loadSync()
export const env = new Env({
	b2: {
		bucket: {
			default: 'robo-templates',
			env: 'B2_BUCKET'
		}
	},
	forceTemplates: {
		default: 'false',
		env: 'FORCE_TEMPLATES'
	},
	github: {
		pushObject: {
			env: 'GH_PUSH'
		},
		repo: {
			default: 'Nazeofel/robo.js',
			env: 'REPO_DATA'
		},
		token: {
			env: 'GH_TOKEN'
		}
	},
	robo: {
		logLevel: {
			default: 'info',
			env: 'ROBO_LOG_LEVEL'
		}
	}
})

const Repo = {
	Owner: env.get('github.repo').split('/')[0],
	Name: env.get('github.repo').split('/')[1]
}
export const RootDir = path.join(process.cwd(), '..')

export interface CommitData {
	commits: Array<{
		author: {
			email: string
			name: string
			username: string
		}
		committer: {
			email: string
			name: string
			username: string
		}
		distinct: boolean
		id: string
		message: string
		timestamp: string
		tree_id: string
		url: string
	}>
}

interface CommittedFile {
	additions: number
	blob_url: string
	changes: number
	contents_url: string
	deletions: number
	filename: string
	patch?: string
	raw_url: string
	sha: string
	status: string
}

interface Template {
	_links: {
		git: string
		html: string
		self: string
	}
	download_url: string | null
	git_url: string
	html_url: string
	name: string
	path: string
	sha: string
	size: number
	type: string
	url: string
}

/**
 *
 * @returns Promise<string[]>
 */

export async function getAllTemplates() {
	const paths = ['discord-activities', 'discord-bots', 'plugins', 'web-apps']
	const templates: string[] = []

	for (const path of paths) {
		const url = `https://api.github.com/repos/${Repo.Owner}/${Repo.Name}/contents/templates/${path}`
		const response = await fetch(url, {
			headers: {
				Authorization: `token ${env.get('github.token')}`
			}
		})
		const data: Template[] = await response.json()
		logger.debug('Template path data:', data)
		templates.push(...data.filter((item) => item.type === 'dir').map((folder) => folder.path))
	}

	return templates
}

/**
 *
 * @param id
 * @returns Promise<CommittedFile[]>
 */

export async function getCommittedFiles(id: string) {
	const url = `https://api.github.com/repos/${Repo.Owner}/${Repo.Name}/commits/${id}`
	const response = await fetch(url, {
		headers: {
			Authorization: `token ${env.get('github.token')}`
		}
	})

	const json = await response.json()
	const files: CommittedFile[] = json.files
	logger.debug('Committed files:', files)

	return files.filter((file) => {
		return file.filename.startsWith('templates')
	})
}

export async function filterCommitedTemplates(commitId: string, templates: string[]): Promise<Set<string> | undefined> {
	const committedFiles = await getCommittedFiles(commitId)

	if (committedFiles.length < 1) {
		logger.warn(`No committed files found for commit ${commitId}. Skipping...`)
		return
	}

	// Filter the templates to zip
	const templatesToZip: Set<string> = new Set(
		env.get('forceTemplates') === 'true'
			? templates
			: committedFiles.flatMap((file) => templates.filter((template) => file.filename.includes(template)))
	)

	return templatesToZip
}

/**
 *
 * @param branchName
 * @param commitSha : The commit sha is the sha of the main branch we base ourselves on.
 * @returns Promise<boolean>
 */
export async function createBranch(branchName: string, commitSha: string): Promise<boolean> {
	const url = `https://api.github.com/repos/${Repo.Owner}/${Repo.Name}/git/refs`

	const response = await fetch(url, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.get('github.token')}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			ref: `refs/heads/${branchName}`,
			sha: commitSha
		})
	})

	if (response.ok) {
		const data = await response.json()
		console.log('Branch created successfully:', data)
		return true
	} else {
		const error = await response.json()
		console.error('Error creating branch:', error)
		return false
	}
}

/**
 *
 * @returns Promise<string | undefined>
 */
export async function getBranchSha(): Promise<string | undefined> {
	const branch = 'main'

	const response = await fetch(`https://api.github.com/repos/${Repo.Owner}/${Repo.Name}/git/ref/heads/${branch}`, {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${env.get('github.token')}`
		}
	})

	if (response.ok) {
		const data = await response.json()
		logger.log('Commit SHA of the base branch:', data.object.sha)
		return data.object.sha // This is the SHA you'll use to create the new branch
	} else {
		const error = await response.json()
		logger.error('Error fetching branch SHA:', error)
		return undefined
	}
}

/**
 *
 * @param branch
 * @param filePath
 */

export async function uploadFileToGitHub(branch: string, filePath: string) {
	try {
		const fileContent = readFileSync(filePath, 'utf8')

		const encodedContent = btoa(fileContent)
		// the lack of / after contents is normal, its because it cannot start with a slash, so we re use the slash
		// of filePath
		const response = await fetch(`https://api.github.com/repos/${Repo.Owner}/${Repo.Name}/contents${filePath}`, {
			method: 'PUT',
			headers: {
				Authorization: `Bearer ${env.get('github.token')}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				message: 'Upgraded dependencies', // Commit message
				content: encodedContent,
				branch: branch
			})
		})

		// Handle the response
		if (response.ok) {
			const data = await response.json()
			console.log('File uploaded successfully:', data.content.html_url)
		} else {
			const error = await response.json()
			console.error('Error uploading file:', error)
		}
	} catch (error) {
		logger.error(error)
	}
}

/**
 *
 * @param title : This is the name of the PR
 * @param head  : The source branch where your changes are located.
 * @param base  : The target branch (e.g., main) you want to merge into.
 * @param body  : This is the description of the PR.
 * @returns Promise<Record<string, string> | undefined>
 */

export async function createPullRequest(
	title: string,
	head: string,
	base: string,
	body: string
): Promise<Record<string, string> | undefined> {
	const response = await fetch(`https://api.github.com/repos/${Repo.Owner}/${Repo.Name}/pulls`, {
		method: 'POST',
		headers: {
			Authorization: `token ${env.get('github.token')}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			title,
			head,
			base,
			body
		})
	})

	if (response.ok) {
		const data = await response.json()
		logger.log('Data: ', data)
		return data // This is the SHA you'll use to create the new branch
	} else {
		const error = await response.json()
		logger.error('Error creating a pull request:', error)
		return undefined
	}
}

import got from 'got'
import tar from 'tar'
import { Stream } from 'stream'
import { promisify } from 'util'
import { join } from 'path'
import { tmpdir } from 'os'
import { createWriteStream, promises as fs } from 'fs'
import { logger } from 'robo.js'

const pipeline = promisify(Stream.pipeline)

export type RepoInfo = {
	username: string
	name: string
	branch: string
	filePath: string
}

export async function isUrlOk(url: string): Promise<boolean> {
	const res = await got.head(url)
	return res.statusCode === 200
}

export async function getRepoInfo(url: URL, examplePath?: string): Promise<RepoInfo | undefined> {
	const [, username, name, t, _branch, ...file] = url.pathname.split('/')
	const filePath = examplePath ? examplePath.replace(/^\//, '') : file.join('/')

	if (t === undefined || (t === '' && _branch === undefined)) {
		const infoResponse = await got(`https://api.github.com/repos/${username}/${name}`)
		if (infoResponse.statusCode !== 200) {
			return
		}
		const info = JSON.parse(infoResponse.body)
		return { username, name, branch: info['default_branch'], filePath }
	}

	// If examplePath is available, the branch name takes the entire path
	const branch = examplePath ? `${_branch}/${file.join('/')}`.replace(new RegExp(`/${filePath}|/$`), '') : _branch

	if (username && name && branch && t === 'tree') {
		return { username, name, branch, filePath }
	}
}

export function hasRepo({ username, name, branch, filePath }: RepoInfo): Promise<boolean> {
	const contentsUrl = `https://api.github.com/repos/${username}/${name}/contents`
	const packagePath = `${filePath ? `/${filePath}` : ''}/package.json`

	return isUrlOk(contentsUrl + packagePath + `?ref=${branch}`)
}

export function existsInRepo(nameOrUrl: string): Promise<boolean> {
	try {
		const url = new URL(nameOrUrl)
		return isUrlOk(url.href)
	} catch {
		return isUrlOk(`https://api.github.com/repos/Wave-Play/robo.js/templates/${encodeURIComponent(nameOrUrl)}`)
	}
}

async function downloadTar(url: string) {
	const tempFile = join(tmpdir(), `robo.js-cr-template.temp-${Date.now()}`)
	await pipeline(got.stream(url), createWriteStream(tempFile))
	return tempFile
}

export async function downloadAndExtractRepo(root: string, { username, name, branch, filePath }: RepoInfo) {
	const tempFile = await downloadTar(`https://codeload.github.com/${username}/${name}/tar.gz/${branch}`)
	await fs.mkdir(root, { recursive: true })

	await tar.x({
		file: tempFile,
		cwd: root,
		strip: filePath ? filePath.split('/').length + 1 : 1,
		filter: (p) => p.startsWith(`${name}-${branch.replace(/\//g, '-')}${filePath ? `/${filePath}` : ''}`)
	})

	await fs.unlink(tempFile)

	// Load package.json from root
	try {
		return JSON.parse(await fs.readFile(join(root, 'package.json'), 'utf-8'))
	} catch (error) {
		logger.debug(`Failed to read template package.json:`, error)
		return {}
	}
}

export async function downloadAndExtractExample(root: string, name: string) {
	if (name === '__internal-testing-retry') {
		throw new Error('This is an internal example for testing the CLI.')
	}

	const tempFile = await downloadTar('https://codeload.github.com/Wave-Play/robo.js/tar.gz/main')

	await tar.x({
		file: tempFile,
		cwd: root,
		strip: 3,
		filter: (p) => p.includes(`robo.js-main/templates/${name}/`)
	})

	await fs.unlink(tempFile)

	// Load package.json from root
	try {
		const packageJson = JSON.parse(await fs.readFile(join(root, 'package.json'), 'utf-8'))
		console.log(packageJson)
		return packageJson
	} catch (error) {
		logger.debug(error)
		return {}
	}
}

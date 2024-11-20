import path from 'node:path'
import { createWriteStream, mkdirSync } from 'node:fs'
import { Readable, pipeline } from 'node:stream'
import { promisify } from 'node:util'
import { readFile } from 'node:fs/promises'
import { logger } from './logger.js'
import { color } from './color.js'
import { FLASHCORE_KEYS } from 'robo.js/dist/core/constants.js'
import { spawn } from 'node:child_process'
import { Config, Flashcore } from 'robo.js'
import { packageJson } from '../index.js'
import { select } from '@inquirer/prompts'
import type { SpawnOptions } from 'node:child_process'
import type { PackageJson } from './types.js'

type PackageManager = 'npm' | 'bun' | 'pnpm' | 'yarn'

const pipelineAsync = promisify(pipeline)

export const IS_WINDOWS = /^win/.test(process.platform)

export async function checkSageUpdates() {
	// Check NPM registry for updates
	logger.debug(`Checking for updates...`)
	const response = await fetch(`https://registry.npmjs.org/${packageJson.name}/latest`)
	const latestVersion = (await response.json()).version
	logger.debug(`Latest version on NPM Registry: ${latestVersion}`)

	// Compare versions
	if (packageJson.version !== latestVersion) {
		// Print update message
		logger.info(color.green(`A new version of ${color.bold('@roboplay/sage')} is available! (v${latestVersion})\n`))
		const useLatest = await select({
			message: 'Would you like to use the latest version?',
			choices: [
				{ name: 'Yes, use latest', value: true },
				{ name: 'No, stick with v' + packageJson.version, value: false }
			]
		})
		logger.log('')

		if (useLatest) {
			// Prepare commands
			const packageExecutor = getPackageExecutor()
			let cliPackage = process.argv[1] ?? packageJson.name
			if (path.isAbsolute(cliPackage)) {
				cliPackage = path.basename(cliPackage)
			}

			await exec(`${packageExecutor} ${cliPackage}@${packageJson.version} ${process.argv.slice(2).join(' ')}`.trim())
			process.exit(0)
		}
	}
}

export async function checkUpdates(packageJson: PackageJson, config: Config, forceCheck = false) {
	const { updateCheckInterval = 60 * 60 } = config
	logger.debug(`Checking for updates for package.json:`, packageJson)

	const update = {
		changelogUrl: '',
		currentVersion: packageJson.version,
		hasUpdate: false,
		latestVersion: ''
	}

	// Ignore if disabled
	if (!forceCheck && updateCheckInterval <= 0) {
		logger.debug(`Update check is disabled.`)
		return update
	}

	// Check if update check is due
	const lastUpdateCheck = (await Flashcore.get<number>(FLASHCORE_KEYS.lastUpdateCheck)) ?? 0
	const now = Date.now()
	const isDue = now - lastUpdateCheck > updateCheckInterval * 1000
	logger.debug(`Update check from ${new Date(lastUpdateCheck).toISOString()} is due:`, isDue)

	if (!forceCheck && !isDue) {
		return update
	}

	// Check NPM registry for updates
	const response = await fetch(`https://registry.npmjs.org/${packageJson.name}/latest`)
	const latestVersion = (await response.json()).version
	update.hasUpdate = packageJson.version !== latestVersion
	update.latestVersion = latestVersion

	// Get changelog URL
	if (packageJson.repository?.url) {
		logger.debug(`Getting changelog URL from repository URL...`, packageJson.repository)

		// Construct raw changelog URL based on common convention
		let changelogUrl = packageJson.repository?.url
		changelogUrl = changelogUrl.replace('.git', '').replace('git+', '') + '/main'
		if (packageJson.repository.directory) {
			changelogUrl += `/${packageJson.repository.directory}`
		}
		if (changelogUrl.includes('github.com')) {
			changelogUrl = changelogUrl.replace('github.com', 'raw.githubusercontent.com')
		}
		changelogUrl += '/CHANGELOG.md'

		// Ping changelog URL to make sure it exists
		const changelogResponse = await fetch(changelogUrl)
		if (!changelogResponse.ok) {
			logger.debug(`Changelog URL does not exist:`, changelogUrl)
		} else {
			update.changelogUrl = changelogUrl
		}
	}

	// Update last update check time
	await Flashcore.set(FLASHCORE_KEYS.lastUpdateCheck, now)

	return update
}

export function createNodeReadable(webReadable: ReadableStream<Uint8Array>): NodeJS.ReadableStream {
	const reader = webReadable.getReader()
	return new Readable({
		async read() {
			const { done, value } = await reader.read()
			this.push(done ? null : value)
		}
	})
}

export async function downloadFile(url: string, fileName: string) {
	const response = await fetch(url)

	if (!response.ok) {
		throw new Error('Network response was not ok ' + response.statusText)
	}

	mkdirSync(path.dirname(fileName), { recursive: true })
	const fileStream = createWriteStream(fileName)
	const nodeReadable = createNodeReadable(response.body)

	await pipelineAsync(nodeReadable, fileStream)
}

/**
 * Run a command as a child process
 */
export function exec(command: string, options?: SpawnOptions) {
	return new Promise<void>((resolve, reject) => {
		logger.debug(`> ${color.bold(command)}`)

		// Run command as child process
		const args = command.split(' ')
		const childProcess = spawn(args.shift(), args, {
			env: { ...process.env, FORCE_COLOR: '1' },
			shell: IS_WINDOWS,
			stdio: 'inherit',
			...(options ?? {})
		})

		// Resolve promise when child process exits
		childProcess.on('error', reject)
		childProcess.on('close', (code) => {
			if (code === 0) {
				resolve()
			} else {
				reject(`Command exited with code ${code}`)
			}
		})
	})
}

/**
 * Get the package manager used to run this CLI
 * This allows developers to use their preferred package manager seamlessly
 */
export function getPackageManager(): PackageManager {
	const userAgent = process.env.npm_config_user_agent

	if (userAgent?.startsWith('bun')) {
		return 'bun'
	} else if (userAgent?.startsWith('yarn')) {
		return 'yarn'
	} else if (userAgent?.startsWith('pnpm')) {
		return 'pnpm'
	} else {
		return 'npm'
	}
}

export function getPackageExecutor(): string {
	const packageManager = getPackageManager()
	if (packageManager === 'yarn') {
		return 'yarn dlx'
	} else if (packageManager === 'pnpm') {
		return 'pnpx'
	} else if (packageManager === 'bun') {
		return 'bunx'
	} else {
		return 'npx'
	}
}

/**
 * Make sure that the working directory is a Robo project by checking for robo.js in package.json
 */
export async function isRoboProject(project = process.cwd()): Promise<boolean> {
	try {
		const packageJsonPath = path.join(project, 'package.json')
		const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'))

		return packageJson.dependencies['robo.js'] || packageJson.devDependencies['robo.js']
	} catch (e) {
		logger.debug(`Not a Robo project:`, e)
		return false
	}
}

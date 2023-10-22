import path from 'node:path'
import { createWriteStream, mkdirSync } from 'node:fs'
import { Readable, pipeline } from 'node:stream'
import { promisify } from 'node:util'
import { readFile } from 'node:fs/promises'
import { logger } from './logger.js'
import { color } from './color.js'
import { spawn } from 'node:child_process'
import type { SpawnOptions } from 'node:child_process'

type PackageManager = 'npm' | 'bun' | 'pnpm' | 'yarn'

const pipelineAsync = promisify(pipeline)

export const IS_WINDOWS = /^win/.test(process.platform)

export function cmd(packageManager: PackageManager): string {
	return IS_WINDOWS ? `${packageManager}.cmd` : packageManager
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

/**
 * Make sure that the working directory is a Robo project by checking for @roboplay/robo.js in package.json
 */
export async function isRoboProject(project = process.cwd()): Promise<boolean> {
	try {
		const packageJsonPath = path.join(project, 'package.json')
		const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'))

		return packageJson.dependencies['@roboplay/robo.js'] || packageJson.devDependencies['@roboplay/robo.js']
	} catch (e) {
		logger.debug(`Not a Robo project:`, e)
		return false
	}
}

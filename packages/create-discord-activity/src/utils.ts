#!/usr/bin/env node
import { color, logger } from 'robo.js'
import { ChildProcess, SpawnOptions, spawn } from 'node:child_process'
import { createRequire } from 'node:module'

// Read the version from the package.json file
const require = createRequire(import.meta.url)
export const packageJson = require('../../package.json')

const IS_WINDOWS = /^win/.test(process.platform)

export type PackageManager = 'npm' | 'bun' | 'pnpm' | 'yarn'

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
 * Get the "npx" or equivalent for the current package manager.
 *
 * @param external Whether to be used for an external package or local script.
 */
export function getPackageExecutor(external = true): string {
	const packageManager = getPackageManager()

	if (packageManager === 'yarn') {
		return external ? 'yarn dlx' : 'yarn'
	} else if (packageManager === 'pnpm') {
		return external ? 'pnpx' : 'pnpm'
	} else if (packageManager === 'bun') {
		return 'bunx'
	} else {
		return 'npx'
	}
}

/**
 * Run a command as a child process
 */
export function exec(command: string | string[], options?: SpawnOptions) {
	return new Promise<void>((resolve, reject) => {
		let childProcess: ChildProcess
		const spawnOptions: SpawnOptions = {
			env: { ...process.env, FORCE_COLOR: '1' },
			shell: IS_WINDOWS,
			stdio: 'inherit',
			...(options ?? {})
		}
		logger.debug(`${IS_WINDOWS ? '$' : '>'} ${color.bold(JSON.stringify(command))}`)

		if (IS_WINDOWS) {
			const str = Array.isArray(command) ? command.map((c) => (c.includes(' ') ? `"${c}"` : c)).join(' ') : command
			childProcess = spawn(str, spawnOptions)
		} else {
			const args = Array.isArray(command) ? command : command.split(' ')
			childProcess = spawn(args.shift()!, args, spawnOptions)
		}

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

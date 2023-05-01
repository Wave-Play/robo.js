import { spawn } from 'child_process'
import { logger } from './logger.js'
import type { SpawnOptions } from 'child_process'
import chalk from 'chalk'

type PackageManager = 'npm' | 'pnpm' | 'yarn'

export const IS_WINDOWS = /^win/.test(process.platform)

/**
 * Eh, just Windows things
 */
export function cmd(packageManager: PackageManager): string {
	return IS_WINDOWS ? `${packageManager}.cmd` : packageManager
}

/**
 * Run a command as a child process
 */
export function exec(command: string, options?: SpawnOptions) {
	return new Promise<void>((resolve, reject) => {
		logger.debug(`> ${chalk.bold(command)}`)

		// Run command as child process
		const args = command.split(' ')
		const childProcess = spawn(args.shift(), args, {
			...options ?? {},
			env: { ...process.env, FORCE_COLOR: '1' },
			stdio: 'inherit'
		})

		// Resolve promise when child process exits
		childProcess.on('close', (code) => {
			if (code === 0) {
				resolve()
			} else {
				reject(new Error(`Child process exited with code ${code}`))
			}
		})

		// Or reject when it errors
		childProcess.on('error', (error) => {
			reject(error)
		})
	})
}

/**
 * Get the package manager used to run this CLI
 * This allows developers to use their preferred package manager seamlessly
 */
export function getPackageManager(): PackageManager {
	const userAgent = process.env.npm_config_user_agent

	if (userAgent?.startsWith('yarn')) {
		return 'yarn'
	} else if (userAgent?.startsWith('pnpm')) {
		return 'pnpm'
	} else {
		return 'npm'
	}
}

export function hasProperties<T extends Record<string, unknown>>(
	obj: unknown,
	props: (keyof T)[]
): obj is T & Record<keyof T, unknown> {
	return typeof obj === 'object' && obj !== null && props.every((prop) => prop in obj)
}

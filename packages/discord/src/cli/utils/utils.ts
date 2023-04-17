import chalkLib from 'chalk'
import { DEFAULT_CONFIG } from '../../core/constants.js'
import { CommandConfig, Config, SageOptions } from '../../types'
import { getConfig } from './config.js'
import { createRequire } from 'node:module'

// Read the version from the package.json file
const require = createRequire(import.meta.url)
export const packageJson = require('../../../package.json')

// Convenience internal access for default commands and events injected by the CLI
export const chalk = chalkLib

export function getSage(commandConfig?: CommandConfig, config?: Config): SageOptions {
	// Ensure config always has a value
	if (!config) {
		config = getConfig()
	}

	// Disable all sage options if commandConfig.sage is disabled or if it is undefined and config.sage is disabled
	if (commandConfig?.sage === false || (commandConfig?.sage === undefined && config?.sage === false)) {
		return {
			defer: false,
			deferBuffer: 0,
			ephemeral: false,
			errorReplies: false
		}
	}

	return {
		...DEFAULT_CONFIG.sage,
		...(config?.sage === false ? {} : commandConfig?.sage ?? config?.sage ?? {})
	}
}

export function hasProperties<T extends Record<string, unknown>>(
	obj: unknown,
	props: (keyof T)[]
): obj is T & Record<keyof T, unknown> {
	return typeof obj === 'object' && obj !== null && props.every((prop) => prop in obj)
}

export function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

type PackageManager = 'npm' | 'pnpm' | 'yarn'

export const IS_WINDOWS = /^win/.test(process.platform)

export function cmd(packageManager: PackageManager): string {
	return IS_WINDOWS ? `${packageManager}.cmd` : packageManager
}

export function getPkgManager(): PackageManager {
	const userAgent = process.env.npm_config_user_agent

	if (userAgent?.startsWith('yarn')) {
		return 'yarn'
	} else if (userAgent?.startsWith('pnpm')) {
		return 'pnpm'
	} else {
		return 'npm'
	}
}

export function timeout<T = void>(callback: () => T, ms: number): Promise<T> {
	return new Promise<T>((resolve) =>
		setTimeout(() => {
			resolve(callback())
		}, ms)
	)
}

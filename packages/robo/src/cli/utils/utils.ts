import fs from 'node:fs/promises'
import { DEFAULT_CONFIG } from '../../core/constants.js'
import { CommandConfig, Config, SageOptions } from '../../types/index.js'
import { getConfig } from '../../core/config.js'
import { createRequire } from 'node:module'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { logger } from '../../core/logger.js'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const __DIRNAME = path.dirname(fileURLToPath(import.meta.url))

const execAsync = promisify(exec)

// Read the version from the package.json file
const require = createRequire(import.meta.url)
export const packageJson = require('../../../package.json')

/**
 * Filters an array of paths to only include those that exist.
 *
 * @param paths - The original array of relative paths
 * @param basePath - The base path (expected to be working directory by default)
 * @returns - The array of existing paths
 */
export async function filterExistingPaths(paths: string[], basePath = process.cwd()) {
	const result: string[] = []

	for (const relativePath of paths) {
		const absolutePath = path.resolve(basePath, relativePath)

		try {
			await fs.stat(absolutePath)
			// If stat didn't throw an error, the file exists
			result.push(relativePath)
		} catch (err) {
			// The file doesn't exist, ignore this path
		}
	}

	return result
}

export async function findNodeModules(basePath: string): Promise<string | null> {
	const nodeModulesPath = path.join(basePath, 'node_modules')
	try {
		await fs.access(nodeModulesPath)
		return nodeModulesPath
	} catch (error) {
		const parentPath = path.resolve(basePath, '..')
		if (parentPath !== basePath) {
			return findNodeModules(parentPath)
		} else {
			return null
		}
	}
}

export async function findPackagePath(packageName: string, currentPath: string): Promise<string | null> {
	const nodeModulesPath = await findNodeModules(currentPath)
	if (!nodeModulesPath) {
		logger.debug(`Could not find node_modules folder for ${packageName}`)
		return null
	}

	const pnpmNodeModulesPath = path.resolve(nodeModulesPath, '.pnpm')
	const isPnpm = await fs.access(pnpmNodeModulesPath).then(
		() => true,
		() => false
	)

	let packagePath: string | null = null

	if (isPnpm) {
		logger.debug(`Found pnpm node_modules folder for ${packageName}`)
		try {
			const { stdout } = await execAsync(`pnpm list ${packageName} --json`, { cwd: currentPath })
			const packages = JSON.parse(stdout)
			const packageInfo = Array.isArray(packages) ? packages[0] : packages
			packagePath = packageInfo.dependencies[packageName].path
		} catch (error) {
			logger.error('', error)
		}
	} else {
		const candidatePath = path.join(nodeModulesPath, packageName)
		logger.debug(`Checking for ${packageName} in ${candidatePath}`)
		try {
			await fs.access(candidatePath)
			packagePath = candidatePath
		} catch (error) {
			// Do nothing
		}
	}

	if (packagePath) {
		return path.relative(process.cwd(), packagePath)
	}

	const parentPath = path.resolve(nodeModulesPath, '..')
	return parentPath !== currentPath ? findPackagePath(packageName, parentPath) : null
}

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

interface WatchedPlugin {
	importPath: string
	name: string
}

export async function getWatchedPlugins(config: Config) {
	// Get a list of all plugin names
	const pluginNames = config.plugins?.map((plugin) => (typeof plugin === 'string' ? plugin : plugin[0])) ?? []
	const watchedPlugins: Record<string, WatchedPlugin> = {}

	for (const name of pluginNames) {
		try {
			const packagePath = await findPackagePath(name, process.cwd())
			const watchFilePath = path.join(packagePath, '.robo', 'watch.mjs')
			const importPath = pathToFileURL(path.join(process.cwd(), watchFilePath)).toString()

			// Ensure the file exists and is valid before adding it to the list
			await import(importPath)
			watchedPlugins[watchFilePath] = { importPath, name }
		} catch (error) {
			// Do nothing
		}
	}

	return watchedPlugins
}

export function hasProperties<T extends Record<string, unknown>>(
	obj: unknown,
	props: (keyof T)[]
): obj is T & Record<keyof T, unknown> {
	return typeof obj === 'object' && obj !== null && props.every((prop) => prop in obj)
}

/**
 * Checks recursively upwards for the given file or directory, preserving the trailing path.
 *
 * @param targetPath - The target file or directory path
 * @param currentDir - The current directory
 * @returns - The located path if exists or undefined
 */
export async function locateInHierarchy(targetPath: string, currentDir = process.cwd()): Promise<string | undefined> {
	const currentPath = path.join(currentDir, targetPath)

	try {
		// Check if the file or directory exists
		await fs.access(currentPath)
		return currentPath
	} catch {
		// Base case: we've reached the root directory
		const upperDir = path.dirname(currentDir)
		if (upperDir === currentDir) {
			return undefined
		}

		// Recursive case: go up one level and try again
		return locateInHierarchy(targetPath, upperDir)
	}
}

/**
 * Replaces 'src/' with '.robo/build' in the given key-value record, if the path starts with 'src/'.
 *
 * @param record - The original key-value record
 * @param basePath - The base path (expected to be working directory by default)
 * @returns - The modified key-value record
 */
export function replaceSrcWithBuildInRecord(record: Record<string, string[]>, basePath = process.cwd()) {
	const result: Record<string, string[]> = {}

	for (const [key, values] of Object.entries(record)) {
		result[key] = values.map((value) => {
			const relativePath = path.relative(basePath, value)

			// Replace 'src/' with the correct build path
			if (relativePath.startsWith('src/')) {
				return relativePath.replace('src/', '../.robo/build/')
			}

			// Otherwise, return the original path up one level to account for extra ".robo" folder
			return '../' + relativePath
		})
	}

	return result
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

type Task<T extends unknown[]> = (...args: T) => Promise<unknown>
type EnqueuedTask<T extends unknown[]> = {
	task: Task<T>
	args: T
	resolve: (value?: unknown | PromiseLike<unknown>) => unknown
}

export default function pLimit<T extends unknown[]>(
	concurrency: number
): (fn: Task<T>, ...args: T) => Promise<unknown> {
	if (!((Number.isInteger(concurrency) || concurrency === Number.POSITIVE_INFINITY) && concurrency > 0)) {
		throw new TypeError('Expected `concurrency` to be a number from 1 and up')
	}

	const queue: EnqueuedTask<T>[] = []
	let activeCount = 0

	const next = () => {
		activeCount--

		if (queue.length > 0) {
			const { task, args, resolve } = queue.shift()
			run(task, resolve, args)
		}
	}

	const run = async (fn: Task<T>, resolve: (value?: unknown | PromiseLike<unknown>) => unknown, args: T) => {
		activeCount++

		const result = fn(...args)

		resolve(result)

		try {
			await result
		} catch {
			// Do nothing
		}

		next()
	}

	const enqueue = (fn: Task<T>, resolve: (value?: unknown | PromiseLike<unknown>) => unknown, args: T) => {
		queue.push({ task: fn, args, resolve })
		;(async () => {
			// This function needs to wait until the next microtask before comparing
			// `activeCount` to `concurrency`, because `activeCount` is updated asynchronously
			// when the run function is dequeued and called. The comparison in the if-statement
			// needs to happen asynchronously as well to get an up-to-date value for `activeCount`.
			await Promise.resolve()

			if (activeCount < concurrency && queue.length > 0) {
				const { task, args, resolve } = queue.shift()
				run(task, resolve, args)
			}
		})()
	}

	const generator = (fn: Task<T>, ...args: T) =>
		new Promise<unknown>((resolve) => {
			enqueue(fn, resolve, args)
		})

	Object.defineProperties(generator, {
		activeCount: {
			get: () => activeCount
		},
		pendingCount: {
			get: () => queue.length
		},
		clearQueue: {
			value: () => {
				queue.length = 0
			}
		}
	})

	return generator
}

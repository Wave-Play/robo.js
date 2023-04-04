import fs from 'fs/promises'
import path from 'path'
import type { CompilerOptions } from 'typescript'
import type { transform as SwcTransform } from '@swc/core'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { hasProperties } from '../cli/utils/utils.js'
import { logger } from '../cli/utils/logger.js'

const srcDir = 'src'
const distDir = path.join('.robo', 'build')
const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function createDefaultHelpFile() {
	const defaultHelpPath = path.join(__dirname, '..', 'default-help.js')
	const distPath = path.join(distDir, 'commands', 'help.js')

	try {
		await fs.access(defaultHelpPath)
		await fs.mkdir(path.dirname(distPath), { recursive: true })
		await fs.copyFile(defaultHelpPath, distPath)
	} catch (err) {
		console.error('default-help.js file not found')
		process.exit(1)
	}
}

/**
 * Recursively traverse a directory and transform TypeScript files using SWC
 *
 * @param dir
 * @param compilerOptions
 */
async function traverse(
	dir: string,
	options: RoboCompileOptions,
	compilerOptions: CompilerOptions,
	transform: typeof SwcTransform
) {
	const { parallel = 20 } = options

	// Read directory contents
	let files
	try {
		files = await fs.readdir(dir)
	} catch (e) {
		if (hasProperties<{ code: unknown }>(e, ['code']) && e.code === 'ENOENT') {
			logger.debug(`Directory ${dir} does not exist, skipping traversal.`)
			return
		} else {
			throw e
		}
	}
	const tasks = []

	for (const file of files) {
		const filePath = path.join(dir, file)
		const stat = await fs.stat(filePath)

		// Recursively traverse subdirectories
		if (stat.isDirectory()) {
			tasks.push(traverse(filePath, options, compilerOptions, transform))
		} else if (/\.(js|ts|tsx)$/.test(file)) {
			// Queue up a task to transform the file
			tasks.push(
				(async () => {
					const fileContents = await fs.readFile(filePath, 'utf-8')
					const transformed = await transform(fileContents, {
						filename: filePath,
						jsc: {
							target: 'esnext',
							parser: {
								// Configure parser options for TypeScript files
								syntax: 'typescript',
								tsx: filePath.endsWith('.tsx'),
								dynamicImport: true,
								decorators: true
							},
							transform: {
								legacyDecorator: true
							}
						}
					})

					// Write transformed code to destination directory
					const distPath = path.join(distDir, path.relative(srcDir, filePath.replace(/\.(js|ts|tsx)$/, '.js')))
					await fs.mkdir(path.dirname(distPath), { recursive: true })
					await fs.writeFile(distPath, transformed.code)
				})()
			)
		}
		if (tasks.length >= parallel) {
			// Wait for the currently running tasks to complete
			await Promise.all(tasks)
			tasks.length = 0
		}
	}

	// Wait for any remaining tasks to complete
	await Promise.all(tasks)
}

interface RoboCompileOptions {
	defaultHelp?: boolean
	parallel?: number
}

export async function compile(options?: RoboCompileOptions) {
	const startTime = performance.now()

	const { default: ts } = await import('typescript')
	const { transform } = await import('@swc/core')

	// Read the tsconfig.json file
	const configFileName = path.join(process.cwd(), 'tsconfig.json')
	try {
		await fs.access(configFileName)
	} catch (error) {
		logger.debug('Copying srcDir to distDir without transversing...')
		await copyDir(srcDir, distDir)

		// Create a default help file if one does not exist
		if (options?.defaultHelp && !(await checkForHelpFile())) {
			await createDefaultHelpFile()
		}

		return performance.now() - startTime
	}

	if (typeof ts === 'undefined' || typeof transform === 'undefined') {
		logger.debug('Copying srcDir to distDir without transversing...')
		await copyDir(srcDir, distDir)

		// Create a default help file if one does not exist
		if (options?.defaultHelp && !(await checkForHelpFile())) {
			await createDefaultHelpFile()
		}

		return performance.now() - startTime
	}

	//
	const configFileContents = await fs.readFile(configFileName, 'utf8')

	// Parse tsconfig.json and convert compiler options
	const { config: tsconfig, error } = ts.parseConfigFileTextToJson(configFileName, configFileContents)
	if (error) {
		console.error('Error parsing tsconfig.json:', error)
		process.exit(1)
	}

	const { options: tsOptions } = ts.convertCompilerOptionsFromJson(
		tsconfig.compilerOptions,
		path.dirname(configFileName)
	)
	if (tsOptions.errors) {
		console.error('Error parsing compiler options from tsconfig.json')
		process.exit(1)
	}

	// Clear the destination directory before compiling
	await fs.rm(distDir, { recursive: true, force: true })

	// Traverse the source directory and transform files
	await traverse(srcDir, options ?? {}, tsOptions, transform)

	// Create a default help file if one does not exist
	if (options?.defaultHelp && !(await checkForHelpFile())) {
		await createDefaultHelpFile()
	}

	return performance.now() - startTime
}

async function checkForHelpFile(): Promise<boolean> {
	const commandsDir = path.join(srcDir, 'commands')

	try {
		const files = await fs.readdir(commandsDir)
		const helpFileExists = files.some((file) => /^help\.(ts|tsx|js|jsx)$/.test(file))
		return helpFileExists
	} catch (e) {
		if (hasProperties<{ code: unknown }>(e, ['code']) && e.code === 'ENOENT') {
			return false
		} else {
			throw e
		}
	}
}

async function copyDir(src: string, dest: string) {
	await fs.mkdir(dest, { recursive: true })
	const entries = await fs.readdir(src)

	for (const entry of entries) {
		const srcPath = path.join(src, entry)
		const destPath = path.join(dest, entry)

		const entryStat = await fs.stat(srcPath)
		if (entryStat.isDirectory()) {
			await copyDir(srcPath, destPath)
		} else {
			await fs.copyFile(srcPath, destPath)
		}
	}
}

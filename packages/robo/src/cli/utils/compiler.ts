import fs from 'fs/promises'
import path from 'path'
import { hasProperties, replaceSrcWithBuildInRecord } from './utils.js'
import { logger } from '../../core/logger.js'
import { env } from '../../core/env.js'
import type { default as Typescript, CompilerOptions } from 'typescript'
import type { transform as SwcTransform } from '@swc/core'

const srcDir = path.join(process.cwd(), 'src')
const distDir = path.join(process.cwd(), '.robo', 'build')

// Load Typescript compiler in a try/catch block
// This is to maintain compatibility with JS-only projects
let ts: typeof Typescript
let transform: typeof SwcTransform
try {
	const [typescript, swc] = await Promise.all([import('typescript'), import('@swc/core')])
	ts = typescript.default
	transform = swc.transform
} catch {
	// Ignore
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
	const isIncremental = options.files?.length > 0

	// Read directory contents
	let files
	try {
		if (isIncremental) {
			files = options.files.map((file) => path.join(process.cwd(), file))
			logger.debug(`Incrementally compiling:`, files)
		} else {
			files = await fs.readdir(dir)
		}
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
		const filePath = isIncremental ? file : path.join(dir, file)
		const stat = await fs.stat(filePath)

		// Recursively traverse subdirectories, only if no files are specified
		if (stat.isDirectory() && !isIncremental) {
			tasks.push(traverse(filePath, options, compilerOptions, transform))
		} else if (/\.(js|ts|tsx)$/.test(file)) {
			// Queue up a task to transform the file
			tasks.push(
				(async () => {
					const fileContents = await fs.readFile(filePath, 'utf-8')
					const transformed = await transform(fileContents, {
						filename: filePath,
						sourceMaps: env.nodeEnv === 'production' ? false : 'inline',
						jsc: {
							target: 'esnext',
							baseUrl: options.baseUrl,
							paths: options.paths,
							parser: {
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
	baseUrl?: string
	files?: string[]
	parallel?: number
	paths?: Record<string, string[]>
}

export async function compile(options?: RoboCompileOptions) {
	const startTime = Date.now()

	if (typeof ts === 'undefined' || typeof transform === 'undefined') {
		// If either of them fail, just copy the srcDir to distDir
		await fs.rm(distDir, { recursive: true, force: true })
		logger.debug('Copying srcDir to distDir without transversing...')
		await copyDir(srcDir, distDir)

		return Date.now() - startTime
	}

	// Read the tsconfig.json file
	const configFileName = path.join(process.cwd(), 'tsconfig.json')
	try {
		await fs.access(configFileName)
	} catch (error) {
		await fs.rm(distDir, { recursive: true, force: true })
		logger.debug('Copying srcDir to distDir without transversing...')
		await copyDir(srcDir, distDir)

		return Date.now() - startTime
	}

	if (typeof ts === 'undefined' || typeof transform === 'undefined') {
		await fs.rm(distDir, { recursive: true, force: true })
		logger.debug('Copying srcDir to distDir without transversing...')
		await copyDir(srcDir, distDir)

		return Date.now() - startTime
	}

	//
	const configFileContents = await fs.readFile(configFileName, 'utf8')

	// Parse tsconfig.json and convert compiler options
	const { config: tsconfig, error } = ts.parseConfigFileTextToJson(configFileName, configFileContents)
	if (error) {
		logger.error('Error parsing tsconfig.json:', error)
		process.exit(1)
	}

	const { options: tsOptions } = ts.convertCompilerOptionsFromJson(
		tsconfig.compilerOptions,
		path.dirname(configFileName)
	)
	if (tsOptions.errors) {
		logger.error('Error parsing compiler options from tsconfig.json')
		process.exit(1)
	}

	// Clear the destination directory before compiling
	if (!options?.files?.length) {
		logger.debug(`Cleaning ${distDir}...`)
		await fs.rm(distDir, { recursive: true, force: true })
	}

	// Traverse the source directory and transform files
	logger.debug(`Compiling ${srcDir} to ${distDir}...`)
	const baseUrl = tsOptions.baseUrl ?? process.cwd()
	const compileOptions = {
		baseUrl: baseUrl,
		paths: replaceSrcWithBuildInRecord(tsOptions.paths ?? {}),
		...(options ?? {})
	}
	logger.debug(`Compiler options:`, compileOptions)
	await traverse(srcDir, compileOptions, tsOptions, transform)
	await fs.rm(path.join(process.cwd(), '.swc'), { recursive: true, force: true })

	// Copy any non-TypeScript files to the destination directory
	logger.debug(`Copying additional non-TypeScript files from ${srcDir} to ${distDir}...`)
	await copyDir(srcDir, distDir, ['.ts', '.tsx'])

	return Date.now() - startTime
}

async function copyDir(src: string, dest: string, excludeExtensions: string[] = []) {
	await fs.mkdir(dest, { recursive: true })
	const entries = await fs.readdir(src)

	for (const entry of entries) {
		const srcPath = path.join(src, entry)
		const destPath = path.join(dest, entry)

		const entryStat = await fs.stat(srcPath)
		const entryExt = path.extname(srcPath)

		if (excludeExtensions.includes(entryExt)) {
			continue
		} else if (entryStat.isDirectory()) {
			await copyDir(srcPath, destPath, excludeExtensions)
		} else {
			await fs.copyFile(srcPath, destPath)
		}
	}
}

import fs from 'fs/promises'
import path from 'path'
import type { CompilerOptions } from 'typescript'
import type { transform as SwcTransform } from '@swc/core'
import { performance } from 'node:perf_hooks'
import { hasProperties } from './utils.js'
import { logger } from '../../core/logger.js'
import { env } from '../../core/env.js'

const srcDir = 'src'
const distDir = path.join('.robo', 'build')

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
						sourceMaps: env.nodeEnv === 'production' ? false : 'inline',
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
	parallel?: number
}

export async function compile(options?: RoboCompileOptions) {
	const startTime = performance.now()

	let ts, transform
	try {
		// Try to import TypeScript and SWC
		ts = (await import('typescript')).default
		transform = (await import('@swc/core')).transform
	} catch (error) {
		// If either of them fail, just copy the srcDir to distDir
		logger.debug('Copying srcDir to distDir without transversing...')
		await copyDir(srcDir, distDir)

		return performance.now() - startTime
	}

	// Read the tsconfig.json file
	const configFileName = path.join(process.cwd(), 'tsconfig.json')
	try {
		await fs.access(configFileName)
	} catch (error) {
		logger.debug('Copying srcDir to distDir without transversing...')
		await copyDir(srcDir, distDir)

		return performance.now() - startTime
	}

	if (typeof ts === 'undefined' || typeof transform === 'undefined') {
		logger.debug('Copying srcDir to distDir without transversing...')
		await copyDir(srcDir, distDir)

		return performance.now() - startTime
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
	await fs.rm(distDir, { recursive: true, force: true })

	// Traverse the source directory and transform files
	await traverse(srcDir, options ?? {}, tsOptions, transform)

	return performance.now() - startTime
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

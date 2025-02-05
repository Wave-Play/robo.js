import { rm } from 'fs/promises'
import { existsSync } from 'node:fs'
import path from 'path'
import { copyDir, PackageDir } from '../utils/utils.js'
import { color } from '../../core/color.js'
import { compilerLogger } from '../utils/loggers.js'
import { Compiler } from '../utils/compiler.js'

const SeedDir = path.join(process.cwd(), 'seed')
const SeedBuildDir = path.join(process.cwd(), '.robo', 'seed')

/**
 * Compile and copy /seed directly from plugin onto /.robo/seed.
 * These are files that are meant to be inherited by the project in which the plugin is installed.
 *
 * Use this on a plugin during the build process.
 */
export async function buildSeed() {
	const startTime = Date.now()

	// Clear the destination directory before copying
	compilerLogger.debug(`Cleaning previous seed...`)
	await rm(SeedBuildDir, { recursive: true, force: true })

	// Do nothing if the plugin lacks a /seed directory
	if (!existsSync(SeedDir)) {
		compilerLogger.debug(`No seed directory found, skipping...`)

		return {
			time: 0
		}
	}

	// Build TypeScript files if this project is a TypeScript project prior to copying
	const { isTypeScript } = Compiler.isTypescriptProject()
	if (isTypeScript) {
		compilerLogger.debug(`Compiling TypeScript files from ${SeedDir} to ${SeedBuildDir}...`)
		await Compiler.buildCode({
			distDir: SeedBuildDir,
			srcDir: SeedDir
		})
		await rm(path.join(process.cwd(), '.swc'), { recursive: true, force: true })
	} else {
		compilerLogger.warn('We recommend using TypeScript for your seed files.')
	}

	// Copy the reat of files from /seed into /.robo/seed
	compilerLogger.debug(`Copying seed into Robo build...`)
	await copyDir(SeedDir, SeedBuildDir, [], [])

	compilerLogger.debug(`Successfully built seed in ${Date.now() - startTime}ms`)
	return {
		time: Date.now() - startTime
	}
}

/**
 * Check if a plugin has a /seed directory.
 * This is used to determine whether or not to copy files from the plugin onto the project.
 */
export function hasSeed(packageName: string) {
	const base = packageName.startsWith('.') ? process.cwd() : path.join(PackageDir, '..')
	const seedPath = path.resolve(base, packageName, '.robo', 'seed')
	const fallbackPath = path.resolve(process.cwd(), 'node_modules', packageName, '.robo', 'seed')

	compilerLogger.debug(`Checking for ${packageName} seed files:`, seedPath, 'or', fallbackPath)
	return existsSync(seedPath) || existsSync(fallbackPath)
}

/**
 * Copy files meant to be inherited from the plugin onto the project's /src directory.
 * Does nothing if the plugin doesn't have any files to seed from.
 *
 * Use this after installing a plugin.
 */
export async function useSeed(packageName: string) {
	compilerLogger.debug(`Looking for seed files in plugin ${color.bold(packageName)}...`)
	const base = packageName.startsWith('.') ? process.cwd() : path.join(PackageDir, '..')
	const fallbackPath = path.resolve(process.cwd(), 'node_modules', packageName, '.robo', 'seed')
	const projectSrc = path.join(process.cwd(), 'src')
	let seedPath = path.resolve(base, packageName, '.robo', 'seed')
	compilerLogger.debug('Looking in seed path:', seedPath, 'or', fallbackPath)

	// Use the fallback path if the plugin doesn't have a seed directory
	if (!existsSync(seedPath)) {
		seedPath = fallbackPath
	}

	// See if the plugin has a seed directory
	if (existsSync(seedPath)) {
		compilerLogger.debug('Seed folder exists! Verifying manifest...')
		const manifest = await Compiler.useManifest({
			basePath: path.resolve(seedPath, '..', '..'),
			name: packageName
		})
		const identifiesAsTypeScript = manifest.__robo.language === 'typescript'
		const { isTypeScript } = Compiler.isTypescriptProject()

		// Copy the files recursively
		const excludeExts = identifiesAsTypeScript && isTypeScript ? ['.js', '.jsx'] : ['.ts', '.tsx']
		await copyDir(seedPath, projectSrc, excludeExts, [path.join(seedPath, '_root')], false)
		compilerLogger.debug(`Successfully copied seed files from`, color.bold(packageName))

		// Copy the root files
		const rootPath = path.join(seedPath, '_root')
		if (existsSync(rootPath)) {
			compilerLogger.debug('Copying root seed files...')
			await copyDir(rootPath, process.cwd(), [], [], false)
			compilerLogger.debug(`Successfully copied root seed files from`, color.bold(packageName))
		}
	}
}

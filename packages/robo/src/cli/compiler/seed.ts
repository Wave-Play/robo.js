import { rm } from 'fs/promises'
import { existsSync } from 'node:fs'
import path from 'path'
import { copyDir, PackageDir, replaceSrcWithBuildInRecord } from '../utils/utils.js'
import { color } from '../../core/color.js'
import { compilerLogger } from '../utils/loggers.js'
import { Compiler, transform, traverse } from '../utils/compiler.js'
import { getTypeScriptCompilerOptions } from './typescript.js'

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
	if (Compiler.isTypescriptProject()) {
		compilerLogger.debug(`Compiling TypeScript files from ${SeedDir} to ${SeedBuildDir}...`)
		const tsOptions = await getTypeScriptCompilerOptions()
		const baseUrl = tsOptions.baseUrl ?? process.cwd()
		const compileOptions = {
			baseUrl: baseUrl,
			paths: replaceSrcWithBuildInRecord(tsOptions.paths ?? {})
		}
		compilerLogger.debug(`Compiler options:`, compileOptions)

		await traverse(SeedDir, SeedBuildDir, compileOptions, tsOptions, transform)
		await rm(path.join(process.cwd(), '.swc'), { recursive: true, force: true })
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
 * Copy files meant to be inherited from the plugin onto the project's /src directory.
 * Does nothing if the plugin doesn't have any files to seed from.
 *
 * Use this after installing a plugin.
 */
export async function useSeed(packageName: string) {
	compilerLogger.debug(`Looking for seed files in plugin ${color.bold(packageName)}...`)
	const seedPath = path.resolve(PackageDir, '..', 'node_modules', packageName, '.robo', 'seed')
	const projectSrc = path.join(process.cwd(), 'src')
	compilerLogger.debug('Looking in seed path:', seedPath)

	// See if the plugin has an inherits directory
	if (existsSync(seedPath)) {
		compilerLogger.debug('Seed folder exists! Verifying manifest...')
		const manifest = await Compiler.useManifest({ name: packageName })
		const isTypeScript = manifest.__robo.language === 'typescript'

		// Copy the files recursively
		const excludeExts = Compiler.isTypescriptProject() && isTypeScript ? ['.js', '.jsx'] : ['.ts', '.tsx']
		await copyDir(seedPath, projectSrc, excludeExts, [path.join(seedPath, '_root')])
		compilerLogger.debug(`Successfully copied seed files from`, color.bold(packageName))

		// Copy the root files
		const rootPath = path.join(seedPath, '_root')
		if (existsSync(rootPath)) {
			compilerLogger.debug('Copying root seed files...')
			await copyDir(rootPath, process.cwd(), [], [])
			compilerLogger.debug(`Successfully copied root seed files from`, color.bold(packageName))
		}
	}
}

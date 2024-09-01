import { Command } from 'commander'
import tar from 'tar'
import { color, composeColors } from '../core/color.js'
import { logger } from '../core/logger.js'
import { checkSageUpdates, downloadFile, exec, getPackageManager, isRoboProject } from '../core/utils.js'
import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { access, cp, readFile, writeFile } from 'node:fs/promises'
import { cleanTempDir } from 'robo.js/utils.js'
import type { PackageJson } from '../core/types.js'

const command = new Command('import')
	.arguments('[plugins...]')
	.description('Import plugin(s) as modules into your Robo')
	.option('-ns --no-self-check', 'do not check for updates to Sage CLI')
	.option('-s --silent', 'do not print anything')
	.option('-v --verbose', 'print more information for debugging')
	.action(importAction)
export default command

interface ImportOptions {
	selfCheck?: boolean
	silent?: boolean
	verbose?: boolean
}

async function importAction(plugins: string[], options: ImportOptions) {
	// Create a logger
	logger({
		enabled: !options.silent,
		level: options.verbose ? 'debug' : 'info'
	}).info(`Importing ${plugins.length} plugin${plugins.length === 1 ? '' : 's'}...`)
	logger.debug(`CLI Options:`, options)
	logger.debug(`Package manager:`, getPackageManager())
	logger.debug(`Current working directory:`, process.cwd())
	logger.debug(`Plugins:`, plugins)
	if (options.selfCheck) {
		await checkSageUpdates()
	}

	// Validate
	if (plugins.length < 1) {
		logger.error('Please provide at least one plugin to import!')
		process.exit(1)
	}
	if (!(await isRoboProject())) {
		logger.error(`This does not appear to be a Robo project!`)
		process.exit(1)
	}

	// Read package.json for dependencies
	const packageJsonPath = path.join(process.cwd(), 'package.json')
	const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'))

	// Import plugins one by one for sanity's sake
	const success = []
	try {
		await cleanTempDir()
	} catch (error) {
		logger.debug(`Failed to clean temp directory:`, error)
	}

	let needsTypescript = false
	for (const plugin of plugins) {
		try {
			const result = await importPlugin(plugin, packageJson)
			if (result.typescript) {
				needsTypescript = true
			}

			success.push(plugin)
		} catch (error) {
			logger.error(`Failed to import plugin "${color.bold(plugin)}":`, error)
		}
	}

	// Print summary
	if (success.length > 0) {
		logger.ready(`Successfully imported ${success.length} plugin${success.length === 1 ? '' : 's'}!`)
	} else {
		logger.error(`Failed to import any plugins.`)
	}

	// Check if project needs TypeScript
	const tsPath = path.join(process.cwd(), 'tsconfig.json')
	const tsExists = await access(tsPath)
		.then(() => true)
		.catch(() => false)

	if (needsTypescript && !tsExists) {
		const docs = composeColors(color.underline, color.cyan)('https://docs.roboplay.dev/docs/advanced/typescript')
		logger.warn(`One or more of your plugins requires TypeScript.`)
		logger.warn(`See the following docs for more information:`, docs)
	}
}

async function importPlugin(plugin: string, packageJson: PackageJson) {
	// Get info from registry
	const npmResponse = await fetch(`https://registry.npmjs.org/${plugin}/latest`)
	const info = await npmResponse.json()
	const prefix = color.bold(plugin + ' >')
	logger.debug(prefix, `Registry info:`, info)

	if (!npmResponse.ok) {
		throw new Error(`Plugin "${color.bold(plugin)}" does not exist!`)
	}

	// Download package tarball using `tar` package
	const packageName = info.name.replace('/', '_').replace('@', '')
	const distDir = path.join('.robo', 'temp', `${packageName}_${info.version}`)
	const sourceTar = distDir + '.tgz'
	logger.info(prefix, `Downloading tarball...`)
	await downloadFile(info.dist.tarball, sourceTar)

	// Extract tarball
	mkdirSync(distDir, { recursive: true })
	logger.debug(prefix, `Extracting tarball...`)
	await tar.x({
		file: sourceTar,
		cwd: distDir
	})

	// Verify that the Plugin's `src` directory exists
	logger.debug(prefix, `Verifying "src" directory...`)
	const pluginDir = path.join(distDir, 'package')
	const pluginSrcDir = path.join(pluginDir, 'src')
	const pluginSrcDirExists = await access(pluginSrcDir)
		.then(() => true)
		.catch(() => false)

	if (!pluginSrcDirExists) {
		throw new Error(`Plugin "${color.bold(plugin)}" does not have a "src" directory!`)
	}

	// Copy the Plugin's `src` directory to the Robo's module directory
	logger.info(prefix, 'Copying plugin source files to Robo project...')
	const roboSrcDir = path.join(process.cwd(), 'src', 'modules', packageName)
	mkdirSync(roboSrcDir, { recursive: true })
	await cp(pluginSrcDir, roboSrcDir, {
		recursive: true
	})

	// Also copy the plugin's `README.md` if it exists
	const pluginReadmePath = path.join(pluginDir, 'README.md')
	const pluginReadmeExists = await access(pluginReadmePath)
		.then(() => true)
		.catch(() => false)

	if (pluginReadmeExists) {
		// Make sure to inject note at the top of the README saying that it was imported
		const readmeContents = await readFile(pluginReadmePath, 'utf-8')
		const readmeSource = `**[View original source](https://www.npmjs.com/package/${plugin})**`
		const readmeHeader = `> ***Import*ant:** This module was imported from the plugin package "${plugin}". ${readmeSource}\n\n`
		await writeFile(pluginReadmePath, readmeHeader + readmeContents)
		await cp(pluginReadmePath, path.join(roboSrcDir, 'README.md'))
	}

	// Check plugin's package.json and compare to project's package.json
	// Install dependencies if necessary
	logger.debug(prefix, `Reading plugin's package.json...`)
	const pluginPackageJson = JSON.parse(await readFile(path.join(pluginDir, 'package.json'), 'utf-8'))
	const pluginDeps = pluginPackageJson.dependencies ?? {}
	const pluginDevDeps = pluginPackageJson.devDependencies ?? {}
	const projectDeps = packageJson.dependencies ?? {}
	const projectDevDeps = packageJson.devDependencies ?? {}

	// Check if plugin is configured for TypeScript by checking dev dependencies for `typescript`
	logger.info(prefix, `Checking for TypeScript...`)
	const pluginHasTs = Object.keys(pluginDevDeps).includes('typescript')
	logger.debug(prefix, `Plugin ${pluginHasTs ? 'contains' : 'does not contain'} TypeScript.`)

	// It's safe to assume core is necessary for all plugins' development
	delete pluginDevDeps['robo.js']
	delete projectDevDeps['discord.js']

	// Install dependencies
	logger.debug(prefix, `Comparing dependencies...`)
	const depsToInstall = Object.keys(pluginDeps).filter((dep) => !projectDeps[dep])
	const devDepsToInstall = Object.keys(pluginDevDeps).filter((dep) => !projectDevDeps[dep])
	logger.debug(prefix, `Dependencies to install:`, depsToInstall)
	logger.debug(prefix, `Dev dependencies to install:`, devDepsToInstall)

	if (depsToInstall.length > 0) {
		logger.info(prefix, `Installing dependencies...`)
		const packageManager = getPackageManager()
		const command = packageManager === 'npm' ? 'install' : 'add'
		await exec(`${packageManager} ${command} ${depsToInstall.join(' ')}`)
	}

	if (devDepsToInstall.length > 0) {
		logger.info(prefix, `Installing dev dependencies...`)
		const packageManager = getPackageManager()
		const command = packageManager === 'npm' ? 'install' : 'add'
		const commandOption = packageManager === 'npm' ? '--save-dev' : '--dev'
		await exec(`${packageManager} ${command} ${commandOption} ${devDepsToInstall.join(' ')}`)
	}

	logger.info(prefix, `Successfully imported!`)
	return {
		typescript: pluginHasTs
	}
}

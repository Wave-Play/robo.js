import { Command } from 'commander'
import depcheck from 'depcheck'
import { color } from '../core/color.js'
import { logger } from '../core/logger.js'
import { cmd, exec, getPackageManager, isRoboProject } from '../core/utils.js'
import path from 'node:path'
import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import type { PackageJson } from '../core/types.js'

interface ProjectInfo {
	hasEslint: boolean
	hasPrettier: boolean
	hasTypescript: boolean
}

const command = new Command('export')
	.arguments('[modules...]')
	.description('Export module(s) from your Robo as plugins')
	.option('-s --silent', 'do not print anything')
	.option('-v --verbose', 'print more information for debugging')
	.action(exportAction)
export default command

interface ExportOptions {
	silent?: boolean
	verbose?: boolean
}

async function exportAction(modules: string[], options: ExportOptions) {
	// Create a logger
	logger({
		enabled: !options.silent,
		level: options.verbose ? 'debug' : 'info'
	}).info(`Exporting ${modules.length} module${modules.length === 1 ? '' : 's'}...`)
	logger.debug(`Package manager:`, getPackageManager())
	logger.debug(`Current working directory:`, process.cwd())

	// Validate
	if (modules.length < 1) {
		logger.error('Please provide at least one module to export!')
		process.exit(1)
	}
	if (!(await isRoboProject())) {
		logger.error(`This does not appear to be a Robo project!`)
		process.exit(1)
	}

	// Read package.json for dependencies
	logger.debug(`Reading project package.json...`)
	const packageJsonPath = path.join(process.cwd(), 'package.json')
	const packageJson: PackageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'))
	const projectInfo: ProjectInfo = {
		hasEslint: !!packageJson.devDependencies['eslint'],
		hasPrettier: !!packageJson.devDependencies['prettier'],
		hasTypescript: !!packageJson.devDependencies['typescript']
	}

	const results: unknown[] = []
	for (const module of modules) {
		try {
			const result = await exportModule(module, projectInfo, options)
			results.push(result)
		} catch (error) {
			logger.error(`Failed to export module "${color.bold(module)}":`, error)
		}
	}
}

async function exportModule(module: string, project: ProjectInfo, commandOptions: ExportOptions) {
	// Make sure the module exists
	logger.debug(`Checking if module "${color.bold(module)}" exists...`)
	const modulePath = path.join(process.cwd(), 'src', 'modules', module)
	const moduleExists = await access(modulePath)
		.then(() => true)
		.catch(() => false)

	if (!moduleExists) {
		throw new Error(`Module "${color.bold(module)}" does not exist!`)
	}

	// Create folder adjacent to project
	const packageName = 'robo-plugin-' + module
	const exportPath = path.join(process.cwd(), '..', packageName)
	mkdir(exportPath, { recursive: true })

	// Execute `create-robo` in the new folder
	const packageManager = getPackageManager()
	let commandName = 'npx'
	if (packageManager === 'yarn') {
		commandName = 'yarn dlx'
	} else if (packageManager === 'pnpm') {
		commandName = 'pnpx'
	} else if (packageManager === 'bun') {
		commandName = 'bunx'
	}

	const features = []
	if (project.hasEslint) {
		features.push('eslint')
	}
	if (project.hasPrettier) {
		features.push('prettier')
	}

	const options = ['--no-install', '--plugin']
	if (project.hasTypescript) {
		options.push('--typescript')
	}
	if (features.length > 0) {
		options.push('--features', features.join(','))
	}
	if (commandOptions.verbose) {
		options.push('--verbose')
	}

	logger.debug(`Creating plugin project in "${color.bold(exportPath)}"...`)
	await exec(`${commandName} create-robo ${options.join(' ')}`, {
		cwd: exportPath
	})

	// Clean the generated project template
	logger.debug(`Cleaning generated project template...`)
	const srcPath = path.join(exportPath, 'src')
	await rm(srcPath, { recursive: true, force: true })

	// Copy module files
	logger.debug(`Copying module files...`)
	await cp(modulePath, srcPath, { recursive: true })

	// Read existing README.md (if it exists)
	const readmePath = path.join(process.cwd(), 'README.md')
	const readmeExists = await access(readmePath)
		.then(() => true)
		.catch(() => false)

	// Append to generated README.md
	if (readmeExists) {
		logger.debug(`Appending to README.md...`)
		const readme = await readFile(readmePath, 'utf-8')
		const note = `\n\n> Original module README.md below\n\n${readme}`
		const generatedReadmePath = path.join(exportPath, 'README.md')
		const generatedReadme = await readFile(generatedReadmePath, 'utf-8')

		await writeFile(generatedReadmePath, generatedReadme + note)
	}

	// Read existing LICENSE (if it exists)
	const licensePath = path.join(process.cwd(), 'LICENSE')
	const licenseExists = await access(licensePath)
		.then(() => true)
		.catch(() => false)

	// Copy LICENSE
	if (licenseExists) {
		logger.debug(`Copying LICENSE...`)
		await cp(licensePath, path.join(exportPath, 'LICENSE'))
	}

	// Read generated package.json
	logger.debug(`Reading generated package.json...`)
	const generatedPackageJsonPath = path.join(exportPath, 'package.json')
	const generatedPackageJson: PackageJson = JSON.parse(await readFile(generatedPackageJsonPath, 'utf-8'))

	// Check for missing dependencies
	logger.debug(`Checking for missing dependencies...`)
	const depResults = await depcheck(srcPath, {
		package: generatedPackageJson
	})

	const missingDeps = Object.keys(depResults.missing ?? {})
	if (missingDeps) {
		logger.debug(`Missing dependencies:`, depResults.missing)
		logger.info(`Installing missing dependencies...`)
		try {
			await exec(`${cmd(packageManager)} install ${missingDeps.join(' ')}`, {
				cwd: exportPath
			})
		} catch (error) {
			logger.error(`Failed to install missing dependencies:`, error)
		}
	}

	// Build the plugin
	logger.debug(`Building plugin...`)
	await exec(`${commandName} robo build plugin`, {
		cwd: exportPath
	})

	// Install dependencies
	logger.debug(`Installing dependencies...`)
	await exec(`${cmd(packageManager)} install`, {
		cwd: exportPath
	})

	// Print success message
	logger.ready(`Successfully exported module "${color.bold(module)}" as a plugin!`)
}

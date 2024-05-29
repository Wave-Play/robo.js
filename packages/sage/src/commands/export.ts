import { Command } from 'commander'
import depcheck from 'depcheck'
import { select, Separator } from '@inquirer/prompts'
import { color, composeColors } from '../core/color.js'
import { logger } from '../core/logger.js'
import { checkSageUpdates, exec, getPackageExecutor, getPackageManager, isRoboProject } from '../core/utils.js'
import path from 'node:path'
import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import type { PackageJson } from '../core/types.js'

interface ProjectInfo {
	hasEslint: boolean
	hasPrettier: boolean
	hasTypescript: boolean
	hasWorkspaces: boolean
	roboversion: string
}

const command = new Command('export')
	.arguments('[modules...]')
	.description('Export module(s) from your Robo as plugins')
	.option('-ns --no-self-check', 'do not check for updates to Sage CLI')
	.option('-s --silent', 'do not print anything')
	.option('-v --verbose', 'print more information for debugging')
	.action(exportAction)
export default command

interface ExportOptions {
	selfCheck?: boolean
	silent?: boolean
	verbose?: boolean
}

async function exportAction(modules: string[], options: ExportOptions) {
	// Create a logger
	logger({
		enabled: !options.silent,
		level: options.verbose ? 'debug' : 'info'
	}).info(`Exporting ${modules.length} module${modules.length === 1 ? '' : 's'}...`)
	logger.debug(`CLI Options:`, options)
	logger.debug(`Package manager:`, getPackageManager())
	logger.debug(`Current working directory:`, process.cwd())
	if (options.selfCheck) {
		await checkSageUpdates()
	}

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
		hasTypescript: !!packageJson.devDependencies['typescript'],
		hasWorkspaces: !!packageJson.workspaces,
		roboversion: packageJson.dependencies['robo.js']
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
	const packageExecutor = getPackageExecutor()
	const command = getPackageManager() == 'npm' && !project.hasWorkspaces ? 'npx' : getPackageManager()

	const features = []
	if (project.hasEslint) {
		features.push('eslint')
	}
	if (project.hasPrettier) {
		features.push('prettier')
	}

	const options = ['--no-install', '--plugin']

	if (project.roboversion) {
		options.push(`--robo-version ${project.roboversion}`)
	}

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
	await exec(`${packageExecutor} create-robo ${options.join(' ')}`, {
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
			await exec(`${command} ${await usesLocalWorkaround(command, project.hasWorkspaces)} ${missingDeps.join(' ')}`, {
				cwd: exportPath
			})
		} catch (error) {
			logger.error(`Failed to install missing dependencies:`, error)
		}
	} else {
		// Install dependencies
		logger.info(`Installing dependencies...`)
		await exec(
			`${command} ${await usesLocalWorkaround(command, project.hasWorkspaces)}
			`,
			{ cwd: exportPath }
		)
	}

	// Build the plugin
	logger.debug(`Building plugin...`)
	await exec(`${packageExecutor} robo build plugin${commandOptions.verbose ? ' --verbose' : ''}`, {
		cwd: exportPath
	})

	// Print success message
	logger.ready(`Successfully exported module "${color.bold(module)}" as a plugin!`)
	logger.info(`You can find the plugin project here:`, color.bold(exportPath))

	// Ask if they want to add the new plugin
	logger.log('')
	const addPlugin = await select({
		message: color.blue(`Want to add ${packageName} to your Robo?`),
		choices: [
			{ name: 'Yes', value: true },
			{ name: 'No', value: false },
			new Separator(
				color.reset(`\n${composeColors(color.bold, color.yellow)('Warning:')} this will delete the original module!`)
			)
		]
	})

	// Add plugin to project via `robo add` command
	if (addPlugin) {
		logger.debug(`Adding plugin to project...`)
		const absolutePath = path.join(process.cwd(), '..', packageName)
		await exec(`${packageExecutor} robo add ${absolutePath}${commandOptions.verbose ? ' --verbose' : ''}`, {
			cwd: process.cwd()
		})

		// Remove module from project
		logger.debug(`Removing module from project...`)
		await rm(modulePath, { recursive: true, force: true })
		logger.ready(`Successfully added plugin "${color.bold(packageName)}" to your Robo!`)
	}
}

async function usesLocalWorkaround(packageManager: string, hasWorkspaces: boolean): Promise<string> {
	if (packageManager === 'npm' && !hasWorkspaces) {
		return 'install-local'
	} else {
		return 'install'
	}
}

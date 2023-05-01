import fs from 'fs/promises'
import path from 'path'
import inquirer from 'inquirer'
import chalk from 'chalk'
import { fileURLToPath } from 'node:url'
import { exec, getPackageManager, hasProperties } from './utils.js'
import { logger } from './logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

interface PackageJson {
	name: string
	version: string
	description: string
	engines: {
		node: string
	}
	type: 'module' | 'commonjs'
	scripts: Record<string, string>
	dependencies: {
		'discord.js': string
		'@roboplay/robo.js': string
		[key: string]: string
	}
	devDependencies: {
		[key: string]: string
	}
}

export default class Robo {
	private _name: string
	private _workingDir: string

	constructor(name: string) {
		this._name = name
		this._workingDir = path.join(process.cwd(), name)
	}

	async getUserInput(): Promise<'defaults' | string[]> {
		const { useDefaults } = await inquirer.prompt([
			{
				type: 'list',
				name: 'useDefaults',
				message: 'Choose an option:',
				choices: [
					{
						name: 'Use recommended defaults',
						value: 'defaults'
					},
					{
						name: 'Customize features',
						value: 'custom'
					}
				]
			}
		])

		if (useDefaults === 'defaults') {
			return 'defaults'
		}

		const { selectedFeatures } = await inquirer.prompt([
			{
				type: 'checkbox',
				name: 'selectedFeatures',
				message: 'Select features:',
				choices: [{ name: 'TypeScript' }, { name: 'ESLint' }, { name: 'Prettier' }]
			}
		])

		return selectedFeatures
	}

	async createPackage(features: string[]): Promise<void> {
		// Find the package manager that triggered this command
		const packageManager = getPackageManager()
		logger.debug(`Using ${chalk.bold(packageManager)} in ${this._workingDir}...`)

		// Create a package.json file based on the selected features
		const packageJson: PackageJson = {
			name: this._name,
			version: '0.1.0',
			description: '',
			engines: {
				node: '>=18.0.0'
			},
			type: 'module',
			scripts: {
				build: 'robo build',
				deploy: 'robo deploy',
				dev: 'robo dev',
				doctor: 'robo doctor',
				start: 'robo start'
			},
			dependencies: {
				'discord.js': '^14.7.1',
				'@roboplay/robo.js': 'latest'
			},
			devDependencies: {}
		}

		const runPrefix = packageManager + packageManager === 'npm' ? 'npm run ' : packageManager + ' '
		if (features.includes('TypeScript')) {
			packageJson.devDependencies['typescript'] = '^5.0.0'
		}
		if (features.includes('ESLint')) {
			packageJson.devDependencies['eslint'] = '^8.36.0'
			packageJson.scripts['lint'] = runPrefix + 'lint:eslint'
			packageJson.scripts['lint:eslint'] = 'eslint . --ext js,jsx,ts,tsx'
		}
		if (features.includes('Prettier')) {
			packageJson.devDependencies['prettier'] = '^2.8.5'
			packageJson.scripts['lint:style'] = 'prettier --write .'

			const hasLintScript = packageJson.scripts['lint']
			if (hasLintScript) {
				packageJson.scripts['lint'] += ' && ' + runPrefix + 'lint:style'
			}
		}
		await fs.mkdir(this._workingDir, { recursive: true })
		await fs.writeFile(path.join(this._workingDir, 'package.json'), JSON.stringify(packageJson, null, 2))

		// Install dependencies using the package manager that triggered the command
		await exec(`${packageManager} install`, { cwd: this._workingDir })
	}

	async copyTemplateFiles(sourceDir: string, useTypeScript: boolean): Promise<void> {
		const templateDir = useTypeScript ? '../templates/ts' : '../templates/js'
		const sourcePath = path.join(__dirname, templateDir, sourceDir)
		const targetPath = path.join(this._workingDir, sourceDir)

		const items = await fs.readdir(sourcePath)

		for (const item of items) {
			const itemSourcePath = path.join(sourcePath, item)
			const itemTargetPath = path.join(targetPath, item)
			const stat = await fs.stat(itemSourcePath)

			if (stat.isDirectory()) {
				await fs.mkdir(itemTargetPath, { recursive: true })
				await this.copyTemplateFiles(path.join(sourceDir, item), useTypeScript)
			} else {
				await fs.copyFile(itemSourcePath, itemTargetPath)
			}
		}
	}

	async askForDiscordCredentials(): Promise<void> {
		logger.log('\n')
		logger.info(
			chalk.blue('To get your Discord Token and Client ID, register your bot at the Discord Developer portal.')
		)
		logger.info(`Discord Developer Portal: ${chalk.bold.underline('https://discord.com/developers/applications')}\n`)

		const { discordToken, discordClientId } = await inquirer.prompt([
			{
				type: 'input',
				name: 'discordToken',
				message: 'Enter your Discord Token (press Enter to skip):'
			},
			{
				type: 'input',
				name: 'discordClientId',
				message: 'Enter your Discord Client ID (press Enter to skip):'
			}
		])

		const envFilePath = path.join(this._workingDir, '.env')
		let envContent = ''

		try {
			envContent = await fs.readFile(envFilePath, 'utf8')
		} catch (error) {
			if (hasProperties(error, ['code']) && error.code !== 'ENOENT') {
				throw error
			}
		}

		// Helper function to update or add a variable
		const updateOrAddVariable = (content: string, variable: string, value: string): string => {
			const regex = new RegExp(`(${variable}\\s*=)(.*)`, 'i')
			if (regex.test(content)) {
				return content.replace(regex, `$1${value}`)
			} else {
				return `${content}${variable}="${value}"\n`
			}
		}

		// Update DISCORD_TOKEN and DISCORD_CLIENT_ID variables
		envContent = updateOrAddVariable(envContent, 'DISCORD_CLIENT_ID', discordClientId ?? '')
		envContent = updateOrAddVariable(envContent, 'DISCORD_TOKEN', discordToken ?? '')

		await fs.writeFile(envFilePath, envContent)
	}
}

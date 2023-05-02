import fs from 'fs/promises'
import path from 'path'
import inquirer from 'inquirer'
import chalk from 'chalk'
import { fileURLToPath } from 'node:url'
import {
	ESLINT_IGNORE,
	PRETTIER_CONFIG,
	exec,
	generateRoboConfig,
	getPackageManager,
	hasProperties,
	sortObjectKeys
} from './utils.js'
import { logger } from './logger.js'
import type { Plugin } from '@roboplay/robo.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

interface PackageJson {
	name: string
	description: string
	version: string
	engines: {
		node: string
	}
	type: 'module' | 'commonjs'
	scripts: Record<string, string>
	dependencies: Record<string, string>
	devDependencies: Record<string, string>
}

export default class Robo {
	// Custom properties used to build the Robo project
	private _name: string
	private _useTypeScript: boolean
	private _workingDir: string

	constructor(name: string) {
		this._name = name
		this._workingDir = path.join(process.cwd(), name)
	}

	async askUseTypeScript() {
		const { useTypeScript } = await inquirer.prompt([
			{
				type: 'list',
				name: 'useTypeScript',
				message: chalk.blue('Would you like to use TypeScript?'),
				choices: [
					{ name: 'Yes', value: true },
					{ name: 'No', value: false }
				]
			}
		])

		this._useTypeScript = useTypeScript
	}

	async getUserInput(): Promise<string[]> {
		const { selectedFeatures } = await inquirer.prompt([
			{
				type: 'checkbox',
				name: 'selectedFeatures',
				message: 'Select features:',
				choices: [
					{
						name: `${chalk.bold('ESLint')} (recommended) - Keeps your code clean and consistent.`,
						short: 'ESLint',
						value: 'eslint',
						checked: true
					},
					{
						name: `${chalk.bold('Prettier')} (recommended) - Automatically formats your code for readability.`,
						short: 'Prettier',
						value: 'prettier',
						checked: true
					},
					new inquirer.Separator('\nOptional Plugins:'),
					{
						name: `${chalk.bold('GPT')} - Enable your bot to generate human-like text with the power of GPT.`,
						short: 'GPT',
						value: 'gpt'
					}
				]
			}
		])

		return selectedFeatures
	}

	async createPackage(features: string[]): Promise<void> {
		// Find the package manager that triggered this command
		const packageManager = getPackageManager()
		logger.debug(`Using ${chalk.bold(packageManager)} in ${this._workingDir}...`)
		await fs.mkdir(this._workingDir, { recursive: true })

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
		if (this._useTypeScript) {
			packageJson.devDependencies['@swc/core'] = '^1.3.44'
			packageJson.devDependencies['@types/node'] = '^18.14.6'
			packageJson.devDependencies['typescript'] = '^5.0.0'
		}
		if (features.includes('eslint')) {
			packageJson.devDependencies['eslint'] = '^8.36.0'
			packageJson.scripts['lint'] = runPrefix + 'lint:eslint'
			packageJson.scripts['lint:eslint'] = 'eslint . --ext js,jsx,ts,tsx'

			const eslintConfig = {
				extends: ['eslint:recommended'],
				env: {
					node: true
				},
				parser: undefined as string | undefined,
				plugins: [] as string[],
				root: true,
				rules: {}
			}
			if (this._useTypeScript) {
				eslintConfig.extends.push('plugin:@typescript-eslint/recommended')
				eslintConfig.parser = '@typescript-eslint/parser'
				eslintConfig.plugins.push('@typescript-eslint')

				packageJson.devDependencies['@typescript-eslint/eslint-plugin'] = '^5.56.0'
				packageJson.devDependencies['@typescript-eslint/parser'] = '^5.56.0'
			}
			await fs.writeFile(path.join(this._workingDir, '.eslintignore'), ESLINT_IGNORE)
			await fs.writeFile(path.join(this._workingDir, '.eslintrc.json'), JSON.stringify(eslintConfig, null, 2))
		}
		if (features.includes('prettier')) {
			packageJson.devDependencies['prettier'] = '^2.8.5'
			packageJson.scripts['lint:style'] = 'prettier --write .'

			const hasLintScript = packageJson.scripts['lint']
			if (hasLintScript) {
				packageJson.scripts['lint'] += ' && ' + runPrefix + 'lint:style'
			}

			// Create the prettier.config.js file
			await fs.writeFile(path.join(this._workingDir, 'prettier.config.js'), PRETTIER_CONFIG)
		}

		const plugins: Plugin[] = []
		if (features.includes('gpt')) {
			packageJson.dependencies['@roboplay/plugin-gpt'] = '^1.0.0'
			plugins.push([
				'@roboplay/plugin-gpt',
				{
					openaiKey: 'YOUR_OPENAI_KEY_HERE'
				}
			])
		}

		// Create the robo.mjs file
		const roboConfig = generateRoboConfig(plugins)
		await fs.mkdir(path.join(this._workingDir, '.config'), { recursive: true })
		await fs.writeFile(path.join(this._workingDir, '.config', 'robo.mjs'), roboConfig)

		// Sort scripts, dependencies and devDependencies alphabetically because this is important to me
		packageJson.scripts = sortObjectKeys(packageJson.scripts)
		packageJson.dependencies = sortObjectKeys(packageJson.dependencies)
		packageJson.devDependencies = sortObjectKeys(packageJson.devDependencies)

		// Order scripts, dependencies and devDependencies
		await fs.writeFile(path.join(this._workingDir, 'package.json'), JSON.stringify(packageJson, null, 2))

		// Install dependencies using the package manager that triggered the command
		await exec(`${packageManager} install`, { cwd: this._workingDir })
	}

	async copyTemplateFiles(sourceDir: string): Promise<void> {
		const templateDir = this._useTypeScript ? '../templates/ts' : '../templates/js'
		const sourcePath = path.join(__dirname, templateDir, sourceDir)
		const targetPath = path.join(this._workingDir, sourceDir)

		const items = await fs.readdir(sourcePath)

		for (const item of items) {
			const itemSourcePath = path.join(sourcePath, item)
			const itemTargetPath = path.join(targetPath, item)
			const stat = await fs.stat(itemSourcePath)

			if (stat.isDirectory()) {
				await fs.mkdir(itemTargetPath, { recursive: true })
				await this.copyTemplateFiles(path.join(sourceDir, item))
			} else {
				await fs.copyFile(itemSourcePath, itemTargetPath)
			}
		}
	}

	async askForDiscordCredentials(): Promise<void> {
		const discordPortal = chalk.bold('Discord Developer Portal:')
		const discordPortalUrl = chalk.blue.underline('https://discord.com/developers/applications')
		logger.log('')
		logger.log('To get your Discord Token and Client ID, register your bot at the Discord Developer portal.')
		logger.log(`${discordPortal} ${discordPortalUrl}\n`)

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

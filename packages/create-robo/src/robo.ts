import fs from 'fs/promises'
import path from 'path'
import inquirer from 'inquirer'
import chalk from 'chalk'
import { fileURLToPath } from 'node:url'
import {
	ESLINT_IGNORE,
	PRETTIER_CONFIG,
	cmd,
	exec,
	generateRoboConfig,
	getPackageManager,
	hasProperties,
	sortObjectKeys
} from './utils.js'
import { logger } from './logger.js'
import type { Plugin } from '@roboplay/robo.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const roboScripts = {
	build: 'robo build',
	deploy: 'robo deploy',
	dev: 'robo dev',
	doctor: 'robo doctor',
	invite: 'robo invite',
	start: 'robo start'
}

const pluginScripts = {
	build: 'robo build plugin',
	dev: 'robo build plugin --watch'
}

const optionalPlugins = [
	new inquirer.Separator('\nOptional Plugins:'),
	{
		name: `${chalk.bold('GPT')} - Enable your bot to generate human-like text with the power of GPT.`,
		short: 'GPT',
		value: 'gpt'
	},
	{
		name: `${chalk.bold('Polls')} - Add the ability to create and manage polls with ease.`,
		short: 'Polls',
		value: 'polls'
	}
]

interface PackageJson {
	name: string
	description: string
	version: string
	engines?: {
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

	// Same as above, but exposed as getters
	private _isPlugin: boolean

	public get isPlugin(): boolean {
		return this._isPlugin
	}

	constructor(name: string, isPlugin: boolean, useSameDirectory: boolean) {
		this._isPlugin = isPlugin
		this._name = name
		this._workingDir = useSameDirectory ? process.cwd() : path.join(process.cwd(), name)
	}

	async askIsPlugin() {
		const { isPlugin } = await inquirer.prompt([
			{
				type: 'list',
				name: 'isPlugin',
				message: chalk.blue('This sounds like a plugin. Would you like to set it up as one?'),
				choices: [
					{ name: 'Yes', value: true },
					{ name: 'No', value: false }
				]
			}
		])

		this._isPlugin = isPlugin
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

	useTypeScript(useTypeScript: boolean) {
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
					...(this._isPlugin ? [] : optionalPlugins)
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
			description: '',
			version: '1.0.0',
			type: 'module',
			scripts: this._isPlugin ? pluginScripts : roboScripts,
			dependencies: {},
			devDependencies: {}
		}

		// Robo.js and Discord.js are normal dependencies, unless this is a plugin
		if (!this._isPlugin) {
			packageJson.dependencies['@roboplay/robo.js'] = 'latest'
			packageJson.dependencies['discord.js'] = '^14.7.1'
		} else {
			packageJson.devDependencies['@roboplay/robo.js'] = 'latest'
			packageJson.devDependencies['discord.js'] = '^14.7.1'
		}

		// Generate customized documentation
		if (this._isPlugin) {
			let pluginName = this._name
				.replace(/[^a-zA-Z0-9]/g, ' ')
				.split(' ')
				.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
				.join('')
			pluginName = pluginName.charAt(0).toLowerCase() + pluginName.slice(1)
			if (!pluginName.toLowerCase().includes('plugin')) {
				pluginName += 'Plugin'
			}

			const readme = await fs.readFile(path.join(__dirname, '../docs/plugin-readme.md'), 'utf-8')
			const customReadme = readme
				.replaceAll('{{projectName}}', this._name)
				.replaceAll('{{pluginVariableName}}', pluginName)
			await fs.writeFile(path.join(this._workingDir, 'README.md'), customReadme)

			const development = await fs.readFile(path.join(__dirname, '../docs/plugin-development.md'), 'utf-8')
			const customDevelopment = development.replaceAll('{{projectName}}', this._name)
			await fs.writeFile(path.join(this._workingDir, 'DEVELOPMENT.md'), customDevelopment)
		} else {
			const readme = await fs.readFile(path.join(__dirname, '../docs/robo-readme.md'), 'utf-8')
			const customReadme = readme.replaceAll('{{projectName}}', this._name)
			await fs.writeFile(path.join(this._workingDir, 'README.md'), customReadme)
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
		if (features.includes('polls')) {
			packageJson.dependencies['@roboplay/plugin-poll'] = '^0.1.0'
			plugins.push('@roboplay/plugin-poll')
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
		await exec(`${cmd(packageManager)} install`, { cwd: this._workingDir })
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
		const officialGuide = chalk.bold('Official Guide:')
		const officialGuideUrl = chalk.blue.underline('https://docs.roboplay.dev/docs/advanced/environment-variables')
		logger.log('')
		logger.log('To get your Discord Token and Client ID, register your bot at the Discord Developer portal.')
		logger.log(`${discordPortal} ${discordPortalUrl}`)
		logger.log(`${officialGuide} ${officialGuideUrl}\n`)

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

import fs from 'fs/promises'
import path from 'path'
import inquirer from 'inquirer'
import chalk from 'chalk'
import { fileURLToPath } from 'node:url'
import {
	ESLINT_IGNORE,
	PRETTIER_CONFIG,
	ROBO_CONFIG,
	cmd,
	exec,
	getPackageManager,
	hasProperties,
	getNodeOptions,
	prettyStringify,
	sortObjectKeys,
	updateOrAddVariable
} from './utils.js'
import { logger } from './logger.js'
import { RepoInfo, downloadAndExtractRepo, getRepoInfo, hasRepo } from './templates.js'
import retry from 'async-retry'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const roboScripts = {
	build: 'robo build',
	deploy: 'robo deploy',
	dev: `${getNodeOptions()} robo dev`,
	doctor: 'robo doctor',
	invite: 'robo invite',
	start: 'robo start'
}

const pluginScripts = {
	build: 'robo build plugin',
	dev: `${getNodeOptions()} robo build plugin --watch`,
	prepublishOnly: 'robo build plugin'
}

const optionalPlugins = [
	new inquirer.Separator('\nOptional Plugins:'),
	{
		name: `${chalk.bold(
			'AI'
		)} - Transform your Robo into an engaging chatbot using AI. Supports customized behaviors and Discord commands.`,
		short: 'AI',
		value: 'ai'
	},
	{
		name: `${chalk.bold(
			'AI Voice'
		)} - Give your Robo a voice! Command and converse with it verbally in voice channels.`,
		short: 'AI Voice',
		value: 'ai-voice'
	},
	{
		name: `${chalk.bold(
			'API'
		)} - Effortlessly create and manage API routes, turning your Robo project into a full-fledged API server.`,
		short: 'API',
		value: 'api'
	},
	{
		name: `${chalk.bold('GPT')} - Enable your robo to generate human-like text with the power of GPT.`,
		short: 'GPT',
		value: 'gpt'
	},
	{
		name: `${chalk.bold('Maintenance')} - Add a maintenance mode to your robo.`,
		short: 'Maintenance',
		value: 'maintenance'
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
	private: boolean
	engines?: {
		node: string
	}
	type: 'module' | 'commonjs'
	main?: string
	license?: string
	author?: string
	contributors?: string[]
	files?: string[]
	repository?: {
		directory: string
		type: string
		url: string
	}
	publishConfig?: {
		access: 'public' | 'restricted'
		registry: string
	}
	scripts: Record<string, string>
	dependencies: Record<string, string>
	devDependencies: Record<string, string>
	peerDependencies?: Record<string, string>
	peerDependenciesMeta?: Record<string, Record<string, unknown>>
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

	async downloadTemplate(url: string) {
		logger.debug(`Using template: ${url}`)
		let repoUrl: URL | undefined
		let repoInfo: RepoInfo | undefined

		try {
			repoUrl = new URL(url)
		} catch (error) {
			if (hasProperties(error, ['code']) && error.code !== 'ERR_INVALID_URL') {
				logger.error(error)
				process.exit(1)
			}
		}

		if (repoUrl) {
			logger.debug(`Validating template URL:`, repoUrl)
			if (repoUrl.origin !== 'https://github.com') {
				logger.error(
					`Invalid URL: ${chalk.red(
						`"${url}"`
					)}. Only GitHub repositories are supported. Please use a GitHub URL and try again.`
				)
				process.exit(1)
			}

			repoInfo = await getRepoInfo(repoUrl)
			logger.debug(`Found repo info:`, repoInfo)

			if (!repoInfo) {
				logger.error(`Found invalid GitHub URL: ${chalk.red(`"${url}"`)}. Please fix the URL and try again.`)
				process.exit(1)
			}

			const found = await hasRepo(repoInfo)

			if (!found) {
				logger.error(
					`Could not locate the repository for ${chalk.red(
						`"${url}"`
					)}. Please check that the repository exists and try again.`
				)
				process.exit(1)
			}
		}

		logger.info(`Downloading files from repo ${chalk.cyan(url)}. This might take a moment.`)
		logger.log()
		await retry(() => downloadAndExtractRepo(this._workingDir, repoInfo), {
			retries: 3
		})
		logger.debug(`Finished downloading files from repo ${chalk.cyan(url)}.`)
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

	async createPackage(features: string[], install: boolean, roboversion: string): Promise<void> {
		// Find the package manager that triggered this command
		const packageManager = getPackageManager()
		logger.debug(`Using ${chalk.bold(packageManager)} in ${this._workingDir}...`)
		await fs.mkdir(this._workingDir, { recursive: true })

		// Create a package.json file based on the selected features
		const npmRegistry = {
			access: 'public',
			registry: 'https://registry.npmjs.org/'
		} as const
		const packageJson: PackageJson = {
			name: this._name,
			description: '',
			version: '1.0.0',
			type: 'module',
			private: !this._isPlugin,
			main: this._isPlugin ? '.robo/build/index.js' : undefined,
			license: this._isPlugin ? 'MIT' : undefined,
			author: this._isPlugin ? `Your Name <email>` : undefined,
			contributors: this._isPlugin ? [`Your Name <email>`] : undefined,
			files: this._isPlugin ? ['.robo/', 'src/', 'LICENSE', 'README.md'] : undefined,
			publishConfig: this._isPlugin ? npmRegistry : undefined,
			scripts: this._isPlugin ? pluginScripts : roboScripts,
			dependencies: {},
			devDependencies: {}
		}

		// Robo.js and Discord.js are normal dependencies, unless this is a plugin
		if (!this._isPlugin) {
			packageJson.dependencies['@roboplay/robo.js'] = `${roboversion}`
			packageJson.dependencies['discord.js'] = '^14.13.0'
		} else {
			packageJson.devDependencies['@roboplay/robo.js'] = `${roboversion}`
			packageJson.devDependencies['discord.js'] = '^14.13.0'
			packageJson.peerDependencies = {
				'@roboplay/robo.js': '^0.9.0'
			}
			packageJson.peerDependenciesMeta = {
				'@roboplay/robo.js': {
					optional: false
				}
			}

			// Clean up undefined fields from packageJson
			Object.keys(packageJson).forEach((key) => {
				if (packageJson[key as keyof PackageJson] === undefined) {
					delete packageJson[key as keyof PackageJson]
				}
			})
		}

		// Generate customized documentation
		if (this._isPlugin) {
			logger.debug(`Generating plugin documentation...`)
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
			logger.debug(`Generating Robo documentation...`)
			const readme = await fs.readFile(path.join(__dirname, '../docs/robo-readme.md'), 'utf-8')
			const customReadme = readme.replaceAll('{{projectName}}', this._name)
			await fs.writeFile(path.join(this._workingDir, 'README.md'), customReadme)
		}

		const runPrefix = packageManager === 'npm' ? 'npm run ' : packageManager + ' '
		if (this._useTypeScript) {
			packageJson.devDependencies['@swc/core'] = '^1.3.44'
			packageJson.devDependencies['@types/node'] = '^18.14.6'
			packageJson.devDependencies['typescript'] = '^5.0.0'
		}

		logger.debug(`Adding features:`, features)
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
			await fs.writeFile(path.join(this._workingDir, 'prettier.config.mjs'), PRETTIER_CONFIG)
		}

		// Create the robo.mjs file
		let roboConfig = ROBO_CONFIG
		if (this._isPlugin) {
			roboConfig = roboConfig.replace(`type: 'robo'`, `type: 'plugin'`)
		}

		logger.debug(`Writing Robo config file...`)
		await fs.mkdir(path.join(this._workingDir, 'config', 'plugins'), { recursive: true })
		await fs.writeFile(path.join(this._workingDir, 'config', 'robo.mjs'), roboConfig)
		logger.debug(`Finished writing Robo config file:\n`, roboConfig)
		logger.debug(`Setting up plugins...`)

		if (features.includes('ai')) {
			packageJson.dependencies['@roboplay/plugin-ai'] = '^0.1.0'
			await this.createPluginConfig('@roboplay/plugin-ai', {
				commands: false,
				openaiKey: 'process.env.OPENAI_KEY',
				systemMessage: 'You are a helpful Robo.',
				whitelist: {
					channelIds: []
				}
			})
		}
		if (features.includes('ai-voice')) {
			packageJson.dependencies['@roboplay/plugin-ai-voice'] = '^0.1.0'
			await this.createPluginConfig('@roboplay/plugin-ai-voice', {})
		}
		if (features.includes('api')) {
			packageJson.dependencies['@roboplay/plugin-api'] = '^0.1.0'
			await this.createPluginConfig('@roboplay/plugin-api', {
				cors: true,
				port: 3000
			})
		}
		if (features.includes('gpt')) {
			packageJson.dependencies['@roboplay/plugin-gpt'] = '^1.0.0'
			await this.createPluginConfig('@roboplay/plugin-gpt', {
				openaiKey: 'process.env.OPENAI_KEY'
			})
		}
		if (features.includes('maintenance')) {
			packageJson.dependencies['@roboplay/plugin-maintenance'] = '^0.1.0'
			await this.createPluginConfig('@roboplay/plugin-maintenance', {})
		}
		if (features.includes('polls')) {
			packageJson.dependencies['@roboplay/plugin-poll'] = '^0.1.0'
			await this.createPluginConfig('@roboplay/plugin-poll', {})
		}

		// Sort scripts, dependencies and devDependencies alphabetically because this is important to me
		packageJson.scripts = sortObjectKeys(packageJson.scripts)
		packageJson.dependencies = sortObjectKeys(packageJson.dependencies)
		packageJson.devDependencies = sortObjectKeys(packageJson.devDependencies)

		// Order scripts, dependencies and devDependencies
		logger.debug(`Writing package.json file...`)
		await fs.writeFile(path.join(this._workingDir, 'package.json'), JSON.stringify(packageJson, null, 2))

		// Install dependencies using the package manager that triggered the command
		if (install) {
			await exec(`${cmd(packageManager)} install`, { cwd: this._workingDir })
		}
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

	async askForDiscordCredentials(features: string[]): Promise<void> {
		const discordPortal = chalk.bold('Discord Developer Portal:')
		const discordPortalUrl = chalk.blue.underline('https://discord.com/developers/applications')
		const officialGuide = chalk.bold('Official Guide:')
		const officialGuideUrl = chalk.blue.underline('https://docs.roboplay.dev/docs/advanced/environment-variables')
		logger.log('')
		logger.log('To get your Discord Token and Client ID, register your bot at the Discord Developer portal.')
		logger.log(`${discordPortal} ${discordPortalUrl}`)
		logger.log(`${officialGuide} ${officialGuideUrl}\n`)

		const { discordClientId, discordToken } = await inquirer.prompt([
			{
				type: 'input',
				name: 'discordClientId',
				message: 'Enter your Discord Client ID (press Enter to skip):'
			},
			{
				type: 'input',
				name: 'discordToken',
				message: 'Enter your Discord Token (press Enter to skip):'
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

		// Update DISCORD_TOKEN and DISCORD_CLIENT_ID variables
		envContent = updateOrAddVariable(envContent, 'DISCORD_CLIENT_ID', discordClientId ?? '')
		envContent = updateOrAddVariable(envContent, 'DISCORD_TOKEN', discordToken ?? '')

		if (features.includes('ai') || features.includes('gpt')) {
			envContent = updateOrAddVariable(envContent, 'OPENAI_KEY', '')
		}
		if (features.includes('ai-voice')) {
			envContent = updateOrAddVariable(envContent, 'AZURE_SUBSCRIPTION_KEY', '')
			envContent = updateOrAddVariable(envContent, 'AZURE_SUBSCRIPTION_REGION', '')
		}
		if (features.includes('api')) {
			envContent = updateOrAddVariable(envContent, 'PORT', '3000')
		}

		await fs.writeFile(envFilePath, envContent)
	}

	/**
	 * Generates a plugin config file in the config/plugins directory.
	 *
	 * @param pluginName The name of the plugin (e.g. @roboplay/plugin-ai)
	 * @param config The plugin config
	 */
	private async createPluginConfig(pluginName: string, config: Record<string, unknown>) {
		const pluginParts = pluginName.replace(/^@/, '').split('/')

		// Create parent directory if this is a scoped plugin
		if (pluginName.startsWith('@')) {
			await fs.mkdir(path.join(this._workingDir, 'config', 'plugins', pluginParts[0]), {
				recursive: true
			})
		}

		// Normalize plugin path
		const pluginPath = path.join(this._workingDir, 'config', 'plugins', ...pluginParts) + '.mjs'
		const pluginConfig = prettyStringify(config) + '\n'

		logger.debug(`Writing ${pluginName} config to ${pluginPath}...`)
		await fs.writeFile(pluginPath, `export default ${pluginConfig}`)
	}
}

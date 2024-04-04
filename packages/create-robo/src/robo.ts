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
	prettyStringify,
	sortObjectKeys,
	updateOrAddVariable,
	getPackageExecutor,
	Indent,
	ExecOptions,
	Space
} from './utils.js'
import { RepoInfo, downloadAndExtractRepo, getRepoInfo, hasRepo } from './templates.js'
import retry from 'async-retry'
import { logger } from '@roboplay/robo.js'
// @ts-expect-error - Internal
import { Spinner } from '@roboplay/robo.js/dist/cli/utils/spinner.js'
import type { CommandOptions } from './index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const roboScripts = {
	build: 'robo build',
	deploy: 'robo deploy',
	dev: `robox dev`,
	doctor: 'robo doctor',
	invite: 'robo invite',
	start: 'robo start'
}

const pluginScripts = {
	build: 'robo build plugin',
	dev: `robo build plugin --watch`,
	prepublishOnly: 'robo build plugin'
}
type Plugin = {
	name: string
	short: string
	value: string
}[]

const optionalFeatures = [
	{
		name: `${chalk.bold('TypeScript')} (recommended) - A superset of JavaScript that adds static types.`,
		short: 'TypeScript',
		value: 'typescript',
		checked: true
	},
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
	{
		name: `${chalk.bold('Extensionless')} - Removes the need for file extensions in imports.`,
		short: 'Extensionless',
		value: 'extensionless',
		checked: false
	}
]

const optionalPlugins: [string | inquirer.Separator, ...Plugin] = [
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
			'Web Server'
		)} - Turn your Robo into a web server! Create and manage web pages, APIs, and more.`,
		short: 'Web Server',
		value: 'server'
	},
	{
		name: `${chalk.bold('Maintenance')} - Add a maintenance mode to your robo.`,
		short: 'Maintenance',
		value: 'maintenance'
	},
	{
		name: `${chalk.bold('Moderation Tools')} - Equip your bot with essential tools to manage and maintain your server.`,
		short: 'Moderation Tools',
		value: 'modtools'
	}
]

interface PackageJson {
	name: string
	description: string
	keywords: string[]
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
type appTemplate = 'VTS' | 'VJS' | 'RTS' | 'RJS' | undefined

export default class Robo {
	private readonly _nodeOptions = ['--enable-source-maps']
	private readonly _spinner = new Spinner()

	// Custom properties used to build the Robo project
	private _installFailed: boolean
	private _missingEnv: boolean
	private _name: string
	private _useTypeScript: boolean | undefined
	private _workingDir: string
	private _isApp: boolean
	private _appTemplate: appTemplate

	// Same as above, but exposed as getters
	private _isPlugin: boolean

	public get installFailed(): boolean {
		return this._installFailed
	}

	public get isPlugin(): boolean {
		return this._isPlugin
	}

	public get missingEnv(): boolean {
		return this._missingEnv
	}

	constructor(name: string, isPlugin: boolean, useSameDirectory: boolean, isApp: boolean) {
		this._isPlugin = isPlugin
		this._name = name
		this._isApp = isApp
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

	async askUseTemplate() {
		const { useTemplate } = await inquirer.prompt<Record<string, appTemplate>>([
			{
				type: 'list',
				name: 'useTemplate',
				message: chalk.blue('Choose a template for your app!'),
				choices: [
					{
						name: 'Vanilla JS',
						value: 'VJS'
					},
					{
						name: 'Vanilla TS',
						value: 'VTS'
					},
					{
						name: 'React-TS',
						value: 'RTS'
					},
					{
						name: 'React-JS',
						value: 'RJS'
					}
				]
			}
		])
		this._useTypeScript = useTemplate.includes('TS')
		this._appTemplate = useTemplate
	}

	async downloadTemplate(url: string) {
		logger.debug(`Using template: ${url}`)
		let repoUrl: URL | undefined
		let repoInfo: RepoInfo | undefined
		logger.debug('\n')
		logger.log('\x1B[1A\x1B[K\x1B[1A\x1B[K')
		logger.log(Indent, chalk.bold('🌐 Creating from template'))
		this._spinner.setText(Indent + '    {{spinner}} Downloading template...\n')

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

		const result = await retry(() => downloadAndExtractRepo(this._workingDir, repoInfo), {
			retries: 3
		})
		this._spinner.stop(false)
		logger.log(Indent, `   Bootstraped project successfully from ${chalk.bold.cyan(result?.name ?? 'repository')}.`)
	}

	useTypeScript(useTypeScript: boolean) {
		this._useTypeScript = useTypeScript
	}

	async getUserInput(): Promise<string[]> {
		// Exclude TypeScript from the optional features if the user has already selected it
		const features =
			this._useTypeScript !== undefined ? optionalFeatures.filter((f) => f.value !== 'typescript') : optionalFeatures

		// Sorry, plugin developers don't get Extensionless as an option
		if (this._isPlugin) {
			const index = features.findIndex((f) => f.value === 'extensionless')

			if (index >= 0) {
				features.splice(index, 1)
			}
		}

		// Prompto! (I'm sorry)
		const optionalAppPlugins = optionalPlugins.filter((plugin) => {
			const obj = plugin as unknown as Plugin[0]
			if (obj.value === 'api') {
				return
			}
			return plugin
		})
		const { selectedFeatures } = await inquirer.prompt([
			{
				type: 'checkbox',
				name: 'selectedFeatures',
				message: 'Select features:',
				choices: [...features, ...(this._isPlugin ? [] : this._isApp ? optionalAppPlugins : optionalPlugins)]
			}
		])

		// Determine if TypeScript is selected only if it wasn't previously set
		if (this._useTypeScript === undefined) {
			this._useTypeScript = selectedFeatures.includes('typescript')
		}

		// Move up one line
		logger.log('\x1B[1A\x1B[K\x1B[1A\x1B[K')

		return selectedFeatures
	}

	async createPackage(features: string[], plugins: string[], cliOptions: CommandOptions): Promise<void> {
		const { install = true } = cliOptions

		// Find the package manager that triggered this command
		const packageManager = getPackageManager()
		logger.debug(`Using ${chalk.bold(packageManager)} in ${this._workingDir}...`)
		await fs.mkdir(this._workingDir, { recursive: true })

		// Move up one line and print new section
		logger.debug('\n')
		logger.log(
			Indent,
			chalk.bold(`📦 Creating ${chalk.cyan(this._useTypeScript ? 'TypeScript' : 'JavaScript')} project`)
		)
		this._spinner.setText(Indent + '    {{spinner}} Generating files...\n')
		this._spinner.start()

		// Create a package.json file based on the selected features
		const npmRegistry = {
			access: 'public',
			registry: 'https://registry.npmjs.org/'
		} as const
		const dependencies: string[] = []
		const devDependencies: string[] = []
		const packageJson: PackageJson = {
			name: this._name,
			description: '',
			version: '1.0.0',
			type: 'module',
			private: !this._isPlugin,
			keywords: ['robo', 'robo.js'],
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
		if (this._isApp) {
			packageJson.dependencies['@discord/embedded-app-sdk'] = '^1.0.2'
			packageJson.dependencies['dotenv'] = '^16.4.1'
			packageJson.devDependencies['vite'] = '^5.0.8'
			packageJson.dependencies['@roboplay/robo.js'] = 'latest'
			packageJson.dependencies['@roboplay/plugin-api'] = '^0.2.3'
			await this.createPluginConfig('@roboplay/plugin-api', {
				cors: true,
				port: 3000
			})
			if (this._appTemplate === 'RTS' || this._appTemplate === 'RJS') {
				packageJson.dependencies['react'] = '^18.2.0'
				packageJson.dependencies['react-dom'] = '^18.2.0'

				packageJson.devDependencies['@types/react'] = '^18.2.66'
				packageJson.devDependencies['@types/react-dom'] = '^18.2.22'
				packageJson.devDependencies['eslint-plugin-react-hooks'] = '^4.6.0'
				packageJson.devDependencies['eslint-plugin-react-refresh'] = '^0.4.6'
			} else if (!this._isPlugin) {
				packageJson.dependencies['@roboplay/robo.js'] = 'latest'
				packageJson.dependencies['discord.js'] = '^14.13.0'
			}
		}

		if (cliOptions.kit === 'app') {
			packageJson.keywords.push('activity', 'discord', 'sdk', 'embed', 'embedded app')
		} else {
			packageJson.keywords.push('bot', 'discord', 'discord.js')
		}

		// Robo.js and Discord.js are normal dependencies, unless this is a plugin
		const roboDep = '@roboplay/robo.js' + (cliOptions.roboVersion ? `@${cliOptions.roboVersion}` : '')

		if (!this._isPlugin) {
			dependencies.push(roboDep)
			dependencies.push('discord.js')
		} else {
			devDependencies.push(roboDep)
			devDependencies.push('discord.js')
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
			if (this._appTemplate === 'RTS') {
				devDependencies.push('@vitejs/plugin-react-swc')
			}
			packageJson.keywords.push('typescript')
			devDependencies.push('@swc/core')
			devDependencies.push('@types/node')
			devDependencies.push('typescript')
		} else {
			packageJson.keywords.push('javascript')
		}

		logger.debug(`Adding features:`, features)
		if (features.includes('eslint')) {
			devDependencies.push('eslint')
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

				devDependencies.push('@typescript-eslint/eslint-plugin')
				devDependencies.push('@typescript-eslint/parser')
			}
			await fs.writeFile(path.join(this._workingDir, '.eslintignore'), ESLINT_IGNORE)
			await fs.writeFile(path.join(this._workingDir, '.eslintrc.json'), JSON.stringify(eslintConfig, null, 2))
		}

		if (features.includes('prettier')) {
			devDependencies.push('prettier')
			packageJson.scripts['lint:style'] = 'prettier --write .'

			const hasLintScript = packageJson.scripts['lint']
			if (hasLintScript) {
				packageJson.scripts['lint'] += ' && ' + runPrefix + 'lint:style'
			}

			// Create the prettier.config.js file
			await fs.writeFile(path.join(this._workingDir, 'prettier.config.mjs'), PRETTIER_CONFIG)
		}

		if (features.includes('extensionless')) {
			dependencies.push('extensionless')
			this._nodeOptions.push('--import=extensionless/register')

			// Replace every "robo" command with "robox"
			for (const [key, value] of Object.entries(packageJson.scripts)) {
				packageJson.scripts[key] = value.replace('robo ', 'robox ')
			}
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
			packageJson.keywords.push('ai', 'gpt', 'openai')
			dependencies.push('@roboplay/plugin-ai')
			await this.createPluginConfig('@roboplay/plugin-ai', {
				commands: false,
				openaiKey: 'process.env.OPENAI_API_KEY',
				systemMessage: 'You are a helpful Robo.',
				whitelist: {
					channelIds: []
				}
			})
		}
		if (features.includes('ai-voice')) {
			packageJson.keywords.push('speech', 'voice')
			dependencies.push('@roboplay/plugin-ai-voice')
			await this.createPluginConfig('@roboplay/plugin-ai-voice', {})
		}
		if (features.includes('server')) {
			packageJson.keywords.push('api', 'http', 'server', 'web')
			dependencies.push('@roboplay/plugin-api')
			await this.createPluginConfig('@roboplay/plugin-api', {
				cors: true
			})
		}
		if (features.includes('maintenance')) {
			packageJson.keywords.push('maintenance')
			dependencies.push('@roboplay/plugin-maintenance')
			await this.createPluginConfig('@roboplay/plugin-maintenance', {})
		}
		if (features.includes('modtools')) {
			packageJson.keywords.push('moderation', 'moderator')
			dependencies.push('@roboplay/plugin-modtools')
			await this.createPluginConfig('@roboplay/plugin-modtools', {})
		}

		// Sort keywords, scripts, dependencies, and devDependencies alphabetically (this is important to me)
		packageJson.keywords.sort()
		packageJson.scripts = sortObjectKeys(packageJson.scripts)
		dependencies.sort()
		devDependencies.sort()

		const writeDependencies = () => {
			dependencies.forEach((dep) => {
				const versionIndex = dep.lastIndexOf('@')

				if (versionIndex > 0) {
					packageJson.dependencies[dep.slice(0, versionIndex)] = dep.slice(versionIndex + 1)
				} else {
					packageJson.dependencies[dep] = 'latest'
				}
			})
			devDependencies.forEach((dep) => {
				const versionIndex = dep.lastIndexOf('@')

				if (versionIndex > 0) {
					packageJson.devDependencies[dep.slice(0, versionIndex)] = dep.slice(versionIndex + 1)
				} else {
					packageJson.devDependencies[dep] = 'latest'
				}
			})
		}

		const pureFeatures = features
			.filter((f) => f !== 'typescript')
			.map((f) => {
				return optionalFeatures.find((feature) => feature.value === f)?.short ?? f
			})
		if (!install) {
			writeDependencies()
			this._spinner.stop(false)
			let extra = ''
			if (pureFeatures.length > 0) {
				extra = ` with ${pureFeatures.map((f) => chalk.bold.cyan(f)).join(', ')}`
			}
			logger.log(Indent, `   Project created successfully${extra}.`)
		}

		// Write the package.json file
		logger.debug(`Writing package.json file...`)
		await fs.writeFile(path.join(this._workingDir, 'package.json'), JSON.stringify(packageJson, null, 2))

		// Install dependencies using the package manager that triggered the command
		if (install) {
			if (cliOptions.verbose) {
				this._spinner.stop()
			}

			try {
				let baseCommand = cmd(packageManager) + ' ' + (packageManager === 'npm' ? 'install' : 'add')
				this._spinner.setText(Indent + '    {{spinner}} Installing dependencies...\n')
				const execOptions: ExecOptions = {
					cwd: this._workingDir,
					stdio: cliOptions.verbose ? 'pipe' : 'ignore',
					verbose: cliOptions.verbose
				}

				await exec(baseCommand + ' ' + dependencies.join(' '), execOptions)

				this._spinner.setText(Indent + '    {{spinner}} Installing dev dependencies...\n')
				baseCommand += packageManager === 'yarn' ? ' --dev' : ' --save-dev'
				await exec(baseCommand + ' ' + devDependencies.join(' '), execOptions)
				this._spinner.stop(false)
				let extra = ''
				if (pureFeatures.length > 0) {
					extra = ` with ${pureFeatures.map((f) => chalk.bold.cyan(f)).join(', ')}`
				}

				// Oxford comma 'cause we fancy uwu
				if (pureFeatures.length > 1) {
					const lastComma = extra.lastIndexOf(',')
					extra = extra.slice(0, lastComma) + ' and' + extra.slice(lastComma + 1)
				}
				if (pureFeatures.length > 2) {
					extra = extra.replace(' and', ', and')
				}

				logger.log(Indent, `   Project created successfully${extra}.`, Space)
			} catch {
				this._spinner.stop(false)
				this._installFailed = true
				logger.log(Indent, chalk.red(`   Could not install dependencies!`))

				writeDependencies()
				logger.debug(`Updating package.json file...`)
				await fs.writeFile(path.join(this._workingDir, 'package.json'), JSON.stringify(packageJson, null, 2))
			}
		}

		// Install and register the necessary plugins
		if (plugins.length > 0) {
			const executor = getPackageExecutor()

			try {
				await exec(`${executor} robo add ${plugins.join(' ')}`, { cwd: this._workingDir })
			} catch (error) {
				logger.error(`Failed to install plugins:`, error)
				logger.warn(`Please add the plugins manually using ${chalk.bold(executor + ' robo add')}`)
			}
		}
	}

	private whichTemplate(useTypeScript: boolean, isApp: boolean, appTemplate: appTemplate): string {
		if (isApp) {
			switch (appTemplate) {
				case 'RJS': {
					return 'none'
				}
				case 'RTS': {
					return '../templates/dapp-rts'
				}
				case 'VJS': {
					return '../templates/dapp-js'
				}
				case 'VTS': {
					return '../templates/dapp-ts'
				}
				default:
					break
			}
		} else {
			return useTypeScript ? '../templates/ts' : '../templates/js'
		}
	}

	async copyTemplateFiles(sourceDir: string): Promise<void> {
		const templateDir = this.whichTemplate(this._useTypeScript, this._isApp, this._appTemplate)
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

	async askForDiscordCredentials(features: string[], verbose: boolean): Promise<void> {
		const discordPortal = 'Portal:'
		const discordPortalUrl = chalk.bold.blue('https://discord.com/developers/applications')
		const officialGuide = 'Guide:'
		const officialGuideUrl = chalk.bold.blue('https://roboplay.dev/botkey')
		logger.log('')
		logger.log(`${discordPortal} ${discordPortalUrl}`)
		logger.log(`${officialGuide} ${officialGuideUrl}\n`)
		logger.log(Indent, chalk.bold('🔑 Setting up credentials'))

		if (this._isApp) {
			logger.log(
				Indent,
				'To get your Discord Client Secret and Client ID, register your app at the Discord Developor portal.'
			)
		} else {
			logger.log(Indent, '   Get your credentials from the Discord Developer portal.\n')
		}
		logger.log(Indent, `   ${discordPortal} ${discordPortalUrl}`)
		logger.log(Indent, `   ${officialGuide} ${officialGuideUrl}\n`)

		const { discordClientId, discordToken } = await inquirer.prompt([
			{
				type: 'input',
				name: 'discordClientId',
				message: 'Enter your Discord Client ID (press Enter to skip):'
			},
			{
				type: 'input',
				name: 'discordToken',
				message: this._isApp
					? 'Enter your Discord Client Secret (press enter to skip)'
					: 'Enter your Discord Token (press Enter to skip):'
			}
		])

		if (!discordClientId || !discordToken) {
			this._missingEnv = true
		}

		if (verbose) {
			logger.log('')
		} else {
			logger.log('\x1B[1A\x1B[K\x1B[1A\x1B[K')
		}
		this._spinner.setText(Indent + '    {{spinner}} Applying credentials...\n')
		this._spinner.start()

		const envFilePath = path.join(this._workingDir, '.env')
		let envContent = ''

		try {
			envContent = await fs.readFile(envFilePath, 'utf8')
		} catch (error) {
			if (hasProperties(error, ['code']) && error.code !== 'ENOENT') {
				throw error
			}
		}

		envContent = updateOrAddVariable(envContent, 'DISCORD_CLIENT_ID', discordClientId ?? '')
		envContent = updateOrAddVariable(
			envContent,
			this._isApp ? 'DISCORD_CLIENT_SECRET' : 'DISCORD_TOKEN',
			discordToken ?? ''
		)
		envContent = updateOrAddVariable(envContent, 'DISCORD_TOKEN', discordToken ?? '')
		envContent = updateOrAddVariable(envContent, 'NODE_OPTIONS', this._nodeOptions.join(' '))

		if (features.includes('ai') || features.includes('gpt')) {
			envContent = updateOrAddVariable(envContent, 'OPENAI_KEY', '')
		}
		if (features.includes('ai-voice')) {
			envContent = updateOrAddVariable(envContent, 'AZURE_SUBSCRIPTION_KEY', '')
			envContent = updateOrAddVariable(envContent, 'AZURE_SUBSCRIPTION_REGION', '')
		}
		if (features.includes('server')) {
			envContent = updateOrAddVariable(envContent, 'PORT', '3000')
		}

		await fs.writeFile(envFilePath, envContent)
		await this.createEnvTsFile()
		this._spinner.stop()
		logger.log(Indent, '   Manage your credentials in the', chalk.bold.cyan('.env'), 'file.')
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

	/**
	 * Adds the "env.d.ts" entry to the compilerOptions in the tsconfig.json
	 *
	 */

	private async createEnvTsFile() {
		if (this._useTypeScript) {
			const autoCompletionEnvVar = `export {}\ndeclare global {\n    namespace NodeJS {\n		interface ProcessEnv {\n			DISCORD_CLIENT_ID: string\n			${
				this._isApp ? 'DISCORD_CLIENT_SECRET: string' : 'DISCORD_TOKEN: string'
			}
			}\n		}\n	} \n}`

			const tsconfigPath = path.join(this._workingDir, 'tsconfig.json')

			const tsconfig = await fs
				.access(tsconfigPath)
				.then(() => true)
				.catch(() => false)

			if (tsconfig) {
				await fs.writeFile(path.join(this._workingDir, 'env.d.ts'), autoCompletionEnvVar)
				const parsedTSConfig = JSON.parse(await fs.readFile(tsconfigPath, 'utf-8'))
				const compilerOptions = parsedTSConfig['compilerOptions']
				compilerOptions['typeRoots'] = ['./env.d.ts']

				await fs.writeFile(tsconfigPath, JSON.stringify(parsedTSConfig, null, '\t'))
			}
		}
	}
}

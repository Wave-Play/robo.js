import { Config } from '../types/index.js'
import { Mode } from './mode.js'
import { Compiler } from '../cli/utils/compiler.js'
import { Globals } from './globals.js'
import { getTypeScriptCompilerOptions, ts } from '../cli/compiler/typescript.js'
import { logger } from './logger.js'
import fs, { existsSync } from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { CompilerOptions } from 'typescript'

// Global config reference
let _config: Config = null
const _configPaths: Set<string> = new Set()

/**
 * Returns the currently loaded configuration.
 * May return null if config has yet to load. Use {@link loadConfig} to load it first.
 */
export function getConfig(): Config | null {
	return Globals.getConfig() ?? _config
}

/**
 * Returns the paths to all loaded configuration files.
 */
export function getConfigPaths(): Set<string> {
	return _configPaths
}

export async function loadConfig(file = 'robo', compile = false): Promise<Config> {
	const configPath = await loadConfigPath(file)
	let config: Config

	if (configPath) {
		config = await readConfig<Config>(configPath, compile)
		_configPaths.add(configPath)

		// Load plugin files when using "/config" directory
		if (configPath.includes(path.sep + 'config' + path.sep)) {
			logger.debug('Scanning for plugin files...')
			config.plugins = config.plugins ?? []

			await scanPlugins(configPath, compile, (plugin, pluginConfig, pluginPath) => {
				// Remove existing plugin config if it exists
				const existingIndex = config.plugins?.findIndex((p) => p === plugin || p[0] === plugin)
				if (existingIndex !== -1) {
					config.plugins?.splice(existingIndex, 1)
				}

				config.plugins?.push([plugin, pluginConfig])
				_configPaths.add(pluginPath)
			})
		}
	} else {
		config = {
			clientOptions: {
				intents: []
			}
		}
	}

	_config = config
	Globals.registerConfig(config)
	logger.debug(`Loaded configuration file:`, config)
	return config
}

/**
 * Looks for the config file in the current project.
 * Will look for the following files in order:
 * - config/robo.ts
 * - config/robo.mjs
 * - config/robo.cjs
 * - config/robo.json
 * - .config/robo.ts
 * - .config/robo.mjs
 * - .config/robo.cjs
 * - .config/robo.json
 *
 * If a mode is set, it will prioritize the mode-specific config file.
 * - config/robo.{mode}.ts
 * - config/robo.{mode}.mjs
 * - config/robo.{mode}.cjs
 * - config/robo.{mode}.json
 *
 * @param file The name of the config file to look for. Defaults to "robo".
 * @returns The path to the config file, or null if it could not be found.
 */
export async function loadConfigPath(file = 'robo'): Promise<string> {
	const extensions = ['.ts', '.mjs', '.cjs', '.json']
	const prefixes = ['config', '.config']

	for (const prefix of prefixes) {
		const pathBase = path.join(process.cwd(), prefix)

		for (const ext of extensions) {
			let fullPath = path.join(pathBase, `${file}.${Mode.get()}${ext}`)

			try {
				if (fs.existsSync(fullPath)) {
					// Convert to file URL to allow for dynamic import()
					logger.debug(`Found configuration file at`, fullPath)
					return fullPath
				}
			} catch (ignored) {
				// empty
			}

			try {
				fullPath = path.join(pathBase, `${file}${ext}`)
				if (fs.existsSync(fullPath)) {
					// Convert to file URL to allow for dynamic import()
					logger.debug(`Found configuration file at`, fullPath)
					return fullPath
				}
			} catch (ignored) {
				// empty
			}
		}
	}

	// If no config file was found, return null
	return null
}

/**
 * Scans the /plugins config subdirectory for plugins.
 *
 * @param callback A callback function to be called for each plugin found. The plugin name will be passed as the first argument, including the scoped organization if applicable. Second parameter is the plugin config object.
 */
async function scanPlugins(
	configPath: string,
	compile: boolean,
	callback: (plugin: string, pluginConfig: unknown, pluginPath: string) => void
) {
	// Look for plugins in the same directory as the config file
	const pluginsPath = path.join(path.dirname(configPath), 'plugins')

	if (!fs.existsSync(pluginsPath)) {
		return
	}

	// For each file in the plugins directory, import it and add it to the config
	const plugins = fs.readdirSync(pluginsPath)
	const pluginData: Array<{ mode: string; name: string; path: string }> = []

	for (const plugin of plugins) {
		const pluginPath = path.join(pluginsPath, plugin)

		// Load subdirectories as scoped plugins
		if (fs.statSync(pluginPath).isDirectory()) {
			const scopedPlugins = fs.readdirSync(pluginPath)

			for (const scopedPlugin of scopedPlugins) {
				// Compute the file name, keeping the base path in mind for scoped config files
				const scopedPath = path.join(pluginPath, scopedPlugin)
				const resolvedPath = path.relative(pluginsPath, scopedPath)
				const parts = resolvedPath.split('.')
				const pluginName = '@' + parts[0]
				let mode = undefined
				if (parts.length > 2) {
					mode = parts[1]
				}

				pluginData.push({ mode, name: pluginName, path: scopedPath })
			}
		} else {
			// Compute the file name, keeping the base path in mind for scoped config files
			const resolvedPath = path.relative(pluginsPath, pluginPath)
			const parts = resolvedPath.split('.')
			const pluginName = parts[0]
			let mode = undefined
			if (parts.length > 2) {
				mode = parts[1]
			}

			pluginData.push({ mode, name: pluginName, path: pluginPath })
		}
	}

	// Load all plugins in parallel
	await Promise.all(
		pluginData.map(async (plugin) => {
			// Skip plugins without mode unless mode file is not found
			if (!plugin.mode) {
				const modeVariant = pluginData.find((p) => p.mode === Mode.get() && p.name === plugin.name)

				if (modeVariant?.path && existsSync(modeVariant.path)) {
					return
				}
			}

			// Skip if this plugin's mode is not the current mode
			if (plugin.mode && plugin.mode !== Mode.get()) {
				return
			}

			const pluginConfig = await readConfig(plugin.path, compile)
			callback(plugin.name, pluginConfig, plugin.path)
		})
	)
}

async function readConfig<T = unknown>(configPath: string, compile = false): Promise<T> {
	try {
		if (configPath.endsWith('.json')) {
			// If the file is a JSON file, handle it differently
			const rawData = fs.readFileSync(configPath, 'utf8')
			const pluginConfig = JSON.parse(rawData)
			return pluginConfig ?? {}
		} else if (configPath.endsWith('.ts') || configPath.endsWith('.tsx')) {
			const compiledPath = await buildTypescriptConfig(configPath, compile)
			const imported = await import(pathToFileURL(compiledPath).toString())
			const pluginConfig = imported.default ?? imported
			return pluginConfig ?? ({} as T)
		} else {
			// Convert to file URL to allow for a seamless dynamic import()
			const imported = await import(pathToFileURL(configPath).toString())
			const pluginConfig = imported.default ?? imported
			return pluginConfig ?? {}
		}
	} catch (e) {
		logger.error('Failed to load configuration file:', e, configPath)
		return {} as T
	}
}

async function buildTypescriptConfig(configPath: string, force: boolean): Promise<string> {
	const projectRoot = process.cwd()
	const absoluteConfigPath = path.resolve(configPath)
	const relativeConfigPath = toProjectRelative(absoluteConfigPath)
	if (!relativeConfigPath) {
		throw new Error(`Config file must be inside project root: ${configPath}`)
	}

	const distRootRelative = path.join('.robo', 'config')
	const distRoot = path.join(projectRoot, distRootRelative)
	const compiledPath = path.join(distRoot, relativeConfigPath).replace(/\.(ts|tsx)$/, '.mjs')

	await fsPromises.mkdir(path.dirname(compiledPath), { recursive: true })

	const dependencyGraph = await resolveConfigDependencies(absoluteConfigPath)
	const filesToCompile = new Set<string>(dependencyGraph.files)
	filesToCompile.add(absoluteConfigPath)

	const projectRelativeFiles = Array.from(filesToCompile)
		.map((filePath) => toProjectRelative(filePath))
		.filter((value): value is string => value !== null)

	let needsCompile = force || !existsSync(compiledPath)
	let latestSourceTime = 0

	if (!needsCompile) {
		for (const filePath of filesToCompile) {
			try {
				const stat = await fsPromises.stat(filePath)
				latestSourceTime = Math.max(latestSourceTime, stat.mtimeMs)
			} catch (error) {
				logger.debug('Unable to read mtime for config dependency:', error)
				needsCompile = true
				break
			}
		}

		if (!needsCompile) {
			try {
				const compiledStat = await fsPromises.stat(compiledPath)
				if (compiledStat.mtimeMs < latestSourceTime) {
					needsCompile = true
				}
			} catch (error) {
				logger.debug('Unable to read mtime for compiled config:', error)
				needsCompile = true
			}
		}
	}

	if (!needsCompile) {
		logger.debug('Config cache hit, skipping rebuild.', { config: relativeConfigPath })
		return compiledPath
	}

	const compilerOptions = dependencyGraph.compilerOptions
	const compileStart = Date.now()

	if (!compilerOptions) {
		logger.debug('No TypeScript project detected. Compiling config without graph.', {
			config: relativeConfigPath
		})
		await Compiler.buildCode({
			clean: false,
			copyOther: false,
			distDir: distRootRelative,
			distExt: '.mjs',
			files: [relativeConfigPath],
			parallel: 1,
			srcDir: projectRoot
		})
		await rewriteConfigImports(compiledPath)
		logger.debug(`Compiled config ${relativeConfigPath} in ${Date.now() - compileStart}ms (no graph).`)
		return compiledPath
	}

	const pathMappings = createConfigPathMappings(compilerOptions, distRoot)
	logger.debug(
		`Building config ${relativeConfigPath} with ${filesToCompile.size} ${
			filesToCompile.size === 1 ? 'dependency' : 'dependencies'
		}.`
	)
	logger.debug('Config dependency graph', {
		config: relativeConfigPath,
		files: projectRelativeFiles
	})

	await Compiler.buildCode({
		baseUrl: compilerOptions.baseUrl ? path.resolve(projectRoot, compilerOptions.baseUrl) : projectRoot,
		clean: false,
		copyOther: false,
		distDir: distRootRelative,
		distExt: '.mjs',
		files: projectRelativeFiles,
		parallel: 4,
		paths: pathMappings,
		srcDir: projectRoot
	})
	await rewriteConfigImports(compiledPath)

	logger.debug(`Compiled config ${relativeConfigPath} in ${Date.now() - compileStart}ms.`)
	return compiledPath
}

async function resolveConfigDependencies(configPath: string): Promise<{
	compilerOptions: CompilerOptions | null
	files: Set<string>
}> {
	const { isTypeScript } = Compiler.isTypescriptProject()
	const projectRoot = process.cwd()
	const dependencies = new Set<string>()

	if (!isTypeScript || typeof ts === 'undefined') {
		dependencies.add(configPath)
		return {
			compilerOptions: null,
			files: dependencies
		}
	}

	const tsOptions = await getTypeScriptCompilerOptions()
	const compilerOptions: CompilerOptions = {
		...tsOptions,
		allowJs: true,
		incremental: false,
		noEmit: true,
		skipLibCheck: true
	}

	const program = ts.createProgram([configPath], compilerOptions)

	for (const sourceFile of program.getSourceFiles()) {
		if (sourceFile.isDeclarationFile) {
			continue
		}
		const normalized = path.normalize(sourceFile.fileName)
		if (!normalized.startsWith(projectRoot)) {
			continue
		}
		if (normalized.includes(`${path.sep}node_modules${path.sep}`)) {
			continue
		}
		dependencies.add(normalized)
	}

	return {
		compilerOptions,
		files: dependencies
	}
}

function toProjectRelative(filePath: string): string | null {
	const projectRoot = process.cwd()
	const relative = path.relative(projectRoot, filePath)
	if (relative.startsWith('..')) {
		return null
	}
	return relative
}

function createConfigPathMappings(compilerOptions: CompilerOptions, distRoot: string): Record<string, string[]> {
	const projectRoot = process.cwd()
	const baseUrl = compilerOptions.baseUrl ? path.resolve(projectRoot, compilerOptions.baseUrl) : projectRoot
	const existingPaths = compilerOptions.paths ?? {}
	const mapped: Record<string, string[]> = {}

	for (const [alias, values] of Object.entries(existingPaths)) {
		mapped[alias] = values.map((value) => normalizePathForConfig(value, baseUrl, distRoot))
	}

	if (!mapped['@/*']) {
		const assumed = ensurePosix(path.join(distRoot, 'src', '*'))
		mapped['@/*'] = [assumed]
	}

	return mapped
}

function normalizePathForConfig(value: string, baseUrl: string, distRoot: string): string {
	const starIndex = value.indexOf('*')
	const prefix = starIndex === -1 ? value : value.slice(0, starIndex)
	const suffix = starIndex === -1 ? '' : value.slice(starIndex + 1)
	const absolutePrefix = path.resolve(baseUrl, prefix)
	const relativeToProject = path.relative(process.cwd(), absolutePrefix)
	const target = path.join(distRoot, relativeToProject)
	let normalized = ensurePosix(target)

	if (starIndex !== -1) {
		if (!normalized.endsWith('/')) {
			normalized += '/'
		}
		normalized += '*'
		if (suffix) {
			normalized += suffix
		}
	}

	return normalized
}

function ensurePosix(value: string): string {
	return value.split(path.sep).join('/')
}

async function rewriteConfigImports(compiledPath: string) {
	try {
		const compiledDir = path.dirname(compiledPath)
		const code = await fsPromises.readFile(compiledPath, 'utf8')
		const rewritten = code.replace(
			/(['"])([^'"\n]*\.robo\/config\/[^'"\n]+?)(\.(?:ts|tsx|js|mjs))?\1/g,
			(match, quote: string, specifier: string, ext: string | undefined) => {
				try {
					const withExt = specifier + (ext ?? '')
					let absoluteTarget = path.resolve(compiledDir, withExt)
					while (
						absoluteTarget.includes(`${path.sep}.robo${path.sep}config${path.sep}.robo${path.sep}config${path.sep}`)
					) {
						absoluteTarget = absoluteTarget.replace(
							`${path.sep}.robo${path.sep}config${path.sep}.robo${path.sep}config${path.sep}`,
							`${path.sep}.robo${path.sep}config${path.sep}`
						)
					}
					if (/\.(ts|tsx)$/i.test(absoluteTarget)) {
						absoluteTarget = absoluteTarget.replace(/\.(ts|tsx)$/i, '.mjs')
					} else if (!absoluteTarget.endsWith('.mjs')) {
						absoluteTarget += '.mjs'
					}
					let relative = path.relative(compiledDir, absoluteTarget)
					if (!relative) {
						relative = './' + path.basename(absoluteTarget)
					} else if (!relative.startsWith('.')) {
						relative = './' + relative
					}
					relative = ensurePosix(relative)
					return `${quote}${relative}${quote}`
				} catch (rewriteError) {
					logger.warn('Failed to normalize config import:', rewriteError)
					return match
				}
			}
		)

		if (rewritten !== code) {
			await fsPromises.writeFile(compiledPath, rewritten, 'utf8')
		}
	} catch (error) {
		logger.warn('Failed to rewrite config imports to .mjs:', error)
	}
}

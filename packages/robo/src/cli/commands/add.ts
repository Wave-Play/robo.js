import { Highlight, HighlightGreen, Indent } from './../../core/constants.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import { color } from '../../core/color.js'
import { loadConfig } from '../../core/config.js'
import { logger } from '../../core/logger.js'
import type { Manifest } from '../../types/index.js'
import { Command } from '../utils/cli-handler.js'
import { createRequire } from 'node:module'
import { PackageDir, exec } from '../utils/utils.js'
import { getPackageExecutor, getPackageManager } from '../utils/runtime-utils.js'
import { Compiler } from '../utils/compiler.js'
import { Spinner } from '../utils/spinner.js'
import { applyEnvVariables, detectEnvFiles } from '../utils/env-editor.js'
import type { EnvApplyResult, EnvFileDescriptor, EnvVariableAssignment } from '../utils/env-editor.js'
import { runSeedHook } from '../utils/seed-hook.js'
import { runSetupHook } from '../utils/setup-hook.js'
import type { NormalizedSeedHookResult } from '../utils/seed-hook.js'
import readline from 'node:readline'

const require = createRequire(import.meta.url)

const localPrefixes = ['file:', '.', '/', '~', ':']

const command = new Command('add')
	.description('Adds a plugin to your Robo.')
	.option('-f', '--force', 'forcefully install & register packages')
	.option('-ns', '--no-seed', 'skip the seeding of files from the plugin')
	.option('-s', '--silent', 'do not print anything')
	.option('-t', '--trigger', 'setup hook trigger context (add or create)')
	.option('-v', '--verbose', 'print more information for debugging')
	.option('-y', '--yes', 'auto-accept seed files')
	.positionalArgs(true)
	.handler(addAction)
export default command

interface AddCommandOptions {
	force?: boolean
	'no-seed'?: boolean
	silent?: boolean
	sync?: boolean
	trigger?: 'add' | 'create'
	verbose?: boolean
	yes?: boolean
}

export async function addAction(packages: string[], options: AddCommandOptions) {
	// Create a logger
	logger({
		enabled: !options.silent,
		level: options.verbose ? 'debug' : 'info'
	})
	logger.debug(`Adding plugins:`, packages)
	logger.debug(`Current working directory:`, process.cwd())
	const startTime = Date.now()
	const seed = !options['no-seed']
	const s = packages.length > 1 ? 's' : ''

	if (packages.length === 0) {
		logger.error(`No packages specified. Use ${color.bold('robo add <package>')} to add a plugin.`)
		return
	}

	// Prepare fancy formatting
	const spinner = new Spinner()
	logger.log('\n' + Indent, color.bold(`📦 Installing plugin${s}`))
	spinner.setText(packages.map((pkg) => `${Indent}    - {{spinner}} ${Highlight(pkg)}`).join('\n') + `\n\n`)
	spinner.start()

	if (options.verbose) {
		spinner.stop(false, false)
	}

	// Load config once; registration resolved after install
	const config = await loadConfig('robo', true)
	const nameMap: Record<string, string> = {}
	const isLocalSpec = (spec: string) =>
		localPrefixes.some((prefix) => (prefix === ':' ? spec.indexOf(prefix) === 1 : spec.startsWith(prefix)))

	// Pre-resolve local specs to package names
	await Promise.all(
		packages.map(async (spec) => {
			if (isLocalSpec(spec)) {
				try {
					const packageJsonPath = path.join(spec, 'package.json')
					const pkgJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'))
					if (pkgJson?.name) nameMap[spec] = pkgJson.name
				} catch {
					// ignore; will try later
				}
			} else if (!isUrlSpec(spec)) {
				nameMap[spec] = spec
			}
		})
	)

	// Check which plugins need to be installed
	const packageJsonPath = path.join(process.cwd(), 'package.json')
	const packageJson = require(packageJsonPath)
	const pendingInstall = packages.filter((spec) => {
		if (options.force) return true
		const deps = packageJson.dependencies ?? {}
		// If spec is a URL, consider it installed when any dep value equals the URL
		if (isUrlSpec(spec)) {
			return !Object.values(deps).some((v) => typeof v === 'string' && v === spec)
		}
		// Otherwise, treat as normal package name
		const alreadyInDeps = Object.keys(deps).includes(spec)
		const alreadyInConfig = config.plugins?.some((p) => (Array.isArray(p) ? p[0] === spec : p === spec))
		return !(alreadyInDeps || alreadyInConfig)
	})
	logger.debug(`Pending installation add:`, pendingInstall)

	// Install plugin packages
	if (pendingInstall.length > 0) {
		const packageManager = getPackageManager()
		const command = packageManager === 'npm' ? 'install' : 'add'
		logger.debug(`Using package manager:`, packageManager)

		// Install dependencies using the package manager that triggered the command
		try {
			await exec([packageManager, command, ...pendingInstall], {
				stdio: options.force ? 'inherit' : 'ignore'
			})
			logger.debug(`Successfully installed packages!`)
		} catch (error) {
			logger.error(`Failed to install packages:`, error)
			if (!options.force) {
				return
			}
		}
	}

	// Reload deps after installation to resolve URL specs to real package names
	const packageJsonAfter = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'))

	// Resolve each input spec to a canonical package name for registration and seeds
	const resolvedNames: string[] = []
	for (const spec of packages) {
		if (nameMap[spec]) {
			resolvedNames.push(nameMap[spec])
			continue
		}

		// Try to infer name from local path
		if (isUrlSpec(spec)) {
			const deps = packageJsonAfter.dependencies ?? {}
			let foundName = Object.entries(deps).find(([, v]) => typeof v === 'string' && v === spec)?.[0]

			if (!foundName) {
				foundName = inferNameFromUrl(spec) ?? undefined
			}

			if (foundName) {
				nameMap[spec] = foundName
				resolvedNames.push(foundName)
				continue
			}
		}

		nameMap[spec] = spec
		resolvedNames.push(spec)
	}

	// Determine which resolved names still need registration
	const pendingRegistration = resolvedNames.filter((pkg) => {
		return options.force || !config.plugins?.some((p) => (Array.isArray(p) ? p[0] === pkg : p === pkg))
	})

	spinner.setText(pendingRegistration.map((pkg) => `${Indent}    - {{spinner}} ${Highlight(pkg)}`).join('\n') + `\n\n`)
	logger.debug('Pending registration add:', pendingRegistration)

	// Register plugins by adding them to the config
	await Promise.all(pendingRegistration.map((pkg) => createPluginConfig(pkg, {})))

	// Update spinner with registered plugins
	spinner.setText(
		pendingRegistration.map((pkg) => `${Indent}    ${HighlightGreen('✔ ' + pkg)}  `).join('\n') + `\n\n`,
		false
	)
	spinner.stop(false, false)

	const manifestEntries = await Promise.all(
		resolvedNames.map(async (pkg) => {
			const manifestRecord = await loadPluginManifest(pkg)
			return [pkg, manifestRecord] as const
		})
	)
	const manifestMap: Record<string, ManifestRecord | null> = Object.fromEntries(manifestEntries)

	const seedCandidates = await Promise.all(
		resolvedNames.map(async (pkg) => ((await pluginHasCopyableSeed(pkg, manifestMap[pkg])) ? pkg : null))
	)
	const pluginsWithSeeds = seedCandidates.filter((pkg): pkg is string => pkg !== null)
	logger.debug(`Plugins with seeds:`, pluginsWithSeeds)

	const { plans: envPlans, duplicates: duplicateEnvKeys } = await buildEnvPlans(
		resolvedNames,
		manifestMap,
		nameMap
	)

	// Automatically copy files meant to be seeded by the plugin
	if (seed && options.sync && pluginsWithSeeds.length > 0) {
		const executor = getPackageExecutor(false)
		const command = executor + ' robo add ' + packages.join(' ')
		logger.log(Indent, color.bold(`🌱 Seed files detected`))
		logger.log(Indent, '   Run the following to copy seed files:', '\n   ' + Indent, Highlight(command))
		logger.log('')
	} else if (seed && pluginsWithSeeds.length > 0) {
		const pluginSeeds = pluginsWithSeeds.map((pkg) => {
			const manifestRecord = manifestMap[pkg]
			const description = manifestRecord?.manifest.__robo?.seed?.description
			const display = nameMap[pkg] ?? pkg
			return `${Indent}    - ${Highlight(display)}${description ? ': ' + description : ''}`
		})
		logger.log(Indent, color.bold(`🌱 Seed files detected`))
		logger.log(pluginSeeds.join('\n'), '\n')

		// Ask for consent
		let seedConsent = options.yes
		if (!seedConsent) {
			// Ensure preceding log entries render before the interactive prompt.
			await logger.flush()
			const response = await prompt(Indent + `    Would you like to include these files? ${color.dim('[Y/n]')}: `)
			seedConsent = response.toLowerCase().trim() === 'y'
			logger.log('')
		}

		if (seedConsent) {
			await Promise.all(
				pluginsWithSeeds.map(async (pkg) => {
					try {
						await Compiler.useSeed(pkg)
					} catch (error) {
						logger.error(`Failed to copy seed files for plugin ${color.bold(pkg)}:`, error)
					}
				})
			)
		}
	}

	// Allow plugins to seed environment variables dynamically
	const envAssignments = envPlans.flatMap((plan) => plan.variables)
	if (envAssignments.length > 0) {
		const envFiles = await detectEnvFiles()
		const envFileSummary = envFiles.map(formatEnvFileTarget).join(', ')
		logger.log(Indent, color.bold(`🔑 Environment additions detected`))
		for (const plan of envPlans) {
			const heading = `${Indent}    - ${Highlight(plan.displayName)}${plan.description ? ': ' + plan.description : ''}`
			logger.log(heading)
			for (const variable of plan.variables) {
				const detail = `${Indent}        ${color.cyan(variable.key)}${variable.description ? color.dim(' – ' + variable.description) : ''}`
				logger.log(detail)
			}
		}
		logger.log(Indent, color.dim(`    Target files: ${envFileSummary}\n`))

		if (duplicateEnvKeys.length > 0) {
			for (const duplicate of duplicateEnvKeys) {
				logger.warn(
					`Skipping environment variable ${color.bold(duplicate.key)} from ${duplicate.incoming.displayName} because ${duplicate.existing.displayName} already requested it.`
				)
			}
		}

		let envConsent = options.yes
		if (!envConsent) {
			const questionTarget = envFiles.length > 1 ? `${envFiles.length} files (${envFileSummary})` : envFileSummary
			// Flush buffered log output so additions appear before the question.
			await logger.flush()
			const response = await prompt(
				Indent + `    Add these variables to ${questionTarget}? ${color.dim('[Y/n]')}: `
			)
			envConsent = response.toLowerCase().trim() === 'y'
			logger.log('')
		}

		if (envConsent) {
			const applyResults = await applyEnvVariables(envFiles, envAssignments)
			const keyStatus = buildKeyStatus(applyResults)
			const pluginSummaries = new Map<string, { added: string[]; displayName: string; merged: string[]; skipped: string[] }>()

			for (const plan of envPlans) {
				pluginSummaries.set(plan.plugin, {
					added: [],
					displayName: plan.displayName,
					merged: [],
					skipped: []
				})
			}

			for (const plan of envPlans) {
				const summary = pluginSummaries.get(plan.plugin)
				if (!summary) {
					continue
				}
				for (const variable of plan.variables) {
					const status = keyStatus.get(variable.key)
					if (!status) {
						continue
					}
					if (status.updated && status.skipped) {
						summary.merged.push(variable.key)
					} else if (status.updated) {
						summary.added.push(variable.key)
					} else if (status.skipped) {
						summary.skipped.push(variable.key)
					}
				}
			}

			logger.log(Indent, color.bold(`🔑 Environment variables applied`))
			for (const summary of pluginSummaries.values()) {
				const hasChanges = summary.added.length > 0 || summary.merged.length > 0
				const heading = hasChanges
					? HighlightGreen('✔ ' + summary.displayName)
					: color.dim('- ' + summary.displayName)
				const details: string[] = []
				if (summary.added.length > 0) {
					details.push(`added ${summary.added.join(', ')}`)
				}
				if (summary.merged.length > 0) {
					details.push(`merged ${summary.merged.join(', ')} (kept existing where present)`)
				}
				if (summary.skipped.length > 0 && !hasChanges) {
					details.push(`kept existing ${summary.skipped.join(', ')}`)
				} else if (summary.skipped.length > 0 && hasChanges) {
					details.push(`kept existing ${summary.skipped.join(', ')}`)
				}
				const detailText = details.length > 0 ? ' ' + details.join('; ') : ''
				logger.log(`${Indent}    ${heading}${detailText}`)
			}
			logger.log('')

			const createdFiles = applyResults.filter((result) => result.created)
			if (createdFiles.length > 0) {
				const createdSummary = createdFiles
					.map((result) => formatRelativeEnvPath(result.file))
					.join(', ')
				logger.log(Indent, color.dim(`    Created new files: ${createdSummary}`))
			}
		} else {
			logger.log(Indent, color.dim('Skipping environment variable additions.'))
		}
	}

	// Execute setup hooks for newly added plugins
	const setupTrigger = options.trigger ?? 'add'
	for (const pkg of pendingRegistration) {
		try {
			const pkgJsonPath = path.join(process.cwd(), 'node_modules', pkg, 'package.json')
			const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, 'utf-8'))
			await runSetupHook(pkg, pkgJson?.version || 'unknown', setupTrigger)
		} catch (error) {
			logger.debug(`Failed to run setup hook for ${pkg}:`, error)
		}
	}

	// Ta-dah!
	logger.log(Indent, `✨ Plugin${s} successfully installed and ready to use.\n`)
	logger.debug(`Finished in ${Date.now() - startTime}ms`)
}

/**
 * Generates a plugin config file in the config/plugins directory.
 *
 * @param pluginName The name of the plugin (e.g. @roboplay/plugin-ai)
 * @param config The plugin config
 */
async function createPluginConfig(pluginName: string, config: Record<string, unknown>) {
	// Split plugin name into parts to create parent directories
	const pluginParts = pluginName.replace(/^@/, '').split('/')

	// Make sure the directory exists
	await fs.mkdir(path.join(process.cwd(), 'config', 'plugins'), {
		recursive: true
	})

	// Create parent directory if this is a scoped plugin
	if (pluginName.startsWith('@')) {
		await fs.mkdir(path.join(process.cwd(), 'config', 'plugins', pluginParts[0]), {
			recursive: true
		})
	}

	// Normalize plugin path
	const { isTypeScript } = Compiler.isTypescriptProject()
	const pluginPath = path.join(process.cwd(), 'config', 'plugins', ...pluginParts) + (isTypeScript ? '.ts' : '.mjs')
	const pluginConfig = JSON.stringify(config) + '\n'

	logger.debug(`Writing ${pluginName} config to ${pluginPath}...`)
	await fs.writeFile(pluginPath, `export default ${pluginConfig}`)
}

function isUrlSpec(input: string) {
	return /^https?:\/\//i.test(input) || /^git\+https?:\/\//i.test(input)
}

function inferNameFromUrl(spec: string): string | null {
	try {
		const u = new URL(spec)
		const last = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '')
		if (!last) return null
		if (last.startsWith('@')) {
			// Pattern: @scope/name or @scope/name@version
			const at = last.lastIndexOf('@')
			if (at > 0) return last.slice(0, at)
			return last
		} else {
			// Pattern: name or name@version
			const at = last.lastIndexOf('@')
			return at > 0 ? last.slice(0, at) : last
		}
	} catch {
		return null
	}
}

interface EnvPlan {
	description?: string
	displayName: string
	plugin: string
	variables: EnvVariableAssignment[]
}

interface EnvDuplicateNotice {
	existing: {
		displayName: string
		plugin: string
	}
	incoming: {
		displayName: string
		plugin: string
	}
	key: string
}

interface ManifestRecord {
	basePath: string
	manifest: Manifest
}

interface KeyStatus {
	skipped: boolean
	updated: boolean
}

async function buildEnvPlans(
	packages: string[],
	manifestMap: Record<string, ManifestRecord | null>,
	displayNames: Record<string, string>
): Promise<{
		duplicates: EnvDuplicateNotice[]
		keyOwnership: Map<string, { displayName: string; plugin: string }>
		plans: EnvPlan[]
	}> {
	const plans: EnvPlan[] = []
	const keyOwnership = new Map<string, { displayName: string; plugin: string }>()
	const duplicates: EnvDuplicateNotice[] = []

	for (const pkg of packages) {
		const manifestRecord = manifestMap[pkg]
		if (!manifestRecord) {
			continue
		}

		const { manifest, basePath } = manifestRecord

		let hookResult: NormalizedSeedHookResult | null = null
		try {
			hookResult = await runSeedHook(pkg, manifest, basePath)
		} catch (error) {
			logger.warn(`Seed hook for ${pkg} failed:`, error)
		}

		const assignments = collectEnvAssignments(manifest, hookResult)
		if (assignments.length === 0) {
			continue
		}

		const displayName = displayNames[pkg] ?? pkg
		const planVariables: EnvVariableAssignment[] = []

		for (const assignment of assignments) {
			const existing = keyOwnership.get(assignment.key)
			if (existing) {
				duplicates.push({
					existing,
					incoming: { displayName, plugin: pkg },
					key: assignment.key
				})
				continue
			}

			keyOwnership.set(assignment.key, { displayName, plugin: pkg })
			planVariables.push(assignment)
		}

		if (planVariables.length > 0) {
			plans.push({
				description: hookResult?.env?.description ?? manifest.__robo?.seed?.env?.description,
				displayName,
				plugin: pkg,
				variables: planVariables
			})
		}
	}

	return { duplicates, keyOwnership, plans }
}

async function pluginHasCopyableSeed(
	packageName: string,
	manifestRecord: ManifestRecord | null
): Promise<boolean> {
	if (!manifestRecord) {
		return false
	}

	const seedDir = path.join(manifestRecord.basePath, '.robo', 'seed')

	try {
		const stats = await fs.stat(seedDir)
		if (!stats.isDirectory()) {
			return false
		}
	} catch {
		return false
	}

	const hookPath = manifestRecord.manifest.__robo?.seed?.env?.hook ?? manifestRecord.manifest.__robo?.seed?.hook
	const excludePaths = new Set(resolveHookAbsolutePaths(manifestRecord.basePath, hookPath))
	const identifiesAsTypeScript = manifestRecord.manifest.__robo?.language === 'typescript'
	const { isTypeScript } = Compiler.isTypescriptProject()
	const excludeExts = identifiesAsTypeScript && isTypeScript ? ['.js', '.jsx'] : ['.ts', '.tsx']

	const skipDirs = new Set([path.join(seedDir, '_root'), path.join(seedDir, '__inline__')])
	const mainDirHasFiles = await directoryHasCopyableFiles(seedDir, excludeExts, excludePaths, skipDirs)
	if (mainDirHasFiles) {
		return true
	}

	const rootHasFiles = await directoryHasCopyableFiles(path.join(seedDir, '_root'), [], excludePaths)
	return rootHasFiles
}

async function directoryHasCopyableFiles(
	dir: string,
	excludeExts: string[],
	excludePaths: Set<string>,
	skipDirs?: Set<string>
): Promise<boolean> {
	if (!dir) {
		return false
	}

	let entries
	try {
		entries = await fs.readdir(dir, { withFileTypes: true })
	} catch {
		return false
	}

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name)

		if (excludePaths.has(fullPath)) {
			continue
		}

		if (entry.isDirectory()) {
			if (skipDirs?.has(fullPath)) {
				continue
			}

			if (await directoryHasCopyableFiles(fullPath, excludeExts, excludePaths)) {
				return true
			}
		} else {
			if (excludeExts.includes(path.extname(entry.name))) {
				continue
			}

			return true
		}
	}

	return false
}

function resolveHookAbsolutePaths(basePath: string, hookPath?: string): string[] {
	if (!hookPath) {
		return []
	}

	let normalized = hookPath.startsWith('/') ? hookPath.slice(1) : hookPath
	normalized = normalized.replace(/^\.\/+/, '')
	normalized = normalized.replace(/\\/g, '/')
	const absolute = path.resolve(basePath, normalized)
	const results = new Set<string>([absolute])

	const jsMatch = absolute.match(/\.(m|c)?js$/)
	if (jsMatch) {
		const prefix = absolute.slice(0, -jsMatch[0].length)
		results.add(prefix + '.ts')
		results.add(prefix + '.tsx')
	}

	return Array.from(results)
}


function collectEnvAssignments(
	manifest: Manifest,
	hookResult: NormalizedSeedHookResult | null
): EnvVariableAssignment[] {
	const manifestVariables = manifest.__robo?.seed?.env?.variables ?? {}
	const hookVariables = hookResult?.env?.variables ?? {}
	const keys = new Set<string>([...Object.keys(manifestVariables), ...Object.keys(hookVariables)])
	const assignments: EnvVariableAssignment[] = []

	for (const key of keys) {
		const manifestValue = manifestVariables[key]
		const hookValue = hookVariables[key]
		let value: string | undefined
		let description: string | undefined
		let overwrite: boolean | undefined

		if (hookValue && typeof hookValue === 'object') {
			value = hookValue.value
			description = hookValue.description ?? description
			overwrite = hookValue.overwrite
		}

		if (value === undefined) {
			if (typeof manifestValue === 'string') {
				value = manifestValue
			} else if (manifestValue && typeof manifestValue === 'object') {
				value = manifestValue.value
				description = manifestValue.description ?? description
				overwrite = manifestValue.overwrite ?? overwrite
			}
		}

		if (manifestValue && typeof manifestValue === 'object') {
			if (!description && manifestValue.description) {
				description = manifestValue.description
			}
			if (overwrite === undefined && typeof manifestValue.overwrite === 'boolean') {
				overwrite = manifestValue.overwrite
			}
		}

		if (typeof value !== 'string') {
			continue
		}

		if (hookValue && typeof hookValue === 'object' && hookValue.description && !description) {
			description = hookValue.description
		}

		assignments.push({
			description,
			key,
			overwrite,
			value
		})
	}

	assignments.sort((a, b) => a.key.localeCompare(b.key))
	return assignments
}

async function loadPluginManifest(pkg: string): Promise<ManifestRecord | null> {
	const candidates = getPluginBasePathCandidates(pkg)
	for (const basePath of candidates) {
		const manifestPath = path.join(basePath, '.robo', 'manifest.json')
		if (!(await fileExists(manifestPath))) {
			continue
		}
		try {
			const manifest = await Compiler.useManifest({ basePath, name: pkg, safe: true })
			return { basePath, manifest }
		} catch (error) {
			logger.debug(`Failed to load manifest for ${pkg} at ${manifestPath}:`, error)
		}
	}

	return null
}

function getPluginBasePathCandidates(pkg: string): string[] {
	const candidates = new Set<string>()
	if (pkg.startsWith('.') || pkg.startsWith('/')) {
		candidates.add(path.resolve(process.cwd(), pkg))
	} else {
		candidates.add(path.resolve(PackageDir, '..', pkg))
		candidates.add(path.resolve(process.cwd(), 'node_modules', pkg))
	}
	return Array.from(candidates)
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		const stat = await fs.stat(filePath)
		return stat.isFile()
	} catch {
		return false
	}
}

function formatEnvFileTarget(file: EnvFileDescriptor): string {
	const relative = formatRelativeEnvPath(file.path)
	return file.exists ? relative : `${relative} (new)`
}

function formatRelativeEnvPath(filePath: string): string {
	const relative = path.relative(process.cwd(), filePath)
	return relative === '' ? '.env' : relative
}

function buildKeyStatus(results: EnvApplyResult[]): Map<string, KeyStatus> {
	const statusMap = new Map<string, KeyStatus>()

	for (const result of results) {
		for (const key of result.updated) {
			const entry = statusMap.get(key) ?? { skipped: false, updated: false }
			entry.updated = true
			statusMap.set(key, entry)
		}
		for (const key of result.skipped) {
			const entry = statusMap.get(key) ?? { skipped: false, updated: false }
			entry.skipped = true
			statusMap.set(key, entry)
		}
	}

	return statusMap
}

function prompt(question: string): Promise<string> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout
	})

	return new Promise((resolve) => {
		rl.question(question, (input) => {
			rl.close()
			resolve(input)
		})
	})
}

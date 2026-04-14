/**
 * Inspect Command
 *
 * Display project structure, plugins, routes, and configuration
 * by reading manifest files from .robo/manifest/{mode}/.
 * Usage: robo inspect [options]
 */

import { Command } from '../utils/cli-handler.js'
import { color, composeColors } from '../../core/color.js'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import type { CliContext } from '../../types/cli.js'
import type {
	ProjectMetadata,
	PluginRegistry,
	PluginInfo,
	HandlerEntry,
	RouteDefinitions,
	EnvMetadata,
	HookEntry
} from '../../types/manifest-v1.js'

const command = new Command('inspect')
	.description('Display project structure, plugins, routes, and configuration.')
	.option('-j', '--json', 'output as structured JSON')
	.option('-m', '--mode', 'which mode manifest to inspect (development, production, etc.)')
	.option('-h', '--help', 'Shows the available command options')
	.handler(inspectAction)
export default command

interface InspectCommandOptions {
	json?: boolean
	mode?: string
}

function readJsonFile<T>(filePath: string): T | null {
	try {
		if (!existsSync(filePath)) return null
		const content = readFileSync(filePath, 'utf-8')
		return JSON.parse(content) as T
	} catch {
		return null
	}
}

function resolveManifestMode(manifestBase: string, preferredMode?: string): string | null {
	if (preferredMode) {
		const modePath = path.join(manifestBase, preferredMode)
		return existsSync(modePath) ? preferredMode : null
	}

	// Try production first, then development
	if (existsSync(path.join(manifestBase, 'production'))) return 'production'
	if (existsSync(path.join(manifestBase, 'development'))) return 'development'

	// Fall back to any available mode (sorted for deterministic selection)
	try {
		const dirs = readdirSync(manifestBase, { withFileTypes: true })
			.filter((d) => d.isDirectory() && d.name !== 'cli')
			.map((d) => d.name)
			.sort()
		return dirs.length > 0 ? dirs[0] : null
	} catch {
		return null
	}
}

function listAvailableModes(manifestBase: string): string[] {
	try {
		return readdirSync(manifestBase, { withFileTypes: true })
			.filter((d) => d.isDirectory() && d.name !== 'cli')
			.map((d) => d.name)
	} catch {
		return []
	}
}

async function inspectAction(context: CliContext) {
	const options = context.options as InspectCommandOptions
	const manifestBase = path.join(process.cwd(), '.robo', 'manifest')

	if (!existsSync(manifestBase)) {
		console.log("No manifest found. Run 'robo build' first.")
		return
	}

	// Guard against boolean mode (CLI parser may pass true when no value given)
	const preferredMode = typeof options.mode === 'string' ? options.mode : undefined
	const mode = resolveManifestMode(manifestBase, preferredMode)

	if (!mode) {
		if (preferredMode) {
			console.log(`No manifest found for mode "${preferredMode}".`)
		} else {
			console.log("No manifest found. Run 'robo build' first.")
		}

		const available = listAvailableModes(manifestBase)
		if (available.length > 0) {
			console.log('')
			console.log('Available modes:')
			for (const m of available) {
				console.log(`  ${m}`)
			}
		}
		return
	}

	const manifestDir = path.join(manifestBase, mode)

	// Read all manifest data
	const project = readJsonFile<ProjectMetadata>(path.join(manifestDir, 'robo.json'))
	const pluginRegistry = readJsonFile<PluginRegistry>(path.join(manifestDir, 'plugins.json'))
	const routeDefinitions = readJsonFile<RouteDefinitions>(path.join(manifestDir, 'routes', '@.json'))
	const envMetadata = readJsonFile<EnvMetadata>(path.join(manifestDir, 'env.json'))

	// Read hooks from hooks/ directory
	const hooksDir = path.join(manifestDir, 'hooks')
	const hooks: Record<string, HookEntry[]> = {}
	if (existsSync(hooksDir)) {
		try {
			const hookFiles = readdirSync(hooksDir).filter((f) => f.endsWith('.json'))
			for (const f of hookFiles) {
				const hookName = f.replace('.json', '')
				const hookData = readJsonFile<HookEntry[]>(path.join(hooksDir, f))
				if (hookData) {
					hooks[hookName] = hookData
				}
			}
		} catch {
			// Ignore hook reading errors
		}
	}

	// Read package.json for fallback project info
	const packageJson = readJsonFile<{ name?: string; version?: string }>(path.join(process.cwd(), 'package.json'))

	// Collect route keys from route handler files
	const routeKeys = collectRouteKeys(manifestDir, routeDefinitions)

	// Read config
	const config = readJsonFile<Record<string, unknown>>(path.join(manifestDir, 'config', '@.json'))

	// Build inspection data
	const data = buildInspectionData(project, pluginRegistry, routeDefinitions, routeKeys, envMetadata, hooks, config, packageJson, mode)

	if (options.json) {
		console.log(JSON.stringify(data, null, 2))
	} else {
		printHumanReadable(data)
	}
}

interface RouteKeys {
	commands: string[]
	events: string[]
	api: string[]
	context: string[]
	middleware: string[]
	other: Record<string, string[]>
}

function collectRouteKeys(manifestDir: string, routeDefinitions: RouteDefinitions | null): RouteKeys {
	const result: RouteKeys = {
		commands: [],
		events: [],
		api: [],
		context: [],
		middleware: [],
		other: {}
	}

	if (!routeDefinitions) return result

	// Scan route handler files in the manifest directory
	const routesDir = path.join(manifestDir, 'routes')
	if (!existsSync(routesDir)) return result

	try {
		const routeFiles = readdirSync(routesDir).filter(
			(f) => f.endsWith('.json') && f !== '@.json'
		)

		for (const file of routeFiles) {
			// Route files are HandlerEntry[] arrays — extract the .key from each entry
			const data = readJsonFile<HandlerEntry[]>(path.join(routesDir, file))
			if (!data || !Array.isArray(data)) continue

			const keys = data.map((entry) => entry.key)

			// Determine route type from file name (format: namespace.routeType.json)
			const parts = file.replace('.json', '').split('.')
			const routeType = parts.length > 1 ? parts[parts.length - 1] : parts[0]

			switch (routeType) {
				case 'commands':
					result.commands.push(...keys)
					break
				case 'events':
					result.events.push(...keys)
					break
				case 'api':
					result.api.push(...keys.map((k) => (k.startsWith('/') ? k : `/api/${k}`)))
					break
				case 'context':
					result.context.push(...keys)
					break
				case 'middleware':
					result.middleware.push(...keys)
					break
				default:
					if (!result.other[routeType]) {
						result.other[routeType] = []
					}
					result.other[routeType].push(...keys)
					break
			}
		}
	} catch {
		// Ignore directory read errors
	}

	// Deduplicate all categories
	result.commands = [...new Set(result.commands)]
	result.events = [...new Set(result.events)]
	result.api = [...new Set(result.api)]
	result.context = [...new Set(result.context)]
	result.middleware = [...new Set(result.middleware)]
	for (const [type, keys] of Object.entries(result.other)) {
		result.other[type] = [...new Set(keys)]
	}

	return result
}

interface InspectionData {
	project: {
		name: string
		version: string
		language: string
		roboVersion: string
		mode: string
		buildTime: string
	}
	plugins: Array<{
		name: string
		version: string
		namespace: string
		routes: string[]
		hooks: string[]
	}>
	routes: {
		commands: string[]
		events: string[]
		api: string[]
		context: string[]
		middleware: string[]
		[key: string]: string[]
	}
	hooks: string[]
	config: Record<string, unknown> | null
	env: {
		summary: { total: number; set: number; empty: number; missing: number }
		missing: string[]
		satisfied: string[]
	} | null
}

function buildInspectionData(
	project: ProjectMetadata | null,
	pluginRegistry: PluginRegistry | null,
	_routeDefinitions: RouteDefinitions | null,
	routeKeys: RouteKeys,
	envMetadata: EnvMetadata | null,
	hooks: Record<string, HookEntry[]>,
	config: Record<string, unknown> | null,
	packageJson: { name?: string; version?: string } | null,
	mode: string
): InspectionData {
	// Build plugins list
	const plugins: InspectionData['plugins'] = []
	if (pluginRegistry) {
		for (const info of Object.values(pluginRegistry) as PluginInfo[]) {
			plugins.push({
				name: info.name,
				version: info.version,
				namespace: info.namespace,
				routes: info.routes,
				hooks: info.hooks
			})
		}
	}

	// Build routes object (merge standard + other)
	const routes: InspectionData['routes'] = {
		commands: routeKeys.commands,
		events: routeKeys.events,
		api: routeKeys.api,
		context: routeKeys.context,
		middleware: routeKeys.middleware
	}
	for (const [type, keys] of Object.entries(routeKeys.other)) {
		routes[type] = keys
	}

	// Build env data
	let env: InspectionData['env'] = null
	if (envMetadata) {
		env = {
			summary: envMetadata.summary,
			missing: envMetadata.required?.missing ?? [],
			satisfied: envMetadata.required?.satisfied ?? []
		}
	}

	return {
		project: {
			name: project?.name ?? packageJson?.name ?? path.basename(process.cwd()),
			version: project?.version ?? packageJson?.version ?? '0.0.0',
			language: project?.language ?? 'unknown',
			roboVersion: project?.roboVersion ?? 'unknown',
			mode: project?.mode ?? mode,
			buildTime: project?.buildTime ?? 'unknown'
		},
		plugins,
		routes,
		hooks: Object.keys(hooks),
		config,
		env
	}
}

function printHumanReadable(data: InspectionData) {
	const header = composeColors(color.bold, color.cyan)

	console.log('')
	console.log(color.bold(`Project: ${data.project.name} v${data.project.version}`))
	console.log(`Mode:    ${data.project.mode}`)
	console.log(`Built:   ${data.project.buildTime} (Robo v${data.project.roboVersion})`)
	console.log('')

	// Plugins
	if (data.plugins.length > 0) {
		console.log(header(`Plugins (${data.plugins.length})`))
		for (const p of data.plugins) {
			const features = [...p.routes, ...p.hooks]
			const featureStr = features.length > 0 ? color.dim(` [${features.join(', ')}]`) : ''
			console.log(`  ${color.white(p.name.padEnd(30))} v${p.version}${featureStr}`)
		}
		console.log('')
	}

	// Routes
	const routeTypes = Object.entries(data.routes).filter(([, keys]) => keys.length > 0)
	if (routeTypes.length > 0) {
		console.log(header('Routes'))
		for (const [type, keys] of routeTypes) {
			const label = type.charAt(0).toUpperCase() + type.slice(1)
			const keyList = keys.length <= 8 ? keys.join(', ') : keys.slice(0, 8).join(', ') + `, ... (+${keys.length - 8})`
			console.log(`  ${color.white(`${label} (${keys.length}):`.padEnd(20))} ${keyList}`)
		}
		console.log('')
	}

	// Hooks
	if (data.hooks.length > 0) {
		console.log(header('Hooks'))
		console.log(`  ${data.hooks.join(', ')}`)
		console.log('')
	}

	// Environment
	if (data.env) {
		console.log(header('Environment Variables'))
		const { summary, missing } = data.env
		const configured = summary.total - summary.missing
		console.log(`  ${configured}/${summary.total} configured${missing.length > 0 ? ` (${missing.length} missing)` : ''}`)
		if (missing.length > 0) {
			console.log(`  ${color.yellow('Missing:')} ${missing.join(', ')}`)
		}
		console.log('')
	}
}

/**
 * ProjectOverviewBuilder - Builds and maintains the project overview
 *
 * The ProjectOverview is a structured "mental model" of the project,
 * grounded in real artifacts. It includes:
 * - Package information (name, scripts, deps)
 * - Robo-specific details (commands, events, routes)
 * - Key files with rationale
 * - Agent-maintained memory (decisions, changelog)
 */

import type { ExecutionProvider } from '../types/execution.js'
import type { AgentPolicy } from '../types/policy.js'
import type { ProjectOverview, PackageInfo, KeyFile, Decision, ChangeLogEntry, RefreshOptions } from '../types/scale.js'
import { OVERVIEW_CAPS, type OverviewCaps } from './caps.js'
import { ProjectIndexer } from './indexer.js'
import { buildRoboOverview, parsePackageJson, getRoboVersion, hasRoboConfig } from './robo-detection.js'
import { codeLogger } from '../core/logger.js'

/**
 * Configuration for ProjectOverviewBuilder
 */
export interface ProjectOverviewBuilderConfig {
	/**
	 * ExecutionProvider for file access
	 */
	provider: ExecutionProvider

	/**
	 * Agent policy
	 */
	policy: AgentPolicy

	/**
	 * ProjectIndexer instance (for Robo detection)
	 */
	indexer: ProjectIndexer

	/**
	 * Project root path (default: '/')
	 */
	root?: string

	/**
	 * Custom caps
	 */
	caps?: Partial<OverviewCaps>
}

/**
 * Known key files and their importance
 */
const KEY_FILES: Array<{ path: string; why: string; required?: boolean }> = [
	{ path: '/package.json', why: 'Package configuration and dependencies', required: true },
	{ path: '/tsconfig.json', why: 'TypeScript configuration' },
	{ path: '/robo.config.ts', why: 'Robo.js configuration' },
	{ path: '/robo.config.js', why: 'Robo.js configuration' },
	{ path: '/robo.config.mjs', why: 'Robo.js configuration' },
	{ path: '/README.md', why: 'Project documentation' },
	{ path: '/.env.example', why: 'Environment variable template' },
	{ path: '/src/index.ts', why: 'Main entry point' },
	{ path: '/src/index.js', why: 'Main entry point' }
]

/**
 * ProjectOverviewBuilder builds and maintains the project overview
 *
 * Usage:
 * ```ts
 * const builder = new ProjectOverviewBuilder({ provider, policy, indexer })
 * const overview = await builder.refresh()
 * builder.addDecision('API prefix', 'Use /api prefix for all routes')
 * builder.addChange('Added ping command', ['/src/commands/ping.ts'])
 * ```
 */
export class ProjectOverviewBuilder {
	private provider: ExecutionProvider
	private policy: AgentPolicy
	private indexer: ProjectIndexer
	private root: string
	private caps: OverviewCaps
	private currentOverview: ProjectOverview | null = null

	constructor(config: ProjectOverviewBuilderConfig) {
		this.provider = config.provider
		this.policy = config.policy
		this.indexer = config.indexer
		this.root = config.root ?? '/'
		this.caps = { ...OVERVIEW_CAPS, ...config.caps }
	}

	/**
	 * Build or refresh the project overview
	 */
	async refresh(options: RefreshOptions = {}): Promise<ProjectOverview> {
		const { deep = false } = options

		codeLogger.debug('Refreshing project overview', { root: this.root, deep })

		// Get or refresh the index
		let index = this.indexer.getIndex()
		if (!index || deep) {
			index = await this.indexer.refresh({ deep })
		}

		// Parse package.json
		const packageInfo = await this.getPackageInfo()

		// Build summary
		const summary = this.buildSummary(packageInfo, index.robo)

		// Identify key files
		const keyFiles = await this.findKeyFiles()

		// Extract constraints
		const constraints = this.extractConstraints(packageInfo)

		// Build Robo overview if applicable
		let roboOverview = undefined
		if (index.robo) {
			roboOverview = await buildRoboOverview(this.provider, index.robo)
		}

		// Preserve existing decisions and changelog if they exist
		const decisions = this.currentOverview?.decisions ?? []
		const changeLog = this.currentOverview?.changeLog ?? []

		const overview: ProjectOverview = {
			updatedAt: new Date().toISOString(),
			root: this.root,
			summary,
			package: packageInfo,
			keyFiles,
			constraints,
			decisions,
			changeLog
		}

		if (roboOverview) {
			overview.robo = roboOverview
		}

		this.currentOverview = overview
		codeLogger.debug('Overview built', { hasRobo: !!roboOverview, keyFiles: keyFiles.length })

		return overview
	}

	/**
	 * Get the current overview (null if never built)
	 */
	getOverview(): ProjectOverview | null {
		return this.currentOverview
	}

	/**
	 * Add a decision to the overview
	 *
	 * @param topic - What the decision is about
	 * @param decision - What was decided
	 */
	addDecision(topic: string, decision: string): void {
		if (!this.currentOverview) {
			codeLogger.warn('Cannot add decision: overview not built')
			return
		}

		const entry: Decision = {
			when: new Date().toISOString(),
			topic,
			decision
		}

		this.currentOverview.decisions.push(entry)

		// Enforce cap
		if (this.currentOverview.decisions.length > this.caps.maxDecisions) {
			this.currentOverview.decisions = this.currentOverview.decisions.slice(-this.caps.maxDecisions)
		}
	}

	/**
	 * Add a change log entry
	 *
	 * @param summary - Brief description of the change
	 * @param files - Files that were changed
	 */
	addChange(summary: string, files: string[]): void {
		if (!this.currentOverview) {
			codeLogger.warn('Cannot add change: overview not built')
			return
		}

		const entry: ChangeLogEntry = {
			when: new Date().toISOString(),
			summary,
			files
		}

		this.currentOverview.changeLog.push(entry)

		// Enforce cap
		if (this.currentOverview.changeLog.length > this.caps.maxChangeLogEntries) {
			this.currentOverview.changeLog = this.currentOverview.changeLog.slice(-this.caps.maxChangeLogEntries)
		}

		// Update the timestamp
		this.currentOverview.updatedAt = new Date().toISOString()
	}

	/**
	 * Get package.json info
	 */
	private async getPackageInfo(): Promise<PackageInfo> {
		try {
			const content = await this.provider.readFile(this.root === '/' ? '/package.json' : `${this.root}/package.json`)
			const pkg = parsePackageJson(content)

			if (!pkg) {
				return {}
			}

			return {
				name: pkg.name,
				version: pkg.version,
				scripts: this.extractScripts(pkg),
				dependencies: pkg.dependencies ? Object.keys(pkg.dependencies) : undefined,
				devDependencies: pkg.devDependencies ? Object.keys(pkg.devDependencies) : undefined
			}
		} catch {
			return {}
		}
	}

	/**
	 * Extract scripts from package.json (limited to reasonable count)
	 */
	private extractScripts(pkg: ReturnType<typeof parsePackageJson>): Record<string, string> | undefined {
		if (!pkg?.scripts) {
			return undefined
		}

		// Return all scripts but limit to reasonable count
		const scripts: Record<string, string> = {}
		const entries = Object.entries(pkg.scripts)

		for (let i = 0; i < Math.min(entries.length, 20); i++) {
			scripts[entries[i][0]] = entries[i][1]
		}

		return Object.keys(scripts).length > 0 ? scripts : undefined
	}

	/**
	 * Build a summary string
	 */
	private buildSummary(pkg: PackageInfo, robo?: { kind: string } | null): string {
		const parts: string[] = []

		if (pkg.name) {
			parts.push(pkg.name)
		}

		if (robo) {
			switch (robo.kind) {
				case 'bot':
					parts.push('Discord bot project')
					break
				case 'bot+api':
					parts.push('Discord bot with API routes')
					break
				case 'activity':
					parts.push('Discord Activity project')
					break
				default:
					parts.push('Robo.js project')
			}
		} else if (pkg.dependencies?.includes('express') || pkg.dependencies?.includes('fastify')) {
			parts.push('Web server project')
		} else if (pkg.dependencies?.includes('react') || pkg.dependencies?.includes('vue')) {
			parts.push('Frontend project')
		} else {
			parts.push('Node.js project')
		}

		return parts.join(' - ')
	}

	/**
	 * Find key files that exist
	 */
	private async findKeyFiles(): Promise<KeyFile[]> {
		const keyFiles: KeyFile[] = []

		for (const kf of KEY_FILES) {
			if (keyFiles.length >= this.caps.maxKeyFiles) break

			const path = this.root === '/' ? kf.path : `${this.root}${kf.path}`

			try {
				const exists = await this.provider.exists(path)
				if (exists) {
					keyFiles.push({ path: kf.path, why: kf.why })
				}
			} catch {
				// File doesn't exist
			}
		}

		return keyFiles
	}

	/**
	 * Extract constraints from package.json and environment
	 */
	private extractConstraints(pkg: PackageInfo): string[] {
		const constraints: string[] = []

		// Check for TypeScript
		if (pkg.devDependencies?.includes('typescript')) {
			constraints.push('TypeScript project')
		}

		// Check for ESM
		// Note: We don't have direct access to "type" field, but we can infer from tsconfig

		// Check for specific frameworks
		if (pkg.dependencies?.includes('robo.js')) {
			constraints.push('Uses Robo.js framework')
		}

		return constraints.slice(0, this.caps.maxConstraints)
	}
}

/**
 * Create a ProjectOverviewBuilder with default configuration
 */
export function createProjectOverviewBuilder(config: ProjectOverviewBuilderConfig): ProjectOverviewBuilder {
	return new ProjectOverviewBuilder(config)
}

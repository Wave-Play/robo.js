/**
 * ProjectIndexer - Builds and maintains the project index
 *
 * The ProjectIndex is a lightweight structure for:
 * - Fast file listing with sizes
 * - Content-based fingerprint for drift detection
 * - Robo-aware signals when applicable
 */

import type { ExecutionProvider } from '../types/execution.js'
import type { AgentPolicy } from '../types/policy.js'
import type { ProjectIndex, RoboIndexSignals, RefreshOptions } from '../types/scale.js'
import { matchesDenyPath } from '../providers/utils/path.js'
import { INDEX_CAPS, type IndexCaps } from './caps.js'
import {
	computeFingerprint,
	computeFileFingerprint,
	hasFingerprintChanged,
	type FileFingerprint
} from './fingerprint.js'
import { detectRoboProject, parsePackageJson } from './robo-detection.js'
import { codeLogger } from '../core/logger.js'

/**
 * Configuration for ProjectIndexer
 */
export interface ProjectIndexerConfig {
	/**
	 * ExecutionProvider for file access
	 */
	provider: ExecutionProvider

	/**
	 * Agent policy for deny paths
	 */
	policy: AgentPolicy

	/**
	 * Project root path (default: '/')
	 */
	root?: string

	/**
	 * Custom caps for indexing
	 */
	caps?: Partial<IndexCaps>
}

/**
 * ProjectIndexer builds and maintains the project index
 *
 * Usage:
 * ```ts
 * const indexer = new ProjectIndexer({ provider, policy })
 * const index = await indexer.refresh()
 * if (await indexer.needsRefresh()) {
 *   await indexer.refresh({ force: true })
 * }
 * ```
 */
export class ProjectIndexer {
	private provider: ExecutionProvider
	private policy: AgentPolicy
	private root: string
	private caps: IndexCaps
	private currentIndex: ProjectIndex | null = null

	constructor(config: ProjectIndexerConfig) {
		this.provider = config.provider
		this.policy = config.policy
		this.root = config.root ?? '/'
		this.caps = { ...INDEX_CAPS, ...config.caps }
	}

	/**
	 * Build or refresh the project index
	 *
	 * @param options.deep - Force content hashing for all files
	 * @param options.force - Refresh even if fingerprint unchanged
	 * @returns The built ProjectIndex
	 */
	async refresh(options: RefreshOptions = {}): Promise<ProjectIndex> {
		const { deep = false, force = false } = options

		codeLogger.debug('Refreshing project index', { root: this.root, deep, force })

		// Get all files and directories
		const { files, dirs } = await this.scanProject()

		// Compute file fingerprints
		const fileFingerprints = await this.computeFileFingerprints(files, deep)

		// Compute overall fingerprint
		const fingerprint = computeFingerprint(fileFingerprints)

		// Check if refresh is needed
		if (!force && this.currentIndex && !hasFingerprintChanged(this.currentIndex.fingerprint, fingerprint)) {
			codeLogger.debug('Index unchanged, returning cached')
			return this.currentIndex
		}

		// Detect Robo signals
		const roboSignals = await this.detectRobo()

		// Build the index
		const index: ProjectIndex = {
			updatedAt: new Date().toISOString(),
			root: this.root,
			fingerprint,
			files: files.map((f) => ({ path: f.path, size: f.size })),
			dirs: dirs.map((d) => ({ path: d }))
		}

		if (roboSignals) {
			index.robo = roboSignals
		}

		this.currentIndex = index
		codeLogger.debug('Index built', { files: files.length, dirs: dirs.length, hasRobo: !!roboSignals })

		return index
	}

	/**
	 * Get the current index (null if never built)
	 */
	getIndex(): ProjectIndex | null {
		return this.currentIndex
	}

	/**
	 * Check if the index needs to be refreshed
	 *
	 * Computes a quick fingerprint based on file paths and sizes
	 * to determine if a full refresh is needed.
	 */
	async needsRefresh(): Promise<boolean> {
		if (!this.currentIndex) {
			return true
		}

		// Quick scan to check for changes
		const { files } = await this.scanProject()

		// Quick fingerprint comparison (paths + sizes only)
		const quickFingerprints = files.map((f) => ({ path: f.path, size: f.size, contentHash: undefined }))
		const quickFp = computeFingerprint(quickFingerprints)

		// Compare with current (which has content hashes)
		// If structure changed, definitely need refresh
		const currentQuickFp = computeFingerprint(this.currentIndex.files.map((f) => ({ path: f.path, size: f.size })))

		return hasFingerprintChanged(currentQuickFp, quickFp)
	}

	/**
	 * Scan the project for files and directories
	 *
	 * Uses batched parallel stat() calls for efficiency.
	 */
	private async scanProject(): Promise<{
		files: Array<{ path: string; size: number; mtimeMs?: number }>
		dirs: string[]
	}> {
		const files: Array<{ path: string; size: number; mtimeMs?: number }> = []
		const dirs: string[] = []
		const denyPaths = this.policy.denyPaths ?? []

		try {
			const entries = await this.provider.readdir(this.root, { recursive: true })

			// Separate files and directories, respecting caps and deny paths
			const filePaths: string[] = []
			for (const entry of entries) {
				// Skip denied paths
				if (matchesDenyPath(entry.path, denyPaths)) {
					continue
				}

				if (entry.isDirectory) {
					if (dirs.length >= this.caps.maxDirs) {
						codeLogger.warn('Max dirs cap reached', { cap: this.caps.maxDirs })
						break
					}
					dirs.push(entry.path)
				} else if (entry.isFile) {
					if (filePaths.length >= this.caps.maxFiles) {
						codeLogger.warn('Max files cap reached', { cap: this.caps.maxFiles })
						break
					}
					filePaths.push(entry.path)
				}
			}

			// Batch parallel stat() calls for efficiency
			const STAT_BATCH_SIZE = 50
			for (let i = 0; i < filePaths.length; i += STAT_BATCH_SIZE) {
				const batch = filePaths.slice(i, i + STAT_BATCH_SIZE)
				const statResults = await Promise.all(
					batch.map(async (path) => {
						try {
							const stat = await this.provider.stat(path)
							return { path, size: stat.size, mtimeMs: stat.mtimeMs }
						} catch (e) {
							codeLogger.debug('Failed to stat file', { path, error: e })
							return null
						}
					})
				)
				// Filter out failed stats and add to files
				for (const result of statResults) {
					if (result) {
						files.push(result)
					}
				}
			}
		} catch (e) {
			codeLogger.error('Failed to scan project', { root: this.root, error: e })
		}

		return { files, dirs }
	}

	/**
	 * Compute fingerprints for all files
	 *
	 * Uses batched parallel readFile() calls for small files that need content hashing.
	 */
	private async computeFileFingerprints(
		files: Array<{ path: string; size: number; mtimeMs?: number }>,
		deep: boolean
	): Promise<FileFingerprint[]> {
		const denyPaths = this.policy.denyPaths ?? []

		// Filter denied paths and separate files by whether they need content hashing
		const filesToHash: Array<{ path: string; size: number; mtimeMs?: number }> = []
		const largeFiles: Array<{ path: string; size: number; mtimeMs?: number }> = []

		for (const file of files) {
			if (matchesDenyPath(file.path, denyPaths)) {
				continue
			}

			// For small files, always compute content hash
			// For large files, use size+mtime unless deep mode
			const shouldHashContent = file.size <= this.caps.largeFileThreshold || deep
			if (shouldHashContent) {
				filesToHash.push(file)
			} else {
				largeFiles.push(file)
			}
		}

		// Batch parallel readFile() calls for files that need content hashing
		const READ_BATCH_SIZE = 50
		const fingerprints: FileFingerprint[] = []

		for (let i = 0; i < filesToHash.length; i += READ_BATCH_SIZE) {
			const batch = filesToHash.slice(i, i + READ_BATCH_SIZE)
			const readResults = await Promise.all(
				batch.map(async (file) => {
					let content: string | null = null
					try {
						content = await this.provider.readFile(file.path)
					} catch (e) {
						codeLogger.debug('Failed to read file for hashing', { path: file.path, error: e })
					}
					return computeFileFingerprint(file.path, content, file.size, file.mtimeMs, this.caps.largeFileThreshold)
				})
			)
			fingerprints.push(...readResults)
		}

		// Add fingerprints for large files (no content hash needed)
		for (const file of largeFiles) {
			fingerprints.push(computeFileFingerprint(file.path, null, file.size, file.mtimeMs, this.caps.largeFileThreshold))
		}

		return fingerprints
	}

	/**
	 * Detect Robo.js project signals
	 */
	private async detectRobo(): Promise<RoboIndexSignals | null> {
		try {
			// Try to read and parse package.json
			const content = await this.provider.readFile(this.root === '/' ? '/package.json' : `${this.root}/package.json`)
			const pkg = parsePackageJson(content)

			if (!pkg) {
				return null
			}

			return await detectRoboProject(this.provider, pkg)
		} catch {
			// No package.json or can't read
			return null
		}
	}
}

/**
 * Create a ProjectIndexer with default configuration
 */
export function createProjectIndexer(config: ProjectIndexerConfig): ProjectIndexer {
	return new ProjectIndexer(config)
}

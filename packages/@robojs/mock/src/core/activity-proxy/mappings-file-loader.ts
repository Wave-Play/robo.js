import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { mockLogger } from '../logger.js'

// ============================================================================
// Schema Types
// ============================================================================

/** Schema v1 for discord-url-mappings.json */
export interface MappingsFileSchema {
	version: 1
	activities: MappingsFileActivity[]
}

export interface MappingsFileActivity {
	id: string
	name: string
	application_id: string
	launch_url: string
	launch_path?: string
	url_mappings?: Array<{ prefix: string; target: string }>
	proxy?: {
		csp_mode?: 'discord_strict' | 'relaxed'
	}
}

export interface MappingsFileLoadResult {
	exists: boolean
	valid: boolean
	error?: string
	data?: MappingsFileSchema
}

// ============================================================================
// Module-level cache
// ============================================================================

let _cachedResult: MappingsFileLoadResult | null = null
let _cachedData: MappingsFileSchema | null = null

// ============================================================================
// Validation
// ============================================================================

function validateSchema(parsed: unknown): { valid: boolean; error?: string; data?: MappingsFileSchema } {
	if (!parsed || typeof parsed !== 'object') {
		return { valid: false, error: 'File content is not a valid JSON object' }
	}

	const obj = parsed as Record<string, unknown>

	// Version check
	if (obj.version !== 1) {
		return { valid: false, error: `Expected version 1, got ${JSON.stringify(obj.version)}` }
	}

	// Activities array check
	if (!Array.isArray(obj.activities) || obj.activities.length === 0) {
		return { valid: false, error: 'activities must be a non-empty array' }
	}

	// Validate each activity
	for (let i = 0; i < obj.activities.length; i++) {
		const activity = obj.activities[i] as Record<string, unknown>
		const prefix = `activities[${i}]`

		if (!activity || typeof activity !== 'object') {
			return { valid: false, error: `${prefix} must be an object` }
		}

		// Required string fields
		if (typeof activity.id !== 'string' || !activity.id) {
			return { valid: false, error: `${prefix}.id must be a non-empty string` }
		}
		if (typeof activity.name !== 'string' || !activity.name) {
			return { valid: false, error: `${prefix}.name must be a non-empty string` }
		}
		if (typeof activity.application_id !== 'string' || !/^\d+$/.test(activity.application_id)) {
			return { valid: false, error: `${prefix}.application_id must be a numeric string (got ${JSON.stringify(activity.application_id)})` }
		}
		if (typeof activity.launch_url !== 'string') {
			return { valid: false, error: `${prefix}.launch_url must be a string` }
		}

		// Validate launch_url is a parseable URL
		try {
			new URL(activity.launch_url)
		} catch {
			return { valid: false, error: `${prefix}.launch_url is not a valid URL: ${activity.launch_url}` }
		}

		// Optional: launch_path
		if (activity.launch_path !== undefined) {
			if (typeof activity.launch_path !== 'string' || !activity.launch_path.startsWith('/')) {
				return { valid: false, error: `${prefix}.launch_path must start with / (got ${JSON.stringify(activity.launch_path)})` }
			}
		}

		// Optional: url_mappings
		if (activity.url_mappings !== undefined) {
			if (!Array.isArray(activity.url_mappings)) {
				return { valid: false, error: `${prefix}.url_mappings must be an array` }
			}
			for (let j = 0; j < activity.url_mappings.length; j++) {
				const mapping = activity.url_mappings[j] as Record<string, unknown>
				const mPrefix = `${prefix}.url_mappings[${j}]`

				if (!mapping || typeof mapping !== 'object') {
					return { valid: false, error: `${mPrefix} must be an object` }
				}
				if (typeof mapping.prefix !== 'string' || !mapping.prefix.startsWith('/')) {
					return { valid: false, error: `${mPrefix}.prefix must start with / (got ${JSON.stringify(mapping.prefix)})` }
				}
				if (typeof mapping.target !== 'string' || !mapping.target) {
					return { valid: false, error: `${mPrefix}.target must be a non-empty string` }
				}
			}
		}

		// Optional: proxy.csp_mode
		if (activity.proxy !== undefined) {
			if (typeof activity.proxy !== 'object' || activity.proxy === null) {
				return { valid: false, error: `${prefix}.proxy must be an object` }
			}
			const proxy = activity.proxy as Record<string, unknown>
			if (proxy.csp_mode !== undefined) {
				if (proxy.csp_mode !== 'discord_strict' && proxy.csp_mode !== 'relaxed') {
					return { valid: false, error: `${prefix}.proxy.csp_mode must be 'discord_strict' or 'relaxed' (got ${JSON.stringify(proxy.csp_mode)})` }
				}
			}
		}
	}

	return { valid: true, data: parsed as MappingsFileSchema }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Load and validate discord-url-mappings.json from a directory.
 * Returns { exists, valid, error?, data? }
 */
export function loadMappingsFile(directory?: string): MappingsFileLoadResult {
	const dir = directory ?? process.cwd()
	const filePath = join(dir, 'discord-url-mappings.json')

	if (!existsSync(filePath)) {
		const result: MappingsFileLoadResult = { exists: false, valid: false }
		_cachedResult = result
		_cachedData = null
		return result
	}

	try {
		const content = readFileSync(filePath, 'utf-8')
		const parsed = JSON.parse(content)
		const validation = validateSchema(parsed)

		if (!validation.valid) {
			mockLogger.warn(`discord-url-mappings.json found but invalid: ${validation.error}`)
			const result: MappingsFileLoadResult = { exists: true, valid: false, error: validation.error }
			_cachedResult = result
			_cachedData = null
			return result
		}

		mockLogger.debug(`discord-url-mappings.json loaded: ${validation.data!.activities.length} activity(ies)`)
		const result: MappingsFileLoadResult = { exists: true, valid: true, data: validation.data }
		_cachedResult = result
		_cachedData = validation.data!
		return result
	} catch (err) {
		const errorMessage = err instanceof SyntaxError ? `Invalid JSON: ${err.message}` : `Failed to read file: ${(err as Error).message}`
		mockLogger.warn(`discord-url-mappings.json: ${errorMessage}`)
		const result: MappingsFileLoadResult = { exists: true, valid: false, error: errorMessage }
		_cachedResult = result
		_cachedData = null
		return result
	}
}

/**
 * Get the cached mappings file data (loaded on first call or server start).
 * Returns null if file doesn't exist or is invalid.
 */
export function getCachedMappingsFile(): MappingsFileSchema | null {
	if (_cachedResult === null) {
		loadMappingsFile()
	}
	return _cachedData
}

/**
 * Force reload the mappings file from disk.
 */
export function reloadMappingsFile(directory?: string): MappingsFileLoadResult {
	_cachedResult = null
	_cachedData = null
	return loadMappingsFile(directory)
}

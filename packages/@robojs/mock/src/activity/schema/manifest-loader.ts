/**
 * Runtime Manifest Loader
 *
 * Singleton module that loads the RPC manifest at server startup.
 * Tries live extraction from the installed SDK first, falls back to pinned manifest.
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { mockLogger } from '../../core/logger.js'
import { extractManifest, ExtractorError } from './extractor.js'
import type { RpcManifest, RpcCommandDefinition, RpcEventDefinition } from './manifest-types.js'

/**
 * Resolve the pinned manifest path.
 * Searches for the pinned manifest relative to known paths.
 */
function resolvePinnedPath(): string | null {
	// Candidates: relative to this file's location in the package
	// At runtime: src/activity/schema/ -> pinned/latest.json
	// In tests (CJS): same relative path from __dirname or package root
	const candidates = [
		// When running from source (src/activity/schema/)
		resolve(__dirname, 'pinned/latest.json'),
		// When running from package root
		resolve(__dirname, '../../activity/schema/pinned/latest.json'),
		resolve(__dirname, '../../../src/activity/schema/pinned/latest.json')
	]

	for (const candidate of candidates) {
		if (existsSync(candidate)) {
			return candidate
		}
	}
	return null
}

// ============================================================================
// Singleton State
// ============================================================================

let loadedManifest: RpcManifest | null = null
let commandMap: Map<string, RpcCommandDefinition> | null = null
let eventMap: Map<string, RpcEventDefinition> | null = null

// ============================================================================
// Public API
// ============================================================================

/**
 * Load the RPC manifest. Tries live extraction first, falls back to pinned.
 *
 * @param projectRoot - Root of the consumer project (default: process.cwd())
 * @returns The loaded manifest
 */
export function loadManifest(projectRoot?: string): RpcManifest {
	const root = projectRoot ?? process.cwd()

	// Step 1: Try live extraction from installed SDK
	try {
		const manifest = extractManifest(root)
		loadedManifest = manifest
		buildLookupMaps(manifest)

		// Compare with pinned manifest for version mismatch warning
		checkVersionMismatch(manifest)

		return manifest
	} catch (error) {
		if (error instanceof ExtractorError && error.code === 'SDK_NOT_FOUND') {
			// Expected for non-Activity projects -- fall through silently
			mockLogger.debug('SDK not found, falling back to pinned manifest')
		} else {
			// Unexpected extraction error -- warn with details
			mockLogger.warn(
				`Live SDK extraction failed: ${(error as Error).message}. Falling back to pinned manifest.`
			)
		}
	}

	// Step 2: Try pinned manifest
	try {
		const pinnedPath = resolvePinnedPath()
		if (!pinnedPath) {
			throw new Error('Pinned manifest file not found')
		}
		const raw = readFileSync(pinnedPath, 'utf-8')
		const manifest = JSON.parse(raw) as RpcManifest

		// Validate basic structure
		if (!manifest.manifest_version || !Array.isArray(manifest.commands) || !Array.isArray(manifest.events)) {
			throw new Error('Invalid pinned manifest structure')
		}

		loadedManifest = manifest
		buildLookupMaps(manifest)

		mockLogger.info(
			`Using pinned manifest (SDK v${manifest.sdk_version}). ` +
			'Install @discord/embedded-app-sdk in your project for version-accurate schema.'
		)

		return manifest
	} catch (error) {
		mockLogger.warn(`Failed to load pinned manifest: ${(error as Error).message}`)
	}

	// Step 3: Return minimal empty manifest (server can still start)
	mockLogger.error('No RPC manifest available. Activities will not function.')
	const emptyManifest: RpcManifest = {
		manifest_version: 1,
		sdk_version: 'none',
		extracted_at: new Date().toISOString(),
		source: 'pinned',
		commands: [],
		events: []
	}
	loadedManifest = emptyManifest
	buildLookupMaps(emptyManifest)
	return emptyManifest
}

/**
 * Get the loaded manifest singleton.
 * Throws if loadManifest() has not been called.
 */
export function getManifest(): RpcManifest {
	if (!loadedManifest) {
		throw new Error('RPC manifest has not been loaded. Call loadManifest() first.')
	}
	return loadedManifest
}

/**
 * Check if a manifest has been loaded.
 */
export function isManifestLoaded(): boolean {
	return loadedManifest !== null
}

/**
 * Get a quick lookup map: command name -> definition
 */
export function getCommandMap(): Map<string, RpcCommandDefinition> {
	if (!commandMap) {
		throw new Error('RPC manifest has not been loaded. Call loadManifest() first.')
	}
	return commandMap
}

/**
 * Get a quick lookup map: event name -> definition
 */
export function getEventMap(): Map<string, RpcEventDefinition> {
	if (!eventMap) {
		throw new Error('RPC manifest has not been loaded. Call loadManifest() first.')
	}
	return eventMap
}

/**
 * Reset the singleton state (for testing only).
 */
export function resetManifest(): void {
	loadedManifest = null
	commandMap = null
	eventMap = null
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Build command and event lookup maps from a manifest.
 */
function buildLookupMaps(manifest: RpcManifest): void {
	commandMap = new Map()
	for (const cmd of manifest.commands) {
		commandMap.set(cmd.name, cmd)
	}

	eventMap = new Map()
	for (const evt of manifest.events) {
		eventMap.set(evt.name, evt)
	}
}

/**
 * Check for version mismatch between live-extracted and pinned manifests.
 */
function checkVersionMismatch(liveManifest: RpcManifest): void {
	try {
		const pinnedPath = resolvePinnedPath()
		if (!pinnedPath) return
		const raw = readFileSync(pinnedPath, 'utf-8')
		const pinned = JSON.parse(raw) as RpcManifest

		if (liveManifest.sdk_version !== pinned.sdk_version) {
			const [liveMajor, liveMinor] = liveManifest.sdk_version.split('.').map(Number)
			const [pinnedMajor, pinnedMinor] = pinned.sdk_version.split('.').map(Number)

			// Only warn on major/minor differences
			if (liveMajor !== pinnedMajor || liveMinor !== pinnedMinor) {
				mockLogger.warn(
					`SDK version mismatch: installed v${liveManifest.sdk_version} vs pinned v${pinned.sdk_version}. ` +
					'Using installed SDK schema. Some commands/events may differ from tested baseline.'
				)
			}
		}
	} catch {
		// Can't read pinned manifest for comparison -- skip check
	}
}

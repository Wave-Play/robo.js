/**
 * SDK Schema Extraction Pipeline
 *
 * Extracts command names, event names, and JSON schemas from @discord/embedded-app-sdk.
 * Uses multiple strategies (d.ts parsing, source parsing, JS scanning) with fallbacks.
 *
 * Called at server startup (synchronous) -- does not import/require the SDK itself.
 */

import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import type { RpcManifest, RpcCommandDefinition, RpcEventDefinition } from './manifest-types.js'

// ============================================================================
// Error Types
// ============================================================================

export type ExtractorErrorCode = 'SDK_NOT_FOUND' | 'COMMANDS_NOT_FOUND' | 'EVENTS_NOT_FOUND' | 'SCHEMA_PARSE_ERROR'

export class ExtractorError extends Error {
	readonly code: ExtractorErrorCode
	readonly scannedPaths: string[]

	constructor(code: ExtractorErrorCode, message: string, scannedPaths: string[] = []) {
		super(message)
		this.name = 'ExtractorError'
		this.code = code
		this.scannedPaths = scannedPaths
	}
}

// ============================================================================
// Category Classification
// ============================================================================

const COMMAND_CATEGORIES: Record<string, RpcCommandDefinition['category']> = {
	DISPATCH: 'handshake',
	AUTHORIZE: 'auth',
	AUTHENTICATE: 'auth',
	SUBSCRIBE: 'subscription',
	UNSUBSCRIBE: 'subscription',
	GET_USER: 'context',
	GET_GUILD: 'context',
	GET_GUILDS: 'context',
	GET_CHANNEL: 'context',
	GET_CHANNELS: 'context',
	GET_CHANNEL_PERMISSIONS: 'context',
	GET_ACTIVITY_INSTANCE_CONNECTED_PARTICIPANTS: 'context',
	SELECT_VOICE_CHANNEL: 'voice',
	SELECT_TEXT_CHANNEL: 'voice',
	CAPTURE_SHORTCUT: 'voice',
	SET_CERTIFIED_DEVICES: 'voice',
	GET_SKUS: 'iap',
	GET_ENTITLEMENTS: 'iap',
	GET_SKUS_EMBEDDED: 'iap',
	GET_ENTITLEMENTS_EMBEDDED: 'iap',
	START_PURCHASE: 'iap',
	GET_RELATIONSHIPS: 'social',
	INVITE_USER_EMBEDDED: 'social',
	OPEN_EXTERNAL_LINK: 'ui',
	OPEN_INVITE_DIALOG: 'ui',
	OPEN_SHARE_MOMENT_DIALOG: 'ui',
	SHARE_LINK: 'ui',
	SHARE_INTERACTION: 'ui',
	INITIATE_IMAGE_UPLOAD: 'ui',
	GET_PLATFORM_BEHAVIORS: 'platform',
	ENCOURAGE_HW_ACCELERATION: 'platform',
	SET_ORIENTATION_LOCK_STATE: 'platform',
	SET_CONFIG: 'platform',
	USER_SETTINGS_GET_LOCALE: 'platform',
	SET_ACTIVITY: 'platform',
	GET_QUEST_ENROLLMENT_STATUS: 'quest',
	QUEST_START_TIMER: 'quest',
	SEND_ANALYTICS_EVENT: 'analytics',
	CAPTURE_LOG: 'analytics'
}

/** Events that are NOT subscribable (lifecycle events) */
const NON_SUBSCRIBABLE_EVENTS = new Set(['READY'])

/** Events that emit a snapshot on subscribe (stateful signals) */
const SNAPSHOT_ON_SUBSCRIBE_EVENTS = new Set([
	'ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE',
	'ACTIVITY_LAYOUT_MODE_UPDATE',
	'ORIENTATION_UPDATE',
	'THERMAL_STATE_UPDATE',
	'VOICE_STATE_UPDATE',
	'RELATIONSHIP_UPDATE',
	'CURRENT_USER_UPDATE',
	'CURRENT_GUILD_MEMBER_UPDATE'
])

// ============================================================================
// Enum Extraction
// ============================================================================

/**
 * Extract string literal values from a TypeScript enum declaration.
 * Works with both d.ts and .ts files.
 *
 * @param content - File content containing the enum
 * @param enumName - Name of the enum to extract (e.g., 'Commands', 'Events')
 * @returns Array of extracted string values
 */
export function extractEnumValues(content: string, enumName: string): string[] {
	const enumRegex = new RegExp(
		`(?:export\\s+)?(?:declare\\s+)?enum\\s+${enumName}\\s*\\{([^}]+)\\}`,
		's'
	)
	const match = content.match(enumRegex)
	if (!match) {
		return []
	}

	const valueRegex = /(\w+)\s*=\s*["']([^"']+)["']/g
	const values: string[] = []
	let m: RegExpExecArray | null
	while ((m = valueRegex.exec(match[1])) !== null) {
		values.push(m[2])
	}
	return values
}

// ============================================================================
// SDK Resolution
// ============================================================================

/**
 * Resolve the root directory of the installed @discord/embedded-app-sdk package.
 *
 * @param projectRoot - Root of the consumer project
 * @returns Absolute path to the SDK package root
 * @throws ExtractorError with code 'SDK_NOT_FOUND'
 */
function resolveSdkRoot(projectRoot: string): string {
	try {
		const require = createRequire(join(projectRoot, 'package.json'))
		const pkgJsonPath = require.resolve('@discord/embedded-app-sdk/package.json')
		return dirname(pkgJsonPath)
	} catch {
		throw new ExtractorError(
			'SDK_NOT_FOUND',
			`Could not resolve @discord/embedded-app-sdk from "${projectRoot}". ` +
			'Ensure it is installed in your project (npm install @discord/embedded-app-sdk).',
			[join(projectRoot, 'node_modules/@discord/embedded-app-sdk')]
		)
	}
}

/**
 * Read a file if it exists, return null otherwise.
 */
function readFileIfExists(filePath: string): string | null {
	if (existsSync(filePath)) {
		return readFileSync(filePath, 'utf-8')
	}
	return null
}

// ============================================================================
// Command Extraction (Multi-Strategy)
// ============================================================================

/**
 * Extract command names from the SDK using multiple strategies.
 *
 * @param sdkRoot - Root of the SDK package
 * @returns Array of command names
 * @throws ExtractorError with code 'COMMANDS_NOT_FOUND'
 */
function extractCommandNames(sdkRoot: string): string[] {
	const scannedPaths: string[] = []

	// Strategy 1: Parse d.ts files for Commands enum
	const dtsSearchPaths = [
		join(sdkRoot, 'dist/schema/common.d.ts'),
		join(sdkRoot, 'dist/index.d.ts'),
		join(sdkRoot, 'output/schema/common.d.ts')
	]

	for (const dtsPath of dtsSearchPaths) {
		scannedPaths.push(dtsPath)
		const content = readFileIfExists(dtsPath)
		if (content) {
			const values = extractEnumValues(content, 'Commands')
			if (values.length > 0) {
				return values
			}
		}
	}

	// Strategy 2: Parse source .ts files
	const srcSearchPaths = [
		join(sdkRoot, 'src/schema/common.ts')
	]

	for (const srcPath of srcSearchPaths) {
		scannedPaths.push(srcPath)
		const content = readFileIfExists(srcPath)
		if (content) {
			const values = extractEnumValues(content, 'Commands')
			if (values.length > 0) {
				return values
			}
		}
	}

	// Strategy 3: Scan compiled JS files for known telltales
	const jsSearchPaths = [
		join(sdkRoot, 'dist/index.js'),
		join(sdkRoot, 'dist/schema/common.js')
	]

	for (const jsPath of jsSearchPaths) {
		scannedPaths.push(jsPath)
		const content = readFileIfExists(jsPath)
		if (content) {
			const values = extractEnumValues(content, 'Commands')
			if (values.length > 0) {
				return values
			}
		}
	}

	throw new ExtractorError(
		'COMMANDS_NOT_FOUND',
		'Could not extract Commands enum from any strategy. ' +
		`Scanned ${scannedPaths.length} paths.`,
		scannedPaths
	)
}

// ============================================================================
// Event Extraction (Multi-Strategy)
// ============================================================================

/**
 * Extract event names from the SDK using multiple strategies.
 *
 * @param sdkRoot - Root of the SDK package
 * @returns Array of event names
 * @throws ExtractorError with code 'EVENTS_NOT_FOUND'
 */
function extractEventNames(sdkRoot: string): string[] {
	const scannedPaths: string[] = []

	// Strategy 1: Parse d.ts files for Events enum
	const dtsSearchPaths = [
		join(sdkRoot, 'dist/schema/events.d.ts'),
		join(sdkRoot, 'dist/index.d.ts'),
		join(sdkRoot, 'output/schema/events.d.ts')
	]

	for (const dtsPath of dtsSearchPaths) {
		scannedPaths.push(dtsPath)
		const content = readFileIfExists(dtsPath)
		if (content) {
			const values = extractEnumValues(content, 'Events')
			if (values.length > 0) {
				return values
			}
		}
	}

	// Strategy 2: Parse source .ts files
	const srcSearchPaths = [
		join(sdkRoot, 'src/schema/events.ts')
	]

	for (const srcPath of srcSearchPaths) {
		scannedPaths.push(srcPath)
		const content = readFileIfExists(srcPath)
		if (content) {
			const values = extractEnumValues(content, 'Events')
			if (values.length > 0) {
				return values
			}
		}
	}

	// Strategy 3: Scan compiled JS files
	const jsSearchPaths = [
		join(sdkRoot, 'dist/index.js'),
		join(sdkRoot, 'dist/schema/events.js')
	]

	for (const jsPath of jsSearchPaths) {
		scannedPaths.push(jsPath)
		const content = readFileIfExists(jsPath)
		if (content) {
			const values = extractEnumValues(content, 'Events')
			if (values.length > 0) {
				return values
			}
		}
	}

	throw new ExtractorError(
		'EVENTS_NOT_FOUND',
		'Could not extract Events enum from any strategy. ' +
		`Scanned ${scannedPaths.length} paths.`,
		scannedPaths
	)
}

// ============================================================================
// JSON Schema Extraction (Optional Enrichment)
// ============================================================================

interface SchemaJsonEntry {
	request: Record<string, unknown> | null
	response: Record<string, unknown> | null
}

/**
 * Try to load JSON Schema definitions for commands.
 * Returns a map of command name -> { request, response } schemas.
 *
 * @param sdkRoot - Root of the SDK package
 * @returns Map of command names to their schemas, or empty map if not found
 */
function extractJsonSchemas(sdkRoot: string): Map<string, SchemaJsonEntry> {
	const searchPaths = [
		join(sdkRoot, 'src/generated/schema.json'),
		join(sdkRoot, 'dist/generated/schema.json'),
		join(sdkRoot, 'generated/schema.json')
	]

	for (const schemaPath of searchPaths) {
		const content = readFileIfExists(schemaPath)
		if (content) {
			try {
				const parsed = JSON.parse(content) as Record<string, SchemaJsonEntry>
				const schemaMap = new Map<string, SchemaJsonEntry>()
				for (const [key, value] of Object.entries(parsed)) {
					schemaMap.set(key, value)
				}
				return schemaMap
			} catch {
				// schema.json exists but is malformed -- skip
			}
		}
	}

	return new Map()
}

// ============================================================================
// Main Extraction Pipeline
// ============================================================================

/**
 * Extract an RPC manifest from the installed @discord/embedded-app-sdk package.
 *
 * @param projectRoot - Root of the consumer project (default: process.cwd())
 * @returns A normalized RpcManifest object
 * @throws ExtractorError if SDK is not found or enums cannot be extracted
 */
export function extractManifest(projectRoot: string = process.cwd()): RpcManifest {
	// Step 1: Resolve SDK package root
	const sdkRoot = resolveSdkRoot(projectRoot)

	// Step 2: Read SDK version
	let sdkVersion = 'unknown'
	try {
		const pkgJson = JSON.parse(readFileSync(join(sdkRoot, 'package.json'), 'utf-8'))
		sdkVersion = pkgJson.version ?? 'unknown'
	} catch {
		// Non-fatal -- version will be 'unknown'
	}

	// Step 3: Extract command names
	const commandNames = extractCommandNames(sdkRoot)

	// Step 4: Extract event names
	const eventNames = extractEventNames(sdkRoot)

	// Step 5: Extract JSON schemas for enrichment (optional)
	const jsonSchemas = extractJsonSchemas(sdkRoot)

	// Step 6: Build command definitions with categories and schemas
	const commands: RpcCommandDefinition[] = commandNames.map((name) => {
		const schema = jsonSchemas.get(name)
		return {
			name,
			args_schema: schema?.request ?? null,
			response_schema: schema?.response ?? null,
			auth_required: classifyAuthRequired(name),
			category: classifyCommandCategory(name)
		}
	})

	// Step 7: Build event definitions
	const events: RpcEventDefinition[] = eventNames.map((name) => ({
		name,
		subscribe_args_schema: null,
		payload_schema: null,
		subscribable: !NON_SUBSCRIBABLE_EVENTS.has(name),
		snapshot_on_subscribe: SNAPSHOT_ON_SUBSCRIBE_EVENTS.has(name)
	}))

	// Step 8: Construct manifest
	return {
		manifest_version: 1,
		sdk_version: sdkVersion,
		extracted_at: new Date().toISOString(),
		source: 'live',
		commands,
		events
	}
}

// ============================================================================
// Classification Helpers
// ============================================================================

/**
 * Classify a command into a category based on its name.
 */
function classifyCommandCategory(name: string): RpcCommandDefinition['category'] {
	return COMMAND_CATEGORIES[name] ?? 'other'
}

/**
 * Heuristic for whether a command requires authentication.
 * Commands that occur before or during auth do not require it.
 */
function classifyAuthRequired(name: string): boolean | null {
	// Pre-auth commands
	if (name === 'AUTHORIZE' || name === 'AUTHENTICATE' || name === 'DISPATCH') {
		return false
	}
	// Most other commands require auth, but we mark as null (unknown) to be safe
	return null
}

/**
 * Flashcore v1 Key Composition Helpers (spec rev 4.3)
 *
 * Provides utilities for composing storage keys in both legacy and safe formats.
 */

import {
	DEFAULT_NAMESPACE_SEPARATOR,
	LEGACY_KEY_SEPARATOR,
	isReservedPrefix
} from './constants.js'
import { encodeKey } from './encoding.js'
import { SafetyError } from './errors.js'

/**
 * Normalize namespace input to an array of strings.
 *
 * @param namespace - String or array namespace
 * @param separator - Separator for splitting string namespaces (legacy only)
 * @returns Array of namespace segments
 */
export function normalizeNamespace(
	namespace: string | string[] | undefined,
	separator: string = DEFAULT_NAMESPACE_SEPARATOR
): string[] {
	if (!namespace) {
		return []
	}

	if (Array.isArray(namespace)) {
		return namespace
	}

	// For legacy compatibility, string namespaces are treated as a single segment
	// (not split by separator - the separator is only used for joining)
	return [namespace]
}

/**
 * Compose a key using the legacy format.
 *
 * Legacy format: `{namespace}__key` where namespace segments are joined by separator.
 *
 * @param key - The key
 * @param namespace - Optional namespace
 * @param separator - Namespace segment separator (default: '/')
 * @returns Composed legacy key
 */
export function composeLegacyKey(
	key: string,
	namespace?: string | string[],
	separator: string = DEFAULT_NAMESPACE_SEPARATOR
): string {
	if (!namespace || (Array.isArray(namespace) && namespace.length === 0)) {
		return key
	}

	const ns = Array.isArray(namespace) ? namespace.join(separator) : namespace
	return `${ns}${LEGACY_KEY_SEPARATOR}${key}`
}

/**
 * Parse a legacy composed key back to namespace and key.
 *
 * @param composedKey - The legacy composed key
 * @param separator - Namespace segment separator (default: '/')
 * @returns Object with namespace array and key
 */
export function parseLegacyKey(
	composedKey: string,
	separator: string = DEFAULT_NAMESPACE_SEPARATOR
): { namespace: string[]; key: string } {
	const separatorIndex = composedKey.indexOf(LEGACY_KEY_SEPARATOR)

	if (separatorIndex === -1) {
		return { namespace: [], key: composedKey }
	}

	const namespacePart = composedKey.slice(0, separatorIndex)
	const key = composedKey.slice(separatorIndex + LEGACY_KEY_SEPARATOR.length)

	// Split namespace by separator
	const namespace = namespacePart ? namespacePart.split(separator) : []

	return { namespace, key }
}

/**
 * Compose a key using the safe (v1) format.
 *
 * Safe format uses SafeKeyEncoder for safe storage across all adapters.
 *
 * @param key - The key
 * @param namespace - Optional namespace
 * @returns Composed safe key
 */
export function composeV1Key(
	key: string,
	namespace?: string | string[]
): string {
	const ns = normalizeNamespace(namespace)
	return encodeKey(ns, key)
}

/**
 * Validate that a key does not use reserved prefixes.
 *
 * Throws SafetyError if the key starts with a reserved prefix.
 *
 * @param key - The key to validate
 * @param operation - The operation being performed (for error message)
 */
export function validateNotReserved(key: string, operation: 'set' | 'delete'): void {
	if (isReservedPrefix(key)) {
		throw new SafetyError(
			`Cannot ${operation} key "${key}": keys starting with reserved prefixes are protected. ` +
			`Reserved prefixes: _model:, _flashcore:, _wal:, _junction_`,
			{ reason: 'reserved_prefix' }
		)
	}
}

/**
 * Build a model key for internal storage.
 *
 * @param modelName - The model name
 * @param suffix - Key suffix (e.g., 'catalog', 'chunk:0')
 * @param namespace - Optional namespace (omitted for default namespace)
 * @returns Model storage key
 */
export function buildModelKey(
	modelName: string,
	suffix: string,
	namespace?: string
): string {
	if (namespace) {
		return `_model:${namespace}::${modelName}:${suffix}`
	}
	return `_model:${modelName}:${suffix}`
}

/**
 * Build a unique index key.
 *
 * @param modelName - The model name
 * @param field - The unique field name
 * @param encodedValue - The encoded field value
 * @param namespace - Optional namespace
 * @returns Unique index key
 */
export function buildUniqueKey(
	modelName: string,
	field: string,
	encodedValue: string,
	namespace?: string
): string {
	if (namespace) {
		return `_model:${namespace}::${modelName}:ux:${field}:${encodedValue}`
	}
	return `_model:${modelName}:ux:${field}:${encodedValue}`
}

/**
 * Build a sorted index key.
 *
 * @param modelName - The model name
 * @param field - The indexed field name
 * @param indexType - Optional index type for plugin indexes
 * @param namespace - Optional namespace
 * @returns Sorted index key
 */
export function buildIndexKey(
	modelName: string,
	field: string,
	indexType?: string,
	namespace?: string
): string {
	const base = namespace
		? `_model:${namespace}::${modelName}:idx:${field}`
		: `_model:${modelName}:idx:${field}`

	return indexType ? `${base}:${indexType}` : base
}

/**
 * Build a compound unique index key.
 *
 * Key format: _model:{ns}::{model}:cux:{field1}..{field2}:{encodedVal1}..{encodedVal2}
 *
 * @param modelName - The model name
 * @param fields - Array of field names in the compound constraint
 * @param encodedValues - Array of encoded field values (same order as fields)
 * @param namespace - Optional namespace
 * @returns Compound unique index key
 */
export function buildCompoundUniqueKey(
	modelName: string,
	fields: string[],
	encodedValues: string[],
	namespace?: string
): string {
	const fieldsPart = fields.join('..')
	const valuesPart = encodedValues.join('..')
	if (namespace) {
		return `_model:${namespace}::${modelName}:cux:${fieldsPart}:${valuesPart}`
	}
	return `_model:${modelName}:cux:${fieldsPart}:${valuesPart}`
}

/**
 * Build a WAL entry key.
 *
 * @param walId - The WAL entry ID
 * @returns WAL entry key
 */
export function buildWalEntryKey(walId: string): string {
	return `_flashcore:wal:entry:${walId}`
}

/**
 * Build a WAL segment key.
 *
 * @param walId - The WAL entry ID
 * @param segmentIndex - The segment index
 * @returns WAL segment key
 */
export function buildWalSegmentKey(walId: string, segmentIndex: number): string {
	return `_flashcore:wal:seg:${walId}:${segmentIndex}`
}

/**
 * Build a schema metadata key.
 *
 * @param namespace - The schema namespace (undefined for default)
 * @returns Schema key
 */
export function buildSchemaKey(namespace?: string): string {
	return namespace
		? `_flashcore:schema:${namespace}`
		: `_flashcore:schema:_default`
}

/**
 * Build a schema history key.
 *
 * @param namespace - The schema namespace (undefined for default)
 * @returns Schema history key
 */
export function buildSchemaHistoryKey(namespace?: string): string {
	return namespace
		? `_flashcore:schema-history:${namespace}`
		: `_flashcore:schema-history:_default`
}

/**
 * Build a plugin storage key.
 *
 * @param pluginName - The plugin name
 * @param suffix - Key suffix within plugin namespace
 * @returns Plugin storage key
 */
export function buildPluginKey(pluginName: string, suffix: string): string {
	return `_flashcore:plugin:${pluginName}:${suffix}`
}

import { generateTypes } from './codegen.js'
import { i18nLogger } from './loggers.js'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { State } from 'robo.js'
import type { Locale } from '../index.js'
import type { LocaleLike } from './types.js'

/** Token used to escape dots in ICU argument names during parsing/sanitization. */
export const DOT_TOKEN = '__RJSI18N_DOT__'

/** Visit every **string** leaf under `obj`, emitting a dot-joined path for nested keys. */
function forEachStringLeaf(obj: unknown, visit: (flatKey: string, value: string) => void, path: string[] = []): void {
	if (typeof obj === 'string') {
		visit(path.join('.'), obj)
		return
	}
	if (isPlainObject(obj)) {
		for (const [k, v] of Object.entries(obj)) {
			forEachStringLeaf(v, visit, [...path, k])
		}
		return
	}
	if (Array.isArray(obj)) {
		i18nLogger.warn?.('Skipping array in locale JSON at path: ' + path.join('.'))
		return
	}
	if (obj != null) {
		i18nLogger.warn?.(`Skipping non-string value in locale JSON at "${path.join('.')}" (type: ${typeof obj})`)
	}
}

/** Flattens nested objects/arrays (and Dates) into a dotted-key map for ICU formatter input. */
export function flattenParams(
	input: Record<string, unknown>,
	prefix = '',
	out: Record<string, unknown> = {}
): Record<string, unknown> {
	for (const [k, v] of Object.entries(input)) {
		const key = prefix ? `${prefix}.${k}` : k
		if (v instanceof Date) {
			out[key] = v
		} else if (Array.isArray(v)) {
			for (let i = 0; i < v.length; i++) {
				const vi = v[i]
				const akey = `${key}.${i}`
				if (vi instanceof Date) out[akey] = vi
				else if (isPlainObject(vi) || Array.isArray(vi)) flattenParams({ [i]: vi }, key, out)
				else out[akey] = vi as unknown
			}
		} else if (isPlainObject(v)) {
			flattenParams(v, key, out)
		} else {
			out[key] = v
		}
	}
	return out
}

/** Recursively collects absolute file paths under a directory. */
export function getAllFilePaths(dirPath: string, fileList: string[] = []): string[] {
	const entries = readdirSync(dirPath, { withFileTypes: true })

	for (const entry of entries) {
		const fullPath = join(dirPath, entry.name)

		if (entry.isDirectory()) {
			getAllFilePaths(fullPath, fileList)
		} else {
			fileList.push(fullPath)
		}
	}

	return fileList
}

/** Extracts a locale string from a `LocaleLike` value (string or object with `locale`/`guildLocale`). */
export function getLocale(input: Locale): Locale
export function getLocale(input: { locale: string } | { guildLocale: string }): string
export function getLocale(input: LocaleLike): string
export function getLocale(input: LocaleLike): string {
	if (typeof input === 'string') return input
	if ('locale' in input && typeof input.locale === 'string') return input.locale
	if ('guildLocale' in input && typeof input.guildLocale === 'string') {
		return input.guildLocale
	}
	throw new TypeError('Invalid LocaleLike')
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return Object.prototype.toString.call(v) === '[object Object]'
}

/** Loads locale JSONs, builds namespaced & flattened keys, stores values in State, and writes generated types. */
export function loadLocales() {
	const LocalesDir = join(process.cwd(), 'locales')

	i18nLogger.debug('Loading locales...')
	const time = Date.now()

	// Recursively collect all files under /locales
	const localeFiles = getAllFilePaths(LocalesDir)

	// Derive the list of available locales from the first path segment after /locales
	const localeNames = Array.from(
		new Set(
			localeFiles.map((filePath) => {
				const rel = relative(LocalesDir, filePath)
				return rel.split(sep)[0]
			})
		)
	)

	const localeValues: Record<string, Record<string, string>> = {}
	localeNames.forEach((locale) => (localeValues[locale] = {}))

	// Collect all discovered **namespaced** keys for typegen
	const localeKeys: string[] = []

	// Assuming all locale files are JSON key-value pairs, extract all keys and values
	for (const localeFile of localeFiles) {
		if (extname(localeFile) !== '.json') {
			i18nLogger.debug(`Skipping non-JSON file: ${localeFile}`)
			continue
		}

		const rel = relative(LocalesDir, localeFile) // e.g. "en/shared/common.json"
		const parts = rel.split(sep)
		if (parts.length < 2) {
			// Should always have at least <locale>/<file>
			i18nLogger.warn?.(`Unexpected locale file path: ${rel}`)
			continue
		}

		const localeName = parts.shift()! // "en"
		const fileAndDirs = parts // e.g. ["shared","common.json"] or ["common.json"]

		// Build namespace: dot-join of intermediate folders + filename (no .json), then colon
		const last = fileAndDirs[fileAndDirs.length - 1]!
		const fileBase = basename(last, '.json') // "common"
		const dirSegments = fileAndDirs.slice(0, -1) // ["shared"]
		const namespace = [...dirSegments, fileBase].join('.') // "shared.common" or "common"
		const prefix = `${namespace}:`

		const json = JSON.parse(readFileSync(localeFile, 'utf-8')) as Record<string, unknown>

		// Track per-file flattened keys to detect collisions between dotted keys and nested objects
		const seenFlat = new Set<string>()

		forEachStringLeaf(json, (flatKey, value) => {
			// Collision check (e.g., both "hello.user" and { hello: { user: … } })
			if (seenFlat.has(flatKey)) {
				const msg =
					`[i18n] Duplicate key after flattening in "${rel}": "${flatKey}". ` +
					'This likely happens because a literal dotted key and a nested object ' +
					'flatten to the same path. Please choose only one representation.'
				i18nLogger.error?.(msg)
				throw new Error(msg)
			}
			seenFlat.add(flatKey)

			const namespacedKey = `${prefix}${flatKey}` // e.g. "shared.common:hello.user"
			localeKeys.push(namespacedKey)
			localeValues[localeName]![namespacedKey] = value
			i18nLogger.debug(`Added key "${namespacedKey}" for locale "${localeName}"`)
		})
	}

	// Save state for runtime
	const namespace = '@robojs/i18n'
	State.set('localeKeys', localeKeys, { namespace })
	State.set('localeNames', localeNames, { namespace })
	State.set('localeValues', localeValues, { namespace })

	// Generate types from **namespaced** keys
	const types = generateTypes(localeNames, Array.from(new Set(localeKeys)), localeValues)

	// Save into package directory
	const __filename = fileURLToPath(import.meta.url)
	const __dirname = dirname(join(__filename, '..', '..'))
	const typesFilePath = join(__dirname, 'generated', 'types.d.ts')
	mkdirSync(dirname(typesFilePath), { recursive: true })
	i18nLogger.debug(`Writing types to ${typesFilePath}`)
	writeFileSync(typesFilePath, types, 'utf-8')
	return Date.now() - time
}

/** Returns the list of discovered locale names from State. */
export function loadLocalNames() {
	const localeNames = State.get<string[]>('localeNames', {
		namespace: '@robojs/i18n'
	})

	return localeNames
}

/** Escapes dots in ICU argument names (e.g., `{user.name}`) using DOT_TOKEN to avoid nested param collisions. */
export function sanitizeDottedArgs(msg: string) {
	const ARG_NAME_RE = /\{(\s*[^,\s}]+)(?=[,}])/g
	const sanitized = msg.replace(ARG_NAME_RE, (_m, nameWithWs: string) => {
		const leadingWs = nameWithWs.match(/^\s*/)?.[0] ?? ''
		const name = nameWithWs.trim()
		const safe = name.replace(/\./g, DOT_TOKEN)

		return `{${leadingWs}${safe}`
	})

	return sanitized
}

/** Rewrites dotted param keys using DOT_TOKEN so they align with `sanitizeDottedArgs` replacements. */
export function mapKeysToSanitized(values: Record<string, unknown>) {
	const out: Record<string, unknown> = {}
	for (const [k, v] of Object.entries(values)) {
		out[k.replaceAll('.', DOT_TOKEN)] = v
	}

	return out
}

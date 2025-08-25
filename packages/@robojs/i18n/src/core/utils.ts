import { i18nLogger } from './loggers.js'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
	parse,
	isPluralElement,
	isSelectElement,
	isArgumentElement,
	isNumberElement,
	isDateElement,
	isTimeElement,
	MessageFormatElement
} from '@formatjs/icu-messageformat-parser'
import { State } from 'robo.js'
import type { Locale } from '../index.js'
import type { LocaleLike } from './types.js'

// Build a per-key param map by parsing ICU messages across all locales,
// then unioning param types if they differ between locales.
type TsKind = 'number' | 'string' | 'dateOrNumber'
type Node = {
	// If this node is ever used as a scalar directly (e.g., {user}), we record its scalar kind
	kind?: TsKind
	// Children mean dotted sub-keys exist (e.g., user.name)
	children?: Record<string, Node>
}

const DOT_TOKEN = '__RJSI18N_DOT__'

/**
 * Recursively gets all file paths from the given directory.
 *
 * @param dirPath The starting directory path
 * @param fileList Internal use: the array of collected file paths
 * @returns Array of absolute file paths
 */
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

export function loadLocales() {
	const LocalesDir = join(process.cwd(), 'locales')

	i18nLogger.debug('Loading locales...')
	const time = Date.now()

	// Loop through locales folder recursively and add all .json files to array
	const localeFiles = getAllFilePaths(LocalesDir)
	const localeKeys: string[] = []
	const localeNames = Array.from(
		new Set(
			localeFiles.map((filePath) => {
				const relativePath = relative(LocalesDir, filePath)
				return relativePath.split(sep)[0]
			})
		)
	)

	// Create a map to hold locale values
	const localeValues: Record<string, Record<string, string>> = {}

	localeNames.forEach((locale) => {
		localeValues[locale] = {}
	})

	// Assuming all locale files are JSON key-value pairs, extract all keys and values
	for (const localeFile of localeFiles) {
		if (extname(localeFile) !== '.json') {
			i18nLogger.debug(`Skipping non-JSON file: ${localeFile}`)
			continue
		}
		const localeName = relative(LocalesDir, localeFile).split(sep)[0]

		const localeData = JSON.parse(readFileSync(localeFile, 'utf-8'))
		for (const [key, value] of Object.entries(localeData)) {
			if (typeof value !== 'string') {
				i18nLogger.warn(`Skipping non-string value for key "${key}" in file ${localeFile}`)
				continue
			}

			localeKeys.push(key)
			localeValues[localeName]![key] = value
			i18nLogger.debug(`Added key "${key}" with value "${value}" for locale "${localeName}"`)
		}
	}

	// Save state for later use
	const namespace = '@robojs/i18n'
	State.set('localeKeys', localeKeys, { namespace })
	State.set('localeNames', localeNames, { namespace })
	State.set('localeValues', localeValues, { namespace })

	// Generate types based on loaded locales and keys, including param extraction
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

function generateTypes(
	locales: string[],
	keys: string[],
	localeValues: Record<string, Record<string, string>>
): string {
	const paramsByKey: Record<string, Node> = {}

	function addPath(key: string, dotted: string, kind: TsKind) {
		const root = (paramsByKey[key] ||= {})
		const parts = dotted.split('.')
		let node = root

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i]!
			node.children ||= {}
			node = node.children[part] ||= {}

			if (i === parts.length - 1) {
				node.kind = widen(node.kind, kind)
			}
		}
	}

	const visit = (els: MessageFormatElement[], key: string) => {
		for (const el of els) {
			if (isPluralElement(el)) {
				addPath(key, undot(el.value), 'number')
				for (const opt of Object.values(el.options)) visit(opt.value, key)
			} else if (isSelectElement(el)) {
				addPath(key, undot(el.value), 'string')
				for (const opt of Object.values(el.options)) visit(opt.value, key)
			} else if (isNumberElement(el)) {
				addPath(key, undot(el.value), 'number')
			} else if (isDateElement(el) || isTimeElement(el)) {
				addPath(key, undot(el.value), 'dateOrNumber')
			} else if (isArgumentElement(el)) {
				addPath(key, undot(el.value), 'string')
			} else {
				// @ts-expect-error defensive traversal
				if (Array.isArray(el.value)) visit(el.value, key)
			}
		}
	}

	for (const locale of Object.keys(localeValues)) {
		const map = localeValues[locale]
		for (const key of Object.keys(map)) {
			try {
				const msg = sanitizeDottedArgs(map[key])
				const ast = parse(msg, { captureLocation: false })
				visit(ast, key)
			} catch (err) {
				// If a message fails to parse, fall back to no params for that key in this locale
				i18nLogger.warn?.(`Failed to parse ICU for key "${key}" in locale "${locale}": ${String(err)}`)
			}
		}
	}

	// Compose the .d.ts content
	let buffer = `// @generated by @robojs/i18n (robo.js)\n`
	buffer += '// DO NOT EDIT — generated from /locales/**/*.json. Run `robo build` to update.\n\n'
	buffer += `export type Locale = ${locales.map((locale) => `'${locale}'`).join(' | ')}\n\n`
	buffer += `export type LocaleKey = ${keys.map((key) => `'${key}'`).join(' | ')}\n\n`
	buffer += `export type LocaleParamsMap = {\n`

	for (const key of keys) {
		const root = paramsByKey[key]
		if (!root) {
			buffer += `  '${key}': {},\n`
			continue
		}
		buffer += `  '${key}': ${emitNode(root, 2)},\n`
	}
	buffer += `}\n\n`
	buffer += `export type ParamsFor<K extends LocaleKey> = LocaleParamsMap[K]\n\n`

	return buffer
}

export function loadLocalNames() {
	const localeNames = State.get<string[]>('localeNames', {
		namespace: '@robojs/i18n'
	})
	return localeNames
}

// Replace dots ONLY in the argument name portion between '{' and the first ',' or '}'
export function sanitizeDottedArgs(msg: string) {
	// {   user.name   , number}  or {user.name}
	const ARG_NAME_RE = /\{(\s*[^,\s}]+)(?=[,\}])/g
	const sanitized = msg.replace(ARG_NAME_RE, (_m, nameWithWs: string) => {
		const leadingWs = nameWithWs.match(/^\s*/)?.[0] ?? ''
		const name = nameWithWs.trim()
		const safe = name.replace(/\./g, DOT_TOKEN)
		return `{${leadingWs}${safe}`
	})
	return sanitized
}

export function mapKeysToSanitized(values: Record<string, unknown>) {
	const out: Record<string, unknown> = {}
	for (const [k, v] of Object.entries(values)) {
		out[k.replaceAll('.', DOT_TOKEN)] = v
	}

	return out
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return Object.prototype.toString.call(v) === '[object Object]'
}

const tsFor = (k: TsKind): string => (k === 'number' ? 'number' : k === 'dateOrNumber' ? 'Date | number' : 'string')

const safeIdent = (s: string) => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s) ? s : JSON.stringify(s))

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

const undot = (s: string) => s.replaceAll(DOT_TOKEN, '.')

const widen = (a: TsKind | undefined, b: TsKind): TsKind => {
	if (!a) return b
	if (a === b) return a
	// date/time vs number → dateOrNumber
	if (a === 'dateOrNumber' || b === 'dateOrNumber') return 'dateOrNumber'
	// string vs number → string (most permissive & still safe for formatting)
	return 'string'
}

function emitNode(node: Node, indent = 2): string {
	const hasChildren = !!node.children && Object.keys(node.children).length > 0

	if (!hasChildren) {
		// leaf only (scalar or unknown) – default to string if no kind recorded
		return tsFor(node.kind ?? 'string')
	}

	// build object type from children
	let objectFields = ''
	for (const [k, child] of Object.entries(node.children!)) {
		objectFields += `${' '.repeat(indent + 2)}${safeIdent(k)}?: ${emitNode(child, indent + 2)};\n`
	}
	const obj = `{\n${objectFields}${' '.repeat(indent)}}`

	// If this node was also used as a scalar (e.g., {user}) AND has children (e.g., {user.name}),
	// produce a union: scalar | { ... }
	if (node.kind) {
		return `${tsFor(node.kind)} | ${obj}`
	}
	return obj
}

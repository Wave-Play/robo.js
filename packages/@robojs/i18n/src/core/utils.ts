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
	// Build a per-key param map by parsing ICU messages across all locales,
	// then unioning param types if they differ between locales.
	type TsKind = 'number' | 'string' | 'dateOrNumber'
	const paramsByKey: Record<string, Record<string, TsKind>> = {}

	const mergeParam = (k: string, name: string, kind: TsKind) => {
		paramsByKey[k] ||= {}
		const prev = paramsByKey[k][name]

		if (!prev) {
			paramsByKey[k][name] = kind
			return
		}

		// widen to a safe union if types disagree (e.g., string vs number across locales)
		if (prev !== kind) {
			// If either is dateOrNumber, keep dateOrNumber
			if (prev === 'dateOrNumber' || kind === 'dateOrNumber') {
				paramsByKey[k][name] = 'dateOrNumber'
			} else {
				// string vs number -> we can't know; prefer string (most permissive for formatting)
				paramsByKey[k][name] = 'string'
			}
		}
	}

	const visit = (els: MessageFormatElement[], key: string) => {
		for (const el of els) {
			if (isPluralElement(el)) {
				mergeParam(key, el.value, 'number')
				for (const opt of Object.values(el.options)) visit(opt.value, key)
			} else if (isSelectElement(el)) {
				mergeParam(key, el.value, 'string')
				for (const opt of Object.values(el.options)) visit(opt.value, key)
			} else if (isNumberElement(el)) {
				mergeParam(key, el.value, 'number')
			} else if (isDateElement(el) || isTimeElement(el)) {
				mergeParam(key, el.value, 'dateOrNumber')
			} else if (isArgumentElement(el)) {
				mergeParam(key, el.value, 'string')
			} else {
				// Some nodes (e.g., literals) may have nested values — defensive traversal
				// @ts-expect-error - different element shapes
				if (Array.isArray(el.value)) visit(el.value, key)
			}
		}
	}

	for (const locale of Object.keys(localeValues)) {
		const map = localeValues[locale]
		for (const key of Object.keys(map)) {
			try {
				const ast = parse(map[key], { captureLocation: false })
				visit(ast, key)
			} catch (err) {
				// If a message fails to parse, fall back to no params for that key in this locale
				i18nLogger.warn?.(`Failed to parse ICU for key "${key}" in locale "${locale}": ${String(err)}`)
			}
		}
	}

	// Helpers to emit TS
	const tsFor = (k: TsKind): string => (k === 'number' ? 'number' : k === 'dateOrNumber' ? 'Date | number' : 'string')

	// Compose the .d.ts content
	let buffer = `// This file is auto-generated. Do not edit manually.\n\n`
	buffer += `export type Locale = ${locales.map((locale) => `'${locale}'`).join(' | ')}\n\n`
	buffer += `export type LocaleKey = ${keys.map((key) => `'${key}'`).join(' | ')}\n\n`

	// Params map
	buffer += `export type LocaleParamsMap = {\n`
	for (const key of keys) {
		const params = paramsByKey[key] ?? {}
		const entries = Object.entries(params)

		if (entries.length === 0) {
			buffer += `  '${key}': {},\n`
		} else {
			const fields = entries.map(([name, kind]) => `    ${name}?: ${tsFor(kind)}`).join(';\n')
			buffer += `  '${key}': {\n${fields}\n  },\n`
		}
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

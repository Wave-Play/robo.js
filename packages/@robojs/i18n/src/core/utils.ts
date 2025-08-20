import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { State } from 'robo.js'
import { i18nLogger } from './loggers'

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
	const localeValues = new Map<string, Record<string, string>>()

	localeNames.forEach((locale) => {
		localeValues.set(locale, {})
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
			localeValues.get(localeName)![key] = value
			i18nLogger.debug(`Added key "${key}" with value "${value}" for locale "${localeName}"`)
		}
	}

	// Save state for later use
	const namespace = '@robojs/i18n'
	State.set('localeKeys', localeKeys, { namespace })
	State.set('localeNames', localeNames, { namespace })
	State.set('localeValues', localeValues, { namespace })

	// Generate types for type safety
	const types = generateTypes(localeNames, localeKeys)

	// Save into package directory
	const __filename = fileURLToPath(import.meta.url)
	const __dirname = dirname(join(__filename, '..', '..'))
	const typesFilePath = join(__dirname, 'generated', 'types.d.ts')
	mkdirSync(dirname(typesFilePath), { recursive: true })
	i18nLogger.warn(`Writing types to ${typesFilePath}`)
	writeFileSync(typesFilePath, types, 'utf-8')

	i18nLogger.info(`Found ${localeFiles.length} locale files.`, localeFiles)
	i18nLogger.info(`Extracted ${localeKeys.length} locale keys.`, localeKeys)
	i18nLogger.info(`Available locales:`, localeNames)
	i18nLogger.info(`Locale values:`, localeValues)
	i18nLogger.warn('Types:', types)
	i18nLogger.ready(`Locales loaded in ${Date.now() - time}ms`)
}


function generateTypes(locales: string[], keys: string[]): string {
	let buffer = `// This file is auto-generated. Do not edit manually.\n\n`
	buffer += `export type Locale = ${locales.map((locale) => `'${locale}'`).join(' | ')}\n\n`
	buffer += `export type LocaleKey = ${keys.map((key) => `'${key}'`).join(' | ')}\n\n`

	return buffer
}




export function loadLocalNames() {
	const localeNames = State.get<string[]>('localeNames', {
		namespace: '@robojs/i18n'
	})
	return localeNames;
}
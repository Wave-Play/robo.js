import { i18nLogger } from '~/core/loggers.js'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const LocalesDir = join(process.cwd(), 'locales')

export default () => {
	i18nLogger.event('Loading locales...')

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

	// Assuming all locale files are JSON key-value pairs, extract all keys and values
	for (const localeFile of localeFiles) {
		if (extname(localeFile) !== '.json') {
			i18nLogger.debug(`Skipping non-JSON file: ${localeFile}`)
			continue
		}

		const localeData = JSON.parse(readFileSync(localeFile, 'utf-8'))
		for (const [key, value] of Object.entries(localeData)) {
			if (typeof value !== 'string') {
				i18nLogger.warn(`Skipping non-string value for key "${key}" in file ${localeFile}`)
				continue
			}

			localeKeys.push(key)
		}
	}

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
	i18nLogger.warn('Types:', types)
}

/**
 * Recursively gets all file paths from the given directory.
 *
 * @param dirPath The starting directory path
 * @param fileList Internal use: the array of collected file paths
 * @returns Array of absolute file paths
 */
function getAllFilePaths(dirPath: string, fileList: string[] = []): string[] {
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

function generateTypes(locales: string[], keys: string[]): string {
	let buffer = `// This file is auto-generated. Do not edit manually.\n\n`
	buffer += `export type Locale = ${locales.map((locale) => `'${locale}'`).join(' | ')}\n\n`
	buffer += `export type LocaleKey = ${keys.map((key) => `'${key}'`).join(' | ')}\n\n`

	return buffer
}

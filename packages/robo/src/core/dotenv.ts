import { existsSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { IS_BUN } from '../cli/utils/runtime-utils.js'
import { logger } from './logger.js'

function parseEnvFile(envFileContent: string): { [key: string]: string } {
	const lines = envFileContent.split('\n')
	const commentRegex = /^\s*#/
	const quotesRegex = /^['"]/
	const escapedCharsRegex = /\\(.)/g

	let currentLine = ''
	const newEnvVars: { [key: string]: string } = {}

	for (let i = 0; i < lines.length; i++) {
		currentLine += lines[i]

		// Ignore comments
		if (commentRegex.test(currentLine)) {
			currentLine = ''
			continue
		}

		// Multiline support
		if (currentLine.endsWith('\\')) {
			currentLine = currentLine.slice(0, -1)
			continue
		}

		// Find first index of '=', and split key/value there
		const delimiterIndex = currentLine.indexOf('=')
		if (delimiterIndex === -1) {
			currentLine = ''
			continue // Ignore lines that aren't key-value pairs
		}

		const key = currentLine.substr(0, delimiterIndex).trim()
		let value = currentLine.substr(delimiterIndex + 1).trim()

		// Remove surrounding quotes and unescape
		if (quotesRegex.test(value)) {
			value = value.slice(1, -1).replace(escapedCharsRegex, '$1')
		}

		newEnvVars[key] = value
		currentLine = ''
	}

	return newEnvVars
}

interface LoadEnvOptions {
	filePath?: string
	mode?: string
	overwrite?: boolean
	sync?: boolean
}

export async function loadEnv(options: LoadEnvOptions = {}): Promise<void> {
	// No need to load .env file if using Bun (it's already loaded)
	if (IS_BUN) {
		return
	}

	// Look for .env.{mode} file first, then fallback to standard .env
	const { mode, overwrite } = options
	let { filePath = path.join(process.cwd(), '.env') } = options

	if (mode && existsSync(filePath + '.' + mode)) {
		logger.debug('Found .env file for mode:', mode, ':', filePath + '.' + mode)
		filePath = path.join(process.cwd(), '.env' + '.' + mode)
	}
	if (!existsSync(filePath)) {
		logger.debug(`No .env file found at "${filePath}"`)
		return
	}

	const envFileContent = options.sync ? readFileSync(filePath, 'utf-8') : await readFile(filePath, 'utf-8')
	const newEnvVars = parseEnvFile(envFileContent)
	const varSubstitutionRegex = /\${(.+?)}/g

	// Create a clone of process.env to maintain a consistent state in case of an error
	const envClone = { ...process.env }

	try {
		for (const key in newEnvVars) {
			// Don't overwrite existing values unless specified
			if (!overwrite && key in envClone) {
				continue
			}

			const visited = new Set<string>()
			let value = newEnvVars[key]

			while (varSubstitutionRegex.test(value)) {
				value = value.replace(varSubstitutionRegex, (_, varName) => {
					if (visited.has(varName)) {
						throw new Error(`Circular reference detected in environment variable "${key}"`)
					}
					visited.add(varName)
					return envClone[varName] || newEnvVars[varName] || ''
				})
			}

			envClone[key] = value
		}

		Object.assign(process.env, envClone)
	} catch (err) {
		console.error(`Error while loading environment variables:`, err)
	}
}

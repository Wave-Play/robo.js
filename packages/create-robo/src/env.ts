import { envLogger } from './core/loggers.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import chalk from 'chalk'
import { hasProperties } from './utils.js'

type Entry = VariableEntry | CommentEntry | EmptyEntry

interface VariableEntry {
	type: 'variable'
	key: string
	value: string
}

interface CommentEntry {
	type: 'comment'
	line: string
}

interface EmptyEntry {
	type: 'empty'
	line: string
}

export class Env {
	private entries: Entry[] = []
	private filePath: string

	constructor(filePath = '.env', private readonly basePath = process.cwd()) {
		this.filePath = path.resolve(basePath, filePath)
	}

	/**
	 * Loads and parses the .env file.
	 */
	public async load() {
		try {
			const content = await fs.readFile(this.filePath, { encoding: 'utf8' })
			this.parse(content)
			envLogger.debug(`Loaded .env from ${this.filePath}:\n`, this.entries)
		} catch (error) {
			if (hasProperties(error, ['code']) && error.code !== 'ENOENT') {
				throw error
			}

			envLogger.debug(`No .env file found at ${this.filePath}`)
		}
		return this
	}

	/**
	 * Retrieves the value of a variable by key.
	 *
	 * @param key - The variable name.
	 * @returns The value of the variable or undefined if not found.
	 */
	public get(key: string): string | undefined {
		for (let i = this.entries.length - 1; i >= 0; i--) {
			const entry = this.entries[i]

			if (entry.type === 'variable' && entry.key === key) {
				return entry.value
			}
		}

		return undefined
	}

	/**
	 * Sets or updates the value of a variable.
	 *
	 * @param key - The variable name.
	 * @param value - The value to set.
	 */
	public set(key: string, value: string, comment?: string) {
		for (let i = this.entries.length - 1; i >= 0; i--) {
			const entry = this.entries[i]

			if (entry.type === 'variable' && entry.key === key) {
				entry.value = value
				return this
			}
		}

		// If key not found, append at the end
		const newEntry: VariableEntry = {
			type: 'variable',
			key,
			value
		}

		// Add a comment if provided, preceded by an empty line if there's entries before it
		if (comment && this.entries.length > 0) {
			this.entries.push({ type: 'empty', line: '' })
		}
		if (comment) {
			this.entries.push({ type: 'comment', line: `# ${comment}` })
		}
		this.entries.push(newEntry)

		return this
	}

	/**
	 * Writes all changes back to the .env file.
	 */
	public async commit(typescript = false) {
		const content =
			this.entries
				.map((entry) => {
					if (entry.type === 'variable') {
						const escapedValue = this.escapeValue(entry.value)
						return `${entry.key}="${escapedValue}"`
					} else {
						return entry.line
					}
				})
				.join('\n') + '\n'

		envLogger.debug(`Writing to .env file:\n${chalk.dim(content)}`)
		await fs.writeFile(this.filePath, content, { encoding: 'utf8' })

		// Generate env.d.ts
		if (typescript) {
			envLogger.debug('Generating env.d.ts')
			const variableEntries = this.entries.filter((entry) => entry.type === 'variable') as VariableEntry[]
			const envVarDeclarations = variableEntries.map((entry) => `      ${entry.key}: string;`).join('\n')
			const autoCompletionEnvVar = `export {}\ndeclare global {\n  namespace NodeJS {\n    interface ProcessEnv {\n${envVarDeclarations}\n    }\n  }\n}`

			// Write env.d.ts
			const envDtsPath = path.join(this.basePath, 'env.d.ts')
			await fs.writeFile(envDtsPath, autoCompletionEnvVar, 'utf-8')

			// Modify tsconfig.json if it exists
			const tsconfigPath = path.join(this.basePath, 'tsconfig.json')
			const tsconfigExists = await fs
				.access(tsconfigPath)
				.then(() => true)
				.catch(() => false)

			if (tsconfigExists) {
				const tsconfigContent = await fs.readFile(tsconfigPath, 'utf-8')
				const tsconfig = JSON.parse(tsconfigContent)
				const compilerOptions = tsconfig.compilerOptions || {}

				// Update typeRoots
				let typeRoots: string[] = compilerOptions.typeRoots || []
				if (!Array.isArray(typeRoots)) {
					typeRoots = [typeRoots]
				}
				if (!typeRoots.includes('./env.d.ts')) {
					typeRoots.push('./env.d.ts')
				}
				compilerOptions.typeRoots = typeRoots
				tsconfig.compilerOptions = compilerOptions

				// Write updated tsconfig.json
				await fs.writeFile(tsconfigPath, JSON.stringify(tsconfig, null, 2), 'utf-8')
			}
		}
	}

	private escapeValue(value: string): string {
		// Escape backslashes and double quotes
		const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

		// Determine if the value needs to be quoted
		if (/[\s#=]/.test(value)) {
			return `"${escaped}"`
		} else {
			return escaped
		}
	}

	/**
	 * Parses the content of the .env file into entries.
	 *
	 * @param content - The content of the .env file.
	 */
	private parse(content: string): void {
		const lines = content.split(/\r?\n/)

		this.entries = lines.map((line) => {
			if (/^\s*$/.test(line)) {
				return { type: 'empty', line } as EmptyEntry
			} else if (/^\s*#/.test(line)) {
				return { type: 'comment', line } as CommentEntry
			} else {
				const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)

				if (match) {
					const key = match[1]
					let value = match[2] || ''
					value = value.trim()

					if (value.startsWith(`"`) && value.endsWith(`"`)) {
						value = value.slice(1, -1).replace(/\\"/g, `"`).replace(/\\\\/g, `\\`)
					} else if (value.startsWith(`'`) && value.endsWith(`'`)) {
						value = value.slice(1, -1)
					} else {
						value = value.replace(/\\ /g, ' ')
					}

					return { type: 'variable', key, value } as VariableEntry
				} else {
					// Invalid line, treat as comment
					return { type: 'comment', line } as CommentEntry
				}
			}
		})

		// Treat a single empty line as no entries
		if (this.entries.length === 1 && this.entries[0].type === 'empty') {
			this.entries = []
		}
	}
}

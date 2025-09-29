import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

export interface EnvFileDescriptor {
	path: string
	exists: boolean
}

export interface EnvVariableAssignment {
	description?: string
	key: string
	overwrite?: boolean
	value: string
}

export interface EnvApplyResult {
	created: boolean
	file: string
	skipped: string[]
	updated: string[]
}

export async function detectEnvFiles(): Promise<EnvFileDescriptor[]> {
	const cwd = process.cwd()
	const entries = await fs.readdir(cwd).catch(() => [] as string[])
	const descriptors = new Map<string, EnvFileDescriptor>()

	await noteEnvFile(descriptors, cwd, '.env')

	await Promise.all(
		entries
			.filter((entry) => entry.startsWith('.env.'))
			.map(async (entry) => {
				await noteEnvFile(descriptors, cwd, entry)
			})
	)

	return Array.from(descriptors.values()).sort((a, b) => a.path.localeCompare(b.path))
}

export async function applyEnvVariables(
	files: EnvFileDescriptor[],
	variables: EnvVariableAssignment[]
): Promise<EnvApplyResult[]> {
	const results: EnvApplyResult[] = []

	for (const file of files) {
		const { exists, path: filePath } = file
		let content = ''
		let newline = '\n'

		if (exists) {
			content = await fs.readFile(filePath, 'utf-8')
			newline = content.includes('\r\n') ? '\r\n' : '\n'
		}

		const applyResult: EnvApplyResult = {
			created: !exists,
			file: filePath,
			skipped: [],
			updated: []
		}

		let updatedContent = content
		let changed = false
		let lines = updatedContent.length > 0 ? updatedContent.split(newline) : []
		if (lines.length === 1 && lines[0] === '') {
			lines = []
		}
		const hadTrailingBlank = updatedContent.endsWith(newline)

		for (const variable of variables) {
			const { key, value, overwrite } = variable
			const escapedKey = escapeRegExp(key)
			const entryRegex = new RegExp(`^(?:export\\s+)?${escapedKey}\\s*=`, 'i')
			const entryIndex = lines.findIndex((line) => entryRegex.test(line))
			const commentText = variable.description ? `# Sensitive! ${variable.description}` : undefined
			const serializedValue = serializeEnvValue(value)

			if (entryIndex !== -1) {
				const existingLine = lines[entryIndex]
				const leadingWhitespaceMatch = existingLine.match(/^\s*/)
				const leadingWhitespace = leadingWhitespaceMatch ? leadingWhitespaceMatch[0] : ''
				const hasExport = new RegExp(`^${escapeRegExp(leadingWhitespace)}export\\s+`, 'i').test(existingLine)
				const equalsIndex = existingLine.indexOf('=')
				const valueSegment = equalsIndex >= 0 ? existingLine.slice(equalsIndex + 1) : ''
				const parsed = parseValueSegment(valueSegment)

				if (!overwrite && parsed.value.trim().length > 0) {
					applyResult.skipped.push(key)
					continue
				}

				const entryLine = `${leadingWhitespace}${hasExport ? 'export ' : ''}${key}=${serializedValue}`
				lines[entryIndex] = entryLine

				const commentIndex = entryIndex - 1
				let commentIdx: number | undefined
				if (commentText) {
					if (commentIndex >= 0 && lines[commentIndex].trim().startsWith('# Sensitive! ')) {
						lines[commentIndex] = commentText
						commentIdx = commentIndex
					} else {
						lines.splice(entryIndex, 0, commentText)
						commentIdx = entryIndex
					}

					if (commentIdx! > 0 && lines[commentIdx! - 1] !== '') {
						lines.splice(commentIdx!, 0, '')
						commentIdx! += 1
					}
				} else if (commentIndex >= 0 && lines[commentIndex].trim().startsWith('# Sensitive! ')) {
					lines.splice(commentIndex, 1)
					if (commentIndex < lines.length && lines[commentIndex] === '') {
						lines.splice(commentIndex, 1)
					} else if (commentIndex - 1 >= 0 && lines[commentIndex - 1] === '') {
						lines.splice(commentIndex - 1, 1)
					}
				}

				applyResult.updated.push(key)
				changed = true
			} else {
				if (commentText) {
					if (lines.length > 0 && lines[lines.length - 1] !== '') {
						// maintain separation from previous entry
						lines.push('')
					}
					lines.push(commentText)
				}
				lines.push(`${key}=${serializedValue}`)
				applyResult.updated.push(key)
				changed = true
			}
		}

		if (changed) {
			// remove possible extra blank line at start
			while (lines.length > 0 && lines[0] === '') {
				lines.shift()
			}

			updatedContent = lines.join(newline)
			if (updatedContent.length > 0 && !updatedContent.endsWith(newline)) {
				updatedContent += newline
			}
			if (updatedContent.length === 0 && hadTrailingBlank) {
				updatedContent = newline
			}
			await fs.mkdir(path.dirname(filePath), { recursive: true })
			await fs.writeFile(filePath, updatedContent, 'utf-8')
		}

		results.push(applyResult)
	}

	return results
}

function serializeEnvValue(value: string): string {
	const escaped = value
		.replace(/\\/g, '\\\\')
		.replace(/\r/g, '\\r')
		.replace(/\n/g, '\\n')
		.replace(/\t/g, '\\t')
		.replace(/"/g, '\\"')
	return `"${escaped}"`
}

function parseValueSegment(segment: string): { comment?: string; value: string } {
	let comment: string | undefined
	let valuePart = segment
	let inSingle = false
	let inDouble = false

	for (let i = 0; i < segment.length; i++) {
		const char = segment[i]
		const prev = segment[i - 1]
		if (char === '"' && prev !== '\\' && !inSingle) {
			inDouble = !inDouble
			continue
		}
		if (char === "'" && prev !== '\\' && !inDouble) {
			inSingle = !inSingle
			continue
		}
		if (char === '#' && !inSingle && !inDouble) {
			comment = segment.slice(i)
			valuePart = segment.slice(0, i)
			break
		}
	}

	const trimmed = valuePart.trim()
	const unquoted = unquote(trimmed)
	return {
		comment,
		value: unquoted
	}
}

function unquote(value: string): string {
	if (value.length < 2) {
		return value
	}

	const first = value[0]
	const last = value[value.length - 1]

	if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
		const inner = value.slice(1, -1)
		return inner
			.replace(/\\n/g, '\n')
			.replace(/\\r/g, '\r')
			.replace(/\\t/g, '\t')
			.replace(/\\"/g, '"')
			.replace(/\\'/g, "'")
			.replace(/\\\\/g, '\\')
	}

	return value
}

async function noteEnvFile(map: Map<string, EnvFileDescriptor>, cwd: string, filename: string) {
	const fullPath = path.join(cwd, filename)

	if (map.has(fullPath)) {
		return
	}

	let exists = existsSync(fullPath)

	if (exists) {
		try {
			const stat = await fs.stat(fullPath)
			exists = stat.isFile()
		} catch {
			exists = false
		}
	}

	map.set(fullPath, { path: fullPath, exists })
}

function escapeRegExp(input: string) {
	return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

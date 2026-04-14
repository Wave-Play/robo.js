/**
 * /db export - Export schema to markdown or JSON format
 */
import { color, createTerminalCommandConfig } from 'robo.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'Export schema to markdown or JSON',
	options: [
		{ alias: '-f', name: '--format', description: 'Output format: md (default) or json', type: 'string' },
		{ alias: '-o', name: '--output', description: 'Output file path (prints to terminal if not specified)', type: 'string' },
		{ alias: '-v', name: '--verbose', description: 'Print more information for debugging', type: 'boolean' }
	]
} as const)

const Indent = '   '

export default async function (ctx: TerminalContext<typeof config>) {
	const { format: formatOpt, output: outputPath, verbose } = ctx.options
	const format = formatOpt || 'md'

	try {
		const { Flashcore } = await import('robo.js/flashcore')

		if (!Flashcore.$.isInitialized) {
			ctx.write('\n')
			ctx.write(Indent + 'Flashcore has not been initialized.\n')
			ctx.write('\n')
			return
		}

		const models = Flashcore.$.getRegisteredModels()
		if (models.size === 0) {
			ctx.write('\n')
			ctx.write(Indent + 'No models registered.\n')
			ctx.write('\n')
			return
		}

		let output: string

		if (format === 'json') {
			output = await exportToJson(models)
		} else if (format === 'md' || format === 'markdown') {
			output = await exportToMarkdown(models)
		} else {
			ctx.write(Indent + `Unknown format: ${format}. Use 'md' or 'json'.\n`)
			return
		}

		if (outputPath) {
			const { writeFile } = await import('fs/promises')
			await writeFile(outputPath, output, 'utf-8')
			ctx.write(Indent + `Schema exported to ${color.cyan(outputPath)}\n`)
		} else {
			ctx.write(output + '\n')
		}
	} catch (error) {
		ctx.write(Indent + `Failed to export schema: ${error}\n`)
	}
}

async function exportToMarkdown(models: Map<string, any>): Promise<string> {
	const lines: string[] = []

	lines.push('# Flashcore Schema')
	lines.push('')
	lines.push(`Generated: ${new Date().toISOString()}`)
	lines.push('')
	lines.push('## Models')
	lines.push('')

	for (const [name, model] of models) {
		lines.push(`### ${name}`)
		lines.push('')
		lines.push('| Field | Type | Required | Unique | Default |')
		lines.push('|-------|------|----------|--------|---------|')

		const schema = model._schema
		for (const [fieldName, field] of Object.entries(schema.fields)) {
			const f = field as any
			const type = f.type || 'unknown'
			const required = f.optional ? 'No' : 'Yes'
			const unique = f.unique ? 'Yes' : 'No'
			const defaultVal = f.default !== undefined ? `\`${JSON.stringify(f.default)}\`` : '-'

			lines.push(`| ${fieldName} | ${type} | ${required} | ${unique} | ${defaultVal} |`)
		}

		lines.push('')

		// Show relations if any
		if (schema.relations && Object.keys(schema.relations).length > 0) {
			lines.push('**Relations:**')
			lines.push('')
			for (const [relName, rel] of Object.entries(schema.relations)) {
				const r = rel as any
				lines.push(`- \`${relName}\`: ${r.type} → ${r.model}`)
			}
			lines.push('')
		}

		// Show indexes if any
		if (schema.indexes && schema.indexes.length > 0) {
			lines.push('**Indexes:**')
			lines.push('')
			for (const idx of schema.indexes) {
				const fields = (idx as any).fields.join(', ')
				const type = (idx as any).unique ? 'unique' : 'index'
				lines.push(`- ${type}(${fields})`)
			}
			lines.push('')
		}
	}

	return lines.join('\n')
}

async function exportToJson(models: Map<string, any>): Promise<string> {
	const output: Record<string, any> = {
		generated: new Date().toISOString(),
		models: {}
	}

	for (const [name, model] of models) {
		const schema = model._schema

		output.models[name] = {
			checksum: model._schemaChecksum,
			fields: {},
			relations: schema.relations || {},
			indexes: schema.indexes || []
		}

		for (const [fieldName, field] of Object.entries(schema.fields)) {
			const f = field as any
			output.models[name].fields[fieldName] = {
				type: f.type,
				optional: f.optional ?? false,
				unique: f.unique ?? false,
				default: f.default
			}
		}
	}

	return JSON.stringify(output, null, 2)
}

/**
 * /db diff - Show visual schema diff between stored and current versions
 */
import { color, createTerminalCommandConfig } from 'robo.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'Show visual schema diff between versions',
	positionalArgs: true,
	options: [
		{ alias: '-m', name: '--model', description: 'Specific model to diff', type: 'string' },
		{ alias: '-v', name: '--verbose', description: 'Print more information for debugging', type: 'boolean' }
	]
} as const)

const Indent = '   '

export default async function (ctx: TerminalContext<typeof config>) {
	const { model: modelOpt, verbose: _verbose } = ctx.options
	const modelName = modelOpt || ctx.args[0]

	try {
		const { Flashcore } = await import('robo.js/flashcore')
		const { analyzeSchemaChanges, formatSchemaChanges } = await import('../../../../migrations/index.js')

		if (!Flashcore.$.isInitialized) {
			ctx.write('\n')
			ctx.write(Indent + 'Flashcore has not been initialized.\n')
			ctx.write('\n')
			return
		}

		const metadataManager = Flashcore.$._schemaMetadataManager
		if (!metadataManager) {
			ctx.write('\n')
			ctx.write(Indent + 'Schema metadata manager not available.\n')
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

		// Filter to specific model if provided
		const modelsToCheck = modelName
			? new Map([...models].filter(([name]) => name === modelName))
			: models

		if (modelName && modelsToCheck.size === 0) {
			ctx.write('\n')
			ctx.write(Indent + `Model "${modelName}" not found.\n`)
			ctx.write('\n')
			return
		}

		ctx.write('\n')
		ctx.write(Indent + color.bold('Schema Diff') + '\n')
		ctx.write(Indent + '============\n')
		ctx.write('\n')

		let hasChanges = false

		for (const [name, model] of modelsToCheck) {
			const metadata = await metadataManager.getModelMetadata(name)

			if (!metadata) {
				ctx.write(Indent + color.bold(name) + ' ' + color.yellow('(untracked)') + '\n')
				ctx.write(Indent + '  No stored schema - will be tracked on first sync\n')
				ctx.write('\n')
				continue
			}

			// Analyze changes between stored metadata fields and current model schema
			const analysis = analyzeSchemaChanges(metadata.fields, (model as any).schema, name)

			const allChanges = [...analysis.safe, ...analysis.breaking]
			if (allChanges.length === 0) {
				ctx.write(Indent + color.bold(name) + ' ' + color.green('(no changes)') + '\n')
				ctx.write('\n')
				continue
			}

			hasChanges = true
			ctx.write(Indent + color.bold(name) + '\n')

			// Format and display changes
			const formatted = formatSchemaChanges(allChanges)
			for (const line of formatted.split('\n')) {
				if (line.startsWith('+')) {
					ctx.write(Indent + '  ' + color.green(line) + '\n')
				} else if (line.startsWith('-')) {
					ctx.write(Indent + '  ' + color.red(line) + '\n')
				} else if (line.startsWith('~')) {
					ctx.write(Indent + '  ' + color.yellow(line) + '\n')
				} else {
					ctx.write(Indent + '  ' + line + '\n')
				}
			}

			// Show summary
			const safeCount = analysis.safe.length
			const breakingCount = analysis.breaking.length

			if (safeCount > 0) {
				ctx.write(Indent + '  ' + color.green(`${safeCount} safe change(s) - will auto-apply`) + '\n')
			}
			if (breakingCount > 0) {
				ctx.write(Indent + '  ' + color.red(`${breakingCount} breaking change(s) - migration required`) + '\n')
			}

			ctx.write('\n')
		}

		if (!hasChanges) {
			ctx.write(Indent + color.green('All schemas are up to date.') + '\n')
			ctx.write('\n')
		}
	} catch (error) {
		ctx.write(Indent + `Failed to compute diff: ${error}\n`)
	}
}

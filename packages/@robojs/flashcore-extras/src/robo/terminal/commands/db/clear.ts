/**
 * /db clear - Clear data from Flashcore models
 */
import { color, createTerminalCommandConfig } from 'robo.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'Clear data from Flashcore models',
	options: [
		{ alias: '-m', name: '--model', description: 'Clear a specific model', type: 'string' },
		{ alias: '-n', name: '--namespace', description: 'Clear models in a specific namespace', type: 'string' },
		{ alias: '-c', name: '--confirm', description: 'Skip confirmation prompt (DANGEROUS)', type: 'boolean' },
		{ alias: '-k', name: '--keep-schema', description: 'Keep schema metadata (only clear data)', type: 'boolean' },
		{ alias: '-v', name: '--verbose', description: 'Print more information for debugging', type: 'boolean' }
	]
} as const)

const Indent = '   '

export default async function (ctx: TerminalContext<typeof config>) {
	const { model, namespace, confirm, 'keep-schema': keepSchema, verbose: _verbose } = ctx.options

	try {
		const { Flashcore } = await import('robo.js/flashcore')

		if (!Flashcore.$.isInitialized) {
			ctx.write('\n')
			ctx.write(Indent + 'Flashcore is not initialized.\n')
			ctx.write(Indent + 'Run your Robo to initialize Flashcore first.\n')
			ctx.write('\n')
			return
		}

		// Get models to clear
		const models = Flashcore.$.getRegisteredModels()

		if (models.size === 0) {
			ctx.write('\n')
			ctx.write(Indent + color.dim('No models registered.') + '\n')
			ctx.write('\n')
			return
		}

		let modelsToClear = Array.from(models.values()) as any[]

		// Filter by model name
		if (model) {
			modelsToClear = modelsToClear.filter((m: any) => m.name === model)
			if (modelsToClear.length === 0) {
				ctx.write(Indent + `Model '${model}' not found.\n`)
				return
			}
		}

		// Filter by namespace
		if (namespace) {
			modelsToClear = modelsToClear.filter((m: any) => (m.namespace ?? 'default') === namespace)
			if (modelsToClear.length === 0) {
				ctx.write(Indent + `No models found in namespace '${namespace}'.\n`)
				return
			}
		}

		ctx.write('\n')

		// Show warning
		ctx.write(Indent + color.red(color.bold('WARNING: This will permanently delete data!')) + '\n')
		ctx.write('\n')
		ctx.write(Indent + 'The following models will be cleared:\n')
		for (const m of modelsToClear) {
			const ns = m.namespace ?? 'default'
			ctx.write(Indent + `  - ${m.name} (${ns})\n`)
		}
		ctx.write('\n')

		// Check confirmation
		if (!confirm) {
			ctx.write(Indent + color.yellow('Add --confirm to proceed with deletion.') + '\n')
			ctx.write(Indent + color.dim('This is a safety measure to prevent accidental data loss.') + '\n')
			ctx.write('\n')
			return
		}

		ctx.write(Indent + color.bold('Clearing data...') + '\n')
		ctx.write('\n')

		let totalCleared = 0
		let totalRecords = 0

		for (const m of modelsToClear) {
			ctx.write(Indent + color.cyan(`Model: ${m.name}`) + '\n')

			try {
				// Get count before clearing
				let count = 0
				try {
					count = await m.count()
				} catch {
					// Count not available
				}

				// Clear the model data
				if (m.deleteMany) {
					const deleted = await m.deleteMany({})
					ctx.write(Indent + `  ${color.green('✓')} Deleted ${deleted} record(s)\n`)
					totalRecords += deleted
				} else if (m.clear) {
					await m.clear()
					ctx.write(Indent + `  ${color.green('✓')} Cleared (${count} records)\n`)
					totalRecords += count
				} else {
					ctx.write(Indent + `  ${color.yellow('○')} No clear method available\n`)
					continue
				}

				// Clear derived structures
				if (!keepSchema) {
					try {
						if (m.clearFilter) await m.clearFilter()
						if (m.clearIndexes) await m.clearIndexes()
						if (m.clearUniqueIndex) await m.clearUniqueIndex()
						ctx.write(Indent + `  ${color.green('✓')} Cleared derived structures\n`)
					} catch {
						// Failed to clear derived structures
					}
				}

				totalCleared++
			} catch (e) {
				ctx.write(Indent + `  ${color.red('✗')} Failed: ${e}\n`)
			}

			ctx.write('\n')
		}

		// Summary
		ctx.write(Indent + color.bold('Summary') + '\n')
		ctx.write(Indent + `Models cleared: ${totalCleared}/${modelsToClear.length}\n`)
		ctx.write(Indent + `Records deleted: ${totalRecords}\n`)

		if (keepSchema) {
			ctx.write(Indent + color.dim('Schema metadata preserved.') + '\n')
		}

		ctx.write('\n')
	} catch (error) {
		ctx.write(Indent + `Clear failed: ${error}\n`)
	}
}

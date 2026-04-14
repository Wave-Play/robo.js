/**
 * /db rebuild-indexes - Rebuild all indexes for Flashcore models
 */
import { color, createTerminalCommandConfig } from 'robo.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'Rebuild all indexes for Flashcore models',
	options: [
		{ alias: '-m', name: '--model', description: 'Rebuild indexes for a specific model', type: 'string' },
		{ alias: '-a', name: '--all', description: 'Also rebuild filter and unique indexes', type: 'boolean' },
		{ alias: '-v', name: '--verbose', description: 'Print more information for debugging', type: 'boolean' }
	]
} as const)

const Indent = '   '

export default async function (ctx: TerminalContext<typeof config>) {
	const { model, all, verbose: _verbose } = ctx.options

	try {
		const { Flashcore } = await import('robo.js/flashcore')

		if (!Flashcore.$.isInitialized) {
			ctx.write('\n')
			ctx.write(Indent + 'Flashcore is not initialized.\n')
			ctx.write(Indent + 'Run your Robo to initialize Flashcore first.\n')
			ctx.write('\n')
			return
		}

		ctx.write('\n')
		ctx.write(Indent + color.bold('Rebuild Indexes') + '\n')
		ctx.write(Indent + '='.repeat(18) + '\n')
		ctx.write('\n')

		// Get models to rebuild
		const models = Flashcore.$.getRegisteredModels()

		if (models.size === 0) {
			ctx.write(Indent + color.dim('No models registered.') + '\n')
			ctx.write('\n')
			return
		}

		const modelsToRebuild = model
			? Array.from(models.values()).filter((m: any) => m.name === model)
			: Array.from(models.values())

		if (modelsToRebuild.length === 0 && model) {
			ctx.write(Indent + `Model '${model}' not found.\n`)
			ctx.write('\n')
			return
		}

		let totalRebuilt = 0
		const startTime = Date.now()

		for (const m of modelsToRebuild as any[]) {
			ctx.write(Indent + color.cyan(`Model: ${m.name}`) + '\n')

			// Rebuild indexes
			try {
				if (m.rebuildIndexes) {
					await m.rebuildIndexes()
					ctx.write(Indent + `  ${color.green('✓')} Indexes rebuilt\n`)
					totalRebuilt++
				} else {
					ctx.write(Indent + `  ${color.dim('○')} No indexes to rebuild\n`)
				}
			} catch (e) {
				ctx.write(Indent + `  ${color.red('✗')} Failed: ${e}\n`)
			}

			// Also rebuild filter and unique if --all
			if (all) {
				try {
					if (m.rebuildFilter) {
						await m.rebuildFilter()
						ctx.write(Indent + `  ${color.green('✓')} Filter rebuilt\n`)
						totalRebuilt++
					}
				} catch (e) {
					ctx.write(Indent + `  ${color.red('✗')} Filter failed: ${e}\n`)
				}

				try {
					if (m.rebuildUniqueIndex) {
						await m.rebuildUniqueIndex()
						ctx.write(Indent + `  ${color.green('✓')} Unique index rebuilt\n`)
						totalRebuilt++
					}
				} catch (e) {
					ctx.write(Indent + `  ${color.red('✗')} Unique index failed: ${e}\n`)
				}
			}

			ctx.write('\n')
		}

		const duration = Date.now() - startTime

		// Summary
		ctx.write(Indent + color.bold('Summary') + '\n')
		ctx.write(Indent + `Models processed: ${modelsToRebuild.length}\n`)
		ctx.write(Indent + `Structures rebuilt: ${totalRebuilt}\n`)
		ctx.write(Indent + `Duration: ${duration}ms\n`)
		ctx.write('\n')
	} catch (error) {
		ctx.write(Indent + `Rebuild failed: ${error}\n`)
	}
}

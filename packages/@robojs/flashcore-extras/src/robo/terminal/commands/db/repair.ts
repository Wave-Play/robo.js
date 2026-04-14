/**
 * /db repair - Repair Flashcore data structures
 */
import { color, createTerminalCommandConfig } from 'robo.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'Repair Flashcore data structures',
	options: [
		{ alias: '-m', name: '--model', description: 'Repair a specific model', type: 'string' },
		{ alias: '-r', name: '--rebuild', description: 'Rebuild specific structures (filter,indexes,unique,all)', type: 'string' },
		{ alias: '-d', name: '--dry-run', description: 'Show what would be repaired without making changes', type: 'boolean' },
		{ alias: '-v', name: '--verbose', description: 'Print more information for debugging', type: 'boolean' }
	]
} as const)

const Indent = '   '

export default async function (ctx: TerminalContext<typeof config>) {
	const { model, rebuild, 'dry-run': dryRun, verbose: _verbose } = ctx.options

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
		ctx.write(Indent + color.bold('Flashcore Repair') + '\n')
		if (dryRun) {
			ctx.write(Indent + color.cyan('[DRY RUN]') + '\n')
		}
		ctx.write(Indent + '='.repeat(20) + '\n')
		ctx.write('\n')

		// Get models to repair
		const models = Flashcore.$.getRegisteredModels()

		if (models.size === 0) {
			ctx.write(Indent + color.dim('No models registered.') + '\n')
			ctx.write('\n')
			return
		}

		const modelsToRepair = model
			? Array.from(models.values()).filter((m: any) => m.name === model)
			: Array.from(models.values())

		if (modelsToRepair.length === 0 && model) {
			ctx.write(Indent + `Model '${model}' not found.\n`)
			ctx.write('\n')
			return
		}

		// Parse rebuild options
		const rebuildOptions = rebuild?.split(',').map((s) => s.trim().toLowerCase()) ?? []
		const rebuildAll = rebuildOptions.includes('all')
		const rebuildFilter = rebuildAll || rebuildOptions.includes('filter')
		const rebuildIndexes = rebuildAll || rebuildOptions.includes('indexes')
		const rebuildUnique = rebuildAll || rebuildOptions.includes('unique')

		// If no specific rebuild requested, default to filter + indexes
		const defaultRebuild = rebuildOptions.length === 0 || (!rebuildFilter && !rebuildIndexes && !rebuildUnique)
		const shouldRebuildFilter = rebuildFilter || defaultRebuild
		const shouldRebuildIndexes = rebuildIndexes || defaultRebuild
		const shouldRebuildUnique = rebuildUnique

		let totalRepairs = 0

		// Try to import RepairEngine if available
		let RepairEngine: any
		try {
			const repairModule = await import('../../../../integrity/repair.js')
			RepairEngine = repairModule.RepairEngine
		} catch {
			// RepairEngine not available, using basic repair
		}

		for (const m of modelsToRepair as any[]) {
			ctx.write(Indent + color.cyan(`Repairing model: ${m.name}`) + '\n')

			let repairs = 0

			// Rebuild filter
			if (shouldRebuildFilter) {
				if (dryRun) {
					ctx.write(Indent + `  ${color.dim('→')} Would rebuild filter\n`)
				} else {
					try {
						if (m.rebuildFilter) {
							await m.rebuildFilter()
							ctx.write(Indent + `  ${color.green('✓')} Rebuilt filter\n`)
							repairs++
						} else {
							ctx.write(Indent + `  ${color.dim('○')} No filter to rebuild\n`)
						}
					} catch (e) {
						ctx.write(Indent + `  ${color.red('✗')} Failed to rebuild filter: ${e}\n`)
					}
				}
			}

			// Rebuild indexes
			if (shouldRebuildIndexes) {
				if (dryRun) {
					ctx.write(Indent + `  ${color.dim('→')} Would rebuild indexes\n`)
				} else {
					try {
						if (m.rebuildIndexes) {
							await m.rebuildIndexes()
							ctx.write(Indent + `  ${color.green('✓')} Rebuilt indexes\n`)
							repairs++
						} else {
							ctx.write(Indent + `  ${color.dim('○')} No indexes to rebuild\n`)
						}
					} catch (e) {
						ctx.write(Indent + `  ${color.red('✗')} Failed to rebuild indexes: ${e}\n`)
					}
				}
			}

			// Rebuild unique index
			if (shouldRebuildUnique) {
				if (dryRun) {
					ctx.write(Indent + `  ${color.dim('→')} Would rebuild unique index\n`)
				} else {
					try {
						if (m.rebuildUniqueIndex) {
							await m.rebuildUniqueIndex()
							ctx.write(Indent + `  ${color.green('✓')} Rebuilt unique index\n`)
							repairs++
						} else {
							ctx.write(Indent + `  ${color.dim('○')} No unique index to rebuild\n`)
						}
					} catch (e) {
						ctx.write(Indent + `  ${color.red('✗')} Failed to rebuild unique index: ${e}\n`)
					}
				}
			}

			// Use RepairEngine for more comprehensive repairs
			if (RepairEngine && !dryRun) {
				try {
					const engine = new RepairEngine(m)
					const report = await engine.repair({
						filter: shouldRebuildFilter,
						indexes: shouldRebuildIndexes,
						uniqueIndexes: shouldRebuildUnique
					})

					if (report.repairs > 0) {
						ctx.write(Indent + `  ${color.green('✓')} RepairEngine: ${report.repairs} repair(s)\n`)
						repairs += report.repairs
					}
				} catch {
					// RepairEngine failed
				}
			}

			totalRepairs += repairs

			if (repairs > 0 || dryRun) {
				ctx.write('\n')
			}
		}

		// Summary
		ctx.write(Indent + color.bold('Summary') + '\n')
		ctx.write(Indent + `Models processed: ${modelsToRepair.length}\n`)

		if (dryRun) {
			ctx.write(Indent + color.dim('No changes made (dry run).') + '\n')
		} else if (totalRepairs === 0) {
			ctx.write(Indent + color.dim('No repairs needed.') + '\n')
		} else {
			ctx.write(Indent + color.green(`${totalRepairs} repair(s) completed.`) + '\n')
		}

		ctx.write('\n')
	} catch (error) {
		ctx.write(Indent + `Repair failed: ${error}\n`)
	}
}

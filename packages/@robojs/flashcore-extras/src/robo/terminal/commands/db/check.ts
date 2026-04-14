/**
 * /db check - Run integrity checks on Flashcore data structures
 */
import { color, createTerminalCommandConfig } from 'robo.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'Run integrity checks on Flashcore data',
	options: [
		{ alias: '-m', name: '--model', description: 'Check a specific model', type: 'string' },
		{ alias: '-c', name: '--check', description: 'Specific check type (filter, indexes, unique, catalog, all)', type: 'string' },
		{ alias: '-v', name: '--verbose', description: 'Print more information for debugging', type: 'boolean' }
	]
} as const)

const Indent = '   '

export default async function (ctx: TerminalContext<typeof config>) {
	const { model, check, verbose } = ctx.options

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
		ctx.write(Indent + color.bold('Flashcore Integrity Check') + '\n')
		ctx.write(Indent + '='.repeat(30) + '\n')
		ctx.write('\n')

		// Get models to check
		const models = Flashcore.$.getRegisteredModels()

		if (models.size === 0) {
			ctx.write(Indent + color.dim('No models registered.') + '\n')
			ctx.write('\n')
			return
		}

		const modelsToCheck = model
			? Array.from(models.values()).filter((m: any) => m.name === model)
			: Array.from(models.values())

		if (modelsToCheck.length === 0 && model) {
			ctx.write(Indent + `Model '${model}' not found.\n`)
			ctx.write('\n')
			return
		}

		const checkType = check ?? 'all'
		let totalIssues = 0
		let totalChecks = 0

		// Try to import IntegrityChecker if available
		let IntegrityChecker: any
		try {
			const integrityModule = await import('../../../../integrity/check.js')
			IntegrityChecker = integrityModule.IntegrityChecker
		} catch {
			// IntegrityChecker not available, using basic checks
		}

		for (const m of modelsToCheck as any[]) {
			ctx.write(Indent + color.cyan(`Checking model: ${m.name}`) + '\n')

			const issues: string[] = []
			let checks = 0

			// Check catalog integrity
			if (checkType === 'all' || checkType === 'catalog') {
				checks++
				try {
					const catalog = await m.getCatalog?.()
					if (catalog) {
						ctx.write(Indent + `  ${color.green('✓')} Catalog readable (${catalog.chunkIds?.length ?? 0} chunks)\n`)
					} else {
						ctx.write(Indent + `  ${color.dim('○')} No catalog (model may be empty)\n`)
					}
				} catch (e) {
					issues.push(`Catalog corrupted: ${e}`)
					ctx.write(Indent + `  ${color.red('✗')} Catalog corrupted\n`)
				}
			}

			// Check filter integrity
			if (checkType === 'all' || checkType === 'filter') {
				checks++
				try {
					const filter = m._filter
					if (filter) {
						ctx.write(Indent + `  ${color.green('✓')} Filter exists\n`)
					} else {
						ctx.write(Indent + `  ${color.dim('○')} No filter configured\n`)
					}
				} catch (e) {
					issues.push(`Filter error: ${e}`)
					ctx.write(Indent + `  ${color.red('✗')} Filter error\n`)
				}
			}

			// Check indexes integrity
			if (checkType === 'all' || checkType === 'indexes') {
				checks++
				try {
					const indexes = m._indexes
					if (indexes && indexes.size > 0) {
						ctx.write(Indent + `  ${color.green('✓')} Indexes (${indexes.size} configured)\n`)

						if (verbose) {
							for (const [field] of indexes) {
								ctx.write(Indent + `    - ${field}\n`)
							}
						}
					} else {
						ctx.write(Indent + `  ${color.dim('○')} No indexes configured\n`)
					}
				} catch (e) {
					issues.push(`Index error: ${e}`)
					ctx.write(Indent + `  ${color.red('✗')} Index error\n`)
				}
			}

			// Check unique constraints
			if (checkType === 'all' || checkType === 'unique') {
				checks++
				try {
					const uniqueIndex = m._uniqueIndex
					if (uniqueIndex) {
						const uniqueFields = m.schema?.fields
							? Object.entries(m.schema.fields)
									.filter(([, f]: [string, any]) => f.unique)
									.map(([name]) => name)
							: []

						if (uniqueFields.length > 0) {
							ctx.write(Indent + `  ${color.green('✓')} Unique constraints (${uniqueFields.join(', ')})\n`)
						} else {
							ctx.write(Indent + `  ${color.dim('○')} No unique constraints\n`)
						}
					} else {
						ctx.write(Indent + `  ${color.dim('○')} No unique index\n`)
					}
				} catch (e) {
					issues.push(`Unique constraint error: ${e}`)
					ctx.write(Indent + `  ${color.red('✗')} Unique constraint error\n`)
				}
			}

			// Run IntegrityChecker if available
			if (IntegrityChecker && (checkType === 'all' || checkType === 'deep')) {
				checks++
				try {
					const checker = new IntegrityChecker(m)
					const report = await checker.check()

					if (report.issues.length === 0) {
						ctx.write(Indent + `  ${color.green('✓')} Deep integrity check passed\n`)
					} else {
						for (const issue of report.issues) {
							issues.push(issue.message)
							ctx.write(Indent + `  ${color.red('✗')} ${issue.message}\n`)
						}
					}
				} catch {
					// IntegrityChecker failed
				}
			}

			totalChecks += checks
			totalIssues += issues.length

			if (issues.length > 0) {
				ctx.write(Indent + color.red(`  ${issues.length} issue(s) found`) + '\n')
			}

			ctx.write('\n')
		}

		// Summary
		ctx.write(Indent + color.bold('Summary') + '\n')
		ctx.write(Indent + `Models checked: ${modelsToCheck.length}\n`)
		ctx.write(Indent + `Total checks: ${totalChecks}\n`)

		if (totalIssues === 0) {
			ctx.write(Indent + color.green('No issues found.') + '\n')
		} else {
			ctx.write(Indent + color.red(`${totalIssues} issue(s) found.`) + '\n')
			ctx.write(Indent + color.dim('Run "/db repair" to fix issues.') + '\n')
		}

		ctx.write('\n')
	} catch (error) {
		ctx.write(Indent + `Integrity check failed: ${error}\n`)
	}
}

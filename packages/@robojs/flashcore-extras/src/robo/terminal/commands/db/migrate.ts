/**
 * /db migrate - Run pending database migrations
 */
import { color, createTerminalCommandConfig } from 'robo.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'Run pending database migrations',
	options: [
		{ alias: '-d', name: '--dry-run', description: 'Show what would be migrated without applying', type: 'boolean' },
		{ alias: '-f', name: '--force-unlock', description: 'Force release a stuck migration lock', type: 'boolean' },
		{ alias: '-t', name: '--target', description: 'Run migrations up to (and including) this target', type: 'string' },
		{ alias: '-r', name: '--rollback', description: 'Roll back a specific migration by name', type: 'string' },
		{ alias: '-v', name: '--verbose', description: 'Print more information for debugging', type: 'boolean' }
	]
} as const)

const Indent = '   '

export default async function (ctx: TerminalContext<typeof config>) {
	const { 'dry-run': dryRun, 'force-unlock': forceUnlock, target, rollback, verbose } = ctx.options

	try {
		const { Flashcore } = await import('robo.js/flashcore')

		if (!Flashcore.$.isInitialized) {
			ctx.write('\n')
			ctx.write(Indent + 'Flashcore is not initialized.\n')
			ctx.write(Indent + 'Run your Robo to initialize Flashcore first.\n')
			ctx.write('\n')
			return
		}

		const runner = await Flashcore.$.createMigrationRunner()
		if (!runner) {
			ctx.write('\n')
			ctx.write(Indent + 'Failed to create migration runner.\n')
			ctx.write('\n')
			return
		}

		ctx.write('\n')

		// Handle force unlock
		if (forceUnlock) {
			ctx.write(Indent + color.yellow('Force releasing migration lock...') + '\n')
			await runner.forceUnlock()
			ctx.write(Indent + color.green('Lock released.') + '\n')
			ctx.write('\n')

			// If only force-unlock was requested, exit
			if (!dryRun && !target && !rollback) {
				return
			}
		}

		// Handle rollback
		if (rollback) {
			ctx.write(Indent + color.bold(`Rolling back migration: ${rollback}`) + '\n')
			ctx.write('\n')

			const result = await runner.rollback(rollback)

			if (result.status === 'success') {
				ctx.write(Indent + color.green(`Rollback successful (${result.durationMs}ms)`) + '\n')
			} else {
				ctx.write(Indent + color.red(`Rollback failed: ${result.error}`) + '\n')
			}

			ctx.write('\n')
			return
		}

		// Get current status
		const status = await runner.getStatus()

		if (status.lockStatus.locked && !forceUnlock) {
			ctx.write(Indent + color.red('Migration lock is held.') + '\n')
			if (status.lockStatus.holder) {
				ctx.write(Indent + `Holder: ${status.lockStatus.holder}\n`)
			}
			if (status.lockStatus.stale) {
				ctx.write(Indent + color.yellow('Lock appears stale. Use --force-unlock to override.') + '\n')
			} else {
				ctx.write(Indent + 'Another migration may be in progress.\n')
			}
			ctx.write('\n')
			return
		}

		if (status.pending.length === 0) {
			ctx.write(Indent + color.green('No pending migrations.') + '\n')
			ctx.write('\n')
			return
		}

		// Show pending migrations
		ctx.write(Indent + color.bold(`${status.pending.length} pending migration(s):`) + '\n')
		for (const migrationName of status.pending) {
			ctx.write(Indent + `  - ${migrationName}\n`)
		}
		ctx.write('\n')

		// Dry run mode
		if (dryRun) {
			ctx.write(Indent + color.cyan('[DRY RUN] The following migrations would be applied:') + '\n')
			for (const migrationName of status.pending) {
				if (target && migrationName > target) break
				ctx.write(Indent + `  ${color.green('→')} ${migrationName}\n`)
			}
			ctx.write('\n')
			ctx.write(Indent + color.dim('No changes were made. Remove --dry-run to apply migrations.') + '\n')
			ctx.write('\n')
			return
		}

		// Run migrations
		ctx.write(Indent + color.bold('Running migrations...') + '\n')
		ctx.write('\n')

		const results = await runner.runPending({
			dryRun: false,
			forceUnlock: forceUnlock,
			target: target
		})

		// Show results
		let successCount = 0
		let failCount = 0

		for (const result of results) {
			if (result.status === 'success') {
				ctx.write(Indent + `${color.green('✓')} ${result.name} (${result.durationMs}ms)\n`)
				successCount++
			} else if (result.status === 'skipped') {
				ctx.write(Indent + `${color.dim('○')} ${result.name} (skipped)\n`)
			} else {
				ctx.write(Indent + `${color.red('✗')} ${result.name}\n`)
				ctx.write(Indent + `  Error: ${result.error}\n`)
				if (result.rollbackAttempted) {
					ctx.write(Indent + `  ${color.yellow('Rollback attempted')}\n`)
				}
				failCount++
			}
		}

		ctx.write('\n')

		// Summary
		if (failCount === 0) {
			ctx.write(Indent + color.green(`All ${successCount} migration(s) completed successfully.`) + '\n')
		} else {
			ctx.write(Indent + color.red(`${failCount} migration(s) failed.`) + '\n')
			if (successCount > 0) {
				ctx.write(Indent + `${successCount} migration(s) succeeded before failure.\n`)
			}
			ctx.write(Indent + color.dim('Fix the issue and run migrations again.') + '\n')
		}

		ctx.write('\n')
	} catch (error) {
		if (error instanceof Error && error.message.includes('Another migration')) {
			ctx.write('\n')
			ctx.write(Indent + error.message + '\n')
			ctx.write('\n')
		} else {
			ctx.write(Indent + `Migration failed: ${error}\n`)
		}
	}
}

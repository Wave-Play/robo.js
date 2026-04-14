/**
 * /db status - Show schema checksums and pending changes
 */
import { color, createTerminalCommandConfig } from 'robo.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'Show schema checksums and pending changes',
	options: [
		{ alias: '-v', name: '--verbose', description: 'Print more information for debugging', type: 'boolean' }
	]
} as const)

const Indent = '   '

export default async function (ctx: TerminalContext<typeof config>) {
	try {
		const { Flashcore } = await import('robo.js/flashcore')

		if (!Flashcore.$.isInitialized) {
			ctx.write('\n')
			ctx.write(Indent + 'Flashcore has not been initialized.\n')
			ctx.write(Indent + 'Run your Robo to initialize Flashcore, then check status.\n')
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

		// Get registered models
		const models = Flashcore.$.getRegisteredModels()
		if (models.size === 0) {
			ctx.write('\n')
			ctx.write(Indent + 'No models registered.\n')
			ctx.write('\n')
			return
		}

		ctx.write('\n')
		ctx.write(Indent + color.bold('Flashcore Schema Status') + '\n')
		ctx.write(Indent + '========================\n')
		ctx.write('\n')

		// Show each model's status
		for (const [name, model] of models) {
			const metadata = await metadataManager.getModelMetadata(name)
			const currentChecksum = model.getSchemaChecksum()

			const icon = metadata ? '✓' : '○'
			const iconColor = metadata ? color.green : color.yellow
			const statusText = metadata ? 'tracked' : 'untracked'
			const statusColor = metadata ? color.green : color.yellow

			ctx.write(Indent + iconColor(color.bold(icon)) + ' ' + color.bold(name) + '\n')
			ctx.write(Indent + '  Status: ' + statusColor(statusText) + '\n')
			ctx.write(Indent + '  Checksum: ' + color.dim(currentChecksum || 'unknown') + '\n')

			if (metadata) {
				ctx.write(Indent + '  Stored: ' + color.dim(metadata.checksum) + '\n')
				ctx.write(Indent + '  Version: ' + color.dim(String(metadata.version)) + '\n')
				ctx.write(Indent + '  Migrated: ' + color.dim(metadata.migratedAt) + '\n')

				if (metadata.checksum !== currentChecksum) {
					ctx.write(Indent + '  ' + color.yellow('⚠ Schema has changed') + '\n')
				}
			}

			ctx.write('\n')
		}

		// Show pending migrations
		const migrationRunner = await Flashcore.$.createMigrationRunner()
		if (migrationRunner) {
			const report = await migrationRunner.getStatus()

			if (report.pending.length > 0) {
				ctx.write(Indent + color.bold('Pending Migrations') + '\n')
				ctx.write(Indent + '-------------------\n')
				for (const migrationName of report.pending) {
					ctx.write(Indent + '  ' + color.yellow('○') + ' ' + migrationName + '\n')
				}
				ctx.write('\n')
			}

			if (report.failed.length > 0) {
				ctx.write(Indent + color.bold('Failed Migrations') + '\n')
				ctx.write(Indent + '-----------------\n')
				for (const migrationName of report.failed) {
					ctx.write(Indent + '  ' + color.red('✗') + ' ' + migrationName + '\n')
				}
				ctx.write('\n')
			}

			if (report.lockStatus.locked) {
				const lockColorFn = report.lockStatus.stale ? color.yellow : color.red
				ctx.write(Indent + lockColorFn('Migration lock active') + '\n')
				ctx.write(Indent + '  Holder: ' + color.dim(report.lockStatus.holder || 'unknown') + '\n')
				if (report.lockStatus.stale) {
					ctx.write(Indent + '  ' + color.yellow('Lock is stale - can be overridden') + '\n')
				}
				ctx.write('\n')
			}
		}
	} catch (error) {
		ctx.write(Indent + `Failed to get status: ${error}\n`)
	}
}

/**
 * /db legacy-migrate - Show status of lazy migration from legacy .robo/data storage.
 */
import { color, createTerminalCommandConfig, getConfig } from 'robo.js'
import type { TerminalContext } from 'robo.js'

interface RuntimeMigrationMetadata {
	version: 1
	mode: 'idle' | 'lazy-read-through'
	legacyDataDir: string
	fileBaseDir: string
	backupDir?: string
	backupCreatedAt?: string
	lastMigratedAt?: string
	legacyFallbackDisabled?: boolean
	totalLegacyKeys?: number
	migratedKeys?: number
}

export const config = createTerminalCommandConfig({
	description: 'Show status of legacy .robo/data migration into .robo/flashcore'
} as const)

const Indent = '   '

function renderProgressBar(current: number, total: number, width = 20): string {
	if (total <= 0) return `[${'░'.repeat(width)}] 0%`
	const ratio = Math.min(current / total, 1)
	const filled = Math.round(ratio * width)
	const empty = width - filled
	const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(empty)
	const pct = Math.round(ratio * 100)
	return `[${bar}] ${pct}%`
}

export default async function (ctx: TerminalContext<typeof config>) {
	try {
		const roboConfig = getConfig()
		if (roboConfig?.flashcore?.keyv) {
			ctx.write('\n')
			ctx.write(Indent + color.yellow('Legacy file migration is unavailable while Keyv storage is configured.') + '\n')
			ctx.write('\n')
			return
		}

		const { Flashcore } = await import('robo.js')
		await Flashcore.$init({
			namespaceSeparator: roboConfig?.flashcore?.namespaceSeparator
		})

		const metadata = await Flashcore.get<RuntimeMigrationMetadata>('_flashcore:migration:metadata')

		ctx.write('\n')
		if (!metadata) {
			ctx.write(Indent + color.yellow('No migration metadata found.') + '\n')
			ctx.write('\n')
			return
		}

		if (metadata.mode === 'idle') {
			const total = metadata.totalLegacyKeys
			const migrated = metadata.migratedKeys
			if (total != null && migrated != null && total > 0) {
				ctx.write(Indent + color.green(`Legacy migration complete: ${migrated} / ${total} keys migrated.`) + '\n')
			} else {
				ctx.write(Indent + color.green('No legacy .robo/data migration is required.') + '\n')
			}
			ctx.write('\n')
			return
		}

		ctx.write(Indent + color.green('Legacy migration active (lazy read-through).') + '\n')
		ctx.write(Indent + `Legacy store: ${color.cyan(metadata.legacyDataDir)}\n`)
		ctx.write(Indent + `Primary store: ${color.cyan(metadata.fileBaseDir)}\n`)
		if (metadata.backupDir) {
			ctx.write(Indent + `Backup: ${color.cyan(metadata.backupDir)}\n`)
		}
		if (metadata.backupCreatedAt) {
			ctx.write(Indent + `Backup created: ${metadata.backupCreatedAt}\n`)
		}
		if (metadata.lastMigratedAt) {
			ctx.write(Indent + `Last migrated key: ${metadata.lastMigratedAt}\n`)
		}

		ctx.write('\n')

		const total = metadata.totalLegacyKeys
		const migrated = metadata.migratedKeys
		if (total != null && migrated != null && total > 0) {
			ctx.write(Indent + `Progress: ${renderProgressBar(migrated, total)}\n`)
			ctx.write(Indent + `${migrated} / ${total} keys migrated\n`)
		} else {
			ctx.write(Indent + color.dim('Progress tracking unavailable (metadata predates this feature).') + '\n')
		}

		ctx.write('\n')
		ctx.write(Indent + color.dim('Legacy keys are migrated lazily on read because .robo/data filenames are one-way hashes.') + '\n')
		ctx.write(Indent + color.dim('The legacy directory is preserved until you delete it explicitly after validation.') + '\n')
		ctx.write('\n')
	} catch (error) {
		ctx.write('\n')
		ctx.write(Indent + color.red(`Legacy migration failed: ${error}`) + '\n')
		ctx.write('\n')
	}
}

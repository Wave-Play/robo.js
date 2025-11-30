/**
 * Route definition for Discord slash commands.
 * Directory inferred from filename: /src/commands/
 */
import type { RouteConfig, ScannedEntry, ProcessedEntry } from 'robo.js'
import type { CommandHandler, CommandController, CommandConfig } from '../../types/commands.js'
import { createCommandController } from '../../core/controllers.js'

/**
 * Handler type for data access (portal.discord.commands)
 */
export type Handler = CommandHandler

/**
 * Controller type for method access (portal.discord.command())
 */
export type Controller = CommandController

/**
 * Controller factory for runtime
 */
export { createCommandController as controller }

/**
 * Route configuration - how to scan and process files.
 */
export const config: RouteConfig = {
	key: {
		style: 'filepath',
		separator: ' ' // admin/ban.ts → "admin ban"
	},
	nesting: {
		maxDepth: 3, // Discord limit: command > group > subcommand
		allowIndex: false // Can't execute parent when subcommands exist
	},
	exports: {
		named: ['autocomplete'],
		default: 'required',
		config: 'optional'
	},
	description: 'Discord slash commands'
}

/**
 * Process each scanned command entry.
 */
export default function (entry: ScannedEntry): ProcessedEntry {
	const handlerConfig = entry.exports.config as CommandConfig | undefined

	// Determine command hierarchy
	const keyParts = entry.key.split(' ')
	const isSubcommand = keyParts.length > 1
	const parent = isSubcommand ? keyParts.slice(0, -1).join(' ') : undefined

	return {
		key: entry.key,
		path: entry.filePath.replace(/\.ts$/, '.js'),
		exports: {
			default: 'default' in entry.exports,
			config: 'config' in entry.exports,
			named: Object.keys(entry.exports).filter((k) => !['default', 'config'].includes(k))
		},
		metadata: {
			description: handlerConfig?.description ?? 'No description provided',
			options: handlerConfig?.options ?? [],
			defaultMemberPermissions: handlerConfig?.defaultMemberPermissions,
			dmPermission: handlerConfig?.dmPermission ?? true,
			contexts: handlerConfig?.contexts,
			integrationTypes: handlerConfig?.integrationTypes,
			nsfw: handlerConfig?.nsfw ?? false,
			sage: handlerConfig?.sage
		},
		extra: isSubcommand
			? {
					parent,
					type: keyParts.length === 2 ? 'subcommand' : 'subcommand-group'
				}
			: undefined
	}
}

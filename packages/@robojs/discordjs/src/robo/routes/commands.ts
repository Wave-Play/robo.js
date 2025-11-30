/**
 * Route definition for Discord slash commands.
 * Directory inferred from filename: /src/commands/
 */
import type { PortalAPI, RouteConfig, ScannedEntry, ProcessedEntry } from 'robo.js'
import type { ChatInputCommandInteraction } from 'discord.js'
import type { CommandHandler, CommandController, CommandConfig, CommandsNamespaceController } from '../../types/commands.js'
import { createCommandController } from '../../core/controllers.js'
import { executeCommandHandler } from '../../core/handlers/command.js'

/**
 * Handler type for data access (portal.discord.commands)
 */
export type Handler = CommandHandler

/**
 * Controller type for method access (portal.discord.command())
 */
export type Controller = CommandController

/**
 * Controller factory for runtime (per-handler)
 */
export { createCommandController as controller }

/**
 * Namespace controller factory for portal access.
 * Provides get, list, execute methods for all commands.
 */
export const NamespaceController = (portal: PortalAPI): CommandsNamespaceController => ({
	async get(name: string): Promise<CommandHandler | null> {
		try {
			const handler = await portal.getHandler<CommandHandler>('discord', 'commands', name)
			return handler?.default ?? null
		} catch {
			return null
		}
	},

	list(): string[] {
		const portalApi = portal as unknown as { getByType: (type: string) => Record<string, unknown> }
		const commandsData = portalApi.getByType('discord:commands')
		return Object.keys(commandsData)
	},

	async execute(name: string, interaction: ChatInputCommandInteraction): Promise<void> {
		await executeCommandHandler(interaction, name)
	}
})

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

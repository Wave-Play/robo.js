/**
 * Route definition for Discord prefix commands.
 * Directory inferred from filename: /src/prefixCommands/
 */
import { Manifest } from 'robo.js'
import type { PortalAPI, RouteConfig, ScannedEntry, ProcessedEntry } from 'robo.js'
import type { Message } from 'discord.js'
import type {
	PrefixCommandHandler,
	PrefixCommandController,
	PrefixCommandConfig,
	PrefixCommandsNamespaceController
} from '../../types/prefix-commands.js'
import { createPrefixCommandController } from '../../core/controllers.js'
import { executePrefixCommandHandler } from '../../core/handlers/prefix-command.js'

/**
 * Handler type for data access (portal.discordjs.prefixCommands)
 */
export type Handler = PrefixCommandHandler

/**
 * Controller type for method access (portal.discordjs.prefixCommand())
 */
export type Controller = PrefixCommandController

/**
 * Controller factory for runtime (per-handler)
 */
export { createPrefixCommandController as controller }

/**
 * Namespace controller factory for portal access.
 * Provides get, list, execute methods for all prefix commands.
 */
export const NamespaceController = (portal: PortalAPI): PrefixCommandsNamespaceController => ({
	async get(name: string): Promise<PrefixCommandHandler | null> {
		try {
			const handler = await portal.getHandler<PrefixCommandHandler>('discordjs', 'prefixCommands', name)
			return handler?.default ?? null
		} catch {
			return null
		}
	},

	list(): string[] {
		return Manifest.routeSummariesSync('discordjs', 'prefixCommands').map((summary) => summary.key)
	},

	async execute(name: string, message: Message, args?: string[]): Promise<void> {
		await executePrefixCommandHandler(message, name, args?.join(' ') ?? '')
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
		maxDepth: 3,
		allowIndex: false
	},
	exports: {
		default: 'required',
		config: 'optional'
	},
	description: 'Discord prefix commands'
}

/**
 * Process each scanned prefix command entry.
 */
export default function (entry: ScannedEntry): ProcessedEntry {
	const handlerConfig = entry.exports.config as PrefixCommandConfig | undefined

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
			args: handlerConfig?.args ?? [],
			aliases: handlerConfig?.aliases ?? [],
			cooldown: handlerConfig?.cooldown,
			disabled: handlerConfig?.disabled ?? false,
			dmPermission: handlerConfig?.dmPermission ?? true,
			requiredPermissions: handlerConfig?.requiredPermissions,
			sage: handlerConfig?.sage,
			serverOnly: handlerConfig?.serverOnly
		}
	}
}

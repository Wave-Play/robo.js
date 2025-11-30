/**
 * Route definition for Discord context menu commands.
 * Directory inferred from filename: /src/context/
 */
import type { PortalAPI, RouteConfig, ScannedEntry, ProcessedEntry } from 'robo.js'
import type { ContextHandler, ContextController, ContextConfig, ContextNamespaceController } from '../../types/context.js'
import { createContextController } from '../../core/controllers.js'

/**
 * Handler type for data access (portal.discord.context)
 */
export type Handler = ContextHandler

/**
 * Controller type for method access (portal.discord.context())
 */
export type Controller = ContextController

/**
 * Controller factory for runtime (per-handler)
 */
export { createContextController as controller }

/**
 * Namespace controller factory for portal access.
 * Provides get, list methods for all context menus.
 */
export const NamespaceController = (portal: PortalAPI): ContextNamespaceController => ({
	async get(name: string): Promise<ContextHandler | null> {
		try {
			const handler = await portal.getHandler<ContextHandler>('discord', 'context', name)
			return handler?.default ?? null
		} catch {
			return null
		}
	},

	list(): string[] {
		const portalApi = portal as unknown as { getByType: (type: string) => Record<string, unknown> }
		const contextData = portalApi.getByType('discord:context')
		return Object.keys(contextData)
	}
})

/**
 * Route configuration - how to scan and process files.
 */
export const config: RouteConfig = {
	key: {
		style: 'filename' // context/user/Profile.ts → "Profile"
	},
	nesting: {
		maxDepth: 2, // context/{user|message}/Name.ts
		allowIndex: false
	},
	exports: {
		default: 'required',
		config: 'optional'
	},
	description: 'Discord context menu commands'
}

/**
 * Process each scanned context menu entry.
 */
export default function (entry: ScannedEntry): ProcessedEntry {
	const handlerConfig = entry.exports.config as ContextConfig | undefined

	// Determine context type from path
	const isUserContext = entry.filePath.includes('/user/')
	const isMessageContext = entry.filePath.includes('/message/')

	// Discord ApplicationCommandType values
	const contextType = isUserContext ? 2 : isMessageContext ? 3 : undefined

	return {
		key: entry.key,
		path: entry.filePath.replace(/\.ts$/, '.js'),
		exports: {
			default: 'default' in entry.exports,
			config: 'config' in entry.exports,
			named: []
		},
		metadata: {
			contextType,
			description: handlerConfig?.description,
			defaultMemberPermissions: handlerConfig?.defaultMemberPermissions,
			dmPermission: handlerConfig?.dmPermission ?? true,
			sage: handlerConfig?.sage
		}
	}
}

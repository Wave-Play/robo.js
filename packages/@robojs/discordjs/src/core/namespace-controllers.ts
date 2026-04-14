/**
 * Namespace Controller Factories for @robojs/discordjs
 *
 * These controllers provide list/get/execute methods for accessing all handlers
 * of a specific route type. They're different from per-handler controllers
 * which operate on individual handlers.
 */
import { Manifest, portal } from 'robo.js'
import { executeCommandHandler } from './handlers/command.js'
import { executeEventHandler } from './handlers/event.js'
import { executePrefixCommandHandler } from './handlers/prefix-command.js'
import type { ChatInputCommandInteraction, ClientEvents, Message } from 'discord.js'
import type {
	CommandHandler,
	CommandsNamespaceController,
	ContextHandler,
	ContextNamespaceController,
	EventHandler,
	EventsNamespaceController,
	MiddlewareChainEntry,
	MiddlewareHandler,
	MiddlewareNamespaceController,
	PrefixCommandHandler,
	PrefixCommandsNamespaceController
} from '../types/index.js'

/**
 * Create a namespace controller for commands.
 * Provides list/get/execute methods for all commands.
 */
export function createCommandsNamespaceController(): CommandsNamespaceController {
	return {
		async get(name: string): Promise<CommandHandler | null> {
			try {
				const handler = await portal.getHandler<CommandHandler>('discordjs', 'commands', name)
				return handler?.default ?? null
			} catch {
				return null
			}
		},

		list(): string[] {
			return Manifest.routeSummariesSync('discordjs', 'commands').map((summary) => summary.key)
		},

		async execute(name: string, interaction: ChatInputCommandInteraction): Promise<void> {
			await executeCommandHandler(interaction, name)
		}
	}
}

/**
 * Create a namespace controller for events.
 * Provides list/get/emit methods for all events.
 */
export function createEventsNamespaceController(): EventsNamespaceController {
	return {
		async get<K extends keyof ClientEvents = keyof ClientEvents>(name: K): Promise<EventHandler<K>[]> {
			await portal.ensureRoute('discordjs', 'events')
			const eventsData = portal.getByType('discordjs:events')
			const records = eventsData[name as string]

			if (!records) {
				return []
			}

			const recordArray = Array.isArray(records) ? records : [records]
			const handlers: EventHandler<K>[] = []

			for (const record of recordArray) {
				if (!record.handler) {
					await portal.importHandler('discordjs', 'events', name as string)
				}
				if (record.handler?.default) {
					handlers.push(record.handler.default as EventHandler<K>)
				}
			}

			return handlers
		},

		list(): string[] {
			return Manifest.routeSummariesSync('discordjs', 'events').map((summary) => summary.key)
		},

		async emit<K extends keyof ClientEvents>(name: K, ...args: ClientEvents[K]): Promise<void> {
			await executeEventHandler(name as string, ...args)
		}
	}
}

/**
 * Create a namespace controller for context menus.
 * Provides list/get methods for all context menus.
 */
export function createContextNamespaceController(): ContextNamespaceController {
	return {
		async get(name: string): Promise<ContextHandler | null> {
			try {
				const handler = await portal.getHandler<ContextHandler>('discordjs', 'context', name)
				return handler?.default ?? null
			} catch {
				return null
			}
		},

		list(): string[] {
			return Manifest.routeSummariesSync('discordjs', 'context').map((summary) => summary.key)
		}
	}
}

/**
 * Create a namespace controller for prefix commands.
 * Provides list/get/execute methods for all prefix commands.
 */
export function createPrefixCommandsNamespaceController(): PrefixCommandsNamespaceController {
	return {
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
	}
}

/**
 * Create a namespace controller for middleware.
 * Provides list/chain methods for all middleware.
 */
export function createMiddlewareNamespaceController(): MiddlewareNamespaceController {
	return {
		list(): string[] {
			return Manifest.routeSummariesSync('discordjs', 'middleware').map((summary) => summary.key)
		},

		async chain(): Promise<MiddlewareChainEntry[]> {
			await portal.ensureRoute('discordjs', 'middleware')
			const middlewareData = portal.getByType('discordjs:middleware')
			const entries: MiddlewareChainEntry[] = []

			for (const [key, recordOrArray] of Object.entries(middlewareData)) {
				const record = Array.isArray(recordOrArray) ? recordOrArray[0] : recordOrArray

				// Import handler if needed
				if (!record.handler) {
					await portal.importHandler('discordjs', 'middleware', key)
				}

				const isEnabled = record.enabled && record.metadata?.enabled !== false && record.metadata?.disabled !== true
				if (record.handler?.default && isEnabled) {
					entries.push({
						key,
						handler: record.handler.default as MiddlewareHandler,
						order: (record.metadata?.order as number) ?? 0,
						enabled: isEnabled
					})
				}
			}

			// Sort by order (lower runs first)
			return entries.sort((a, b) => a.order - b.order)
		}
	}
}

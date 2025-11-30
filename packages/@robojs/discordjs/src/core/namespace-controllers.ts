/**
 * Namespace Controller Factories for @robojs/discordjs
 *
 * These controllers provide list/get/execute methods for accessing all handlers
 * of a specific route type. They're different from per-handler controllers
 * which operate on individual handlers.
 */
import { portal } from 'robo.js'
import { executeCommandHandler } from './handlers/command.js'
import { executeEventHandler } from './handlers/event.js'
import type { ChatInputCommandInteraction, ClientEvents } from 'discord.js'
import type {
	CommandHandler,
	CommandsNamespaceController,
	ContextHandler,
	ContextNamespaceController,
	EventHandler,
	EventsNamespaceController,
	MiddlewareChainEntry,
	MiddlewareHandler,
	MiddlewareNamespaceController
} from '../types/index.js'

/**
 * Create a namespace controller for commands.
 * Provides list/get/execute methods for all commands.
 */
export function createCommandsNamespaceController(): CommandsNamespaceController {
	return {
		async get(name: string): Promise<CommandHandler | null> {
			try {
				const handler = await portal.getHandler<CommandHandler>('discord', 'commands', name)
				return handler?.default ?? null
			} catch {
				return null
			}
		},

		list(): string[] {
			const commandsData = portal.getByType('discord:commands')
			return Object.keys(commandsData)
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
			const eventsData = portal.getByType('discord:events')
			const records = eventsData[name as string]

			if (!records) {
				return []
			}

			const recordArray = Array.isArray(records) ? records : [records]
			const handlers: EventHandler<K>[] = []

			for (const record of recordArray) {
				if (!record.handler) {
					await portal.importHandler('discord', 'events', name as string)
				}
				if (record.handler?.default) {
					handlers.push(record.handler.default as EventHandler<K>)
				}
			}

			return handlers
		},

		list(): string[] {
			const eventsData = portal.getByType('discord:events')
			return Object.keys(eventsData)
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
				const handler = await portal.getHandler<ContextHandler>('discord', 'context', name)
				return handler?.default ?? null
			} catch {
				return null
			}
		},

		list(): string[] {
			const contextData = portal.getByType('discord:context')
			return Object.keys(contextData)
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
			const middlewareData = portal.getByType('discord:middleware')
			return Object.keys(middlewareData)
		},

		async chain(): Promise<MiddlewareChainEntry[]> {
			const middlewareData = portal.getByType('discord:middleware')
			const entries: MiddlewareChainEntry[] = []

			for (const [key, recordOrArray] of Object.entries(middlewareData)) {
				const record = Array.isArray(recordOrArray) ? recordOrArray[0] : recordOrArray

				// Import handler if needed
				if (!record.handler) {
					await portal.importHandler('discord', 'middleware', key)
				}

				if (record.handler?.default && record.enabled) {
					entries.push({
						key,
						handler: record.handler.default as MiddlewareHandler,
						order: (record.metadata?.order as number) ?? 0,
						enabled: record.enabled
					})
				}
			}

			// Sort by order (lower runs first)
			return entries.sort((a, b) => a.order - b.order)
		}
	}
}

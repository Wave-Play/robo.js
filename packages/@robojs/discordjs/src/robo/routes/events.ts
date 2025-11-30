/**
 * Route definition for Discord gateway events.
 * Directory inferred from filename: /src/events/
 */
import type { PortalAPI, RouteConfig, ScannedEntry, ProcessedEntry } from 'robo.js'
import type { ClientEvents } from 'discord.js'
import type { EventHandler, EventController, EventConfig, EventsNamespaceController } from '../../types/events.js'
import { createEventController } from '../../core/controllers.js'
import { executeEventHandler } from '../../core/handlers/event.js'

/**
 * Handler type for data access (portal.discord.events)
 */
export type Handler = EventHandler

/**
 * Controller type for method access (portal.discord.event())
 */
export type Controller = EventController

/**
 * Controller factory for runtime (per-handler)
 */
export { createEventController as controller }

/**
 * Namespace controller factory for portal access.
 * Provides get, list, emit methods for all events.
 */
export const NamespaceController = (portal: PortalAPI): EventsNamespaceController => ({
	async get<K extends keyof ClientEvents = keyof ClientEvents>(name: K): Promise<EventHandler<K>[]> {
		const portalApi = portal as unknown as { getByType: (type: string) => Record<string, unknown[]> }
		const eventsData = portalApi.getByType('discord:events')
		const records = eventsData[name as string]

		if (!records) {
			return []
		}

		const recordArray = Array.isArray(records) ? records : [records]
		const handlers: EventHandler<K>[] = []

		for (const record of recordArray) {
			const rec = record as { handler?: { default?: EventHandler<K> } }
			if (!rec.handler) {
				await portal.importHandler('discord', 'events', name as string)
			}
			if (rec.handler?.default) {
				handlers.push(rec.handler.default)
			}
		}

		return handlers
	},

	list(): string[] {
		const portalApi = portal as unknown as { getByType: (type: string) => Record<string, unknown> }
		const eventsData = portalApi.getByType('discord:events')
		return Object.keys(eventsData)
	},

	async emit<K extends keyof ClientEvents>(name: K, ...args: ClientEvents[K]): Promise<void> {
		await executeEventHandler(name as string, ...args)
	}
})

/**
 * Route configuration - how to scan and process files.
 */
export const config: RouteConfig = {
	key: {
		style: 'filename', // events/messageCreate.ts → "messageCreate"
		nested: 'camelCase' // events/guild/memberAdd.ts → "guildMemberAdd"
	},
	multiple: true, // Multiple handlers per event
	filter: /^(?!_)/, // Exclude lifecycle events (_start, _stop)
	exports: {
		default: 'required',
		config: 'optional'
	},
	description: 'Discord gateway events'
}

/**
 * Process each scanned event entry.
 */
export default function (entry: ScannedEntry): ProcessedEntry {
	const handlerConfig = entry.exports.config as EventConfig | undefined

	return {
		key: entry.key,
		path: entry.filePath.replace(/\.ts$/, '.js'),
		exports: {
			default: 'default' in entry.exports,
			config: 'config' in entry.exports,
			named: []
		},
		metadata: {
			frequency: handlerConfig?.frequency ?? 'always'
		}
	}
}

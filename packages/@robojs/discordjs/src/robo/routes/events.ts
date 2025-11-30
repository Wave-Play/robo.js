/**
 * Route definition for Discord gateway events.
 * Directory inferred from filename: /src/events/
 */
import type { RouteConfig, ScannedEntry, ProcessedEntry } from 'robo.js'
import type { EventHandler, EventController, EventConfig } from '../../types/events.js'
import { createEventController } from '../../core/controllers.js'

/**
 * Handler type for data access (portal.discord.events)
 */
export type Handler = EventHandler

/**
 * Controller type for method access (portal.discord.event())
 */
export type Controller = EventController

/**
 * Controller factory for runtime
 */
export { createEventController as controller }

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

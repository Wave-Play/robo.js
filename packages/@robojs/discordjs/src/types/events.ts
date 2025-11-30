/**
 * Discord event types for @robojs/discordjs
 */
import type { ClientEvents } from 'discord.js'
import type { BaseConfig } from './common.js'

/**
 * Event handler function type.
 * Accepts any Discord.js event arguments.
 */
export type EventHandler<K extends keyof ClientEvents = keyof ClientEvents> = (
	...args: ClientEvents[K]
) => unknown | Promise<unknown>

/**
 * Event module structure expected in handler files.
 */
export interface Event<K extends keyof ClientEvents = keyof ClientEvents> {
	config?: EventConfig
	default: EventHandler<K>
}

/**
 * Event configuration options.
 */
export interface EventConfig extends BaseConfig {
	/**
	 * Event frequency:
	 * - 'always': Handler runs on every event (default)
	 * - 'once': Handler runs only on first occurrence
	 */
	frequency?: 'always' | 'once'
	/**
	 * Execution priority (lower runs first).
	 * Default is 0.
	 */
	priority?: number
}

/**
 * Event entry in manifest.
 */
export type EventEntry = EventConfig

/**
 * Event controller for portal.discord.event()
 */
export interface EventController {
	/** Check if event handler is enabled */
	isEnabled(): boolean
	/** Enable or disable the event handler */
	setEnabled(value: boolean): void
	/** Restrict event handler to specific servers */
	setServerOnly(serverIds: string | string[]): void
	/** Check if event handler is enabled for a specific server */
	isEnabledForServer(serverId: string): boolean
}

/**
 * Discord.js event names.
 * Re-exported for convenience.
 */
export type DiscordEventName = keyof ClientEvents

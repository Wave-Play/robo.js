/**
 * Portal Type Augmentation for @robojs/discordjs
 *
 * This file provides TypeScript module augmentation to enhance IDE autocomplete
 * when accessing Discord handlers via the portal (e.g., portal.discord.commands).
 */
import type { HandlerRecord } from 'robo.js'
import type {
	CommandController,
	CommandHandler,
	CommandsNamespaceController
} from './commands.js'
import type {
	ContextController,
	ContextHandler,
	ContextNamespaceController
} from './context.js'
import type {
	EventController,
	EventHandler,
	EventsNamespaceController
} from './events.js'
import type {
	MiddlewareController,
	MiddlewareHandler,
	MiddlewareNamespaceController
} from './middleware.js'

/**
 * Discord namespace on the portal.
 * Provides typed access to all Discord handlers and controllers.
 */
export interface DiscordPortalNamespace {
	/** Access command data (Record of handler records) */
	commands: Record<string, HandlerRecord<CommandHandler>>
	/** Access event data (Record of handler record arrays) */
	events: Record<string, HandlerRecord<EventHandler>[]>
	/** Access context menu data (Record of handler records) */
	context: Record<string, HandlerRecord<ContextHandler>>
	/** Access middleware data (Record of handler records) */
	middleware: Record<string, HandlerRecord<MiddlewareHandler>>

	/** Get controller for a specific command */
	command(name: string): CommandController
	/** Get controller for a specific event */
	event(name: string): EventController
	/** Get controller for a specific context menu (singular accessor) */
	contextMenu(name: string): ContextController
	/** Get controller for a specific middleware */
	middlewareItem(name: string): MiddlewareController
}

/**
 * Augment the robo.js Portal type to include Discord namespace.
 * This enables IDE autocomplete for portal.discord.*
 */
declare module 'robo.js' {
	interface PortalNamespaces {
		discord: DiscordPortalNamespace
	}
}

/**
 * Re-export namespace controller types for convenience.
 */
export type {
	CommandsNamespaceController,
	ContextNamespaceController,
	EventsNamespaceController,
	MiddlewareNamespaceController
}

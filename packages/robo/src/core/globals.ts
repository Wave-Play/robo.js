import type {
	Api,
	Command,
	Config,
	Context,
	Event,
	FlashcoreAdapter,
	HandlerRecord,
	Middleware
} from '../types/index.js'
import type { Collection } from 'discord.js'
import type Keyv from 'keyv'

interface PortalEnabledState {
	modules: Record<string, boolean>;
	commands: Record<string, boolean>;
	events: Record<string, boolean>;
	middleware: Record<string, boolean>;
	contexts: Record<string, boolean>;
}

interface PortalValues {
	apis: Collection<string, HandlerRecord<Api>> | null;
	commands: Collection<string, HandlerRecord<Command>> | null;
	context: Collection<string, HandlerRecord<Context>> | null;
	events: Collection<string, HandlerRecord<Event>[]> | null;
	middleware: HandlerRecord<Middleware>[];
	moduleKeys: Set<string>;
	enabledState: PortalEnabledState;
	serverRestrictions: Record<string, string[]>;
}

const instanceId = Math.random().toString(36).slice(2)

export const Globals = {
	getConfig: () => {
		if (!globalThis.robo) {
			Globals.init()
		}

		return globalThis.robo.config
	},
	getFlashcoreAdapter: () => {
		if (!globalThis.robo) {
			Globals.init()
		}

		return globalThis.robo.flashcore._adapter
	},
	getPortalValues: (): PortalValues => {
		if (!globalThis.robo) {
			Globals.init()
		}


		const portalAny = globalThis.robo.portal as any;

		return {
			apis: portalAny.apis,
			commands: portalAny.commands,
			context: portalAny.context,
			events: portalAny.events,
			middleware: portalAny.middleware,
			moduleKeys: portalAny.moduleKeys,
			enabledState: portalAny.enabledState,
			serverRestrictions: portalAny.serverRestrictions
		}
	},
	init: () => {
		globalThis.robo = {
			config: null,
			flashcore: {
				_adapter: null
			},
			portal: {
				apis: null,
				commands: null,
				context: null,
				events: null,
				middleware: [],
				moduleKeys: new Set(),
				enabledState: {
					modules: {},
					commands: {},
					events: {},
					middleware: {},
					contexts: {}
				},
				serverRestrictions: {}
			} as any
		}
	},
	instanceId,
	registerConfig: (config: Config) => {
		if (!globalThis.robo) {
			Globals.init()
		}

		globalThis.robo.config = config
	},
	registerFlashcore: (adapter: FlashcoreAdapter | Keyv<unknown, unknown>) => {
		if (!globalThis.robo) {
			Globals.init()
		}

		globalThis.robo.flashcore._adapter = adapter
	},
	registerPortal: (
		apis: Collection<string, HandlerRecord<Api>>,
		commands: Collection<string, HandlerRecord<Command>>,
		context: Collection<string, HandlerRecord<Context>>,
		events: Collection<string, HandlerRecord<Event>[]>,
		middleware: HandlerRecord<Middleware>[]
	) => {
		if (!globalThis.robo) {
			Globals.init()
		}

		globalThis.robo.portal.apis = apis
		globalThis.robo.portal.commands = commands
		globalThis.robo.portal.context = context
		globalThis.robo.portal.events = events
		globalThis.robo.portal.middleware = middleware

		const portalAny = globalThis.robo.portal as any;

		if (!portalAny.enabledState) {
			portalAny.enabledState = {
				modules: {},
				commands: {},
				events: {},
				middleware: {},
				contexts: {}
			}
		}

		if (!portalAny.serverRestrictions) {
			portalAny.serverRestrictions = {}
		}

		// Generate module keys based off of entries then sort alphabetically
		const moduleKeys = new Set<string>()
		apis.forEach((api) => {
			if (api.module) {
				moduleKeys.add(api.module)
			}
		})
		commands.forEach((command) => {
			if (command.module) {
				moduleKeys.add(command.module)
			}
		})
		context.forEach((context) => {
			if (context.module) {
				moduleKeys.add(context.module)
			}
		})
		events.forEach((event) => {
			event.forEach((handler) => {
				if (handler.module) {
					moduleKeys.add(handler.module)
				}
			})
		})
		middleware.forEach((middleware) => {
			if (middleware.module) {
				moduleKeys.add(middleware.module)
			}
		})
		globalThis.robo.portal.moduleKeys = new Set([...moduleKeys].sort())
	}
}

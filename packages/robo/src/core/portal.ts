import { Compiler } from './../cli/utils/compiler.js'
import { Collection } from 'discord.js'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { hasProperties } from '../cli/utils/utils.js'
import { logger } from './logger.js'
import { color, composeColors, hex } from './color.js'
import { getConfig } from './config.js'
import { Globals } from './globals.js'
import type { Api, BaseConfig, Command, Context, Event, HandlerRecord, Middleware } from '../types/index.js'
import { portalUtils } from './portal-utils.js'
import type { ID } from './portal-utils.js'

export default class Portal {
	private _enabledModules: Record<string, boolean> = {}
	private _enabledCommands: Record<string, boolean> = {}
	private _enabledEvents: Record<string, boolean> = {}
	private _enabledMiddleware: Record<string, boolean> = {}
	private _enabledContexts: Record<string, boolean> = {}
	private _serverRestrictions: Record<string, string[]> = {}
	private _modules: Record<string, ReturnType<typeof createModuleController>> = {}
	private _keepRegistered: boolean = false

	constructor() {}

	get apis(): Collection<string, HandlerRecord<Api>> {
		return Globals.getPortalValues().apis
	}

	get commands(): Collection<string, HandlerRecord<Command>> {
		return Globals.getPortalValues().commands
	}

	get context(): Collection<string, HandlerRecord<Context>> {
		return Globals.getPortalValues().context
	}

	get events(): Collection<string, HandlerRecord<Event>[]> {
		return Globals.getPortalValues().events
	}

	get middleware(): HandlerRecord<Middleware>[] {
		return Globals.getPortalValues().middleware
	}

	get moduleKeys() {
		return Globals.getPortalValues().moduleKeys
	}
	
	get serverRestrictions() {
		return this._serverRestrictions
	}
	
	get enabledState() {
		return {
			modules: this._enabledModules,
			commands: this._enabledCommands,
			events: this._enabledEvents,
			middleware: this._enabledMiddleware,
			contexts: this._enabledContexts
		}
	}

	setKeepRegistered(keepRegistered: boolean): void {
		this._keepRegistered = keepRegistered;
	}

	get keepRegistered(): boolean {
		return this._keepRegistered;
	}
	
	/**
	 * Disables a module. This prevents all of its commands, contexts, events and middleware from being registered.
	 * @param {string | symbol} id The ID of the module to disable.
	 * @returns {void}
	 */
	disableModule(id: string | symbol): void {
		portalUtils.setEnabled(this._enabledModules, id.toString(), false);
	}

	/**
	 * Enables a module. This allows all of its commands, contexts, events and middleware to be registered.
	 * @param {string | symbol} id The ID of the module to enable.
	 * @returns {void}
	 */
	enableModule(id: string | symbol): void {
		portalUtils.setEnabled(this._enabledModules, id.toString(), true);
	}

	module(moduleName: string) {
		let moduleInstance = this._modules[moduleName]
		if (!moduleInstance) {
			moduleInstance = createModuleController(
				moduleName,
				this._enabledModules,
				this._enabledCommands,
				this._enabledEvents,
				this._enabledMiddleware,
				this._enabledContexts,
				this._serverRestrictions,
				() => this._keepRegistered
			)
			this._modules[moduleName] = moduleInstance
		}
		return moduleInstance
	}

	command(commandName: string) {
		return createCommandController(commandName, this._enabledCommands, this._serverRestrictions)
	}

	event(eventName: string) {
		return createEventController(eventName, this._enabledEvents, this._serverRestrictions)
	}

	middlewareController(middlewareName: string) {
		return createMiddlewareController(middlewareName, this._enabledMiddleware, this._serverRestrictions)
	}

	contextController(contextName: string) {
		return createContextController(contextName, this._enabledContexts, this._serverRestrictions)
	}

	isEnabledForServer(key: string, serverId: ID): boolean {
		// serverId is def real
		return portalUtils.isEnabledForServer(this._serverRestrictions, key, serverId);
	}

	/**
	 * Populates the Portal instance from the manifest file.
	 *
	 * Warning: Do not call this method directly. Use the `portal` export instead.
	 */
	public static async open() {
		const apis = await loadHandlerRecords<HandlerRecord<Api>>('api')
		const commands = await loadHandlerRecords<HandlerRecord<Command>>('commands')
		const context = await loadHandlerRecords<HandlerRecord<Context>>('context')
		const events = await loadHandlerRecords<HandlerRecord<Event>[]>('events')
		const middleware = [...(await loadHandlerRecords<HandlerRecord<Middleware>>('middleware')).values()]

		Globals.registerPortal(apis, commands, context, events, middleware)

		const config = getConfig()
		if (config?.portal?.keepRegistered) {
			if (globalThis.robo?.portal) {
				(globalThis.robo.portal as Portal).setKeepRegistered(true)
			}
		}
	}
}

/**
 * Creates a controller for managing a module's enabled state and server-only restrictions.
 *
 * The controller can query whether the module is enabled, enable or disable the module (optionally unregistering its handlers
 * when disabling unless `getKeepRegistered()` returns true), and restrict the module to specific server IDs.
 *
 * @param moduleName - The module identifier
 * @param enabledModules - Map of module enablement flags keyed by module name
 * @param enabledCommands - Map of command enablement flags keyed by command key
 * @param enabledEvents - Map of event handler enablement flags keyed by `eventName:index`
 * @param enabledMiddleware - Map of middleware enablement flags keyed by index string
 * @param enabledContexts - Map of context handler enablement flags keyed by context key
 * @param serverRestrictions - Map of server restriction arrays keyed by handler or module key
 * @param getKeepRegistered - Callback that returns whether handlers should be kept registered when a module is disabled
 * @returns An object with:
 *  - `isEnabled()` returning `true` if the module is enabled, `false` otherwise.
 *  - `setEnabled(value)` to enable or disable the module; disabling will unregister the module's commands, events, middleware,
 *    and contexts unless `getKeepRegistered()` is `true`; enabling will re-enable handlers belonging to the module.
 *  - `setServerOnly(serverIds)` to set and apply server-only restrictions for the module.
 */
function createModuleController(
	moduleName: string,
	enabledModules: Record<string, boolean>,
	enabledCommands: Record<string, boolean>,
	enabledEvents: Record<string, boolean>,
	enabledMiddleware: Record<string, boolean>,
	enabledContexts: Record<string, boolean>,
	serverRestrictions: Record<string, string[]>,
	getKeepRegistered: () => boolean
) {
	return {
		isEnabled: () => portalUtils.isEnabled(enabledModules, moduleName),

		setEnabled: (value: boolean) => {
			portalUtils.setEnabled(enabledModules, moduleName, value);

			if (!value && !getKeepRegistered()) {
				portalUtils.unregisterModuleCommands(enabledCommands, moduleName);
				portalUtils.unregisterModuleEvents(enabledEvents, moduleName);
				portalUtils.unregisterModuleMiddleware(enabledMiddleware, moduleName);
				portalUtils.unregisterModuleContexts(enabledContexts, moduleName);
			} else if (value) {
				const commands = Globals.getPortalValues().commands
				if (commands) {
					commands.forEach((command: HandlerRecord<Command>, key: string) => {
						if (command.module === moduleName) {
							enabledCommands[key] = true
						}
					})
				}

				const events = Globals.getPortalValues().events
				if (events) {
					events.forEach((eventHandlers: HandlerRecord<Event>[], eventName: string) => {
						eventHandlers.forEach((handler: HandlerRecord<Event>, index: number) => {
							if (handler.module === moduleName) {
								const key = `${eventName}:${index}`
								enabledEvents[key] = true
							}
						})
					})
				}

				const middleware = Globals.getPortalValues().middleware
				if (middleware) {
					middleware.forEach((mw: HandlerRecord<Middleware>, index: number) => {
						if (mw.module === moduleName) {
							enabledMiddleware[index.toString()] = true
						}
					})
				}

				const contexts = Globals.getPortalValues().context
				if (contexts) {
					contexts.forEach((context: HandlerRecord<Context>, key: string) => {
						if (context.module === moduleName) {
							enabledContexts[key] = true
						}
					})
				}
			}
		},

		setServerOnly: (serverIds: string[] | string) => {
			portalUtils.setServerOnly(serverRestrictions, moduleName, serverIds)
			portalUtils.applyModuleServerRestrictions(serverRestrictions, moduleName)
		}
	}
}

/**
 * Create a controller for toggling a command's enabled state and configuring its server restrictions.
 *
 * @param commandName - The command identifier (key) the controller manages
 * @param enabledCommands - Map of command keys to enabled (`true`) or disabled (`false`) states
 * @param serverRestrictions - Map of handler keys to arrays of server IDs where the handler is allowed
 * @returns An object with:
 *  - `isEnabled()` — returns `true` if the command is enabled, `false` otherwise
 *  - `setEnabled(value)` — sets the command's enabled state
 *  - `setServerOnly(serverIds)` — restricts the command to the given server ID(s)
 */
function createCommandController(
	commandName: string,
	enabledCommands: Record<string, boolean>,
	serverRestrictions: Record<string, string[]>
) {
	return {
		isEnabled: () => portalUtils.isEnabled(enabledCommands, commandName),
		setEnabled: (value: boolean) => portalUtils.setEnabled(enabledCommands, commandName, value),
		setServerOnly: (serverIds: string[] | string) => portalUtils.setServerOnly(serverRestrictions, commandName, serverIds)
	}
}

/**
 * Creates a controller for managing an event's enabled state and server restrictions.
 *
 * @param eventKey - The unique key identifying the event
 * @param enabledEvents - Map of event keys to their enabled boolean flags
 * @param serverRestrictions - Map of keys to arrays of server IDs used for per-server restrictions
 * @returns An object with methods to query and modify the event's state:
 *  - `isEnabled()` — `true` if the event is enabled, `false` otherwise.
 *  - `setEnabled(value)` — set the event's enabled flag to `value`.
 *  - `setServerOnly(serverIds)` — restrict the event to the provided server ID or list of server IDs.
 */
function createEventController(
	eventKey: string,
	enabledEvents: Record<string, boolean>,
	serverRestrictions: Record<string, string[]>
) {
	return {
		isEnabled: () => portalUtils.isEnabled(enabledEvents, eventKey),
		setEnabled: (value: boolean) => portalUtils.setEnabled(enabledEvents, eventKey, value),
		setServerOnly: (serverIds: string[] | string) => portalUtils.setServerOnly(serverRestrictions, eventKey, serverIds)
	}
}

/**
 * Create a controller for a middleware entry to query and modify its enabled state and server restrictions.
 *
 * @param middlewareName - The unique name/key of the middleware
 * @param enabledMiddleware - Map tracking enabled/disabled state for middleware by name
 * @param serverRestrictions - Map tracking server ID arrays where handlers are allowed by key
 * @returns An object with methods:
 *  - `isEnabled`: returns `true` if the middleware is enabled, `false` otherwise.
 *  - `setEnabled`: sets the middleware enabled state.
 *  - `setServerOnly`: restricts the middleware to the provided server ID or IDs.
 */
function createMiddlewareController(
	middlewareName: string,
	enabledMiddleware: Record<string, boolean>,
	serverRestrictions: Record<string, string[]>
) {
	return {
		isEnabled: () => portalUtils.isEnabled(enabledMiddleware, middlewareName),
		setEnabled: (value: boolean) => portalUtils.setEnabled(enabledMiddleware, middlewareName, value),
		setServerOnly: (serverIds: string[] | string) => portalUtils.setServerOnly(serverRestrictions, middlewareName, serverIds)
	}
}

/**
 * Create a controller to manage enablement and server restrictions for a context handler.
 *
 * @param contextName - The context handler's identifier
 * @param enabledContexts - Map of context identifiers to their enabled state
 * @param serverRestrictions - Map of context identifiers to arrays of allowed server IDs
 * @returns An object with:
 *  - `isEnabled()` — `true` if the context is enabled, `false` otherwise.
 *  - `setEnabled(value)` — set the context's enabled state to `value`.
 *  - `setServerOnly(serverIds)` — restrict the context to the provided server ID or IDs.
 */
function createContextController(
	contextName: string,
	enabledContexts: Record<string, boolean>,
	serverRestrictions: Record<string, string[]>
) {
	return {
		isEnabled: () => portalUtils.isEnabled(enabledContexts, contextName),
		setEnabled: (value: boolean) => portalUtils.setEnabled(enabledContexts, contextName, value),
		setServerOnly: (serverIds: string[] | string) => portalUtils.setServerOnly(serverRestrictions, contextName, serverIds)
	}
}

/**
 * Gets the config options for a specific plugin package.
 *
 * @param packageName The name of the package to get the options for.
 * @returns The options for the package, or null if the package is not installed nor configured.
 */
export function getPluginOptions(packageName: string): unknown | null {
	const config = getConfig()
	const pluginOptions = config?.plugins?.find((plugin) => {
		return (typeof plugin === 'string' ? plugin : plugin[0]) === packageName
	})
	const options = typeof pluginOptions === 'string' ? null : pluginOptions?.[1]

	return options ?? null
}

interface ScanOptions<T> {
	manifestEntries: Record<string, T | T[]> | T[]
	parentEntry?: T
	recursionKeys?: string[]
	type: string
}
type ScanPredicate = <T>(entry: T, entryKeys: string[]) => Promise<void>

async function scanEntries<T>(predicate: ScanPredicate, options: ScanOptions<T>) {
	const { manifestEntries, parentEntry = {}, recursionKeys = [], type } = options
	const promises: Promise<unknown>[] = []

	for (const entryName in manifestEntries) {
		const entryItem =
			Array.isArray(manifestEntries) && type !== 'middleware'
				? (manifestEntries as T[])
				: (manifestEntries as Record<string, T | T[]>)[entryName]
		const entries = Array.isArray(entryItem) ? entryItem : [entryItem]

		entries.forEach((entry) => {
			const entryKeys = [...recursionKeys, entryName]
			const mergedEntry = { ...parentEntry, ...entry }
			promises.push(predicate(mergedEntry, entryKeys))

			if (hasProperties<{ subcommands: Record<string, T> }>(entry, ['subcommands']) && entry.subcommands) {
				const resursion = scanEntries(predicate, {
					manifestEntries: entry.subcommands,
					parentEntry: mergedEntry,
					recursionKeys: entryKeys,
					type
				})
				promises.push(resursion)
			} else if (hasProperties<{ subroutes: Record<string, T> }>(entry, ['subroutes']) && entry.subroutes) {
				const resursion = scanEntries(predicate, {
					manifestEntries: entry.subroutes,
					parentEntry: mergedEntry,
					recursionKeys: entryKeys,
					type
				})
				promises.push(resursion)
			}
		})
	}

	return Promise.all(promises)
}

/**
 * Loads handler records from the compiled manifest for the given handler type.
 *
 * @param type - The handler category to load: 'api', 'commands', 'context', 'events', or 'middleware'.
 * @returns A Collection mapping handler keys to their loaded HandlerRecord(s). For 'events' the collection values are arrays of HandlerRecord; for other types the values are a single HandlerRecord. Keys follow the manifest's canonical form (e.g., commands joined by spaces, api paths joined by '/').
 */
async function loadHandlerRecords<T extends HandlerRecord | HandlerRecord[]>(
	type: 'api' | 'commands' | 'context' | 'events' | 'middleware'
) {
	const collection = new Collection<string, T>()
	const manifest = Compiler.getManifest()

	// Log manifest objects as debug info
	const pcolor =
		type === 'commands'
			? composeColors(color.blue, color.bold)
			: type === 'context'
			? composeColors(hex('#536DFE'), color.bold)
			: type === 'events'
			? composeColors(color.magenta, color.bold)
			: composeColors(color.gray, color.bold)
	const formatApi = (api: string) => pcolor(`${api}`)
	const formatCommand = (command: string) => pcolor(`/${command}`)
	const formatContext = (context: string) => pcolor(`${context} (${context})`)
	const formatEvent = (event: string) => pcolor(`${event} (${manifest.events[event].length})`)
	const formatMiddleware = (middleware: string) => pcolor(manifest.middleware[parseInt(middleware)]?.__path)
	const formatter =
		type === 'api'
			? formatApi
			: type === 'commands'
			? formatCommand
			: type === 'context'
			? formatContext
			: type === 'events'
			? formatEvent
			: formatMiddleware
	const handlers = Object.keys(manifest[type]).map(formatter)
	logger.debug(`Loading ${type}: ${handlers.join(', ')}`)

	const scanPredicate: ScanPredicate = async <U>(entry: BaseConfig & U, entryKeys: string[]) => {
		// Skip for nested entries (no __path)
		if (!entry.__path) {
			return
		}

		// Load the module
		const basePath = path.join(process.cwd(), entry.__plugin?.path ?? '.')
		const importPath = pathToFileURL(path.join(basePath, entry.__path)).toString()

		const handler: HandlerRecord = {
			auto: entry.__auto,
			description: entry.description,
			handler: await import(importPath),
			key: entryKeys.join('/'),
			module: entry.__module,
			path: entry.__path,
			plugin: entry.__plugin,
			type: type === 'events' ? 'event' : type === 'commands' ? 'command' : type
		}

		if (entry.serverOnly) {
			const servers = Array.isArray(entry.serverOnly) ? entry.serverOnly : [entry.serverOnly]
			const handlerKey = type === 'commands' ? entryKeys.join(' ') : entryKeys[0]

			if (!globalThis.robo) {
				Globals.init()
			}

			// yay
			const portalAny = globalThis.robo.portal as any
			if (portalAny && typeof portalAny.serverRestrictions === 'object') {
				portalUtils.setServerOnly(portalAny.serverRestrictions, handlerKey, servers);
			}
		}

		if (entry.disabled === true) {
			const handlerKey = type === 'commands' ? entryKeys.join(' ') : entryKeys[0]

			if (!globalThis.robo) {
				Globals.init()
			}

			const portalAny = globalThis.robo.portal as any
			if (portalAny && portalAny.enabledState) {
				if (type === 'commands') {
					portalUtils.setEnabled(portalAny.enabledState.commands, handlerKey, false);
				} else if (type === 'context') {
					portalUtils.setEnabled(portalAny.enabledState.contexts, handlerKey, false);
				} else if (type === 'events') {
					const eventKey = `${handlerKey}:${portalAny.enabledState.events[handlerKey] || 0}`
					portalUtils.setEnabled(portalAny.enabledState.events, eventKey, false);
				} else if (type === 'middleware') {
					portalUtils.setEnabled(portalAny.enabledState.middleware, handlerKey, false);
				}
			}
		}

		// Assign the handler to the collection, handling difference between types
		if (type === 'events') {
			const eventKey = entryKeys[0]
			if (!collection.has(eventKey)) {
				collection.set(eventKey, [] as T)
			}
			const handlers = collection.get(eventKey) as HandlerRecord[]
			handlers.push(handler)
		} else if (type === 'commands') {
			const commandKey = entryKeys.join(' ')
			collection.set(commandKey, handler as T)
		} else if (type === 'context') {
			const contextKey = entryKeys[0]
			collection.set(contextKey, handler as T)
		} else if (type === 'middleware') {
			collection.set(entryKeys[0], handler as T)
		} else if (type === 'api') {
			collection.set(entryKeys.join('/'), handler as T)
		}
	}

	// Scan context a bit differently due to nesting
	if (type === 'context') {
		await scanEntries(scanPredicate, { manifestEntries: manifest.context.message, type })
		await scanEntries(scanPredicate, { manifestEntries: manifest.context.user, type })
	} else {
		await scanEntries(scanPredicate, { manifestEntries: manifest[type], type })
	}

	return collection
}
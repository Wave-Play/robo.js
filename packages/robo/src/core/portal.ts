import { Compiler } from './../cli/utils/compiler.js'
import { Collection, Snowflake } from 'discord.js'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { hasProperties } from '../cli/utils/utils.js'
import { logger } from './logger.js'
import { color, composeColors, hex } from './color.js'
import { getConfig } from './config.js'
import type { Api, BaseConfig, Command, Context, Event, HandlerRecord, Middleware } from '../types/index.js'
import { Globals } from './globals.js'

export default class Portal {
	private _enabledModules: Record<string, boolean> = {}
	private _enabledCommands: Record<string, boolean> = {}
	private _enabledEvents: Record<string, boolean> = {}
	private _enabledMiddleware: Record<string, boolean> = {}
	private _enabledContexts: Record<string, boolean> = {}
	private _serverRestrictions: Record<string, string[]> = {}
	private _modules: Record<string, Module> = {}
	private _keepRegistered: boolean = false

	constructor() {}

	get apis() {
		return Globals.getPortalValues().apis
	}

	get commands() {
		return Globals.getPortalValues().commands
	}

	get context() {
		return Globals.getPortalValues().context
	}

	get events() {
		return Globals.getPortalValues().events
	}

	get middleware() {
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

	module(moduleName: string) {
		let moduleInstance = this._modules[moduleName]
		if (!moduleInstance) {
			moduleInstance = new Module(
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
		return new CommandController(commandName, this._enabledCommands, this._serverRestrictions)
	}

	event(eventName: string) {
		return new EventController(eventName, this._enabledEvents, this._serverRestrictions)
	}

	middlewareController(middlewareName: string) {
		return new MiddlewareController(middlewareName, this._enabledMiddleware, this._serverRestrictions)
	}

	contextController(contextName: string) {
		return new ContextController(contextName, this._enabledContexts, this._serverRestrictions)
	}

	isEnabledForServer(key: string, serverId: Snowflake): boolean {
		const serverRestrictions = this._serverRestrictions[key]
		if (!serverRestrictions || serverRestrictions.length === 0) {
			return true
		}
		return serverRestrictions.includes(serverId)
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

class Module {
	constructor(
		private _moduleName: string,
		private _enabledModules: Record<string, boolean>,
		private _enabledCommands: Record<string, boolean>,
		private _enabledEvents: Record<string, boolean>,
		private _enabledMiddleware: Record<string, boolean>,
		private _enabledContexts: Record<string, boolean>,
		private _serverRestrictions: Record<string, string[]>,
		private _getKeepRegistered: () => boolean
	) {}

	get isEnabled(): boolean {
		return this._enabledModules[this._moduleName] ?? true
	}

	setEnabled(value: boolean): void {
		this._enabledModules[this._moduleName] = value

		if (!value && !this._getKeepRegistered()) {
			this._unregisterModuleCommands()
			this._unregisterModuleEvents()
			this._unregisterModuleMiddleware()
			this._unregisterModuleContexts()
		}
	}

	setServerOnly(serverIds: string[] | string): void {
		const servers = Array.isArray(serverIds) ? serverIds : [serverIds]
		this._serverRestrictions[this._moduleName] = servers

		this._applyServerRestrictionsToComponents()
	}

	private _unregisterModuleCommands(): void {
		const commands = Globals.getPortalValues().commands
		if (!commands) return

		commands.forEach((command, key) => {
			if (command.module === this._moduleName) {
				this._enabledCommands[key] = false
			}
		})
	}

	private _unregisterModuleEvents(): void {
		const events = Globals.getPortalValues().events
		if (!events) return

		events.forEach((eventHandlers, eventName) => {
			eventHandlers.forEach((handler, index) => {
				if (handler.module === this._moduleName) {
					const key = `${eventName}:${index}`
					this._enabledEvents[key] = false
				}
			})
		})
	}

	private _unregisterModuleMiddleware(): void {
		const middleware = Globals.getPortalValues().middleware
		middleware.forEach((mw, index) => {
			if (mw.module === this._moduleName) {
				this._enabledMiddleware[index.toString()] = false
			}
		})
	}

	private _unregisterModuleContexts(): void {
		const contexts = Globals.getPortalValues().context
		if (!contexts) return

		contexts.forEach((context, key) => {
			if (context.module === this._moduleName) {
				this._enabledContexts[key] = false
			}
		})
	}

	private _applyServerRestrictionsToComponents(): void {
		const servers = this._serverRestrictions[this._moduleName]
		if (!servers || servers.length === 0) return

		const commands = Globals.getPortalValues().commands
		if (commands) {
			commands.forEach((command, key) => {
				if (command.module === this._moduleName) {
					this._serverRestrictions[key] = servers
				}
			})
		}

		const events = Globals.getPortalValues().events
		if (events) {
			events.forEach((eventHandlers, eventName) => {
				eventHandlers.forEach((handler, index) => {
					if (handler.module === this._moduleName) {
						const key = `${eventName}:${index}`
						this._serverRestrictions[key] = servers
					}
				})
			})
		}

		const middleware = Globals.getPortalValues().middleware
		middleware.forEach((mw, index) => {
			if (mw.module === this._moduleName) {
				this._serverRestrictions[index.toString()] = servers
			}
		})

		const contexts = Globals.getPortalValues().context
		if (contexts) {
			contexts.forEach((context, key) => {
				if (context.module === this._moduleName) {
					this._serverRestrictions[key] = servers
				}
			})
		}
	}
}

class CommandController {
	constructor(
		private _commandName: string,
		private _enabledCommands: Record<string, boolean>,
		private _serverRestrictions: Record<string, string[]>
	) {}

	get isEnabled(): boolean {
		return this._enabledCommands[this._commandName] ?? true
	}

	setEnabled(value: boolean): void {
		this._enabledCommands[this._commandName] = value
	}

	setServerOnly(serverIds: string[] | string): void {
		const servers = Array.isArray(serverIds) ? serverIds : [serverIds]
		this._serverRestrictions[this._commandName] = servers
	}
}

class EventController {
	constructor(
		private _eventKey: string,
		private _enabledEvents: Record<string, boolean>,
		private _serverRestrictions: Record<string, string[]>
	) {}

	get isEnabled(): boolean {
		return this._enabledEvents[this._eventKey] ?? true
	}

	setEnabled(value: boolean): void {
		this._enabledEvents[this._eventKey] = value
	}

	setServerOnly(serverIds: string[] | string): void {
		const servers = Array.isArray(serverIds) ? serverIds : [serverIds]
		this._serverRestrictions[this._eventKey] = servers
	}
}

class MiddlewareController {
	constructor(
		private _middlewareName: string,
		private _enabledMiddleware: Record<string, boolean>,
		private _serverRestrictions: Record<string, string[]>
	) {}

	get isEnabled(): boolean {
		return this._enabledMiddleware[this._middlewareName] ?? true
	}

	setEnabled(value: boolean): void {
		this._enabledMiddleware[this._middlewareName] = value
	}

	setServerOnly(serverIds: string[] | string): void {
		const servers = Array.isArray(serverIds) ? serverIds : [serverIds]
		this._serverRestrictions[this._middlewareName] = servers
	}
}

class ContextController {
	constructor(
		private _contextName: string,
		private _enabledContexts: Record<string, boolean>,
		private _serverRestrictions: Record<string, string[]>
	) {}

	get isEnabled(): boolean {
		return this._enabledContexts[this._contextName] ?? true
	}

	setEnabled(value: boolean): void {
		this._enabledContexts[this._contextName] = value
	}

	setServerOnly(serverIds: string[] | string): void {
		const servers = Array.isArray(serverIds) ? serverIds : [serverIds]
		this._serverRestrictions[this._contextName] = servers
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
	const pluginOptions = config.plugins?.find((plugin) => {
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

			// type assertion yay
			const portalAny = globalThis.robo.portal as any
			if (portalAny && typeof portalAny.serverRestrictions === 'object') {
				portalAny.serverRestrictions[handlerKey] = servers
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
					portalAny.enabledState.commands[handlerKey] = false
				} else if (type === 'context') {
					portalAny.enabledState.contexts[handlerKey] = false
				} else if (type === 'events') {
					const eventKey = `${handlerKey}:${portalAny.enabledState.events[handlerKey] || 0}`
					portalAny.enabledState.events[eventKey] = false
				} else if (type === 'middleware') {
					portalAny.enabledState.middleware[handlerKey] = false
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

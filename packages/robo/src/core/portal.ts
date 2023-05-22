import chalk from 'chalk'
import { Collection } from 'discord.js'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { getManifest } from '../cli/utils/manifest.js'
import { hasProperties } from '../cli/utils/utils.js'
import { logger } from './logger.js'
import type { EventRecord } from './../types/events.js'
import type { CommandRecord } from '../types/commands.js'
import type { BaseConfig, ContextRecord, Handler } from '../types/index.js'

export default class Portal {
	public commands: Collection<string, CommandRecord>
	public context: Collection<string, ContextRecord>
	public events: Collection<string, EventRecord[]>

	constructor(
		commands: Collection<string, CommandRecord>,
		context: Collection<string, ContextRecord>,
		events: Collection<string, EventRecord[]>
	) {
		this.commands = commands
		this.context = context
		this.events = events
	}

	/**
	 * Creates a new Portal instance from the manifest file.
	 * 
	 * Warning: Do not call this method directly. Use the `portal` export instead.
	 */
	public static async open(): Promise<Portal> {
		const commands = await loadHandlerModules<CommandRecord>('commands')
		const context = await loadHandlerModules<ContextRecord>('context')
		const events = await loadHandlerModules<EventRecord[]>('events')

		return new Portal(commands, context, events)
	}
}

interface ScanOptions<T> {
	manifestEntries: Record<string, T | T[]>
	recursionKeys?: string[]
}
type ScanPredicate = <T>(entry: T, entryKeys: string[]) => Promise<void>

async function scanEntries<T>(predicate: ScanPredicate, options: ScanOptions<T>) {
	const { manifestEntries, recursionKeys = [] } = options
	const promises: Promise<unknown>[] = []

	for (const entryName in manifestEntries) {
		const entryItem = manifestEntries[entryName]
		const entries = Array.isArray(entryItem) ? entryItem : [entryItem]

		entries.forEach((entry) => {
			const entryKeys = [...recursionKeys, entryName]
			promises.push(predicate(entry, entryKeys))

			if (hasProperties<{ subcommands: Record<string, T> }>(entry, ['subcommands']) && entry.subcommands) {
				const resursion = scanEntries(predicate, {
					manifestEntries: entry.subcommands,
					recursionKeys: entryKeys
				})
				promises.push(resursion)
			}
		})
	}

	return Promise.all(promises)
}

async function loadHandlerModules<T extends Handler | Handler[]>(type: 'commands' | 'context' | 'events') {
	const collection = new Collection<string, T>()
	const manifest = getManifest()

	// Log manifest objects as debug info
	const color =
		type === 'commands' ? chalk.blue.bold : type === 'context' ? chalk.hex('#536DFE').bold : chalk.magenta.bold
	const formatCommand = (command: string) => color(`/${command}`)
	const formatContext = (context: string) => color(`${context} (${context})`)
	const formatEvent = (event: string) => color(`${event} (${manifest.events[event].length})`)
	const formatter = type === 'commands' ? formatCommand : type === 'context' ? formatContext : formatEvent
	const handlers = Object.keys(manifest[type]).map(formatter)
	logger.debug(`Loading ${type}: ${handlers.join(', ')}`)

	const scanPredicate: ScanPredicate = async (entry: BaseConfig, entryKeys) => {
		// Skip for nested entries (no __path)
		if (!entry.__path) {
			return
		}

		// Load the module
		const basePath = path.join(process.cwd(), entry.__plugin?.path ?? '.')
		const importPath = pathToFileURL(path.join(basePath, entry.__path)).toString()

		const handler: Handler = {
			auto: entry.__auto,
			handler: await import(importPath),
			path: entry.__path,
			plugin: entry.__plugin
		}

		// Assign the handler to the collection, handling difference between types
		if (type === 'events') {
			const eventKey = entryKeys[0]
			if (!collection.has(eventKey)) {
				collection.set(eventKey, [] as T)
			}
			const handlers = collection.get(eventKey) as Handler[]
			handlers.push(handler)
		} else if (type === 'commands') {
			const commandKey = entryKeys.join(' ')
			collection.set(commandKey, handler as T)
		} else if (type === 'context') {
			const contextKey = entryKeys[0]
			collection.set(contextKey, handler as T)
		}
	}

	// Scan context a bit differently due to nesting
	if (type === 'context') {
		await scanEntries(scanPredicate, { manifestEntries: manifest.context.message })
		await scanEntries(scanPredicate, { manifestEntries: manifest.context.user })
	} else {
		await scanEntries(scanPredicate, { manifestEntries: manifest[type] })
	}

	return collection
}

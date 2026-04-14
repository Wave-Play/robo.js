import { Manifest, portal, type HandlerRecord, type HandlerSummary } from 'robo.js'
import type { Client } from 'discord.js'
import { executeEventHandler } from '../core/handlers/event.js'
import { discordLogger } from '../core/logger.js'
import { color } from 'robo.js'

interface RegisteredEventListener {
	callback: (...args: unknown[]) => Promise<void>
	once: boolean
	onlyAuto: boolean
}

const registeredEventListeners = new Map<string, RegisteredEventListener>()

interface EventListenerTopology {
	once: boolean
	onlyAuto: boolean
}

// Portal already exposes importRecord via PortalImpl
const portalApi = portal

function getEventSummaries(): HandlerSummary[] {
	return Manifest.routeSummariesSync('discordjs', 'events')
}

export function getRegisteredDiscordEventNames(): string[] {
	return Array.from(
		new Set(
			getEventSummaries()
				.map((summary) => summary.key)
				.filter((eventName) => !eventName.startsWith('_'))
		)
	)
}

export function syncEventListeners(client: Client): void {
	const topology = getSummaryTopology()
	for (const [eventName, eventTopology] of topology.entries()) {
		upsertEventListener(client, eventName, eventTopology)
	}
}

export async function syncEventListenersFromPortal(client: Client, eventKeys: string[]): Promise<void> {
	await portalApi.ensureRoute('discordjs', 'events')

	const eventsData = portalApi.getByType('discordjs:events') as Record<string, HandlerRecord | HandlerRecord[]>
	const uniqueKeys = [...new Set(eventKeys.filter((eventName) => !eventName.startsWith('_')))]

	for (const eventName of uniqueKeys) {
		const recordOrArray = eventsData[eventName]

		if (!recordOrArray) {
			removeEventListener(client, eventName)
			continue
		}

		const topology = await buildPortalEventTopology(eventName, recordOrArray)
		if (!topology) {
			continue
		}

		upsertEventListener(client, eventName, topology)
	}
}

export function clearEventListeners(client?: Client): void {
	if (client) {
		for (const [eventName, registered] of registeredEventListeners.entries()) {
			client.off(eventName, registered.callback)
		}
	}

	registeredEventListeners.clear()
}

function getSummaryTopology(): Map<string, EventListenerTopology> {
	const topology = new Map<string, EventListenerTopology>()

	for (const [eventName, eventSummaries] of Object.entries(groupEventSummaries(getEventSummaries()))) {
		if (eventName.startsWith('_')) {
			continue
		}

		topology.set(eventName, {
			once: eventSummaries.every((summary) => summary.metadata?.frequency === 'once'),
			onlyAuto: eventSummaries.every((summary) => Boolean(summary.auto))
		})
	}

	return topology
}

function removeEventListener(client: Client, eventName: string): void {
	const registered = registeredEventListeners.get(eventName)
	if (!registered) {
		return
	}

	client.off(eventName, registered.callback)
	registeredEventListeners.delete(eventName)
}

function upsertEventListener(client: Client, eventName: string, listenerConfig: EventListenerTopology): void {
	const registered = registeredEventListeners.get(eventName)
	if (registered) {
		if (registered.once === listenerConfig.once && registered.onlyAuto === listenerConfig.onlyAuto) {
			return
		}

		removeEventListener(client, eventName)
	}

	const callback = async (...args: unknown[]) => {
		if (listenerConfig.once) {
			const registered = registeredEventListeners.get(eventName)
			if (!registered || registered.callback !== callback) return
			client.off(eventName, callback)
			registeredEventListeners.delete(eventName)
		}

		if (!listenerConfig.onlyAuto) {
			discordLogger.event(`Event received: ${color.bold(eventName)}`)
		}
		discordLogger.trace('Event args:', args)

		await executeEventHandler(eventName, ...args)
	}

	client.on(eventName, callback)

	registeredEventListeners.set(eventName, {
		callback,
		once: listenerConfig.once,
		onlyAuto: listenerConfig.onlyAuto
	})
	discordLogger.debug(
		`Registered event listener: ${eventName} (${listenerConfig.once ? 'once' : 'always'})`
	)
}

async function buildPortalEventTopology(
	eventName: string,
	recordOrArray: HandlerRecord | HandlerRecord[]
): Promise<EventListenerTopology | null> {
	const records = Array.isArray(recordOrArray) ? recordOrArray : [recordOrArray]
	const importedConfigs: Array<Record<string, unknown>> = []

	for (const record of records) {
		try {
			await portalApi.importRecord(record)
			importedConfigs.push((record.handler?.config ?? record.metadata ?? {}) as Record<string, unknown>)
		} catch (error) {
			discordLogger.debug(`[HMR] Failed to import event record ${eventName}:`, error)
			return null
		}
	}

	return {
		once: importedConfigs.every((config) => config.frequency === 'once'),
		onlyAuto: records.every((record) => Boolean(record.auto))
	}
}

function groupEventSummaries(summaries: HandlerSummary[]): Record<string, HandlerSummary[]> {
	const grouped: Record<string, HandlerSummary[]> = {}

	for (const summary of summaries) {
		if (!grouped[summary.key]) {
			grouped[summary.key] = []
		}
		grouped[summary.key].push(summary)
	}

	return grouped
}

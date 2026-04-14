import { beforeEach, describe, expect, it, jest } from '@jest/globals'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fn = jest.fn as any

const roboMock = (await import('robo.js')) as unknown as {
	portal: {
		ensureRoute: jest.Mock
		getByType: jest.Mock
		importRecord: jest.Mock
	}
	setRouteSummaries: (namespace: string, route: string, summaries: Array<Record<string, unknown>>) => void
	clearRouteSummaries: () => void
	clearPortalData: () => void
	getForkedLogger: (key: string) => {
		debug: jest.Mock
		info: jest.Mock
		warn: jest.Mock
		error: jest.Mock
		event: jest.Mock
		trace: jest.Mock
	}
}

const discordMock = (await import('discord.js')) as unknown as {
	Client: new (...args: Array<unknown>) => {
		on: (event: string, cb: (...args: unknown[]) => void) => void
		off: (event: string, cb: (...args: unknown[]) => void) => void
		emit: (event: string, ...args: unknown[]) => boolean
		eventListeners: Map<string, Array<(...args: unknown[]) => void>>
	}
}

// Mock executeEventHandler for topology callback verification
const mockExecuteEventHandler = fn().mockResolvedValue(undefined)
jest.unstable_mockModule('../src/core/handlers/event.js', () => ({
	executeEventHandler: mockExecuteEventHandler
}))

const { portal, setRouteSummaries, clearRouteSummaries, clearPortalData, getForkedLogger } = roboMock
const discordLogger = getForkedLogger('discordjs')

// Helper to get client's listener count for an event
function getListenerCount(client: unknown, event: string): number {
	return (
		(client as { eventListeners: Map<string, unknown[]> }).eventListeners.get(event)?.length ?? 0
	)
}

describe('event topology', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		clearRouteSummaries()
		clearPortalData()
		mockExecuteEventHandler.mockClear()
	})

	it('registers startup listeners from summaries only', async () => {
		const { syncEventListeners, clearEventListeners } = await import('../src/robo/event-topology.js')
		const client = new discordMock.Client()

		setRouteSummaries('discordjs', 'events', [{ key: 'ready', metadata: { frequency: 'always' } }])

		syncEventListeners(client as never)

		expect(getListenerCount(client, 'ready')).toBe(1)
		expect(portal.ensureRoute).not.toHaveBeenCalled()

		clearEventListeners(client as never)
	})

	it('rebuilds HMR listener topology from live portal records', async () => {
		const { syncEventListenersFromPortal, clearEventListeners } = await import('../src/robo/event-topology.js')
		const client = new discordMock.Client()
		const readyRecord = {
			key: 'ready',
			type: 'discordjs:events',
			path: 'events/ready.js',
			metadata: { frequency: 'always' },
			auto: false,
			enabled: true,
			exports: { default: true, config: true, named: [] },
			handler: { default: async () => undefined, config: { frequency: 'once' } }
		}

		portal.getByType.mockReturnValue({ ready: readyRecord })
		portal.importRecord.mockImplementation(async (...args: unknown[]) => {
			const [record] = args as [typeof readyRecord]
			record.metadata = { frequency: 'once' }
		})

		await syncEventListenersFromPortal(client as never, ['ready'])

		expect(portal.ensureRoute).toHaveBeenCalledWith('discordjs', 'events')
		expect(portal.importRecord).toHaveBeenCalledWith(readyRecord)
		expect(getListenerCount(client, 'ready')).toBe(1)

		clearEventListeners(client as never)
		expect(getListenerCount(client, 'ready')).toBe(0)
	})
})

describe('getRegisteredDiscordEventNames', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		clearRouteSummaries()
	})

	it('returns unique event names from summaries', async () => {
		const { getRegisteredDiscordEventNames } = await import('../src/robo/event-topology.js')

		setRouteSummaries('discordjs', 'events', [
			{ key: 'ready' },
			{ key: 'messageCreate' },
			{ key: 'guildCreate' }
		])

		const names = getRegisteredDiscordEventNames()
		expect(names).toEqual(expect.arrayContaining(['ready', 'messageCreate', 'guildCreate']))
		expect(names).toHaveLength(3)
	})

	it('filters out events starting with _ (lifecycle events)', async () => {
		const { getRegisteredDiscordEventNames } = await import('../src/robo/event-topology.js')

		setRouteSummaries('discordjs', 'events', [
			{ key: '_start' },
			{ key: '_stop' },
			{ key: 'ready' },
			{ key: 'messageCreate' }
		])

		const names = getRegisteredDiscordEventNames()
		expect(names).not.toContain('_start')
		expect(names).not.toContain('_stop')
		expect(names).toContain('ready')
		expect(names).toContain('messageCreate')
	})

	it('returns empty array when no summaries', async () => {
		const { getRegisteredDiscordEventNames } = await import('../src/robo/event-topology.js')

		const names = getRegisteredDiscordEventNames()
		expect(names).toEqual([])
	})

	it('deduplicates events with multiple handlers', async () => {
		const { getRegisteredDiscordEventNames } = await import('../src/robo/event-topology.js')

		setRouteSummaries('discordjs', 'events', [
			{ key: 'messageCreate' },
			{ key: 'messageCreate' },
			{ key: 'ready' }
		])

		const names = getRegisteredDiscordEventNames()
		const messageCreateCount = names.filter((n: string) => n === 'messageCreate').length
		expect(messageCreateCount).toBe(1)
	})
})

describe('upsertEventListener - idempotency', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		clearRouteSummaries()
		clearPortalData()
	})

	it('calling syncEventListeners twice does not double-register', async () => {
		const { syncEventListeners, clearEventListeners } = await import('../src/robo/event-topology.js')
		const client = new discordMock.Client()

		setRouteSummaries('discordjs', 'events', [{ key: 'messageCreate', metadata: {} }])

		syncEventListeners(client as never)
		syncEventListeners(client as never)

		// Should still have only 1 listener due to idempotency check
		expect(getListenerCount(client, 'messageCreate')).toBe(1)

		clearEventListeners(client as never)
	})

	it('re-registers when topology changes (always -> once)', async () => {
		const { syncEventListeners, clearEventListeners } = await import('../src/robo/event-topology.js')
		const client = new discordMock.Client()

		// First: register as always
		setRouteSummaries('discordjs', 'events', [{ key: 'messageCreate', metadata: {} }])
		syncEventListeners(client as never)
		expect(getListenerCount(client, 'messageCreate')).toBe(1)

		// Change topology to once
		clearRouteSummaries()
		setRouteSummaries('discordjs', 'events', [{ key: 'messageCreate', metadata: { frequency: 'once' } }])
		syncEventListeners(client as never)

		// Should still have 1 listener (old removed, new added)
		expect(getListenerCount(client, 'messageCreate')).toBe(1)

		clearEventListeners(client as never)
	})
})

describe('syncEventListenersFromPortal - removal', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		clearRouteSummaries()
		clearPortalData()
	})

	it('removes listener when record is undefined (event deleted)', async () => {
		const { syncEventListeners, syncEventListenersFromPortal, clearEventListeners } = await import(
			'../src/robo/event-topology.js'
		)
		const client = new discordMock.Client()

		// Register a listener first
		setRouteSummaries('discordjs', 'events', [{ key: 'messageCreate', metadata: {} }])
		syncEventListeners(client as never)
		expect(getListenerCount(client, 'messageCreate')).toBe(1)

		// Now simulate HMR removal - portal returns no record for this event
		portal.getByType.mockReturnValue({})

		await syncEventListenersFromPortal(client as never, ['messageCreate'])

		expect(getListenerCount(client, 'messageCreate')).toBe(0)

		clearEventListeners(client as never)
	})

	it('filters out _ prefixed event keys', async () => {
		const { syncEventListenersFromPortal, clearEventListeners } = await import('../src/robo/event-topology.js')
		const client = new discordMock.Client()

		portal.getByType.mockReturnValue({})

		await syncEventListenersFromPortal(client as never, ['_start', '_stop', 'ready'])

		// Should only process 'ready', not the lifecycle events
		// Since portal returns no record for 'ready', nothing should be registered
		expect(getListenerCount(client, '_start')).toBe(0)
		expect(getListenerCount(client, '_stop')).toBe(0)

		clearEventListeners(client as never)
	})

	it('handles import failure gracefully (returns null topology)', async () => {
		const { syncEventListenersFromPortal, clearEventListeners } = await import('../src/robo/event-topology.js')
		const client = new discordMock.Client()

		const failingRecord = {
			key: 'broken',
			handler: null,
			metadata: {},
			auto: false
		}

		portal.getByType.mockReturnValue({ broken: failingRecord })
		portal.importRecord.mockRejectedValue(new Error('Import failed'))

		await syncEventListenersFromPortal(client as never, ['broken'])

		// Should not register a listener when import fails
		expect(getListenerCount(client, 'broken')).toBe(0)

		clearEventListeners(client as never)
	})
})

describe('once listener behavior', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		clearRouteSummaries()
		clearPortalData()
		mockExecuteEventHandler.mockClear()
	})

	it('listener fires then self-removes for once topology', async () => {
		const { syncEventListeners, clearEventListeners } = await import('../src/robo/event-topology.js')
		const client = new discordMock.Client()

		setRouteSummaries('discordjs', 'events', [{ key: 'guildCreate', metadata: { frequency: 'once' } }])
		syncEventListeners(client as never)

		expect(getListenerCount(client, 'guildCreate')).toBe(1)

		// Emit event - listener should fire and self-remove
		client.emit('guildCreate', { id: '123' })
		await new Promise((r) => setTimeout(r, 10))

		expect(mockExecuteEventHandler).toHaveBeenCalledWith('guildCreate', { id: '123' })

		// Listener should be removed after first emit
		expect(getListenerCount(client, 'guildCreate')).toBe(0)

		clearEventListeners(client as never)
	})

	it('subsequent emits do not trigger callback after once fires', async () => {
		const { syncEventListeners, clearEventListeners } = await import('../src/robo/event-topology.js')
		const client = new discordMock.Client()

		setRouteSummaries('discordjs', 'events', [{ key: 'guildCreate', metadata: { frequency: 'once' } }])
		syncEventListeners(client as never)

		// First emit
		client.emit('guildCreate', { id: '123' })
		await new Promise((r) => setTimeout(r, 10))

		// Second emit should not trigger callback
		mockExecuteEventHandler.mockClear()
		client.emit('guildCreate', { id: '456' })
		await new Promise((r) => setTimeout(r, 10))

		expect(mockExecuteEventHandler).not.toHaveBeenCalled()

		clearEventListeners(client as never)
	})
})

describe('onlyAuto behavior', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		clearRouteSummaries()
		clearPortalData()
		mockExecuteEventHandler.mockClear()
		Object.values(discordLogger).forEach((mockFn) => {
			if (typeof mockFn === 'function' && 'mockClear' in mockFn) {
				;(mockFn as jest.Mock).mockClear()
			}
		})
	})

	it('auto-only events do not log "Event received" message', async () => {
		const { syncEventListeners, clearEventListeners } = await import('../src/robo/event-topology.js')
		const client = new discordMock.Client()

		// All summaries have auto: true -> onlyAuto = true
		setRouteSummaries('discordjs', 'events', [{ key: 'presenceUpdate', metadata: {}, auto: true }])
		syncEventListeners(client as never)

		client.emit('presenceUpdate', {})
		await new Promise((r) => setTimeout(r, 10))

		// Should NOT log "Event received" for auto-only events
		expect(discordLogger.event).not.toHaveBeenCalledWith(expect.stringContaining('Event received'))

		clearEventListeners(client as never)
	})

	it('non-auto events log "Event received" message', async () => {
		const { syncEventListeners, clearEventListeners } = await import('../src/robo/event-topology.js')
		const client = new discordMock.Client()

		// auto: false -> onlyAuto = false
		setRouteSummaries('discordjs', 'events', [{ key: 'messageCreate', metadata: {}, auto: false }])
		syncEventListeners(client as never)

		client.emit('messageCreate', { content: 'hello' })
		await new Promise((r) => setTimeout(r, 10))

		// Should log "Event received" for non-auto events
		expect(discordLogger.event).toHaveBeenCalledWith(expect.stringContaining('Event received'))

		clearEventListeners(client as never)
	})
})

describe('once flag logic fix', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		clearRouteSummaries()
		clearPortalData()
		mockExecuteEventHandler.mockClear()
	})

	it('should NOT be once when mixed once/always handlers exist', async () => {
		const { syncEventListeners, clearEventListeners } = await import('../src/robo/event-topology.js')
		const client = new discordMock.Client()

		setRouteSummaries('discordjs', 'events', [
			{ key: 'messageCreate', metadata: { frequency: 'once' } },
			{ key: 'messageCreate', metadata: { frequency: 'always' } }
		])

		syncEventListeners(client as never)

		// First emit
		client.emit('messageCreate', { content: 'first' })
		await new Promise((r) => setTimeout(r, 10))
		expect(mockExecuteEventHandler).toHaveBeenCalledTimes(1)

		// Second emit should still fire because not all handlers are 'once'
		client.emit('messageCreate', { content: 'second' })
		await new Promise((r) => setTimeout(r, 10))
		expect(mockExecuteEventHandler).toHaveBeenCalledTimes(2)

		clearEventListeners(client as never)
	})

	it('should be once when ALL handlers are once', async () => {
		const { syncEventListeners, clearEventListeners } = await import('../src/robo/event-topology.js')
		const client = new discordMock.Client()

		setRouteSummaries('discordjs', 'events', [
			{ key: 'guildCreate', metadata: { frequency: 'once' } },
			{ key: 'guildCreate', metadata: { frequency: 'once' } }
		])

		syncEventListeners(client as never)

		// First emit
		client.emit('guildCreate', { id: '123' })
		await new Promise((r) => setTimeout(r, 10))
		expect(mockExecuteEventHandler).toHaveBeenCalledTimes(1)

		// Second emit should NOT fire because all handlers are 'once'
		mockExecuteEventHandler.mockClear()
		client.emit('guildCreate', { id: '456' })
		await new Promise((r) => setTimeout(r, 10))
		expect(mockExecuteEventHandler).not.toHaveBeenCalled()

		clearEventListeners(client as never)
	})

	it('should NOT be once when all handlers are always', async () => {
		const { syncEventListeners, clearEventListeners } = await import('../src/robo/event-topology.js')
		const client = new discordMock.Client()

		setRouteSummaries('discordjs', 'events', [
			{ key: 'messageCreate', metadata: {} },
			{ key: 'messageCreate', metadata: { frequency: 'always' } }
		])

		syncEventListeners(client as never)

		// First emit
		client.emit('messageCreate', { content: 'first' })
		await new Promise((r) => setTimeout(r, 10))

		// Second emit should still fire
		client.emit('messageCreate', { content: 'second' })
		await new Promise((r) => setTimeout(r, 10))
		expect(mockExecuteEventHandler).toHaveBeenCalledTimes(2)

		clearEventListeners(client as never)
	})

	it('should NOT be once when only one of many handlers is once', async () => {
		const { syncEventListeners, clearEventListeners } = await import('../src/robo/event-topology.js')
		const client = new discordMock.Client()

		setRouteSummaries('discordjs', 'events', [
			{ key: 'messageCreate', metadata: { frequency: 'once' } },
			{ key: 'messageCreate', metadata: {} },
			{ key: 'messageCreate', metadata: { frequency: 'always' } }
		])

		syncEventListeners(client as never)

		// Both emits should fire
		client.emit('messageCreate', { content: 'a' })
		await new Promise((r) => setTimeout(r, 10))
		client.emit('messageCreate', { content: 'b' })
		await new Promise((r) => setTimeout(r, 10))
		expect(mockExecuteEventHandler).toHaveBeenCalledTimes(2)

		clearEventListeners(client as never)
	})
})

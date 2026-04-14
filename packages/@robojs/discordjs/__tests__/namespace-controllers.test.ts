/**
 * Tests for namespace controller factories
 *
 * Focused on:
 * - execute() and emit() delegation
 * - Edge cases for get/chain with missing handler defaults
 * - Portal error handling paths
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fn = jest.fn as any

// Import mocked robo.js
const roboMock = (await import('robo.js')) as unknown as {
	Manifest: { routeSummariesSync: jest.Mock }
	portal: {
		getByType: jest.Mock
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		getHandler: jest.Mock<any>
		importHandler: jest.Mock
		ensureRoute: jest.Mock
	}
	setRouteSummaries: (namespace: string, route: string, summaries: Array<{ key: string }>) => void
	clearRouteSummaries: () => void
}

const { portal, setRouteSummaries, clearRouteSummaries } = roboMock

// Mock handler execution modules before importing namespace-controllers
const mockExecuteCommandHandler = fn()
const mockExecuteEventHandler = fn()

jest.unstable_mockModule('../src/core/handlers/command.js', () => ({
	executeCommandHandler: mockExecuteCommandHandler
}))

jest.unstable_mockModule('../src/core/handlers/event.js', () => ({
	executeEventHandler: mockExecuteEventHandler
}))

const {
	createCommandsNamespaceController,
	createEventsNamespaceController,
	createContextNamespaceController,
	createMiddlewareNamespaceController
} = await import('../src/core/namespace-controllers.js')

describe('createCommandsNamespaceController', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		clearRouteSummaries()
	})

	it('list() returns keys from Manifest.routeSummariesSync', () => {
		setRouteSummaries('discordjs', 'commands', [{ key: 'ping' }, { key: 'help' }, { key: 'user info' }])
		const controller = createCommandsNamespaceController()
		expect(controller.list()).toEqual(['ping', 'help', 'user info'])
	})

	it('list() returns empty array when no commands', () => {
		const controller = createCommandsNamespaceController()
		expect(controller.list()).toEqual([])
	})

	it('get(name) returns handler default export via portal.getHandler', async () => {
		const mockHandler = fn()
		portal.getHandler.mockResolvedValue({ default: mockHandler })

		const controller = createCommandsNamespaceController()
		const handler = await controller.get('ping')

		expect(handler).toBe(mockHandler)
		expect(portal.getHandler).toHaveBeenCalledWith('discordjs', 'commands', 'ping')
	})

	it('get(name) returns null when handler not found', async () => {
		portal.getHandler.mockRejectedValue(new Error('Not found'))

		const controller = createCommandsNamespaceController()
		const handler = await controller.get('unknown')

		expect(handler).toBeNull()
	})

	it('get(name) returns null when handler has no default', async () => {
		portal.getHandler.mockResolvedValue({})

		const controller = createCommandsNamespaceController()
		const handler = await controller.get('ping')

		expect(handler).toBeNull()
	})

	it('get(name) returns null on portal error (try/catch)', async () => {
		portal.getHandler.mockRejectedValue(new TypeError('Cannot read properties'))

		const controller = createCommandsNamespaceController()
		const handler = await controller.get('crash')

		expect(handler).toBeNull()
	})

	it('execute(name, interaction) delegates to executeCommandHandler', async () => {
		const mockInteraction = { commandName: 'ping', reply: fn() }
		mockExecuteCommandHandler.mockResolvedValue(undefined)

		const controller = createCommandsNamespaceController()
		await controller.execute('ping', mockInteraction as never)

		expect(mockExecuteCommandHandler).toHaveBeenCalledWith(mockInteraction, 'ping')
	})
})

describe('createEventsNamespaceController', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		clearRouteSummaries()
	})

	it('list() returns event keys from Manifest', () => {
		setRouteSummaries('discordjs', 'events', [{ key: 'ready' }, { key: 'messageCreate' }])

		const controller = createEventsNamespaceController()
		expect(controller.list()).toEqual(['ready', 'messageCreate'])
	})

	it('get(name) calls portal.ensureRoute then portal.getByType', async () => {
		const handler = fn()
		portal.getByType.mockReturnValue({ ready: { handler: { default: handler } } })

		const controller = createEventsNamespaceController()
		const handlers = await controller.get('ready')

		expect(portal.ensureRoute).toHaveBeenCalledWith('discordjs', 'events')
		expect(handlers).toEqual([handler])
	})

	it('get(name) returns array of handler defaults for multiple records', async () => {
		const handler1 = fn()
		const handler2 = fn()
		portal.getByType.mockReturnValue({
			messageCreate: [{ handler: { default: handler1 } }, { handler: { default: handler2 } }]
		})

		const controller = createEventsNamespaceController()
		const handlers = await controller.get('messageCreate')

		expect(handlers).toEqual([handler1, handler2])
	})

	it('get(name) returns empty array for unknown event', async () => {
		portal.getByType.mockReturnValue({})

		const controller = createEventsNamespaceController()
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const handlers = await controller.get('unknown' as any)

		expect(handlers).toEqual([])
	})

	it('get(name) imports handler if record.handler is null', async () => {
		const handler = fn()
		const record = { handler: null }

		portal.importHandler.mockImplementation(async () => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			;(record as any).handler = { default: handler }
		})
		portal.getByType.mockReturnValue({ ready: [record] })

		const controller = createEventsNamespaceController()
		const handlers = await controller.get('ready')

		expect(portal.importHandler).toHaveBeenCalledWith('discordjs', 'events', 'ready')
		expect(handlers).toEqual([handler])
	})

	it('get(name) handles single record (non-array) from getByType', async () => {
		const handler = fn()
		portal.getByType.mockReturnValue({ ready: { handler: { default: handler } } })

		const controller = createEventsNamespaceController()
		const handlers = await controller.get('ready')

		expect(handlers).toEqual([handler])
	})

	it('get(name) skips records with no handler.default after import', async () => {
		const record = { handler: null }

		portal.importHandler.mockImplementation(async () => {
			// Import succeeds but sets handler without default
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			;(record as any).handler = { config: {} }
		})
		portal.getByType.mockReturnValue({ ready: [record] })

		const controller = createEventsNamespaceController()
		const handlers = await controller.get('ready')

		expect(handlers).toEqual([])
	})

	it('emit(name, ...args) delegates to executeEventHandler', async () => {
		mockExecuteEventHandler.mockResolvedValue(undefined)

		const controller = createEventsNamespaceController()
		await controller.emit('messageCreate', { content: 'hello' } as never)

		expect(mockExecuteEventHandler).toHaveBeenCalledWith('messageCreate', { content: 'hello' })
	})
})

describe('createContextNamespaceController', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		clearRouteSummaries()
	})

	it('list() returns context menu keys', () => {
		setRouteSummaries('discordjs', 'context', [{ key: 'Get User Info' }, { key: 'Report Message' }])

		const controller = createContextNamespaceController()
		expect(controller.list()).toEqual(['Get User Info', 'Report Message'])
	})

	it('get(name) returns handler default via portal.getHandler', async () => {
		const mockHandler = fn()
		portal.getHandler.mockResolvedValue({ default: mockHandler })

		const controller = createContextNamespaceController()
		const handler = await controller.get('Get User Info')

		expect(handler).toBe(mockHandler)
		expect(portal.getHandler).toHaveBeenCalledWith('discordjs', 'context', 'Get User Info')
	})

	it('get(name) returns null when not found', async () => {
		portal.getHandler.mockRejectedValue(new Error('Not found'))

		const controller = createContextNamespaceController()
		const handler = await controller.get('Unknown')

		expect(handler).toBeNull()
	})

	it('get(name) returns null on portal error', async () => {
		portal.getHandler.mockRejectedValue(new TypeError('Portal crash'))

		const controller = createContextNamespaceController()
		const handler = await controller.get('Bad')

		expect(handler).toBeNull()
	})
})

describe('createMiddlewareNamespaceController', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		clearRouteSummaries()
	})

	it('list() returns middleware keys', () => {
		setRouteSummaries('discordjs', 'middleware', [{ key: 'auth' }, { key: 'logging' }])

		const controller = createMiddlewareNamespaceController()
		expect(controller.list()).toEqual(['auth', 'logging'])
	})

	it('chain() calls portal.ensureRoute then getByType', async () => {
		portal.getByType.mockReturnValue({})

		const controller = createMiddlewareNamespaceController()
		await controller.chain()

		expect(portal.ensureRoute).toHaveBeenCalledWith('discordjs', 'middleware')
		expect(portal.getByType).toHaveBeenCalledWith('discordjs:middleware')
	})

	it('chain() imports handler if not yet loaded', async () => {
		const handler = fn()
		const record = { enabled: true, metadata: {}, handler: null }

		portal.importHandler.mockImplementation(async () => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			;(record as any).handler = { default: handler }
		})
		portal.getByType.mockReturnValue({ auth: record })

		const controller = createMiddlewareNamespaceController()
		const chain = await controller.chain()

		expect(portal.importHandler).toHaveBeenCalledWith('discordjs', 'middleware', 'auth')
		expect(chain[0].handler).toBe(handler)
	})

	it('chain() skips disabled middleware (enabled: false)', async () => {
		const handler = fn()

		portal.getByType.mockReturnValue({
			auth: { enabled: true, metadata: {}, handler: { default: handler } },
			disabled: { enabled: false, metadata: {}, handler: { default: fn() } }
		})

		const controller = createMiddlewareNamespaceController()
		const chain = await controller.chain()

		expect(chain).toHaveLength(1)
		expect(chain[0].key).toBe('auth')
	})

	it('chain() skips middleware with no handler.default', async () => {
		const record = { enabled: true, metadata: {}, handler: null }

		portal.importHandler.mockImplementation(async () => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			;(record as any).handler = { config: {} } // No default export
		})
		portal.getByType.mockReturnValue({ broken: record })

		const controller = createMiddlewareNamespaceController()
		const chain = await controller.chain()

		expect(chain).toEqual([])
	})

	it('chain() returns entries sorted by order (lower first)', async () => {
		const handler1 = fn()
		const handler2 = fn()
		const handler3 = fn()

		portal.getByType.mockReturnValue({
			logging: { enabled: true, metadata: { order: 10 }, handler: { default: handler1 } },
			auth: { enabled: true, metadata: { order: 5 }, handler: { default: handler2 } },
			rate: { enabled: true, metadata: { order: 15 }, handler: { default: handler3 } }
		})

		const controller = createMiddlewareNamespaceController()
		const chain = await controller.chain()

		expect(chain).toHaveLength(3)
		expect(chain[0].key).toBe('auth')
		expect(chain[0].order).toBe(5)
		expect(chain[1].key).toBe('logging')
		expect(chain[1].order).toBe(10)
		expect(chain[2].key).toBe('rate')
		expect(chain[2].order).toBe(15)
	})

	it('chain() handles array records (takes first element)', async () => {
		const handler = fn()

		portal.getByType.mockReturnValue({
			auth: [{ enabled: true, metadata: { order: 1 }, handler: { default: handler } }]
		})

		const controller = createMiddlewareNamespaceController()
		const chain = await controller.chain()

		expect(chain).toHaveLength(1)
		expect(chain[0].key).toBe('auth')
	})

	it('chain() defaults order to 0 when metadata.order missing', async () => {
		const handler = fn()

		portal.getByType.mockReturnValue({
			auth: { enabled: true, metadata: {}, handler: { default: handler } }
		})

		const controller = createMiddlewareNamespaceController()
		const chain = await controller.chain()

		expect(chain[0].order).toBe(0)
	})
})

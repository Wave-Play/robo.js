/**
 * Tests for controller factories
 *
 * Verifies that:
 * - Controller factories create proper controllers
 * - isEnabled/setEnabled works correctly
 * - Server restrictions work correctly
 * - Middleware ordering works
 * - Namespace controllers provide list/get/execute methods
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals'

// Helper for typed mocks
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fn = jest.fn as any

// Import from 'robo.js' to use the mocked module
const roboMock = (await import('robo.js')) as unknown as {
	Manifest: {
		routeSummariesSync: jest.Mock
	}
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

// Import controllers
import {
	createCommandController,
	createContextController,
	createEventController,
	createMiddlewareController,
	createPrefixCommandController
} from '../src/core/controllers.js'

import {
	createCommandsNamespaceController,
	createEventsNamespaceController,
	createContextNamespaceController,
	createMiddlewareNamespaceController,
	createPrefixCommandsNamespaceController
} from '../src/core/namespace-controllers.js'

describe('Controllers', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		clearRouteSummaries()
	})

	describe('createCommandController', () => {
		it('should return controller with all methods', () => {
			const record = { enabled: true, metadata: {} }
			const controller = createCommandController('ping', record, null)

			expect(controller.isEnabled).toBeDefined()
			expect(controller.setEnabled).toBeDefined()
			expect(controller.setServerOnly).toBeDefined()
			expect(controller.isEnabledForServer).toBeDefined()
			expect(controller.getMetadata).toBeDefined()
		})

		it('should return enabled state', () => {
			const record = { enabled: true, metadata: {} }
			const controller = createCommandController('ping', record, null)

			expect(controller.isEnabled()).toBe(true)
		})

		it('should toggle enabled state', () => {
			const record = { enabled: true, metadata: {} }
			const controller = createCommandController('ping', record, null)

			controller.setEnabled(false)
			expect(controller.isEnabled()).toBe(false)

			controller.setEnabled(true)
			expect(controller.isEnabled()).toBe(true)
		})

		it('should handle string server restriction', () => {
			const record = { enabled: true, metadata: {} }
			const state = { serverRestrictions: new Map(), config: {} }
			const controller = createCommandController('ping', record, state)

			controller.setServerOnly('123456789')

			expect(controller.isEnabledForServer('123456789')).toBe(true)
			expect(controller.isEnabledForServer('987654321')).toBe(false)
		})

		it('should handle array server restrictions', () => {
			const record = { enabled: true, metadata: {} }
			const state = { serverRestrictions: new Map(), config: {} }
			const controller = createCommandController('ping', record, state)

			controller.setServerOnly(['123', '456', '789'])

			expect(controller.isEnabledForServer('123')).toBe(true)
			expect(controller.isEnabledForServer('456')).toBe(true)
			expect(controller.isEnabledForServer('789')).toBe(true)
			expect(controller.isEnabledForServer('000')).toBe(false)
		})

		it('should return true for all servers when no restrictions', () => {
			const record = { enabled: true, metadata: {} }
			const state = { serverRestrictions: new Map(), config: {} }
			const controller = createCommandController('ping', record, state)

			expect(controller.isEnabledForServer('any-server')).toBe(true)
		})

		it('should return false when disabled regardless of server', () => {
			const record = { enabled: false, metadata: {} }
			const state = { serverRestrictions: new Map(), config: {} }
			const controller = createCommandController('ping', record, state)

			controller.setServerOnly('123')

			expect(controller.isEnabledForServer('123')).toBe(false)
		})

		it('should return metadata', () => {
			const metadata = { description: 'Test command', permissions: ['SEND_MESSAGES'] }
			const record = { enabled: true, metadata }
			const controller = createCommandController('ping', record, null)

			expect(controller.getMetadata()).toBe(metadata)
		})

		it('should create default state when null passed', () => {
			const record = { enabled: true, metadata: {} }
			const controller = createCommandController('ping', record, null)

			// Should not throw when setting restrictions
			expect(() => controller.setServerOnly('123')).not.toThrow()
		})

		it('should initialize serverRestrictions if missing from state', () => {
			const record = { enabled: true, metadata: {} }
			const state = { config: {} } // Missing serverRestrictions
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const controller = createCommandController('ping', record, state as any)

			expect(() => controller.setServerOnly('123')).not.toThrow()
		})
	})

	describe('createContextController', () => {
		it('should return controller with all methods', () => {
			const record = { enabled: true, metadata: {} }
			const controller = createContextController('Get User Info', record, null)

			expect(controller.isEnabled).toBeDefined()
			expect(controller.setEnabled).toBeDefined()
			expect(controller.setServerOnly).toBeDefined()
			expect(controller.isEnabledForServer).toBeDefined()
			expect(controller.getMetadata).toBeDefined()
		})

		it('should use context-specific key for restrictions', () => {
			const record = { enabled: true, metadata: {} }
			const state = { serverRestrictions: new Map(), config: {} }
			const controller = createContextController('Get User Info', record, state)

			controller.setServerOnly('123')

			// Check the key used internally
			expect(state.serverRestrictions.has('context:Get User Info')).toBe(true)
		})
	})

	describe('createEventController', () => {
		it('should return controller with all methods', () => {
			const record = { enabled: true, metadata: {} }
			const controller = createEventController('messageCreate', record, null)

			expect(controller.isEnabled).toBeDefined()
			expect(controller.setEnabled).toBeDefined()
			expect(controller.setServerOnly).toBeDefined()
			expect(controller.isEnabledForServer).toBeDefined()
		})

		it('should use event-specific key for restrictions', () => {
			const record = { enabled: true, metadata: {} }
			const state = { serverRestrictions: new Map(), config: {} }
			const controller = createEventController('messageCreate', record, state)

			controller.setServerOnly('123')

			expect(state.serverRestrictions.has('event:messageCreate')).toBe(true)
		})
	})

	describe('createMiddlewareController', () => {
		it('should return controller with order methods', () => {
			const record = { enabled: true, metadata: {} }
			const controller = createMiddlewareController('auth', record, null)

			expect(controller.isEnabled).toBeDefined()
			expect(controller.setEnabled).toBeDefined()
			expect(controller.getOrder).toBeDefined()
			expect(controller.setOrder).toBeDefined()
		})

		it('should return order from metadata', () => {
			const record = { enabled: true, metadata: { order: 10 } }
			const controller = createMiddlewareController('auth', record, null)

			expect(controller.getOrder()).toBe(10)
		})

		it('should default order to 0', () => {
			const record = { enabled: true, metadata: {} }
			const controller = createMiddlewareController('auth', record, null)

			expect(controller.getOrder()).toBe(0)
		})

		it('should set order in metadata', () => {
			const record = { enabled: true, metadata: {} as { order?: number } }
			const controller = createMiddlewareController('auth', record, null)

			controller.setOrder(5)

			expect(controller.getOrder()).toBe(5)
			expect(record.metadata.order).toBe(5)
		})
	})

	describe('createPrefixCommandController', () => {
		it('should return controller with all methods', () => {
			const record = { enabled: true, metadata: {} }
			const controller = createPrefixCommandController('ping', record, null)

			expect(controller.isEnabled).toBeDefined()
			expect(controller.setEnabled).toBeDefined()
			expect(controller.setServerOnly).toBeDefined()
			expect(controller.isEnabledForServer).toBeDefined()
			expect(controller.getMetadata).toBeDefined()
		})

		it('should toggle enabled state', () => {
			const record = { enabled: true, metadata: {} }
			const controller = createPrefixCommandController('ping', record, null)

			expect(controller.isEnabled()).toBe(true)
			controller.setEnabled(false)
			expect(controller.isEnabled()).toBe(false)
			controller.setEnabled(true)
			expect(controller.isEnabled()).toBe(true)
		})

		it('should handle string server restriction', () => {
			const record = { enabled: true, metadata: {} }
			const state = { serverRestrictions: new Map(), config: {} }
			const controller = createPrefixCommandController('ping', record, state)

			controller.setServerOnly('123456789')

			expect(controller.isEnabledForServer('123456789')).toBe(true)
			expect(controller.isEnabledForServer('987654321')).toBe(false)
		})

		it('should handle array server restrictions', () => {
			const record = { enabled: true, metadata: {} }
			const state = { serverRestrictions: new Map(), config: {} }
			const controller = createPrefixCommandController('ping', record, state)

			controller.setServerOnly(['123', '456'])

			expect(controller.isEnabledForServer('123')).toBe(true)
			expect(controller.isEnabledForServer('456')).toBe(true)
			expect(controller.isEnabledForServer('789')).toBe(false)
		})

		it('should return true for all servers when no restrictions', () => {
			const record = { enabled: true, metadata: {} }
			const state = { serverRestrictions: new Map(), config: {} }
			const controller = createPrefixCommandController('ping', record, state)

			expect(controller.isEnabledForServer('any-server')).toBe(true)
		})

		it('should return false when disabled regardless of server', () => {
			const record = { enabled: false, metadata: {} }
			const state = { serverRestrictions: new Map(), config: {} }
			const controller = createPrefixCommandController('ping', record, state)

			controller.setServerOnly('123')

			expect(controller.isEnabledForServer('123')).toBe(false)
		})

		it('should use prefixCommand: key prefix for restrictions', () => {
			const record = { enabled: true, metadata: {} }
			const state = { serverRestrictions: new Map(), config: {} }
			const controller = createPrefixCommandController('ping', record, state)

			controller.setServerOnly('123')

			expect(state.serverRestrictions.has('prefixCommand:ping')).toBe(true)
		})

		it('should return metadata reference', () => {
			const metadata = { description: 'Test', aliases: ['p'] }
			const record = { enabled: true, metadata }
			const controller = createPrefixCommandController('ping', record, null)

			expect(controller.getMetadata()).toBe(metadata)
		})
	})
})

describe('Namespace Controllers', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		clearRouteSummaries()
	})

	describe('createCommandsNamespaceController', () => {
		it('should list all command keys', () => {
			setRouteSummaries('discordjs', 'commands', [{ key: 'ping' }, { key: 'help' }, { key: 'user info' }])

			const controller = createCommandsNamespaceController()
			const keys = controller.list()

			expect(keys).toEqual(['ping', 'help', 'user info'])
		})

		it('should return empty array when no commands', () => {
			const controller = createCommandsNamespaceController()
			const keys = controller.list()

			expect(keys).toEqual([])
		})

		it('should get handler by name', async () => {
			const mockHandler = fn()
			portal.getHandler.mockResolvedValue({ default: mockHandler })

			const controller = createCommandsNamespaceController()
			const handler = await controller.get('ping')

			expect(handler).toBe(mockHandler)
			expect(portal.getHandler).toHaveBeenCalledWith('discordjs', 'commands', 'ping')
		})

		it('should return null when handler not found', async () => {
			portal.getHandler.mockRejectedValue(new Error('Not found'))

			const controller = createCommandsNamespaceController()
			const handler = await controller.get('unknown')

			expect(handler).toBeNull()
		})

		it('should return null when handler has no default', async () => {
			portal.getHandler.mockResolvedValue({})

			const controller = createCommandsNamespaceController()
			const handler = await controller.get('ping')

			expect(handler).toBeNull()
		})
	})

	describe('createEventsNamespaceController', () => {
		it('should list all event keys', () => {
			setRouteSummaries('discordjs', 'events', [{ key: 'ready' }, { key: 'messageCreate' }, { key: 'guildCreate' }])

			const controller = createEventsNamespaceController()
			const keys = controller.list()

			expect(keys).toEqual(['ready', 'messageCreate', 'guildCreate'])
		})

		it('should return empty array for unknown event', async () => {
			portal.getByType.mockReturnValue({})

			const controller = createEventsNamespaceController()
			const handlers = await controller.get('unknown' as any)

			expect(portal.ensureRoute).toHaveBeenCalledWith('discordjs', 'events')
			expect(handlers).toEqual([])
		})

		it('should return array of handlers for event', async () => {
			const handler1 = fn()
			const handler2 = fn()

			portal.getByType.mockReturnValue({
				messageCreate: [
					{ handler: { default: handler1 } },
					{ handler: { default: handler2 } }
				]
			})

			const controller = createEventsNamespaceController()
			const handlers = await controller.get('messageCreate')

			expect(portal.ensureRoute).toHaveBeenCalledWith('discordjs', 'events')
			expect(handlers).toEqual([handler1, handler2])
		})

		it('should handle single record (not array)', async () => {
			const handler = fn()

			portal.getByType.mockReturnValue({
				ready: { handler: { default: handler } }
			})

			const controller = createEventsNamespaceController()
			const handlers = await controller.get('ready')

			expect(portal.ensureRoute).toHaveBeenCalledWith('discordjs', 'events')
			expect(handlers).toEqual([handler])
		})

		it('should import handler if not loaded', async () => {
			const handler = fn()
			const record = { handler: null }

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			portal.importHandler.mockImplementation((async () => {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				;(record as any).handler = { default: handler }
			}) as any)

			portal.getByType.mockReturnValue({
				ready: [record]
			})

			const controller = createEventsNamespaceController()
			const handlers = await controller.get('ready')

			expect(portal.importHandler).toHaveBeenCalledWith('discordjs', 'events', 'ready')
			expect(handlers).toEqual([handler])
		})
	})

	describe('createContextNamespaceController', () => {
		it('should list all context menu keys', () => {
			setRouteSummaries('discordjs', 'context', [{ key: 'Get User Info' }, { key: 'Report Message' }])

			const controller = createContextNamespaceController()
			const keys = controller.list()

			expect(keys).toEqual(['Get User Info', 'Report Message'])
		})

		it('should get handler by name', async () => {
			const mockHandler = fn()
			portal.getHandler.mockResolvedValue({ default: mockHandler })

			const controller = createContextNamespaceController()
			const handler = await controller.get('Get User Info')

			expect(handler).toBe(mockHandler)
			expect(portal.getHandler).toHaveBeenCalledWith('discordjs', 'context', 'Get User Info')
		})

		it('should return null when not found', async () => {
			portal.getHandler.mockRejectedValue(new Error('Not found'))

			const controller = createContextNamespaceController()
			const handler = await controller.get('Unknown')

			expect(handler).toBeNull()
		})
	})

	describe('createPrefixCommandsNamespaceController', () => {
		it('should list all prefix command keys', () => {
			setRouteSummaries('discordjs', 'prefixCommands', [{ key: 'ping' }, { key: 'admin ban' }])

			const controller = createPrefixCommandsNamespaceController()
			const keys = controller.list()

			expect(keys).toEqual(['ping', 'admin ban'])
		})

		it('should return empty array when no prefix commands', () => {
			const controller = createPrefixCommandsNamespaceController()
			const keys = controller.list()

			expect(keys).toEqual([])
		})

		it('should get handler by name', async () => {
			const mockHandler = fn()
			portal.getHandler.mockResolvedValue({ default: mockHandler })

			const controller = createPrefixCommandsNamespaceController()
			const handler = await controller.get('ping')

			expect(handler).toBe(mockHandler)
			expect(portal.getHandler).toHaveBeenCalledWith('discordjs', 'prefixCommands', 'ping')
		})

		it('should return null when handler not found', async () => {
			portal.getHandler.mockRejectedValue(new Error('Not found'))

			const controller = createPrefixCommandsNamespaceController()
			const handler = await controller.get('unknown')

			expect(handler).toBeNull()
		})

		it('should return null when handler has no default', async () => {
			portal.getHandler.mockResolvedValue({})

			const controller = createPrefixCommandsNamespaceController()
			const handler = await controller.get('ping')

			expect(handler).toBeNull()
		})

		it('should execute prefix command with joined args', async () => {
			// execute() calls executePrefixCommandHandler which imports from prefix-command.ts
			// We'll verify it calls through to portal.ensureRoute at minimum
			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(null)

			const controller = createPrefixCommandsNamespaceController()
			const mockMessage = { reply: fn(), author: { id: '1' }, guild: null } as any
			await controller.execute('ping', mockMessage, ['arg1', 'arg2'])

			// It should have tried to ensure the route
			expect(portal.ensureRoute).toHaveBeenCalledWith('discordjs', 'prefixCommands')
		})
	})

	describe('createMiddlewareNamespaceController', () => {
		it('should list all middleware keys', () => {
			setRouteSummaries('discordjs', 'middleware', [{ key: 'auth' }, { key: 'logging' }])

			const controller = createMiddlewareNamespaceController()
			const keys = controller.list()

			expect(keys).toEqual(['auth', 'logging'])
		})

		it('should return ordered chain', async () => {
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

			expect(portal.ensureRoute).toHaveBeenCalledWith('discordjs', 'middleware')
			expect(chain).toHaveLength(3)
			expect(chain[0].key).toBe('auth')
			expect(chain[0].order).toBe(5)
			expect(chain[1].key).toBe('logging')
			expect(chain[1].order).toBe(10)
			expect(chain[2].key).toBe('rate')
			expect(chain[2].order).toBe(15)
		})

		it('should filter out disabled middleware', async () => {
			const handler1 = fn()
			const handler2 = fn()

			portal.getByType.mockReturnValue({
				auth: { enabled: true, metadata: {}, handler: { default: handler1 } },
				disabled: { enabled: false, metadata: {}, handler: { default: handler2 } }
			})

			const controller = createMiddlewareNamespaceController()
			const chain = await controller.chain()

			expect(portal.ensureRoute).toHaveBeenCalledWith('discordjs', 'middleware')
			expect(chain).toHaveLength(1)
			expect(chain[0].key).toBe('auth')
		})

		it('should default order to 0', async () => {
			const handler = fn()

			portal.getByType.mockReturnValue({
				auth: { enabled: true, metadata: {}, handler: { default: handler } }
			})

			const controller = createMiddlewareNamespaceController()
			const chain = await controller.chain()

			expect(chain[0].order).toBe(0)
		})

		it('should import handler if not loaded', async () => {
			const handler = fn()
			const record = { enabled: true, metadata: {}, handler: null }

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			portal.importHandler.mockImplementation((async () => {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				;(record as any).handler = { default: handler }
			}) as any)

			portal.getByType.mockReturnValue({ auth: record })

			const controller = createMiddlewareNamespaceController()
			const chain = await controller.chain()

			expect(portal.importHandler).toHaveBeenCalledWith('discordjs', 'middleware', 'auth')
			expect(chain[0].handler).toBe(handler)
		})

		it('should handle array record (use first)', async () => {
			const handler = fn()

			portal.getByType.mockReturnValue({
				auth: [{ enabled: true, metadata: { order: 1 }, handler: { default: handler } }]
			})

			const controller = createMiddlewareNamespaceController()
			const chain = await controller.chain()

			expect(chain).toHaveLength(1)
			expect(chain[0].key).toBe('auth')
		})
	})
})

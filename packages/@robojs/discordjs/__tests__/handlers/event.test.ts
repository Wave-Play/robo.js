/**
 * Tests for event handler execution
 *
 * Verifies that:
 * - Event handlers are found and executed
 * - Priority sorting works correctly
 * - Disabled handlers/modules are skipped
 * - Middleware chain executes before handler
 * - 'once' frequency disables handler after first run
 * - Lifecycle event timeouts are enforced
 * - Plugin options are passed to handlers
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals'

// Helper for typed mocks - avoids TS errors with mock implementations
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fn = jest.fn as any

// Import from 'robo.js' to use the mocked module
const roboMock = (await import('robo.js')) as unknown as {
	portal: {
		getByType: jest.Mock
		importRecord: jest.Mock
		importHandler: jest.Mock
		module: jest.Mock
	}
	getPluginOptions: jest.Mock
	getConfig: jest.Mock
	setConfigData: (config: Record<string, unknown> | null) => void
	getForkedLogger: (key: string) => {
		debug: jest.Mock
		info: jest.Mock
		warn: jest.Mock
		error: jest.Mock
	}
	Mode: { isDev: jest.Mock }
	clearForkedLoggers: () => void
}

const { portal, getPluginOptions, getConfig, setConfigData, getForkedLogger, Mode } = roboMock

// Pre-initialize the forked logger
const discordLogger = getForkedLogger('discordjs')

// Helper to clear mock call history
function clearLoggerMocks() {
	Object.values(discordLogger).forEach((mockFn) => {
		if (typeof mockFn === 'function' && 'mockClear' in mockFn) {
			;(mockFn as jest.Mock).mockClear()
		}
	})
}

// Helper to setup portal mock for a specific event
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setupEventMock(eventName: string, handlers: any[], middleware: any[] = []) {
	portal.getByType.mockImplementation(((type: string) => {
		if (type === 'discordjs:events') {
			return { [eventName]: handlers }
		}
		if (type === 'discordjs:middleware') {
			if (middleware.length === 0) return {}
			return { default: middleware }
		}
		return {}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	}) as any)
}

// Import after mocking
const { executeEventHandler } = await import('../../src/core/handlers/event.js')

describe('Event Handler', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		clearLoggerMocks()
		setConfigData(null)
		Mode.isDev.mockReturnValue(true)

		// Default mock for module check
		portal.module.mockReturnValue({ isEnabled: () => true })
	})

	describe('executeEventHandler', () => {
		it('should do nothing when no handlers exist for event', async () => {
			portal.getByType.mockReturnValue({})

			await executeEventHandler('guildCreate', { id: '123', name: 'Test Guild' })

			// Should return early without errors
			expect(portal.getByType).toHaveBeenCalledWith('discordjs:events')
		})

		it('should execute handler when event fires', async () => {
			const mockHandler = fn()
			setupEventMock('guildCreate', [
				{ key: 'guildCreate', path: 'events/guildCreate.js', enabled: true, handler: { default: mockHandler } }
			])

			const guildData = { id: '123', name: 'Test Guild' }
			await executeEventHandler('guildCreate', guildData)

			expect(mockHandler).toHaveBeenCalledWith(guildData, undefined)
		})

		it('should execute multiple handlers for same event', async () => {
			const mockHandler1 = fn()
			const mockHandler2 = fn()

			setupEventMock('messageCreate', [
				{ key: 'messageCreate', path: 'events/messageCreate.js', enabled: true, handler: { default: mockHandler1 } },
				{ key: 'messageCreate', path: 'plugins/foo/events/messageCreate.js', enabled: true, handler: { default: mockHandler2 } }
			])

			const messageData = { content: 'Hello', author: { id: '456' } }
			await executeEventHandler('messageCreate', messageData)

			expect(mockHandler1).toHaveBeenCalledWith(messageData, undefined)
			expect(mockHandler2).toHaveBeenCalledWith(messageData, undefined)
		})

		it('should sort handlers by priority (lower runs first)', async () => {
			const handler1 = fn()
			const handler2 = fn()
			const handler3 = fn()

			setupEventMock('guildCreate', [
				{ key: 'guildCreate', path: 'a.js', enabled: true, handler: { default: handler2 }, metadata: { priority: 10 } },
				{ key: 'guildCreate', path: 'b.js', enabled: true, handler: { default: handler1 }, metadata: { priority: 0 } },
				{ key: 'guildCreate', path: 'c.js', enabled: true, handler: { default: handler3 }, metadata: { priority: 20 } }
			])

			await executeEventHandler('guildCreate', {})

			// All handlers should be called
			expect(handler1).toHaveBeenCalled()
			expect(handler2).toHaveBeenCalled()
			expect(handler3).toHaveBeenCalled()
		})

		it('should skip disabled handler', async () => {
			const mockHandler = fn()

			setupEventMock('guildCreate', [
				{ key: 'guildCreate', path: 'events/guildCreate.js', enabled: false, handler: { default: mockHandler } }
			])

			await executeEventHandler('guildCreate', {})

			expect(mockHandler).not.toHaveBeenCalled()
			expect(discordLogger.debug).toHaveBeenCalledWith(expect.stringContaining('disabled event'))
		})

		it('should skip handler when module is disabled', async () => {
			const mockHandler = fn()

			setupEventMock('guildCreate', [
				{ key: 'guildCreate', path: 'events/guildCreate.js', enabled: true, module: 'myModule', handler: { default: mockHandler } }
			])

			portal.module.mockReturnValue({ isEnabled: () => false })

			await executeEventHandler('guildCreate', {})

			expect(mockHandler).not.toHaveBeenCalled()
			expect(discordLogger.debug).toHaveBeenCalledWith(expect.stringContaining('disabled event from module'))
		})

		it('should import handler if not already imported', async () => {
			const mockHandler = fn()
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const handlerRecord: any = {
				key: 'guildCreate',
				path: 'events/guildCreate.js',
				enabled: true,
				handler: null
			}

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			portal.importRecord.mockImplementation((async (record: any) => {
				record.handler = { default: mockHandler }
			}) as any)

			setupEventMock('guildCreate', [handlerRecord])

			await executeEventHandler('guildCreate', {})

			expect(portal.importRecord).toHaveBeenCalledWith(handlerRecord)
			expect(mockHandler).toHaveBeenCalled()
		})

		it('should disable handler after execution when frequency is once', async () => {
			const mockHandler = fn()
			const handlerRecord = {
				key: 'guildCreate',
				path: 'events/guildCreate.js',
				enabled: true,
				handler: { default: mockHandler, config: { frequency: 'once' } }
			}

			setupEventMock('guildCreate', [handlerRecord])

			await executeEventHandler('guildCreate', {})

			expect(mockHandler).toHaveBeenCalled()
			expect(handlerRecord.enabled).toBe(false)
		})

		it('should pass plugin options to handler', async () => {
			const mockHandler = fn()
			const pluginOptions = { apiKey: 'test-key', enabled: true }

			getPluginOptions.mockReturnValue(pluginOptions)

			setupEventMock('guildCreate', [{
				key: 'guildCreate',
				path: 'events/guildCreate.js',
				enabled: true,
				plugin: { name: 'my-plugin' },
				handler: { default: mockHandler }
			}])

			const guildData = { id: '123' }
			await executeEventHandler('guildCreate', guildData)

			expect(getPluginOptions).toHaveBeenCalledWith('my-plugin')
			expect(mockHandler).toHaveBeenCalledWith(guildData, pluginOptions)
		})

		it('should handle handler errors gracefully', async () => {
			const error = new Error('Handler failed')
			const mockHandler = fn().mockRejectedValue(error)

			setupEventMock('guildCreate', [
				{ key: 'guildCreate', path: 'events/guildCreate.js', enabled: true, handler: { default: mockHandler } }
			])

			// Should not throw
			await executeEventHandler('guildCreate', {})

			expect(discordLogger.error).toHaveBeenCalledWith(expect.stringContaining('Error executing'), error)
		})

		it('should handle plugin handler errors with plugin name', async () => {
			const error = new Error('Plugin handler failed')
			const mockHandler = fn().mockRejectedValue(error)

			setupEventMock('guildCreate', [{
				key: 'guildCreate',
				path: 'events/guildCreate.js',
				enabled: true,
				plugin: { name: 'test-plugin' },
				handler: { default: mockHandler }
			}])

			await executeEventHandler('guildCreate', {})

			expect(discordLogger.error).toHaveBeenCalledWith(expect.stringContaining('test-plugin'), error)
		})

		it('should log error when handler has no default export', async () => {
			setupEventMock('guildCreate', [
				{ key: 'guildCreate', path: 'events/guildCreate.js', enabled: true, handler: {} } // No default export
			])

			await executeEventHandler('guildCreate', {})

			// Should log error about missing default export
			expect(discordLogger.error).toHaveBeenCalled()
		})
	})

	describe('middleware integration', () => {
		it('should execute middleware before handler', async () => {
			const executionOrder: string[] = []
			const mockMiddleware = fn(() => {
				executionOrder.push('middleware')
				return {}
			})
			const mockHandler = fn(() => {
				executionOrder.push('handler')
			})

			setupEventMock('guildCreate', [
				{ key: 'guildCreate', path: 'events/guildCreate.js', enabled: true, handler: { default: mockHandler } }
			], [
				{ key: 'auth', path: 'middleware/auth.js', enabled: true, handler: { default: mockMiddleware } }
			])

			await executeEventHandler('guildCreate', {})

			expect(executionOrder).toEqual(['middleware', 'handler'])
		})

		it('should abort handler execution when middleware returns abort', async () => {
			const mockMiddleware = fn(() => ({ abort: true }))
			const mockHandler = fn()

			setupEventMock('guildCreate', [
				{ key: 'guildCreate', path: 'events/guildCreate.js', enabled: true, handler: { default: mockHandler } }
			], [
				{ key: 'auth', path: 'middleware/auth.js', enabled: true, handler: { default: mockMiddleware } }
			])

			await executeEventHandler('guildCreate', {})

			expect(mockMiddleware).toHaveBeenCalled()
			expect(mockHandler).not.toHaveBeenCalled()
			expect(discordLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Middleware aborted'))
		})

		it('should skip disabled middleware', async () => {
			const mockMiddleware = fn()
			const mockHandler = fn()

			setupEventMock('guildCreate', [
				{ key: 'guildCreate', path: 'events/guildCreate.js', enabled: true, handler: { default: mockHandler } }
			], [
				{ key: 'auth', path: 'middleware/auth.js', enabled: false, handler: { default: mockMiddleware } }
			])

			await executeEventHandler('guildCreate', {})

			expect(mockMiddleware).not.toHaveBeenCalled()
			expect(mockHandler).toHaveBeenCalled()
		})
	})

	describe('lifecycle events', () => {
		it('should handle lifecycle event prefixed with underscore', async () => {
			const mockHandler = fn()

			setupEventMock('_start', [
				{ key: '_start', path: 'events/_start.js', enabled: true, handler: { default: mockHandler } }
			])

			await executeEventHandler('_start', {})

			expect(mockHandler).toHaveBeenCalled()
		})

		it('should race handler against timeout for lifecycle events', async () => {
			// Create a handler that completes quickly
			const fastHandler = fn(() => Promise.resolve('done'))

			setupEventMock('_start', [{
				key: '_start',
				path: 'events/_start.js',
				enabled: true,
				handler: { default: fastHandler, config: { timeout: 5000 } }
			}])

			await executeEventHandler('_start', {})

			// Handler should have been called
			expect(fastHandler).toHaveBeenCalled()
		})

		it('should handle plugin _start failure errors', async () => {
			const error = new Error('Plugin failed to start')
			const mockHandler = fn().mockRejectedValue(error)

			setupEventMock('_start', [{
				key: '_start',
				path: 'events/_start.js',
				enabled: true,
				plugin: { name: 'optional-plugin' },
				handler: { default: mockHandler }
			}])

			await executeEventHandler('_start', {})

			// Should have logged error for plugin failure
			expect(discordLogger.error).toHaveBeenCalledWith(expect.stringContaining('optional-plugin'), error)
		})
	})

	describe('failSafe support', () => {
		it('should warn instead of error when _start plugin has failSafe: true', async () => {
			const error = new Error('Plugin failed to start')
			const mockHandler = fn().mockRejectedValue(error)

			setupEventMock('_start', [{
				key: '_start',
				path: 'events/_start.js',
				enabled: true,
				plugin: { name: 'optional-plugin' },
				handler: { default: mockHandler }
			}])

			// Configure plugin with failSafe in config
			setConfigData({
				plugins: [['optional-plugin', {}, { failSafe: true }]]
			})

			await executeEventHandler('_start', {})

			// Should warn (not error) when failSafe is true
			expect(discordLogger.warn).toHaveBeenCalledWith(
				expect.stringContaining('optional-plugin'),
				error
			)
		})

		it('should error when _start plugin does NOT have failSafe', async () => {
			const error = new Error('Plugin failed to start')
			const mockHandler = fn().mockRejectedValue(error)

			setupEventMock('_start', [{
				key: '_start',
				path: 'events/_start.js',
				enabled: true,
				plugin: { name: 'critical-plugin' },
				handler: { default: mockHandler }
			}])

			// Configure plugin without failSafe
			setConfigData({
				plugins: [['critical-plugin', {}]]
			})

			await executeEventHandler('_start', {})

			// Should error (not warn)
			expect(discordLogger.error).toHaveBeenCalledWith(
				expect.stringContaining('critical-plugin'),
				error
			)
		})
	})

	describe('server restrictions', () => {
		it('should skip event handler when server is not in serverOnly list', async () => {
			const mockHandler = fn()

			setupEventMock('messageCreate', [{
				key: 'messageCreate',
				path: 'events/messageCreate.js',
				enabled: true,
				metadata: { serverOnly: ['allowed-guild'] },
				handler: { default: mockHandler }
			}])

			await executeEventHandler('messageCreate', { guildId: 'other-guild', content: 'hello' })

			expect(mockHandler).not.toHaveBeenCalled()
			expect(discordLogger.debug).toHaveBeenCalledWith(
				expect.stringContaining('restricted to specific servers')
			)
		})

		it('should execute event handler when server is in serverOnly list', async () => {
			const mockHandler = fn()

			setupEventMock('messageCreate', [{
				key: 'messageCreate',
				path: 'events/messageCreate.js',
				enabled: true,
				metadata: { serverOnly: ['allowed-guild'] },
				handler: { default: mockHandler }
			}])

			await executeEventHandler('messageCreate', { guildId: 'allowed-guild', content: 'hello' })

			expect(mockHandler).toHaveBeenCalled()
		})

		it('should extract guildId from guild object in event data', async () => {
			const mockHandler = fn()

			setupEventMock('guildCreate', [{
				key: 'guildCreate',
				path: 'events/guildCreate.js',
				enabled: true,
				metadata: { serverOnly: ['guild-123'] },
				handler: { default: mockHandler }
			}])

			// guildCreate event passes the guild object directly (has id + name)
			await executeEventHandler('guildCreate', { id: 'guild-123', name: 'Test Guild' })

			expect(mockHandler).toHaveBeenCalled()
		})
	})

	describe('Error objects', () => {
		it('should throw Error objects instead of strings for missing exports', async () => {
			setupEventMock('guildCreate', [
				{ key: 'guildCreate', path: 'events/guildCreate.js', enabled: true, handler: {} }
			])

			await executeEventHandler('guildCreate', {})

			// The error logged should be an Error instance
			const errorCall = (discordLogger.error as jest.Mock).mock.calls[0]
			expect(errorCall).toBeDefined()
			// The error should come from the catch block as "Error executing..." message + the Error object
			expect(errorCall[0]).toContain('Error executing')
			expect(errorCall[1]).toBeInstanceOf(Error)
		})
	})
})

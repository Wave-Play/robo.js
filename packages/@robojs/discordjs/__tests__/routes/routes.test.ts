/**
 * Tests for route definitions
 *
 * Verifies that:
 * - Route configs have correct key styles and settings
 * - Route processors transform entries correctly
 * - Namespace controllers provide list/get/execute/emit methods
 */

import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals'

// Helper for typed mocks
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fn = jest.fn as any

// Mock handlers to prevent actual execution
jest.unstable_mockModule('../../src/core/handlers/command.js', () => ({
	executeCommandHandler: jest.fn()
}))

jest.unstable_mockModule('../../src/core/handlers/event.js', () => ({
	executeEventHandler: jest.fn()
}))

// Declare variables for async imports (assigned in beforeAll)
let portal: {
	getByType: jest.Mock
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	getHandler: jest.Mock<any>
	getRecord: jest.Mock
	importHandler: jest.Mock
	ensureRoute: jest.Mock
}
let setRouteSummaries: (namespace: string, route: string, summaries: Array<{ key: string }>) => void
let clearRouteSummaries: () => void
let executeCommandHandler: jest.Mock
let executeEventHandler: jest.Mock

// Import route modules
import commandsRoute, { config as commandsConfig, NamespaceController as CommandsNS } from '../../src/robo/routes/commands.js'
import contextRoute, { config as contextConfig, NamespaceController as ContextNS } from '../../src/robo/routes/context.js'
import eventsRoute, { config as eventsConfig, NamespaceController as EventsNS } from '../../src/robo/routes/events.js'
import middlewareRoute, { config as middlewareConfig, NamespaceController as MiddlewareNS } from '../../src/robo/routes/middleware.js'

describe('Route Definitions', () => {
	beforeAll(async () => {
		// Import from 'robo.js' to use the mocked module
		const roboMock = (await import('robo.js')) as unknown as {
			setRouteSummaries: (namespace: string, route: string, summaries: Array<{ key: string }>) => void
			clearRouteSummaries: () => void
			portal: typeof portal
		}
		portal = roboMock.portal
		setRouteSummaries = roboMock.setRouteSummaries
		clearRouteSummaries = roboMock.clearRouteSummaries

		const commandMod = (await import('../../src/core/handlers/command.js')) as { executeCommandHandler: jest.Mock }
		executeCommandHandler = commandMod.executeCommandHandler

		const eventMod = (await import('../../src/core/handlers/event.js')) as { executeEventHandler: jest.Mock }
		executeEventHandler = eventMod.executeEventHandler
	})

	beforeEach(() => {
		jest.clearAllMocks()
		clearRouteSummaries()
	})

	describe('Commands Route', () => {
		describe('config', () => {
			it('should use filepath key style with space separator', () => {
				expect(commandsConfig.key.style).toBe('filepath')
				expect(commandsConfig.key.separator).toBe(' ')
			})

			it('should have max depth of 3 for subcommand groups', () => {
				expect(commandsConfig.nesting?.maxDepth).toBe(3)
			})

			it('should not allow index files', () => {
				expect(commandsConfig.nesting?.allowIndex).toBe(false)
			})

			it('should require default export', () => {
				expect(commandsConfig.exports?.default).toBe('required')
			})

			it('should have optional config export', () => {
				expect(commandsConfig.exports?.config).toBe('optional')
			})

			it('should include autocomplete as named export', () => {
				expect(commandsConfig.exports?.named).toContain('autocomplete')
			})
		})

		describe('processor', () => {
			it('should process simple command entry', () => {
				const entry = {
					key: 'ping',
					filePath: 'src/commands/ping.ts',
					exports: {
						default: fn(),
						config: { description: 'Ping pong!' }
					}
				}

				const result = commandsRoute(entry as any)

				expect(result.key).toBe('ping')
				expect(result.path).toBe('src/commands/ping.js')
				expect(result.metadata.description).toBe('Ping pong!')
			})

			it('should use default description when not provided', () => {
				const entry = {
					key: 'test',
					filePath: 'src/commands/test.ts',
					exports: { default: fn() }
				}

				const result = commandsRoute(entry as any)

				expect(result.metadata.description).toBe('No description provided')
			})

			it('should detect subcommand from key', () => {
				const entry = {
					key: 'user ban',
					filePath: 'src/commands/user/ban.ts',
					exports: { default: fn() }
				}

				const result = commandsRoute(entry as any)

				expect(result.extra?.parent).toBe('user')
				expect(result.extra?.type).toBe('subcommand')
			})

			it('should detect subcommand group from key', () => {
				const entry = {
					key: 'config settings view',
					filePath: 'src/commands/config/settings/view.ts',
					exports: { default: fn() }
				}

				const result = commandsRoute(entry as any)

				expect(result.extra?.parent).toBe('config settings')
				expect(result.extra?.type).toBe('subcommand-group')
			})

			it('should extract command options from config', () => {
				const options = [
					{ name: 'target', type: 'user' as const, required: true }
				]
				const entry = {
					key: 'ban',
					filePath: 'src/commands/ban.ts',
					exports: {
						default: fn(),
						config: { description: 'Ban user', options }
					}
				}

				const result = commandsRoute(entry as any)

				expect(result.metadata.options).toEqual(options)
			})

			it('should include named exports', () => {
				const entry = {
					key: 'search',
					filePath: 'src/commands/search.ts',
					exports: {
						default: fn(),
						config: {},
						autocomplete: fn()
					}
				}

				const result = commandsRoute(entry as any)

				expect(result.exports.named).toContain('autocomplete')
			})
		})

		describe('NamespaceController', () => {
			it('should list all command keys', () => {
				setRouteSummaries('discordjs', 'commands', [{ key: 'ping' }, { key: 'help' }, { key: 'user ban' }])

				const controller = CommandsNS(portal as any)
				const keys = controller.list()

				expect(keys).toEqual(['ping', 'help', 'user ban'])
			})

			it('should get handler by name', async () => {
				const mockHandler = fn()
				portal.getHandler.mockResolvedValue({ default: mockHandler })

				const controller = CommandsNS(portal as any)
				const handler = await controller.get('ping')

				expect(handler).toBe(mockHandler)
				expect(portal.getHandler).toHaveBeenCalledWith('discordjs', 'commands', 'ping')
			})

			it('should return null when handler not found', async () => {
				portal.getHandler.mockRejectedValue(new Error('Not found'))

				const controller = CommandsNS(portal as any)
				const handler = await controller.get('unknown')

				expect(handler).toBeNull()
			})

			it('should have execute method', async () => {
				const mockInteraction = { commandName: 'ping', reply: fn() }

				const controller = CommandsNS(portal as any)

				// execute method should exist and be callable
				expect(controller.execute).toBeDefined()
				expect(typeof controller.execute).toBe('function')

				// Call should not throw (handler execution is tested separately)
				portal.getRecord = fn().mockReturnValue(undefined)
				await expect(controller.execute('ping', mockInteraction as any)).resolves.not.toThrow()
			})
		})
	})

	describe('Context Route', () => {
		describe('config', () => {
			it('should use filename key style', () => {
				expect(contextConfig.key.style).toBe('filename')
			})

			it('should have max depth of 2', () => {
				expect(contextConfig.nesting?.maxDepth).toBe(2)
			})

			it('should require default export', () => {
				expect(contextConfig.exports?.default).toBe('required')
			})
		})

		describe('processor', () => {
			it('should detect user context type from path', () => {
				const entry = {
					key: 'Get User Info',
					filePath: 'src/context/user/Get User Info.ts',
					exports: { default: fn() }
				}

				const result = contextRoute(entry as any)

				expect(result.metadata.contextType).toBe(2)
			})

			it('should detect message context type from path', () => {
				const entry = {
					key: 'Report Message',
					filePath: 'src/context/message/Report Message.ts',
					exports: { default: fn() }
				}

				const result = contextRoute(entry as any)

				expect(result.metadata.contextType).toBe(3)
			})

			it('should return undefined type for unknown path', () => {
				const entry = {
					key: 'Unknown',
					filePath: 'src/context/other/Unknown.ts',
					exports: { default: fn() }
				}

				const result = contextRoute(entry as any)

				expect(result.metadata.contextType).toBeUndefined()
			})
		})

		describe('NamespaceController', () => {
			it('should list all context menu keys', () => {
				setRouteSummaries('discordjs', 'context', [{ key: 'Get User Info' }, { key: 'Report Message' }])

				const controller = ContextNS(portal as any)
				const keys = controller.list()

				expect(keys).toEqual(['Get User Info', 'Report Message'])
			})

			it('should get handler by name', async () => {
				const mockHandler = fn()
				portal.getHandler.mockResolvedValue({ default: mockHandler })

				const controller = ContextNS(portal as any)
				const handler = await controller.get('Get User Info')

				expect(handler).toBe(mockHandler)
				expect(portal.getHandler).toHaveBeenCalledWith('discordjs', 'context', 'Get User Info')
			})

			it('should return null when not found', async () => {
				portal.getHandler.mockRejectedValue(new Error('Not found'))

				const controller = ContextNS(portal as any)
				const handler = await controller.get('Unknown')

				expect(handler).toBeNull()
			})
		})
	})

	describe('Events Route', () => {
		describe('config', () => {
			it('should use parentOrFilename key style', () => {
				expect(eventsConfig.key.style).toBe('parentOrFilename')
			})

			it('should allow multiple handlers per event', () => {
				expect(eventsConfig.multiple).toBe(true)
			})

			it('should filter out lifecycle events', () => {
				expect(eventsConfig.filter).toEqual(/^(?!_)/)
			})

			it('should require default export', () => {
				expect(eventsConfig.exports?.default).toBe('required')
			})
		})

		describe('processor', () => {
			it('should process simple event entry', () => {
				const entry = {
					key: 'ready',
					filePath: 'src/events/ready.ts',
					exports: { default: fn() }
				}

				const result = eventsRoute(entry as any)

				expect(result.key).toBe('ready')
				expect(result.path).toBe('src/events/ready.js')
			})

			it('should default frequency to always', () => {
				const entry = {
					key: 'messageCreate',
					filePath: 'src/events/messageCreate.ts',
					exports: { default: fn() }
				}

				const result = eventsRoute(entry as any)

				expect(result.metadata.frequency).toBe('always')
			})

			it('should use frequency from config', () => {
				const entry = {
					key: 'ready',
					filePath: 'src/events/ready.ts',
					exports: {
						default: fn(),
						config: { frequency: 'once' }
					}
				}

				const result = eventsRoute(entry as any)

				expect(result.metadata.frequency).toBe('once')
			})
		})

		describe('NamespaceController', () => {
			it('should list all event keys', () => {
				setRouteSummaries('discordjs', 'events', [{ key: 'ready' }, { key: 'messageCreate' }])

				const controller = EventsNS(portal as any)
				const keys = controller.list()

				expect(keys).toEqual(['ready', 'messageCreate'])
			})

			it('should get handlers for event', async () => {
				const handler1 = fn()
				const handler2 = fn()

				portal.getByType.mockReturnValue({
					messageCreate: [
						{ handler: { default: handler1 } },
						{ handler: { default: handler2 } }
					]
				})

				const controller = EventsNS(portal as any)
				const handlers = await controller.get('messageCreate')

				expect(portal.ensureRoute).toHaveBeenCalledWith('discordjs', 'events')
				expect(handlers).toEqual([handler1, handler2])
			})

			it('should return empty array for unknown event', async () => {
				portal.getByType.mockReturnValue({})

				const controller = EventsNS(portal as any)
				const handlers = await controller.get('unknown' as any)

				expect(portal.ensureRoute).toHaveBeenCalledWith('discordjs', 'events')
				expect(handlers).toEqual([])
			})

			it('should have emit method', async () => {
				portal.getByType.mockReturnValue({})

				const controller = EventsNS(portal as any)

				// emit method should exist and be callable
				expect(controller.emit).toBeDefined()
				expect(typeof controller.emit).toBe('function')

				// Call should not throw (event execution is tested separately)
				await expect(controller.emit('messageCreate', {} as any)).resolves.not.toThrow()
			})

			it('should import handler if not loaded', async () => {
				const handler = fn()
				const record = { handler: null as any }

				portal.getByType.mockReturnValue({
					ready: [record]
				})
				portal.importHandler.mockImplementation(async () => {
					record.handler = { default: handler }
				})

				const controller = EventsNS(portal as any)
				const handlers = await controller.get('ready')

				expect(portal.importHandler).toHaveBeenCalledWith('discordjs', 'events', 'ready')
				expect(handlers).toEqual([handler])
			})
		})
	})

	describe('Middleware Route', () => {
		describe('config', () => {
			it('should use filepath key style with slash separator', () => {
				expect(middlewareConfig.key.style).toBe('filepath')
				expect(middlewareConfig.key.separator).toBe('/')
			})

			it('should have max depth of 3', () => {
				expect(middlewareConfig.nesting?.maxDepth).toBe(3)
			})

			it('should allow index files', () => {
				expect(middlewareConfig.nesting?.allowIndex).toBe(true)
			})

			it('should require default export', () => {
				expect(middlewareConfig.exports?.default).toBe('required')
			})
		})

		describe('processor', () => {
			it('should process middleware entry', () => {
				const entry = {
					key: 'auth',
					filePath: 'src/middleware/auth.ts',
					exports: { default: fn() }
				}

				const result = middlewareRoute(entry as any)

				expect(result.key).toBe('auth')
				expect(result.path).toBe('src/middleware/auth.js')
			})

			it('should default order to 0', () => {
				const entry = {
					key: 'auth',
					filePath: 'src/middleware/auth.ts',
					exports: { default: fn() }
				}

				const result = middlewareRoute(entry as any)

				expect(result.metadata.order).toBe(0)
			})

			it('should use order from config', () => {
				const entry = {
					key: 'auth',
					filePath: 'src/middleware/auth.ts',
					exports: {
						default: fn(),
						config: { order: 10 }
					}
				}

				const result = middlewareRoute(entry as any)

				expect(result.metadata.order).toBe(10)
			})

			it('should default enabled to true', () => {
				const entry = {
					key: 'auth',
					filePath: 'src/middleware/auth.ts',
					exports: { default: fn() }
				}

				const result = middlewareRoute(entry as any)

				expect(result.metadata.enabled).toBe(true)
			})

			it('should use enabled from config', () => {
				const entry = {
					key: 'deprecated',
					filePath: 'src/middleware/deprecated.ts',
					exports: {
						default: fn(),
						config: { enabled: false }
					}
				}

				const result = middlewareRoute(entry as any)

				expect(result.metadata.enabled).toBe(false)
			})
		})

		describe('NamespaceController', () => {
			it('should list all middleware keys', () => {
				setRouteSummaries('discordjs', 'middleware', [{ key: 'auth' }, { key: 'logging' }])

				const controller = MiddlewareNS(portal as any)
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

				const controller = MiddlewareNS(portal as any)
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
					auth: { enabled: true, handler: { default: handler1 } },
					disabled: { enabled: false, handler: { default: handler2 } }
				})

				const controller = MiddlewareNS(portal as any)
				const chain = await controller.chain()

				expect(chain).toHaveLength(1)
				expect(chain[0].key).toBe('auth')
			})

			it('should default enabled to true', async () => {
				const handler = fn()

				portal.getByType.mockReturnValue({
					auth: { handler: { default: handler } }
				})

				const controller = MiddlewareNS(portal as any)
				const chain = await controller.chain()

				expect(chain).toHaveLength(1)
				expect(chain[0].enabled).toBe(true)
			})

			it('should default order to 0', async () => {
				const handler = fn()

				portal.getByType.mockReturnValue({
					auth: { enabled: true, handler: { default: handler } }
				})

				const controller = MiddlewareNS(portal as any)
				const chain = await controller.chain()

				expect(chain[0].order).toBe(0)
			})

			it('should import handler if not loaded', async () => {
				const handler = fn()
				const record = { enabled: true, handler: null as any }

				portal.getByType.mockReturnValue({ auth: record })
				portal.importHandler.mockImplementation(async () => {
					record.handler = { default: handler }
				})

				const controller = MiddlewareNS(portal as any)
				const chain = await controller.chain()

				expect(portal.importHandler).toHaveBeenCalledWith('discordjs', 'middleware', 'auth')
				expect(chain[0].handler).toBe(handler)
			})

			it('should handle array record (use first)', async () => {
				const handler = fn()

				portal.getByType.mockReturnValue({
					auth: [{ enabled: true, metadata: { order: 1 }, handler: { default: handler } }]
				})

				const controller = MiddlewareNS(portal as any)
				const chain = await controller.chain()

				expect(chain).toHaveLength(1)
				expect(chain[0].key).toBe('auth')
			})
		})
	})
})

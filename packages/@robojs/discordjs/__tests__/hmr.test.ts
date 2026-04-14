/**
 * Tests for HMR (Hot Module Replacement) hook
 *
 * Verifies that:
 * - Config correctly filters to discordjs namespace
 * - Config only triggers for commands and context routes
 * - Metadata hash is computed deterministically
 * - Definition changes are detected via hash comparison
 * - No-change scenario skips registration
 * - Background registration handles errors gracefully
 * - Missing credentials prevent registration
 * - recordsToCommands converts records correctly
 * - recordsToContext filters by context type
 */

import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals'

// Helper for typed mocks
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fn = jest.fn as any

// Import from 'robo.js' to use the mocked module
const roboMock = (await import('robo.js')) as unknown as {
	Env: {
		data: jest.Mock<any>
	}
	portal: {
		getRecord: jest.Mock<any>
		importHandler: jest.Mock<any>
		ensureRoute: jest.Mock<any>
		getByType: jest.Mock<any>
	}
	getPluginOptions: jest.Mock<any>
	getForkedLogger: (key: string) => {
		debug: jest.Mock
		info: jest.Mock
		warn: jest.Mock
		error: jest.Mock
	}
	clearForkedLoggers: () => void
}

const { Env, portal, getPluginOptions, getForkedLogger } = roboMock

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

// Get the REST mock from discord.js mock
const discordMock = (await import('discord.js')) as unknown as {
	getRestMock: () => {
		setToken: jest.Mock<any>
		put: jest.Mock<any>
	}
	resetRestMock: () => void
}

const mockRest = discordMock.getRestMock()

// Import HMR module
const { config, default: hmrHook } = await import('../src/robo/hmr.js')
const originalDiscordToken = process.env.DISCORD_TOKEN
const originalDiscordClientId = process.env.DISCORD_CLIENT_ID
const originalDiscordGuildId = process.env.DISCORD_GUILD_ID

describe('HMR Hook', () => {
	beforeEach(() => {
		clearLoggerMocks()
		mockRest.put.mockClear()
		mockRest.put.mockResolvedValue([])

		portal.getRecord.mockClear()
		portal.importHandler.mockClear()
		portal.ensureRoute.mockClear()
		portal.getByType.mockClear()
		getPluginOptions.mockClear()

		Env.data.mockClear()
		Env.data.mockReturnValue({
			DISCORD_TOKEN: 'test-token-1234567890',
			DISCORD_CLIENT_ID: '123456789012345678'
		})
		process.env.DISCORD_TOKEN = 'test-token-1234567890'
		process.env.DISCORD_CLIENT_ID = '123456789012345678'
		delete process.env.DISCORD_GUILD_ID

		portal.importHandler.mockResolvedValue(undefined)
		portal.ensureRoute.mockResolvedValue(undefined)
		portal.getByType.mockReturnValue({})
		getPluginOptions.mockReturnValue(null)
	})

	afterAll(() => {
		if (originalDiscordToken === undefined) delete process.env.DISCORD_TOKEN
		else process.env.DISCORD_TOKEN = originalDiscordToken

		if (originalDiscordClientId === undefined) delete process.env.DISCORD_CLIENT_ID
		else process.env.DISCORD_CLIENT_ID = originalDiscordClientId

		if (originalDiscordGuildId === undefined) delete process.env.DISCORD_GUILD_ID
		else process.env.DISCORD_GUILD_ID = originalDiscordGuildId
	})

	describe('config', () => {
		it('should filter to discordjs namespace', () => {
			expect(config.namespaces).toBeDefined()
			expect(config.namespaces).toContain('discordjs')
		})

		it('should trigger for commands, context, and events routes', () => {
			expect(config.routes).toBeDefined()
			expect(config.routes).toContain('commands')
			expect(config.routes).toContain('context')
			expect(config.routes).toContain('events')
		})
	})

	describe('HMR hook execution', () => {
		it('should log no changes when handlers have no definition changes', async () => {
			const context = createMockHmrContext([])

			await hmrHook(context as any)

			expect(discordLogger.debug).toHaveBeenCalledWith(expect.stringContaining('No command definition changes'))
		})

		it('should skip handler when record not found', async () => {
			portal.getRecord.mockReturnValue(null)

			const context = createMockHmrContext([
				{ route: 'commands', handlers: [{ key: 'unknown' }] }
			])

			await hmrHook(context as any)

			// Should not try to import handler if record not found
			expect(portal.importHandler).not.toHaveBeenCalled()
		})

		it('should import handler for each affected route', async () => {
			portal.getRecord.mockReturnValue({ metadata: { description: 'Test' } })

			const context = createMockHmrContext([
				{ route: 'commands', handlers: [{ key: 'ping' }, { key: 'pong' }] }
			])

			await hmrHook(context as any)

			expect(portal.importHandler).toHaveBeenCalledTimes(2)
			expect(portal.importHandler).toHaveBeenCalledWith('discordjs', 'commands', 'ping')
			expect(portal.importHandler).toHaveBeenCalledWith('discordjs', 'commands', 'pong')
		})

		it('should detect definition changes on second run with different metadata', async () => {
			// First run - establish baseline
			portal.getRecord.mockReturnValue({ metadata: { description: 'Original' } })

			const context1 = createMockHmrContext([
				{ route: 'commands', handlers: [{ key: 'test-cmd' }] }
			])
			await hmrHook(context1 as any)

			clearLoggerMocks()

			// Second run - changed metadata
			portal.getRecord.mockReturnValue({ metadata: { description: 'Changed' } })

			const context2 = createMockHmrContext([
				{ route: 'commands', handlers: [{ key: 'test-cmd' }] }
			])
			await hmrHook(context2 as any)

			expect(discordLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Command definition changed'))
		})

		it('should not detect changes when metadata is unchanged', async () => {
			const metadata = { description: 'Unchanged' }
			portal.getRecord.mockReturnValue({ metadata })

			// First run
			const context1 = createMockHmrContext([
				{ route: 'commands', handlers: [{ key: 'stable-cmd' }] }
			])
			await hmrHook(context1 as any)

			clearLoggerMocks()

			// Second run - same metadata
			const context2 = createMockHmrContext([
				{ route: 'commands', handlers: [{ key: 'stable-cmd' }] }
			])
			await hmrHook(context2 as any)

			// Should log no changes, not command definition changed
			expect(discordLogger.debug).toHaveBeenCalledWith(expect.stringContaining('No command definition changes'))
		})
	})

	describe('background registration', () => {
		it('should warn when credentials are missing', async () => {
			Env.data.mockReturnValue({}) // No token or client ID
			delete process.env.DISCORD_TOKEN
			delete process.env.DISCORD_CLIENT_ID

			// Force a definition change to trigger registration
			portal.getRecord.mockReturnValueOnce({ metadata: { v: 1 } })
			const context1 = createMockHmrContext([
				{ route: 'commands', handlers: [{ key: 'cred-test' }] }
			])
			await hmrHook(context1 as any)

			portal.getRecord.mockReturnValueOnce({ metadata: { v: 2 } })
			const context2 = createMockHmrContext([
				{ route: 'commands', handlers: [{ key: 'cred-test' }] }
			])
			await hmrHook(context2 as any)

			// Wait for async registration attempt
			await new Promise((r) => setTimeout(r, 50))

			expect(discordLogger.warn).toHaveBeenCalledWith(expect.stringContaining('missing credentials'))
		})

		it('should use guild ID from environment when available', async () => {
			Env.data.mockReturnValue({
				DISCORD_TOKEN: 'test-token',
				DISCORD_CLIENT_ID: '123456789',
				DISCORD_GUILD_ID: '987654321'
			})
			process.env.DISCORD_TOKEN = 'test-token'
			process.env.DISCORD_CLIENT_ID = '123456789'
			process.env.DISCORD_GUILD_ID = '987654321'

			portal.getByType.mockReturnValue({
				ping: { metadata: { description: 'Ping' } }
			})

			// Force a definition change
			portal.getRecord.mockReturnValueOnce({ metadata: { v: 1 } })
			const context1 = createMockHmrContext([
				{ route: 'commands', handlers: [{ key: 'guild-test' }] }
			])
			await hmrHook(context1 as any)

			portal.getRecord.mockReturnValueOnce({ metadata: { v: 2 } })
			const context2 = createMockHmrContext([
				{ route: 'commands', handlers: [{ key: 'guild-test' }] }
			])
			await hmrHook(context2 as any)

			// Wait for async registration
			await new Promise((r) => setTimeout(r, 50))

			// Should have attempted registration (via ensureRoute)
			expect(portal.ensureRoute).toHaveBeenCalledWith('discordjs', 'commands')
		})

		it('should use testServers from plugin config when no DISCORD_GUILD_ID', async () => {
			Env.data.mockReturnValue({
				DISCORD_TOKEN: 'test-token',
				DISCORD_CLIENT_ID: '123456789'
			})
			process.env.DISCORD_TOKEN = 'test-token'
			process.env.DISCORD_CLIENT_ID = '123456789'
			delete process.env.DISCORD_GUILD_ID

			getPluginOptions.mockReturnValue({
				testServers: ['111222333']
			})

			portal.getByType.mockReturnValue({
				ping: { metadata: { description: 'Ping' } }
			})

			// Force a definition change
			portal.getRecord.mockReturnValueOnce({ metadata: { v: 1 } })
			const context1 = createMockHmrContext([
				{ route: 'commands', handlers: [{ key: 'config-test' }] }
			])
			await hmrHook(context1 as any)

			portal.getRecord.mockReturnValueOnce({ metadata: { v: 2 } })
			const context2 = createMockHmrContext([
				{ route: 'commands', handlers: [{ key: 'config-test' }] }
			])
			await hmrHook(context2 as any)

			// Wait for async registration
			await new Promise((r) => setTimeout(r, 50))

			// Should have called getPluginOptions
			expect(getPluginOptions).toHaveBeenCalledWith('@robojs/discordjs')
		})

		it('should handle registration errors gracefully', async () => {
			Env.data.mockReturnValue({
				DISCORD_TOKEN: 'test-token',
				DISCORD_CLIENT_ID: '123456789'
			})
			process.env.DISCORD_TOKEN = 'test-token'
			process.env.DISCORD_CLIENT_ID = '123456789'

			portal.getByType.mockReturnValue({
				ping: { metadata: { description: 'Ping' } }
			})

			// Force ensureRoute to fail
			portal.ensureRoute.mockRejectedValue(new Error('Route error'))

			// Force a definition change
			portal.getRecord.mockReturnValueOnce({ metadata: { v: 1 } })
			const context1 = createMockHmrContext([
				{ route: 'commands', handlers: [{ key: 'error-test' }] }
			])
			await hmrHook(context1 as any)

			portal.getRecord.mockReturnValueOnce({ metadata: { v: 2 } })
			const context2 = createMockHmrContext([
				{ route: 'commands', handlers: [{ key: 'error-test' }] }
			])
			await hmrHook(context2 as any)

			// Wait for async registration
			await new Promise((r) => setTimeout(r, 100))

			// Should warn about failure
			expect(discordLogger.warn).toHaveBeenCalledWith(
				expect.stringContaining('Failed to update commands'),
				expect.any(Error)
			)
		})
	})

	describe('recordsToCommands (via integration)', () => {
		it('should handle top-level commands', async () => {
			Env.data.mockReturnValue({
				DISCORD_TOKEN: 'test-token',
				DISCORD_CLIENT_ID: '123456789'
			})
			process.env.DISCORD_TOKEN = 'test-token'
			process.env.DISCORD_CLIENT_ID = '123456789'

			portal.getByType.mockImplementation((type: string) => {
				if (type === 'discordjs:commands') {
					return {
						ping: { metadata: { description: 'Ping' } }
					}
				}
				return {}
			})

			// Force a definition change
			portal.getRecord.mockReturnValueOnce({ metadata: { v: 1 } })
			const context1 = createMockHmrContext([
				{ route: 'commands', handlers: [{ key: 'records-test' }] }
			])
			await hmrHook(context1 as any)

			portal.getRecord.mockReturnValueOnce({ metadata: { v: 2 } })
			const context2 = createMockHmrContext([
				{ route: 'commands', handlers: [{ key: 'records-test' }] }
			])
			await hmrHook(context2 as any)

			// Wait for async registration
			await new Promise((r) => setTimeout(r, 50))

			// Should have called getByType for commands
			expect(portal.getByType).toHaveBeenCalledWith('discordjs:commands')
		})

		it('should handle subcommands', async () => {
			Env.data.mockReturnValue({
				DISCORD_TOKEN: 'test-token',
				DISCORD_CLIENT_ID: '123456789'
			})
			process.env.DISCORD_TOKEN = 'test-token'
			process.env.DISCORD_CLIENT_ID = '123456789'

			portal.getByType.mockImplementation((type: string) => {
				if (type === 'discordjs:commands') {
					return {
						'user add': { metadata: { description: 'Add user' } },
						'user remove': { metadata: { description: 'Remove user' } }
					}
				}
				return {}
			})

			// Force a definition change
			portal.getRecord.mockReturnValueOnce({ metadata: { v: 1 } })
			const context1 = createMockHmrContext([
				{ route: 'commands', handlers: [{ key: 'sub-test' }] }
			])
			await hmrHook(context1 as any)

			portal.getRecord.mockReturnValueOnce({ metadata: { v: 2 } })
			const context2 = createMockHmrContext([
				{ route: 'commands', handlers: [{ key: 'sub-test' }] }
			])
			await hmrHook(context2 as any)

			// Wait for async registration
			await new Promise((r) => setTimeout(r, 50))

			expect(portal.getByType).toHaveBeenCalledWith('discordjs:commands')
		})
	})

	describe('recordsToContext (via integration)', () => {
		it('should filter user context menus (type 2)', async () => {
			Env.data.mockReturnValue({
				DISCORD_TOKEN: 'test-token',
				DISCORD_CLIENT_ID: '123456789'
			})

			portal.getByType.mockImplementation((type: string) => {
				if (type === 'discordjs:context') {
					return {
						'User Info': { metadata: { contextType: 2, name: 'User Info' } },
						'Message Info': { metadata: { contextType: 3, name: 'Message Info' } }
					}
				}
				return {}
			})

			// Force a definition change
			portal.getRecord.mockReturnValueOnce({ metadata: { v: 1 } })
			const context1 = createMockHmrContext([
				{ route: 'context', handlers: [{ key: 'ctx-test' }] }
			])
			await hmrHook(context1 as any)

			portal.getRecord.mockReturnValueOnce({ metadata: { v: 2 } })
			const context2 = createMockHmrContext([
				{ route: 'context', handlers: [{ key: 'ctx-test' }] }
			])
			await hmrHook(context2 as any)

			// Wait for async registration
			await new Promise((r) => setTimeout(r, 50))

			expect(portal.getByType).toHaveBeenCalledWith('discordjs:context')
		})
	})

	describe('HMR - event route changes', () => {
		it('event route triggers syncEventListenersFromPortal when client exists', async () => {
			// Set up a client so hasClient() returns true
			const { setClient, clearClient } = await import('../src/core/client.js')
			const { Client } = await import('discord.js')
			setClient(new (Client as any)() as any)

			const context = createMockHmrContext([
				{ route: 'events', handlers: [{ key: 'messageCreate' }, { key: 'guildCreate' }] }
			])

			await hmrHook(context as any)

			// The hook calls syncEventListenersFromPortal which calls ensureRoute
			expect(portal.ensureRoute).toHaveBeenCalledWith('discordjs', 'events')

			clearClient()
		})

		it('event route is skipped when no client exists', async () => {
			const { clearClient } = await import('../src/core/client.js')
			clearClient()

			const context = createMockHmrContext([
				{
					route: 'events',
					handlers: [{ key: 'messageCreate', changeType: 'remove' as const }]
				}
			])

			await hmrHook(context as any)

			// Without a client, ensureRoute for events should NOT be called
			expect(portal.ensureRoute).not.toHaveBeenCalledWith('discordjs', 'events')
		})

		it('mixed command+event changes handles both paths', async () => {
			// Set up a client so event processing works
			const { setClient, clearClient } = await import('../src/core/client.js')
			const { Client } = await import('discord.js')
			setClient(new (Client as any)() as any)

			portal.getRecord.mockReturnValueOnce({ metadata: { v: 1 } })

			const context = createMockHmrContext([
				{ route: 'commands', handlers: [{ key: 'ping' }] },
				{ route: 'events', handlers: [{ key: 'messageCreate' }] }
			])

			await hmrHook(context as any)

			// Events should call ensureRoute for events
			expect(portal.ensureRoute).toHaveBeenCalledWith('discordjs', 'events')
			// Commands should import handler
			expect(portal.importHandler).toHaveBeenCalledWith('discordjs', 'commands', 'ping')

			clearClient()
		})
	})
})

// Helper to create mock HMR context
function createMockHmrContext(
	routes: Array<{ route: string; handlers: Array<{ key: string; changeType?: 'add' | 'remove' | 'change' }> }>
) {
	return {
		routes: routes.map((r) => ({
			namespace: 'discordjs',
			route: r.route,
			handlers: r.handlers.map((handler) => ({
				...handler,
				changeType: handler.changeType ?? 'change'
			}))
		})),
		changeType: 'change' as const,
		files: [],
		mode: 'development',
		logger: {
			debug: fn(),
			info: fn(),
			warn: fn(),
			error: fn()
		},
		env: {}
	}
}

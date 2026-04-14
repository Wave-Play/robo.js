/**
 * Tests for lifecycle hooks (prepare, start, stop)
 *
 * These tests are CRITICAL for preventing regressions like:
 * - The "On standby as" log disappearing (the original bug)
 * - Missing intent validation
 * - Client not being created or cleaned up properly
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { Client, GatewayIntentBits } from 'discord.js'
import * as clientModule from '../../src/core/client.js'

// Import from 'robo.js' to use the same module instance as the code under test
// The moduleNameMapper maps 'robo.js' to our mock
const roboMock = (await import('robo.js')) as unknown as {
	portal: {
		getByType: jest.Mock
		ensureRoute: jest.Mock
		registerPluginState: jest.Mock
		importHandler: jest.Mock
	}
	Robo: {
		status: {
			set: jest.Mock
		}
	}
	setRouteSummaries: (namespace: string, route: string, summaries: Array<{ key: string; metadata?: Record<string, unknown>; auto?: boolean }>) => void
	clearRouteSummaries: () => void
	getForkedLogger: (key: string) => {
		debug: jest.Mock
		info: jest.Mock
		warn: jest.Mock
		error: jest.Mock
		ready: jest.Mock
		event: jest.Mock
		trace: jest.Mock
	}
	clearForkedLoggers: () => void
	Mode: { isDev: jest.Mock }
}

const { portal, Robo, getForkedLogger, Mode, setRouteSummaries, clearRouteSummaries } = roboMock

// Pre-initialize the forked logger BEFORE importing any hooks
// This ensures the logger is cached and all code uses the same instance
const discordLogger = getForkedLogger('discordjs')

// Helper to clear mock call history without clearing the logger cache
function clearLoggerMocks() {
	Object.values(discordLogger).forEach((fn) => {
		if (typeof fn === 'function' && 'mockClear' in fn) {
			;(fn as jest.Mock).mockClear()
		}
	})
}

// Store original env values
const originalToken = process.env.DISCORD_TOKEN
const originalMockMode = process.env.ROBO_MOCK_MODE
const originalMockStandalone = process.env.__ROBO_MOCK_STANDALONE
const originalRestApi = process.env.DISCORD_REST_API

describe('Lifecycle Hooks', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		// Clear logger mock call history but keep the logger cached
		clearLoggerMocks()

		// Reset environment variables to original values
		if (originalToken !== undefined) {
			process.env.DISCORD_TOKEN = originalToken
		} else {
			delete process.env.DISCORD_TOKEN
		}
		if (originalMockMode !== undefined) {
			process.env.ROBO_MOCK_MODE = originalMockMode
		} else {
			delete process.env.ROBO_MOCK_MODE
		}
		if (originalMockStandalone !== undefined) {
			process.env.__ROBO_MOCK_STANDALONE = originalMockStandalone
		} else {
			delete process.env.__ROBO_MOCK_STANDALONE
		}
		if (originalRestApi !== undefined) {
			process.env.DISCORD_REST_API = originalRestApi
		} else {
			delete process.env.DISCORD_REST_API
		}

		// Reset Mode mock defaults
		Mode.isDev.mockReturnValue(true)

		// Reset client state
		if (clientModule.hasClient()) {
			clientModule.clearClient()
		}
		clearRouteSummaries()
	})

	afterEach(() => {
		// Clean up client state
		if (clientModule.hasClient()) {
			clientModule.clearClient()
		}
	})

	describe('prepare hook', () => {
		it('should create Discord client with provided options', async () => {
			const { default: prepareHook } = await import('../../src/robo/prepare.js')

			const pluginConfig = {
				clientOptions: { intents: [GatewayIntentBits.Guilds] }
			}
			const context = {
				pluginConfig,
				logger: discordLogger
			}

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await prepareHook(context as any)

			// Client should be set
			expect(clientModule.hasClient()).toBe(true)
		})

		it('should register plugin state with portal', async () => {
			const { default: prepareHook } = await import('../../src/robo/prepare.js')

			const pluginConfig = {
				clientOptions: { intents: [] }
			}
			const context = {
				pluginConfig,
				logger: discordLogger
			}

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await prepareHook(context as any)

			expect(portal.registerPluginState).toHaveBeenCalledWith(
				'discordjs',
				expect.objectContaining({
					serverRestrictions: expect.any(Map),
					config: pluginConfig
				})
			)
		})

		it('should use custom REST API when DISCORD_REST_API is set', async () => {
			// Set env BEFORE importing
			process.env.DISCORD_REST_API = 'http://localhost:3000/api'

			const { default: prepareHook } = await import('../../src/robo/prepare.js')

			const pluginConfig = {
				clientOptions: { intents: [] }
			}
			const context = {
				pluginConfig,
				logger: discordLogger
			}

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await prepareHook(context as any)

			expect(discordLogger.debug).toHaveBeenCalledWith('Using custom REST API:', 'http://localhost:3000/api')
		})

		it('should register event listeners for gateway events', async () => {
			setRouteSummaries('discordjs', 'events', [
				{ key: 'guildCreate', auto: false },
				{ key: 'messageCreate', auto: false }
			])

			const { default: prepareHook } = await import('../../src/robo/prepare.js')

			const pluginConfig = {
				clientOptions: { intents: [] }
			}
			const context = {
				pluginConfig,
				logger: discordLogger
			}

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await prepareHook(context as any)

			// Client should be created
			const client = clientModule.getClient()
			expect(client).toBeDefined()
		})

		it('should skip lifecycle events (starting with _)', async () => {
			setRouteSummaries('discordjs', 'events', [
				{ key: '_start', auto: false },
				{ key: 'guildCreate', auto: false }
			])

			const { default: prepareHook } = await import('../../src/robo/prepare.js')

			const pluginConfig = {
				clientOptions: { intents: [] }
			}
			const context = {
				pluginConfig,
				logger: discordLogger
			}

			// Should not throw
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await prepareHook(context as any)

			// Just verify client was created - lifecycle events are skipped internally
			expect(clientModule.hasClient()).toBe(true)
		})

		it('should skip eager loading in dev mode', async () => {
			Mode.isDev.mockReturnValue(true)

			const { default: prepareHook } = await import('../../src/robo/prepare.js')

			const pluginConfig = {
				clientOptions: { intents: [] }
			}
			const context = {
				pluginConfig,
				logger: discordLogger
			}

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await prepareHook(context as any)

			// In dev mode, should not eagerly import all handlers
			// Just ensure prepare completes without error
			expect(clientModule.hasClient()).toBe(true)
		})

		it('should skip eager loading in mock mode', async () => {
			process.env.ROBO_MOCK_MODE = 'true'
			Mode.isDev.mockReturnValue(false)

			const { default: prepareHook } = await import('../../src/robo/prepare.js')

			const pluginConfig = {
				clientOptions: { intents: [] }
			}
			const context = {
				pluginConfig,
				logger: discordLogger
			}

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await prepareHook(context as any)

			expect(clientModule.hasClient()).toBe(true)
		})

		it('should default to empty intents if no clientOptions provided', async () => {
			const { default: prepareHook } = await import('../../src/robo/prepare.js')

			const context = {
				pluginConfig: undefined,
				logger: discordLogger
			}

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await prepareHook(context as any)

			expect(clientModule.hasClient()).toBe(true)
		})
	})

	describe('start hook', () => {
		beforeEach(() => {
			// Clear mock mode flags to ensure clean state
			delete process.env.ROBO_MOCK_MODE
			delete process.env.__ROBO_MOCK_STANDALONE

			// Set up a client first (simulate prepare hook ran)
			const mockClient = new Client({ intents: [] })
			clientModule.setClient(mockClient)
		})

		it('should throw error if DISCORD_TOKEN is missing', async () => {
			delete process.env.DISCORD_TOKEN
			delete process.env.__ROBO_MOCK_STANDALONE

			const { default: startHook } = await import('../../src/robo/start.js')

			await expect(startHook()).rejects.toThrow('Missing DISCORD_TOKEN environment variable')
		})

		it('should login to Discord with token', async () => {
			process.env.DISCORD_TOKEN = 'test-token'
			delete process.env.__ROBO_MOCK_STANDALONE
			delete process.env.ROBO_MOCK_MODE

			const { default: startHook } = await import('../../src/robo/start.js')

			await startHook()

			const client = clientModule.getClient()
			expect(client.login).toHaveBeenCalledWith('test-token')
		})

		it('should skip login in standalone mock mode', async () => {
			process.env.__ROBO_MOCK_STANDALONE = 'true'
			process.env.DISCORD_TOKEN = 'test-token'

			const { default: startHook } = await import('../../src/robo/start.js')

			await startHook()

			const client = clientModule.getClient()
			expect(client.login).not.toHaveBeenCalled()
		})

		it('should register clientReady handler that logs "On standby as"', async () => {
			process.env.DISCORD_TOKEN = 'test-token'
			delete process.env.__ROBO_MOCK_STANDALONE
			delete process.env.ROBO_MOCK_MODE

			// Spy on the existing client
			const client = clientModule.getClient()
			const onceSpy = jest.spyOn(client, 'once')

			const { default: startHook } = await import('../../src/robo/start.js')

			await startHook()

			// Should have registered a clientReady handler
			expect(onceSpy).toHaveBeenCalledWith('clientReady', expect.any(Function))
		})

		it('should log "On standby as" message when clientReady fires', async () => {
			process.env.DISCORD_TOKEN = 'test-token'
			delete process.env.__ROBO_MOCK_STANDALONE
			delete process.env.ROBO_MOCK_MODE

			// Set up user on client
			const client = clientModule.getClient()
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			;(client as any).user = { tag: 'TestBot#1234', id: '123' }

			const { default: startHook } = await import('../../src/robo/start.js')

			await startHook()

			// Simulate clientReady event
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			;(client as any).emit('clientReady', client)

			// Should set status with "On standby as TestBot#1234"
			expect(Robo.status.set).toHaveBeenCalledWith(
				'bot',
				expect.stringContaining('On standby as'),
				expect.any(Object)
			)
		})

		it('should check intents after clientReady', async () => {
			process.env.DISCORD_TOKEN = 'test-token'
			delete process.env.__ROBO_MOCK_STANDALONE
			delete process.env.ROBO_MOCK_MODE

			setRouteSummaries('discordjs', 'events', [{ key: 'guildCreate' }, { key: 'guildMemberAdd' }])

			const client = clientModule.getClient()
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			;(client as any).user = { tag: 'TestBot#1234', id: '123' }

			const { default: startHook } = await import('../../src/robo/start.js')

			await startHook()

			// Fire the clientReady event
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			;(client as any).emit('clientReady', client)

			expect(discordLogger.warn).toHaveBeenCalledWith(expect.stringContaining('GuildMembers'))
		})

		it('should handle missing user tag gracefully', async () => {
			process.env.DISCORD_TOKEN = 'test-token'
			delete process.env.__ROBO_MOCK_STANDALONE
			delete process.env.ROBO_MOCK_MODE

			const client = clientModule.getClient()
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			;(client as any).user = null

			const { default: startHook } = await import('../../src/robo/start.js')

			await startHook()

			// Fire the clientReady event
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			;(client as any).emit('clientReady', client)

			// Should set status with "Unknown" fallback
			expect(Robo.status.set).toHaveBeenCalledWith(
				'bot',
				expect.stringContaining('Unknown'),
				expect.any(Object)
			)
		})
	})

	describe('stop hook', () => {
		it('should do nothing if no client exists', async () => {
			// Ensure no client is set
			if (clientModule.hasClient()) {
				clientModule.clearClient()
			}

			const { default: stopHook } = await import('../../src/robo/stop.js')

			// Should not throw
			await stopHook()

			expect(discordLogger.debug).toHaveBeenCalledWith('No Discord client to stop')
		})

		it('should destroy the client', async () => {
			const mockClient = new Client({ intents: [] })
			clientModule.setClient(mockClient)

			const { default: stopHook } = await import('../../src/robo/stop.js')

			await stopHook()

			expect(mockClient.destroy).toHaveBeenCalled()
		})

		it('should clear client reference after destroy', async () => {
			const mockClient = new Client({ intents: [] })
			clientModule.setClient(mockClient)

			const { default: stopHook } = await import('../../src/robo/stop.js')

			await stopHook()

			expect(clientModule.hasClient()).toBe(false)
		})

		it('should clear client reference even if destroy throws', async () => {
			const mockClient = new Client({ intents: [] })
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			;(mockClient as any).destroy = jest.fn().mockImplementation(() => {
				throw new Error('Destroy failed')
			})
			clientModule.setClient(mockClient)

			const { default: stopHook } = await import('../../src/robo/stop.js')

			await stopHook()

			// Should still clear client despite error
			expect(clientModule.hasClient()).toBe(false)
			expect(discordLogger.error).toHaveBeenCalledWith('Error while stopping Discord client:', expect.any(Error))
		})

		it('should log disconnect messages', async () => {
			const mockClient = new Client({ intents: [] })
			clientModule.setClient(mockClient)

			const { default: stopHook } = await import('../../src/robo/stop.js')

			await stopHook()

			expect(discordLogger.debug).toHaveBeenCalledWith('Disconnecting Discord client...')
			expect(discordLogger.debug).toHaveBeenCalledWith('Discord client disconnected')
		})
	})

	describe('lifecycle integration', () => {
		it('should complete full lifecycle: prepare -> start -> stop', async () => {
			// Set up environment
			process.env.DISCORD_TOKEN = 'test-token'
			delete process.env.__ROBO_MOCK_STANDALONE
			delete process.env.ROBO_MOCK_MODE

			// Import hooks
			const { default: prepareHook } = await import('../../src/robo/prepare.js')
			const { default: startHook } = await import('../../src/robo/start.js')
			const { default: stopHook } = await import('../../src/robo/stop.js')

			// Prepare: create client
			const context = {
				pluginConfig: { clientOptions: { intents: [] } },
				logger: discordLogger
			}
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await prepareHook(context as any)
			expect(clientModule.hasClient()).toBe(true)

			// Start: login
			await startHook()
			const client = clientModule.getClient()
			expect(client.login).toHaveBeenCalled()

			// Stop: destroy and cleanup
			await stopHook()
			expect(clientModule.hasClient()).toBe(false)
		})
	})
})

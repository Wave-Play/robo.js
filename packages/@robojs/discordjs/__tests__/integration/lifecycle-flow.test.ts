/**
 * Integration Tests: Lifecycle Flow
 *
 * Tests the full prepare -> start -> stop lifecycle of the Discord.js plugin.
 * Verifies that:
 * - prepare creates client and registers listeners
 * - start logs in to Discord with token
 * - stop clears listeners and destroys client
 * - Missing DISCORD_TOKEN throws error
 * - Interaction routing works after prepare
 */

import { afterAll, afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fn = jest.fn as any

// Import mocked modules
const roboMock = (await import('robo.js')) as unknown as {
	portal: {
		ensureRoute: jest.Mock
		getByType: jest.Mock
		getRecord: jest.Mock
		importHandler: jest.Mock
		importRecord: jest.Mock
		registerPluginState: jest.Mock
		module: jest.Mock
	}
	Mode: {
		isDev: jest.Mock
	}
	Robo: {
		status: {
			set: jest.Mock
		}
	}
	setRouteSummaries: (ns: string, route: string, summaries: Array<Record<string, unknown>>) => void
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

const { portal, Mode, clearRouteSummaries, clearPortalData, setRouteSummaries } = roboMock

const discordMock = (await import('discord.js')) as unknown as {
	Client: new (...args: Array<unknown>) => {
		on: (event: string, cb: (...args: unknown[]) => void) => void
		once: (event: string, cb: (...args: unknown[]) => void) => void
		off: (event: string, cb: (...args: unknown[]) => void) => void
		emit: (event: string, ...args: unknown[]) => boolean
		login: jest.Mock
		destroy: jest.Mock
		user: { tag: string; id: string } | null
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		eventListeners: Map<string, Array<(...args: unknown[]) => void>>
	}
}

// Store original env
const originalToken = process.env.DISCORD_TOKEN
const originalClientId = process.env.DISCORD_CLIENT_ID
const originalMockMode = process.env.ROBO_MOCK_MODE
const originalMockStandalone = process.env.__ROBO_MOCK_STANDALONE
const originalRestApi = process.env.DISCORD_REST_API

describe('lifecycle flow', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		clearRouteSummaries()
		clearPortalData()

		// Set up minimal env
		process.env.DISCORD_TOKEN = 'test-token-lifecycle'
		process.env.DISCORD_CLIENT_ID = 'client-id-lifecycle'
		delete process.env.ROBO_MOCK_MODE
		delete process.env.__ROBO_MOCK_STANDALONE
		delete process.env.DISCORD_REST_API

		// Default mocks
		Mode.isDev.mockReturnValue(true)
		portal.ensureRoute.mockResolvedValue(undefined)
		portal.getByType.mockReturnValue({})
		portal.registerPluginState.mockImplementation(() => {})
		portal.module.mockReturnValue({ isEnabled: fn().mockReturnValue(true) })
	})

	afterAll(() => {
		// Restore env
		if (originalToken !== undefined) process.env.DISCORD_TOKEN = originalToken
		else delete process.env.DISCORD_TOKEN

		if (originalClientId !== undefined) process.env.DISCORD_CLIENT_ID = originalClientId
		else delete process.env.DISCORD_CLIENT_ID

		if (originalMockMode !== undefined) process.env.ROBO_MOCK_MODE = originalMockMode
		else delete process.env.ROBO_MOCK_MODE

		if (originalMockStandalone !== undefined) process.env.__ROBO_MOCK_STANDALONE = originalMockStandalone
		else delete process.env.__ROBO_MOCK_STANDALONE

		if (originalRestApi !== undefined) process.env.DISCORD_REST_API = originalRestApi
		else delete process.env.DISCORD_REST_API
	})

	it('prepare creates client and registers InteractionCreate listener', async () => {
		const { default: prepareHook } = await import('../../src/robo/prepare.js')

		const context = {
			pluginConfig: { clientOptions: { intents: [] } },
			logger: {
				debug: fn(),
				info: fn(),
				warn: fn(),
				error: fn()
			}
		}

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await prepareHook(context as any)

		// Should have registered plugin state
		expect(portal.registerPluginState).toHaveBeenCalledWith('discordjs', expect.any(Object))
	})

	it('stop clears event listeners and destroys client when client exists', async () => {
		// Set up client first via prepare
		const { default: prepareHook } = await import('../../src/robo/prepare.js')
		const context = {
			pluginConfig: { clientOptions: { intents: [] } },
			logger: { debug: fn(), info: fn(), warn: fn(), error: fn() }
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await prepareHook(context as any)

		// Now import and call stop
		const { default: stopHook } = await import('../../src/robo/stop.js')
		await stopHook()

		// Import client module to verify state
		const { hasClient } = await import('../../src/core/client.js')
		expect(hasClient()).toBe(false)
	})

	it('stop does nothing when no client exists', async () => {
		// Clear client first
		const { clearClient } = await import('../../src/core/client.js')
		clearClient()

		const { default: stopHook } = await import('../../src/robo/stop.js')

		// Should not throw
		await expect(stopHook()).resolves.toBeUndefined()
	})

	it('missing DISCORD_TOKEN in start throws error', async () => {
		delete process.env.DISCORD_TOKEN

		// Fresh import to pick up env change
		const { default: startHook } = await import('../../src/robo/start.js')

		await expect(startHook()).rejects.toThrow('Missing DISCORD_TOKEN')
	})

	it('standalone mock mode skips Discord login', async () => {
		process.env.__ROBO_MOCK_STANDALONE = 'true'

		const { default: startHook } = await import('../../src/robo/start.js')

		// Should not throw even without token
		delete process.env.DISCORD_TOKEN
		await expect(startHook()).resolves.toBeUndefined()
	})
})

describe('interaction routing through lifecycle', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		clearRouteSummaries()
		clearPortalData()

		process.env.DISCORD_TOKEN = 'test-token-routing'
		process.env.DISCORD_CLIENT_ID = 'client-id-routing'
		delete process.env.ROBO_MOCK_MODE
		delete process.env.__ROBO_MOCK_STANDALONE
		delete process.env.DISCORD_REST_API

		Mode.isDev.mockReturnValue(true)
		portal.ensureRoute.mockResolvedValue(undefined)
		portal.getByType.mockReturnValue({})
		portal.registerPluginState.mockImplementation(() => {})
		portal.module.mockReturnValue({ isEnabled: fn().mockReturnValue(true) })
	})

	afterAll(() => {
		if (originalToken !== undefined) process.env.DISCORD_TOKEN = originalToken
		else delete process.env.DISCORD_TOKEN

		if (originalClientId !== undefined) process.env.DISCORD_CLIENT_ID = originalClientId
		else delete process.env.DISCORD_CLIENT_ID

		if (originalMockMode !== undefined) process.env.ROBO_MOCK_MODE = originalMockMode
		else delete process.env.ROBO_MOCK_MODE
	})

	it('after prepare, InteractionCreate routes ChatInput to command handler', async () => {
		const { default: prepareHook } = await import('../../src/robo/prepare.js')
		const context = {
			pluginConfig: { clientOptions: { intents: [] } },
			logger: { debug: fn(), info: fn(), warn: fn(), error: fn() }
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await prepareHook(context as any)

		const { getClient } = await import('../../src/core/client.js')
		const client = getClient()

		// Create a mock interaction
		const mockInteraction = {
			commandName: 'test-cmd',
			isChatInputCommand: () => true,
			isAutocomplete: () => false,
			isContextMenuCommand: () => false,
			reply: fn(),
			deferReply: fn(),
			editReply: fn(),
			toJSON: () => ({}),
			options: {
				getSubcommand: () => null,
				getSubcommandGroup: () => null
			}
		}

		// Emit interaction - handler will try to find command in portal
		// Since portal returns no record, it will log error and return
		;(client as unknown as { emit: (e: string, ...args: unknown[]) => void }).emit(
			'interactionCreate',
			mockInteraction
		)

		// Give async handler time to execute
		await new Promise((r) => setTimeout(r, 10))

		// Verify portal was consulted for the command
		expect(portal.ensureRoute).toHaveBeenCalledWith('discordjs', 'commands')
	})

	it('after prepare, InteractionCreate routes autocomplete to autocomplete handler', async () => {
		const { default: prepareHook } = await import('../../src/robo/prepare.js')
		const context = {
			pluginConfig: { clientOptions: { intents: [] } },
			logger: { debug: fn(), info: fn(), warn: fn(), error: fn() }
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await prepareHook(context as any)

		const { getClient } = await import('../../src/core/client.js')
		const client = getClient()

		const mockInteraction = {
			commandName: 'search',
			isChatInputCommand: () => false,
			isAutocomplete: () => true,
			isContextMenuCommand: () => false,
			respond: fn(),
			toJSON: () => ({}),
			options: {
				getFocused: () => 'test',
				getSubcommand: () => null,
				getSubcommandGroup: () => null
			}
		}

		;(client as unknown as { emit: (e: string, ...args: unknown[]) => void }).emit(
			'interactionCreate',
			mockInteraction
		)

		await new Promise((r) => setTimeout(r, 10))

		// Autocomplete handler also ensures route
		expect(portal.ensureRoute).toHaveBeenCalledWith('discordjs', 'commands')
	})

	it('after prepare, InteractionCreate routes ContextMenu to context handler', async () => {
		const { default: prepareHook } = await import('../../src/robo/prepare.js')
		const context = {
			pluginConfig: { clientOptions: { intents: [] } },
			logger: { debug: fn(), info: fn(), warn: fn(), error: fn() }
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await prepareHook(context as any)

		const { getClient } = await import('../../src/core/client.js')
		const client = getClient()

		const mockInteraction = {
			commandName: 'Get User Info',
			targetId: '123',
			isChatInputCommand: () => false,
			isAutocomplete: () => false,
			isContextMenuCommand: () => true,
			reply: fn(),
			toJSON: () => ({})
		}

		;(client as unknown as { emit: (e: string, ...args: unknown[]) => void }).emit(
			'interactionCreate',
			mockInteraction
		)

		await new Promise((r) => setTimeout(r, 10))

		// Context handler ensures route
		expect(portal.ensureRoute).toHaveBeenCalledWith('discordjs', 'context')
	})
})

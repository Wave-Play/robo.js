/**
 * Tests for prefix command handler registration and message dispatch
 *
 * Verifies registerPrefixCommandHandler from prepare.ts:
 * - Registration gating (prefix commands exist or not)
 * - Bot message filtering
 * - String prefix matching (default, custom, case sensitivity)
 * - Function prefix
 * - Mention-as-prefix
 * - Command resolution (single/multi-token, longest match, case normalization)
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { createMockMessage } from './helpers/discord-mocks.js'
import { Client, Events } from 'discord.js'

// Helper for typed mocks
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fn = jest.fn as any

// Import from 'robo.js' to use the mocked module
const roboMock = (await import('robo.js')) as unknown as {
	portal: {
		ensureRoute: jest.Mock<any>
		getRecord: jest.Mock<any>
		getByType: jest.Mock<any>
		importHandler: jest.Mock<any>
		module: jest.Mock<any>
		getHandler: jest.Mock<any>
		registerPluginState: jest.Mock<any>
	}
	Manifest: {
		routeSummariesSync: jest.Mock<any>
	}
	Mode: {
		isDev: jest.Mock<any>
	}
	color: {
		bold: (s: string) => string
	}
	getForkedLogger: (key: string) => {
		debug: jest.Mock
		info: jest.Mock
		warn: jest.Mock
		error: jest.Mock
		event: jest.Mock
		trace: jest.Mock
	}
	setPortalData: (type: string, data: Record<string, unknown>) => void
	clearPortalData: () => void
	setRouteSummaries: (namespace: string, route: string, summaries: Array<{ key: string; metadata?: Record<string, unknown> }>) => void
	clearRouteSummaries: () => void
}

const { portal, Manifest, setPortalData, clearPortalData, clearRouteSummaries } = roboMock

// Pre-initialize the forked logger
const discordLogger = roboMock.getForkedLogger('discordjs')

// Import the module under test
const { registerPrefixCommandHandler, resetRegistrationFlags } = await import('../src/robo/prepare.js')

// Import invalidateAliasIndex to reset state between tests
const { invalidateAliasIndex } = await import('../src/core/handlers/prefix-command.js')

describe('Prefix Handler Registration', () => {
	let client: Client

	beforeEach(() => {
		jest.clearAllMocks()
		invalidateAliasIndex()
		clearPortalData()
		clearRouteSummaries()
		resetRegistrationFlags()
		// Create a fresh client for each test
		client = new Client({ intents: [] })
	})

	describe('Handler registration gating', () => {
		it('does not register when no prefix commands in manifest', () => {
			Manifest.routeSummariesSync.mockReturnValue([])

			registerPrefixCommandHandler(client, {})

			// Emit a messageCreate — no listener should be attached
			const message = createMockMessage({ content: '!ping' })
			client.emit(Events.MessageCreate, message)

			expect(discordLogger.debug).toHaveBeenCalledWith(
				expect.stringContaining('No prefix commands found')
			)
		})

		it('registers when prefix commands exist', () => {
			Manifest.routeSummariesSync.mockReturnValue([{ key: 'ping' }])

			registerPrefixCommandHandler(client, {})

			expect(discordLogger.debug).toHaveBeenCalledWith(
				expect.stringContaining('Registered prefix command handler')
			)
		})

		it('re-registration guard prevents duplicate listeners', () => {
			Manifest.routeSummariesSync.mockReturnValue([{ key: 'ping' }])

			registerPrefixCommandHandler(client, {})
			registerPrefixCommandHandler(client, {})

			expect(discordLogger.debug).toHaveBeenCalledWith(
				expect.stringContaining('already registered')
			)
		})
	})

	describe('Bot message filtering', () => {
		it('ignoreBots: true (default) ignores bot messages', async () => {
			Manifest.routeSummariesSync.mockReturnValue([{ key: 'ping' }])
			registerPrefixCommandHandler(client, {})

			const message = createMockMessage({ content: '!ping', authorBot: true })
			portal.ensureRoute.mockResolvedValue(undefined)

			client.emit(Events.MessageCreate, message)

			// Give async handler time to process
			await new Promise((r) => setTimeout(r, 10))

			// Should not attempt to resolve command
			expect(portal.ensureRoute).not.toHaveBeenCalled()
		})

		it('ignoreBots: false processes bot messages', async () => {
			Manifest.routeSummariesSync.mockReturnValue([{ key: 'ping' }])
			registerPrefixCommandHandler(client, { prefix: { ignoreBots: false } })

			const record = {
				key: 'ping',
				enabled: true,
				module: null,
				metadata: { dmPermission: true, args: [] },
				handler: { default: fn().mockReturnValue(undefined), config: {} },
				plugin: null
			}
			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)
			setPortalData('discordjs:prefixCommands', { ping: record })

			const message = createMockMessage({ content: '!ping', authorBot: true })
			client.emit(Events.MessageCreate, message)

			await new Promise((r) => setTimeout(r, 10))

			expect(portal.ensureRoute).toHaveBeenCalled()
		})
	})

	describe('String prefix matching', () => {
		it('matches default prefix "!"', async () => {
			Manifest.routeSummariesSync.mockReturnValue([{ key: 'ping' }])
			registerPrefixCommandHandler(client, {})

			const record = {
				key: 'ping',
				enabled: true,
				module: null,
				metadata: { dmPermission: true, args: [] },
				handler: { default: fn().mockReturnValue('Pong!'), config: {} },
				plugin: null
			}
			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)
			setPortalData('discordjs:prefixCommands', { ping: record })

			const message = createMockMessage({ content: '!ping' })
			client.emit(Events.MessageCreate, message)

			await new Promise((r) => setTimeout(r, 10))

			expect(discordLogger.event).toHaveBeenCalledWith(
				expect.stringContaining('!ping')
			)
		})

		it('matches custom prefix', async () => {
			Manifest.routeSummariesSync.mockReturnValue([{ key: 'ping' }])
			registerPrefixCommandHandler(client, { prefix: { value: '??' } })

			const record = {
				key: 'ping',
				enabled: true,
				module: null,
				metadata: { dmPermission: true, args: [] },
				handler: { default: fn().mockReturnValue('Pong!'), config: {} },
				plugin: null
			}
			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)
			setPortalData('discordjs:prefixCommands', { ping: record })

			const message = createMockMessage({ content: '??ping' })
			client.emit(Events.MessageCreate, message)

			await new Promise((r) => setTimeout(r, 10))

			expect(discordLogger.event).toHaveBeenCalledWith(
				expect.stringContaining('??ping')
			)
		})

		it('case-insensitive prefix matching (default)', async () => {
			Manifest.routeSummariesSync.mockReturnValue([{ key: 'ping' }])
			registerPrefixCommandHandler(client, { prefix: { value: 'bot ' } })

			const record = {
				key: 'ping',
				enabled: true,
				module: null,
				metadata: { dmPermission: true, args: [] },
				handler: { default: fn().mockReturnValue('Pong!'), config: {} },
				plugin: null
			}
			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)
			setPortalData('discordjs:prefixCommands', { ping: record })

			const message = createMockMessage({ content: 'BOT ping' })
			client.emit(Events.MessageCreate, message)

			await new Promise((r) => setTimeout(r, 10))

			expect(portal.ensureRoute).toHaveBeenCalled()
		})

		it('case-sensitive prefix matching rejects wrong case', async () => {
			Manifest.routeSummariesSync.mockReturnValue([{ key: 'ping' }])
			registerPrefixCommandHandler(client, { prefix: { value: '!', caseSensitive: true } })

			portal.ensureRoute.mockResolvedValue(undefined)

			// '!' matches '!' regardless of caseSensitive, so test with a letter prefix
			// Reset client for fresh listeners
			client = new Client({ intents: [] })
			Manifest.routeSummariesSync.mockReturnValue([{ key: 'ping' }])
			registerPrefixCommandHandler(client, { prefix: { value: 'Bot ', caseSensitive: true } })

			const message = createMockMessage({ content: 'bot ping' })
			client.emit(Events.MessageCreate, message)

			await new Promise((r) => setTimeout(r, 10))

			// Should not attempt to resolve since 'bot ' !== 'Bot '
			expect(portal.ensureRoute).not.toHaveBeenCalled()
		})

		it('non-matching prefix is ignored', async () => {
			Manifest.routeSummariesSync.mockReturnValue([{ key: 'ping' }])
			registerPrefixCommandHandler(client, { prefix: { value: '!' } })

			const message = createMockMessage({ content: 'hello ping' })
			client.emit(Events.MessageCreate, message)

			await new Promise((r) => setTimeout(r, 10))

			expect(portal.ensureRoute).not.toHaveBeenCalled()
		})
	})

	describe('Function prefix', () => {
		it('sync function prefix', async () => {
			Manifest.routeSummariesSync.mockReturnValue([{ key: 'ping' }])
			registerPrefixCommandHandler(client, {
				prefix: { value: () => '>' }
			})

			const record = {
				key: 'ping',
				enabled: true,
				module: null,
				metadata: { dmPermission: true, args: [] },
				handler: { default: fn().mockReturnValue('Pong!'), config: {} },
				plugin: null
			}
			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)
			setPortalData('discordjs:prefixCommands', { ping: record })

			const message = createMockMessage({ content: '>ping' })
			client.emit(Events.MessageCreate, message)

			await new Promise((r) => setTimeout(r, 10))

			expect(portal.ensureRoute).toHaveBeenCalled()
		})

		it('async function prefix', async () => {
			Manifest.routeSummariesSync.mockReturnValue([{ key: 'ping' }])
			registerPrefixCommandHandler(client, {
				prefix: { value: async () => '#' }
			})

			const record = {
				key: 'ping',
				enabled: true,
				module: null,
				metadata: { dmPermission: true, args: [] },
				handler: { default: fn().mockReturnValue('Pong!'), config: {} },
				plugin: null
			}
			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)
			setPortalData('discordjs:prefixCommands', { ping: record })

			const message = createMockMessage({ content: '#ping' })
			client.emit(Events.MessageCreate, message)

			await new Promise((r) => setTimeout(r, 10))

			expect(portal.ensureRoute).toHaveBeenCalled()
		})

		it('null guildId for DM messages', async () => {
			const prefixFn = fn().mockReturnValue('!')
			Manifest.routeSummariesSync.mockReturnValue([{ key: 'ping' }])
			registerPrefixCommandHandler(client, {
				prefix: { value: prefixFn }
			})

			const record = {
				key: 'ping',
				enabled: true,
				module: null,
				metadata: { dmPermission: true, args: [] },
				handler: { default: fn().mockReturnValue('Pong!'), config: {} },
				plugin: null
			}
			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)
			setPortalData('discordjs:prefixCommands', { ping: record })

			const message = createMockMessage({ content: '!ping', guildId: null })
			client.emit(Events.MessageCreate, message)

			await new Promise((r) => setTimeout(r, 10))

			// The function should have been called with null for DM
			expect(prefixFn).toHaveBeenCalledWith(null)
		})
	})

	describe('Mention-as-prefix', () => {
		it('bot mention matched and stripped', async () => {
			Manifest.routeSummariesSync.mockReturnValue([{ key: 'ping' }])
			registerPrefixCommandHandler(client, {
				prefix: { mentionAsPrefix: true }
			})

			const record = {
				key: 'ping',
				enabled: true,
				module: null,
				metadata: { dmPermission: true, args: [] },
				handler: { default: fn().mockReturnValue('Pong!'), config: {} },
				plugin: null
			}
			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)
			setPortalData('discordjs:prefixCommands', { ping: record })

			// client.user.id is '123456789' from mock
			const message = createMockMessage({ content: '<@123456789> ping' })
			client.emit(Events.MessageCreate, message)

			await new Promise((r) => setTimeout(r, 10))

			expect(portal.ensureRoute).toHaveBeenCalled()
		})

		it('<@!id> format matched', async () => {
			Manifest.routeSummariesSync.mockReturnValue([{ key: 'ping' }])
			registerPrefixCommandHandler(client, {
				prefix: { mentionAsPrefix: true }
			})

			const record = {
				key: 'ping',
				enabled: true,
				module: null,
				metadata: { dmPermission: true, args: [] },
				handler: { default: fn().mockReturnValue('Pong!'), config: {} },
				plugin: null
			}
			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)
			setPortalData('discordjs:prefixCommands', { ping: record })

			const message = createMockMessage({ content: '<@!123456789> ping' })
			client.emit(Events.MessageCreate, message)

			await new Promise((r) => setTimeout(r, 10))

			expect(portal.ensureRoute).toHaveBeenCalled()
		})

		it('fallback to string prefix when mention does not match', async () => {
			Manifest.routeSummariesSync.mockReturnValue([{ key: 'ping' }])
			registerPrefixCommandHandler(client, {
				prefix: { mentionAsPrefix: true, value: '!' }
			})

			const record = {
				key: 'ping',
				enabled: true,
				module: null,
				metadata: { dmPermission: true, args: [] },
				handler: { default: fn().mockReturnValue('Pong!'), config: {} },
				plugin: null
			}
			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)
			setPortalData('discordjs:prefixCommands', { ping: record })

			// No mention, falls back to '!'
			const message = createMockMessage({ content: '!ping' })
			client.emit(Events.MessageCreate, message)

			await new Promise((r) => setTimeout(r, 10))

			expect(portal.ensureRoute).toHaveBeenCalled()
		})

		it('neither mention nor prefix returns early', async () => {
			Manifest.routeSummariesSync.mockReturnValue([{ key: 'ping' }])
			registerPrefixCommandHandler(client, {
				prefix: { mentionAsPrefix: true, value: '!' }
			})

			const message = createMockMessage({ content: 'just a message' })
			client.emit(Events.MessageCreate, message)

			await new Promise((r) => setTimeout(r, 10))

			expect(portal.ensureRoute).not.toHaveBeenCalled()
		})
	})

	describe('Command resolution', () => {
		it('empty content after prefix returns early', async () => {
			Manifest.routeSummariesSync.mockReturnValue([{ key: 'ping' }])
			registerPrefixCommandHandler(client, {})

			const message = createMockMessage({ content: '!' })
			client.emit(Events.MessageCreate, message)

			await new Promise((r) => setTimeout(r, 10))

			// Should not try to resolve a command
			expect(portal.ensureRoute).not.toHaveBeenCalled()
		})

		it('single-token command', async () => {
			Manifest.routeSummariesSync.mockReturnValue([{ key: 'ping' }])
			registerPrefixCommandHandler(client, {})

			const record = {
				key: 'ping',
				enabled: true,
				module: null,
				metadata: { dmPermission: true, args: [] },
				handler: { default: fn().mockReturnValue('Pong!'), config: {} },
				plugin: null
			}
			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)
			setPortalData('discordjs:prefixCommands', { ping: record })

			const message = createMockMessage({ content: '!ping' })
			client.emit(Events.MessageCreate, message)

			await new Promise((r) => setTimeout(r, 10))

			expect(discordLogger.event).toHaveBeenCalledWith(
				expect.stringContaining('!ping')
			)
		})

		it('multi-token subcommand (longest match first)', async () => {
			Manifest.routeSummariesSync.mockReturnValue([{ key: 'admin ban' }])
			registerPrefixCommandHandler(client, {})

			// "admin" alone returns null, "admin ban" returns the record
			const record = {
				key: 'admin ban',
				enabled: true,
				module: null,
				metadata: { dmPermission: true, args: [] },
				handler: { default: fn().mockReturnValue(undefined), config: {} },
				plugin: null
			}
			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockImplementation((_ns: string, _route: string, key: string) => {
				if (key === 'admin ban') return record
				return null
			})
			setPortalData('discordjs:prefixCommands', { 'admin ban': record })

			const message = createMockMessage({ content: '!admin ban @user' })
			client.emit(Events.MessageCreate, message)

			await new Promise((r) => setTimeout(r, 10))

			expect(discordLogger.event).toHaveBeenCalledWith(
				expect.stringContaining('admin ban')
			)
		})

		it('shorter fallback when longer does not match', async () => {
			Manifest.routeSummariesSync.mockReturnValue([{ key: 'admin' }])
			registerPrefixCommandHandler(client, {})

			const record = {
				key: 'admin',
				enabled: true,
				module: null,
				metadata: { dmPermission: true, args: [] },
				handler: { default: fn().mockReturnValue(undefined), config: {} },
				plugin: null
			}
			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockImplementation((_ns: string, _route: string, key: string) => {
				if (key === 'admin') return record
				return null
			})
			setPortalData('discordjs:prefixCommands', { admin: record })

			// "admin foo" — "admin foo" not found, falls back to "admin"
			const message = createMockMessage({ content: '!admin foo bar' })
			client.emit(Events.MessageCreate, message)

			await new Promise((r) => setTimeout(r, 10))

			expect(discordLogger.event).toHaveBeenCalledWith(
				expect.stringContaining('admin')
			)
		})

		it('no matching command returns silently', async () => {
			Manifest.routeSummariesSync.mockReturnValue([{ key: 'ping' }])
			registerPrefixCommandHandler(client, {})

			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(null)
			setPortalData('discordjs:prefixCommands', {})

			const message = createMockMessage({ content: '!unknown' })
			client.emit(Events.MessageCreate, message)

			await new Promise((r) => setTimeout(r, 10))

			// No event log for unmatched commands
			expect(discordLogger.event).not.toHaveBeenCalled()
		})

		it('case normalization applied to command lookup', async () => {
			Manifest.routeSummariesSync.mockReturnValue([{ key: 'Ping' }])
			registerPrefixCommandHandler(client, {})

			const record = {
				key: 'Ping',
				enabled: true,
				module: null,
				metadata: { dmPermission: true, args: [] },
				handler: { default: fn().mockReturnValue('Pong!'), config: {} },
				plugin: null
			}
			portal.ensureRoute.mockResolvedValue(undefined)
			// Direct lookup for "ping" (lowercase) returns null, but lowercaseKeyIndex maps "ping" -> "Ping"
			portal.getRecord.mockImplementation((_ns: string, _route: string, key: string) => {
				if (key === 'Ping') return record
				return null
			})
			setPortalData('discordjs:prefixCommands', { Ping: record })

			const message = createMockMessage({ content: '!ping' })
			client.emit(Events.MessageCreate, message)

			await new Promise((r) => setTimeout(r, 10))

			expect(portal.ensureRoute).toHaveBeenCalled()
		})
	})
})

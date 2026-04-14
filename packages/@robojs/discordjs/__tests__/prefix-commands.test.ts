/**
 * Tests for prefix command system
 *
 * Verifies:
 * - Route definition config and processor
 * - Handler execution (lookup, aliases, guards, middleware, cooldowns, sage)
 * - Argument parsing (split, quotes, named params)
 * - Alias resolution and invalidation
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { createMockMessage } from './helpers/discord-mocks.js'

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
		getController: jest.Mock<any>
	}
	Manifest: {
		routeSummariesSync: jest.Mock<any>
		routeSummaries: jest.Mock<any>
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

const { portal, Mode, setPortalData, clearPortalData, clearRouteSummaries } = roboMock

// Pre-initialize the forked logger for assertions
const discordLogger = roboMock.getForkedLogger('discordjs')

// Import the modules under test
const routeDefinition = await import('../src/robo/routes/prefixCommands.js')
const { splitArgs, invalidateAliasIndex, resolveCommandKey, executePrefixCommandHandler } = await import(
	'../src/core/handlers/prefix-command.js'
)

// Helper to create a mock handler record
function createMockRecord(options: {
	key?: string
	enabled?: boolean
	module?: string | null
	metadata?: Record<string, unknown>
	handler?: Record<string, unknown> | null
} = {}) {
	const { key = 'ping', enabled = true, module = null, metadata = {}, handler = null } = options
	return {
		key,
		enabled,
		module,
		path: `src/prefix-commands/${key}.js`,
		metadata: {
			description: 'Test command',
			args: [],
			aliases: [],
			dmPermission: true,
			...metadata
		},
		handler,
		plugin: null
	}
}

describe('Prefix Commands', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		invalidateAliasIndex()
		clearPortalData()
		clearRouteSummaries()
	})

	describe('Route Definition', () => {
		it('has correct route config', () => {
			expect(routeDefinition.config.key!.style).toBe('filepath')
			expect(routeDefinition.config.key!.separator).toBe(' ')
			expect(routeDefinition.config.nesting!.maxDepth).toBe(3)
			expect(routeDefinition.config.exports!.default).toBe('required')
			expect(routeDefinition.config.exports!.config).toBe('optional')
		})

		it('processes entry with metadata from config export', () => {
			const entry = {
				key: 'ping',
				filePath: 'src/prefix-commands/ping.ts',
				exports: {
					default: fn(),
					config: {
						description: 'Pong!',
						aliases: ['p'],
						cooldown: 5000,
						args: [{ name: 'target', required: false }]
					}
				}
			}

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = routeDefinition.default(entry as any)

			expect(result.key).toBe('ping')
			expect(result.path).toBe('src/prefix-commands/ping.js')
			expect(result.metadata!.description).toBe('Pong!')
			expect(result.metadata!.aliases).toEqual(['p'])
			expect(result.metadata!.cooldown).toBe(5000)
			expect(result.metadata!.args).toEqual([{ name: 'target', required: false }])
			expect(result.metadata!.dmPermission).toBe(true)
		})

		it('processes entry without config export using defaults', () => {
			const entry = {
				key: 'hello',
				filePath: 'src/prefix-commands/hello.ts',
				exports: {
					default: fn()
				}
			}

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = routeDefinition.default(entry as any)

			expect(result.metadata!.description).toBe('No description provided')
			expect(result.metadata!.aliases).toEqual([])
			expect(result.metadata!.args).toEqual([])
			expect(result.metadata!.dmPermission).toBe(true)
		})

		it('generates correct keys for nested files', () => {
			const entry = {
				key: 'admin ban',
				filePath: 'src/prefix-commands/admin/ban.ts',
				exports: {
					default: fn(),
					config: { description: 'Ban a user' }
				}
			}

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = routeDefinition.default(entry as any)
			expect(result.key).toBe('admin ban')
		})
	})

	describe('Argument Parsing', () => {
		it('splits simple space-separated args', () => {
			expect(splitArgs('a b c')).toEqual(['a', 'b', 'c'])
		})

		it('respects double-quoted strings', () => {
			expect(splitArgs('"hello world" foo')).toEqual(['hello world', 'foo'])
		})

		it('respects single-quoted strings', () => {
			expect(splitArgs("'hello world' foo")).toEqual(['hello world', 'foo'])
		})

		it('returns empty array for empty input', () => {
			expect(splitArgs('')).toEqual([])
		})

		it('handles mixed quoted and unquoted args', () => {
			expect(splitArgs('"some user" reason here')).toEqual(['some user', 'reason', 'here'])
		})

		it('handles multiple spaces between args', () => {
			expect(splitArgs('a   b   c')).toEqual(['a', 'b', 'c'])
		})

		it('handles quotes within unquoted args', () => {
			expect(splitArgs('hello"world"')).toEqual(['helloworld'])
		})

		it('handles unclosed quotes by treating quote as literal', () => {
			// Unclosed quote should not swallow all remaining args
			const result = splitArgs('"hello world')
			expect(result).toEqual(['"hello', 'world'])
		})
	})

	describe('Alias Resolution', () => {
		it('resolves command by direct name', () => {
			const record = createMockRecord({ key: 'ping' })
			portal.getRecord.mockReturnValue(record)

			const result = resolveCommandKey('ping')
			expect(result).toBe('ping')
		})

		it('resolves command by alias', () => {
			portal.getRecord.mockReturnValue(null)
			setPortalData('discordjs:prefixCommands', {
				ping: {
					key: 'ping',
					enabled: true,
					metadata: { aliases: ['p', 'pong'] }
				}
			})

			const result = resolveCommandKey('p')
			expect(result).toBe('ping')
		})

		it('returns null for unknown commands', () => {
			portal.getRecord.mockReturnValue(null)
			setPortalData('discordjs:prefixCommands', {})

			const result = resolveCommandKey('unknown')
			expect(result).toBeNull()
		})

		it('invalidates alias index on HMR', () => {
			// First build the index
			portal.getRecord.mockReturnValue(null)
			setPortalData('discordjs:prefixCommands', {
				ping: {
					key: 'ping',
					enabled: true,
					metadata: { aliases: ['p'] }
				}
			})
			expect(resolveCommandKey('p')).toBe('ping')

			// Invalidate and change data
			invalidateAliasIndex()
			setPortalData('discordjs:prefixCommands', {
				hello: {
					key: 'hello',
					enabled: true,
					metadata: { aliases: ['p'] }
				}
			})

			expect(resolveCommandKey('p')).toBe('hello')
		})

		it('resolves aliases case-insensitively', () => {
			portal.getRecord.mockReturnValue(null)
			setPortalData('discordjs:prefixCommands', {
				ping: {
					key: 'ping',
					enabled: true,
					metadata: { aliases: ['P', 'PONG'] }
				}
			})

			expect(resolveCommandKey('p')).toBe('ping')
			expect(resolveCommandKey('PONG')).toBe('ping')
		})
	})

	describe('Handler Execution', () => {
		it('executes a command handler and replies with string result', async () => {
			const message = createMockMessage()
			const handler = fn().mockReturnValue('Pong!')
			const record = createMockRecord({
				handler: { default: handler, config: {} }
			})

			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await executePrefixCommandHandler(message as any, 'ping', '')

			expect(handler).toHaveBeenCalled()
			expect(message.reply).toHaveBeenCalledWith({ content: 'Pong!' })
		})

		it('executes a command handler and replies with object result', async () => {
			const message = createMockMessage()
			const replyObj = { content: 'Pong!', ephemeral: true }
			const handler = fn().mockReturnValue(replyObj)
			const record = createMockRecord({
				handler: { default: handler, config: {} }
			})

			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await executePrefixCommandHandler(message as any, 'ping', '')

			expect(message.reply).toHaveBeenCalledWith(replyObj)
		})

		it('does not reply when handler returns void', async () => {
			const message = createMockMessage()
			const handler = fn().mockReturnValue(undefined)
			const record = createMockRecord({
				handler: { default: handler, config: {} }
			})

			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await executePrefixCommandHandler(message as any, 'ping', '')

			expect(message.reply).not.toHaveBeenCalled()
		})

		it('skips disabled commands', async () => {
			const message = createMockMessage()
			const record = createMockRecord({ enabled: false })

			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await executePrefixCommandHandler(message as any, 'ping', '')

			expect(message.reply).not.toHaveBeenCalled()
		})

		it('skips commands from disabled modules', async () => {
			const message = createMockMessage()
			const record = createMockRecord({ module: 'my-module' })

			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)
			portal.module.mockReturnValue({ isEnabled: fn().mockReturnValue(false) })

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await executePrefixCommandHandler(message as any, 'ping', '')

			expect(message.reply).not.toHaveBeenCalled()
		})

		it('blocks commands in DMs when dmPermission is false', async () => {
			const message = createMockMessage({ guildId: null })
			const record = createMockRecord({
				metadata: { dmPermission: false }
			})

			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await executePrefixCommandHandler(message as any, 'ping', '')

			expect(message.reply).not.toHaveBeenCalled()
		})

		it('allows commands in DMs when dmPermission is true', async () => {
			const message = createMockMessage({ guildId: null })
			const handler = fn().mockReturnValue('Works in DM!')
			const record = createMockRecord({
				metadata: { dmPermission: true },
				handler: { default: handler, config: {} }
			})

			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await executePrefixCommandHandler(message as any, 'ping', '')

			expect(handler).toHaveBeenCalled()
		})

		it('checks required permissions and blocks if missing', async () => {
			const message = createMockMessage({ permissions: [] })
			const record = createMockRecord({
				metadata: { requiredPermissions: 'BanMembers' }
			})

			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await executePrefixCommandHandler(message as any, 'ban', '')

			expect(message.reply).toHaveBeenCalledWith('You need the following permissions: BanMembers')
		})

		it('checks requiredPermissions as string[] and blocks if any missing', async () => {
			const message = createMockMessage({ permissions: ['BanMembers'] })
			const record = createMockRecord({
				metadata: { requiredPermissions: ['BanMembers', 'KickMembers'] }
			})

			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await executePrefixCommandHandler(message as any, 'modtools', '')

			expect(message.reply).toHaveBeenCalledWith('You need the following permissions: KickMembers')
		})

		it('allows when user has required permissions', async () => {
			const message = createMockMessage({ permissions: ['BanMembers'] })
			const handler = fn().mockReturnValue('Banned!')
			const record = createMockRecord({
				metadata: { requiredPermissions: 'BanMembers' },
				handler: { default: handler, config: {} }
			})

			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await executePrefixCommandHandler(message as any, 'ban', '')

			expect(handler).toHaveBeenCalled()
		})

		it('passes parsed arguments to handler', async () => {
			const message = createMockMessage()
			const handler = fn().mockReturnValue(undefined)
			const record = createMockRecord({
				handler: {
					default: handler,
					config: {
						args: [
							{ name: 'user', required: true },
							{ name: 'reason', required: false }
						]
					}
				}
			})

			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await executePrefixCommandHandler(message as any, 'ban', '"some user" bad behavior')

			expect(handler).toHaveBeenCalledWith(
				message,
				expect.objectContaining({
					raw: ['some user', 'bad', 'behavior'],
					params: { user: 'some user', reason: 'bad' },
					content: '"some user" bad behavior'
				})
			)
		})

		it('handles missing optional args as undefined in params', async () => {
			const message = createMockMessage()
			const handler = fn().mockReturnValue(undefined)
			const record = createMockRecord({
				handler: {
					default: handler,
					config: {
						args: [
							{ name: 'user', required: true },
							{ name: 'reason', required: false }
						]
					}
				}
			})

			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await executePrefixCommandHandler(message as any, 'ban', 'testuser')

			expect(handler).toHaveBeenCalledWith(
				message,
				expect.objectContaining({
					raw: ['testuser'],
					params: { user: 'testuser', reason: undefined }
				})
			)
		})

		it('shows error reply in dev mode when sage.errorReplies is true', async () => {
			Mode.isDev.mockReturnValue(true)
			const message = createMockMessage()
			const handler = fn().mockImplementation(() => {
				throw new Error('Test error')
			})
			const record = createMockRecord({
				handler: { default: handler, config: {} }
			})

			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await executePrefixCommandHandler(message as any, 'ping', '')

			expect(message.reply).toHaveBeenCalledWith('An error occurred: Test error')
		})

		it('suppresses error reply in production mode', async () => {
			Mode.isDev.mockReturnValue(false)
			const message = createMockMessage()
			const handler = fn().mockImplementation(() => {
				throw new Error('Test error')
			})
			const record = createMockRecord({
				handler: { default: handler, config: {} }
			})

			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await executePrefixCommandHandler(message as any, 'ping', '')

			// reply should not have been called with error
			expect(message.reply).not.toHaveBeenCalled()
		})

		it('sends typing indicator when sage.typing is true and handler is async', async () => {
			const message = createMockMessage()
			const handler = fn().mockResolvedValue('Done!')
			const record = createMockRecord({
				handler: {
					default: handler,
					config: { sage: { typing: true } }
				}
			})

			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await executePrefixCommandHandler(message as any, 'ping', '')

			expect(message.channel.sendTyping).toHaveBeenCalled()
			expect(message.reply).toHaveBeenCalledWith({ content: 'Done!' })
		})

		it('imports handler if not already loaded', async () => {
			const message = createMockMessage()
			const record = createMockRecord({ handler: null })

			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)
			portal.importHandler.mockImplementation(async () => {
				record.handler = { default: fn().mockReturnValue('Loaded!'), config: {} }
			})

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await executePrefixCommandHandler(message as any, 'ping', '')

			expect(portal.importHandler).toHaveBeenCalledWith('discordjs', 'prefixCommands', 'ping')
		})

		it('returns early when command record is not found', async () => {
			const message = createMockMessage()

			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(null)

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await executePrefixCommandHandler(message as any, 'nonexistent', '')

			expect(message.reply).not.toHaveBeenCalled()
			expect(discordLogger.error).toHaveBeenCalled()
		})

		it('uses metadata.args fallback when commandConfig.args is undefined', async () => {
			const message = createMockMessage()
			const handler = fn().mockReturnValue(undefined)
			const record = createMockRecord({
				metadata: {
					args: [
						{ name: 'target', required: false }
					]
				},
				handler: { default: handler }
			})

			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await executePrefixCommandHandler(message as any, 'test', 'someuser')

			expect(handler).toHaveBeenCalledWith(
				message,
				expect.objectContaining({
					params: { target: 'someuser' }
				})
			)
		})

		it('sage: false disables both typing and error replies', async () => {
			Mode.isDev.mockReturnValue(true)
			const message = createMockMessage()
			const handler = fn().mockImplementation(() => {
				throw new Error('should not reply')
			})
			const record = createMockRecord({
				handler: { default: handler, config: { sage: false } }
			})

			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await executePrefixCommandHandler(message as any, 'ping', '')

			// Error reply should be suppressed because sage is false
			expect(message.reply).not.toHaveBeenCalled()
			// Typing should not have been sent
			expect(message.channel.sendTyping).not.toHaveBeenCalled()
		})

		it('sendTyping throws but handler still completes', async () => {
			const message = createMockMessage()
			message.channel.sendTyping.mockRejectedValue(new Error('No permission'))
			const handler = fn().mockResolvedValue('Done!')
			const record = createMockRecord({
				handler: {
					default: handler,
					config: { sage: { typing: true } }
				}
			})

			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await executePrefixCommandHandler(message as any, 'ping', '')

			expect(handler).toHaveBeenCalled()
			expect(message.reply).toHaveBeenCalledWith({ content: 'Done!' })
		})

		it('handler throws non-Error (string) shows correct error message', async () => {
			Mode.isDev.mockReturnValue(true)
			const message = createMockMessage()
			const handler = fn().mockImplementation(() => {
				throw 'string error'
			})
			const record = createMockRecord({
				handler: { default: handler, config: {} }
			})

			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await executePrefixCommandHandler(message as any, 'ping', '')

			expect(message.reply).toHaveBeenCalledWith('An error occurred: string error')
		})

		it('reply failure in error path is handled gracefully', async () => {
			Mode.isDev.mockReturnValue(true)
			const message = createMockMessage()
			message.reply.mockRejectedValue(new Error('Cannot send'))
			const handler = fn().mockImplementation(() => {
				throw new Error('Handler error')
			})
			const record = createMockRecord({
				handler: { default: handler, config: {} }
			})

			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)

			// Should not throw even when reply fails
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await expect(executePrefixCommandHandler(message as any, 'ping', '')).resolves.toBeUndefined()
		})

		it('validates required arguments and replies with usage', async () => {
			const message = createMockMessage()
			const handler = fn().mockReturnValue('OK')
			const record = createMockRecord({
				handler: {
					default: handler,
					config: {
						args: [
							{ name: 'user', required: true },
							{ name: 'reason', required: false }
						]
					}
				}
			})

			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)

			// Call with no args — required 'user' is missing
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await executePrefixCommandHandler(message as any, 'ban', '')

			expect(handler).not.toHaveBeenCalled()
			expect(message.reply).toHaveBeenCalledWith(
				'Missing required argument(s): user\nUsage: `ban <user> [reason]`'
			)
		})

		it('sends typing indicator even for sync handlers when sage.typing is true', async () => {
			const message = createMockMessage()
			const handler = fn().mockReturnValue('Sync result')
			const record = createMockRecord({
				handler: {
					default: handler,
					config: { sage: { typing: true } }
				}
			})

			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await executePrefixCommandHandler(message as any, 'ping', '')

			// Typing is now sent before invocation regardless of sync/async
			expect(message.channel.sendTyping).toHaveBeenCalled()
		})
	})

	describe('Cooldown', () => {
		let realDateNow: () => number

		beforeEach(() => {
			realDateNow = Date.now
		})

		afterEach(() => {
			Date.now = realDateNow
		})

		it('blocks command when cooldown is active after successful execution', async () => {
			const message = createMockMessage()
			const handler = fn().mockReturnValue('OK')
			const record = createMockRecord({
				metadata: { cooldown: 60000 },
				handler: { default: handler, config: { cooldown: 60000 } }
			})

			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)

			// First call should work (cooldown set after success)
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await executePrefixCommandHandler(message as any, 'cooldown-test', '')
			expect(handler).toHaveBeenCalledTimes(1)
			message.reply.mockClear()

			// Second call should be blocked by cooldown
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await executePrefixCommandHandler(message as any, 'cooldown-test', '')
			expect(handler).toHaveBeenCalledTimes(1)
			expect(message.reply).toHaveBeenCalledWith(expect.stringMatching(/Please wait \d+s before using this command again\./))
		})

		it('does not apply cooldown when handler throws', async () => {
			Mode.isDev.mockReturnValue(true)
			const message = createMockMessage()
			const handler = fn().mockImplementation(() => {
				throw new Error('Handler failed')
			})
			const record = createMockRecord({
				metadata: { cooldown: 60000 },
				handler: { default: handler, config: { cooldown: 60000 } }
			})

			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)

			// First call fails
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await executePrefixCommandHandler(message as any, 'cooldown-error-test', '')
			expect(handler).toHaveBeenCalledTimes(1)

			// Second call should NOT be blocked (cooldown not applied on error)
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await executePrefixCommandHandler(message as any, 'cooldown-error-test', '')
			expect(handler).toHaveBeenCalledTimes(2)
		})

		it('different users have independent cooldowns', async () => {
			const handler = fn().mockReturnValue('OK')
			const record = createMockRecord({
				metadata: { cooldown: 60000 },
				handler: { default: handler, config: { cooldown: 60000 } }
			})

			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)

			const message1 = createMockMessage({ authorId: 'user1' })
			const message2 = createMockMessage({ authorId: 'user2' })

			// User1 triggers cooldown
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await executePrefixCommandHandler(message1 as any, 'cooldown-multi', '')
			expect(handler).toHaveBeenCalledTimes(1)

			// User2 should NOT be blocked
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await executePrefixCommandHandler(message2 as any, 'cooldown-multi', '')
			expect(handler).toHaveBeenCalledTimes(2)
		})

		it('DM cooldowns use "dm" guild key', async () => {
			const handler = fn().mockReturnValue('OK')
			const record = createMockRecord({
				metadata: { cooldown: 60000 },
				handler: { default: handler, config: { cooldown: 60000 } }
			})

			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)

			const message = createMockMessage({ guildId: null })

			// First call works
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await executePrefixCommandHandler(message as any, 'cooldown-dm', '')
			expect(handler).toHaveBeenCalledTimes(1)
			message.reply.mockClear()

			// Second call blocked
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await executePrefixCommandHandler(message as any, 'cooldown-dm', '')
			expect(handler).toHaveBeenCalledTimes(1)
			expect(message.reply).toHaveBeenCalledWith(expect.stringMatching(/Please wait \d+s before using this command again\./))
		})

		it('cooldown expires after the configured duration', async () => {
			let now = 1000000
			Date.now = () => now

			const handler = fn().mockReturnValue('OK')
			const record = createMockRecord({
				metadata: { cooldown: 5000 },
				handler: { default: handler, config: { cooldown: 5000 } }
			})

			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)

			const message = createMockMessage()

			// First call sets cooldown
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await executePrefixCommandHandler(message as any, 'cooldown-expire', '')
			expect(handler).toHaveBeenCalledTimes(1)

			// Advance time past cooldown
			now = 1000000 + 5001

			// Should not be blocked
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await executePrefixCommandHandler(message as any, 'cooldown-expire', '')
			expect(handler).toHaveBeenCalledTimes(2)
		})

		it('cooldown reply shows exact remaining seconds', async () => {
			let now = 1000000
			Date.now = () => now

			const handler = fn().mockReturnValue('OK')
			const record = createMockRecord({
				metadata: { cooldown: 10000 },
				handler: { default: handler, config: { cooldown: 10000 } }
			})

			portal.ensureRoute.mockResolvedValue(undefined)
			portal.getRecord.mockReturnValue(record)

			const message = createMockMessage()

			// First call sets cooldown
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await executePrefixCommandHandler(message as any, 'cooldown-exact', '')
			message.reply.mockClear()

			// Advance 3 seconds (7 remaining)
			now = 1000000 + 3000

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await executePrefixCommandHandler(message as any, 'cooldown-exact', '')

			expect(message.reply).toHaveBeenCalledWith('Please wait 7s before using this command again.')
		})
	})

	describe('Case-Insensitive Key Resolution', () => {
		it('resolves command key case-insensitively via lowercaseKeyIndex', () => {
			// Simulate a command stored as "Ping" (original case)
			portal.getRecord.mockReturnValue(null)
			setPortalData('discordjs:prefixCommands', {
				Ping: {
					key: 'Ping',
					enabled: true,
					metadata: { aliases: [] }
				}
			})

			// Looking up "ping" (lowercase) should resolve to "Ping"
			const result = resolveCommandKey('ping')
			expect(result).toBe('Ping')
		})
	})
})

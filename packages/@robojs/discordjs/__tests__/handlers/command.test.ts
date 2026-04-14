/**
 * Tests for command handler execution
 *
 * Verifies that:
 * - Commands are found and executed
 * - Disabled commands/modules are skipped
 * - Middleware chain executes before handler
 * - Sage mode auto-defer works
 * - Error handling works correctly
 * - Command responses are sent properly
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals'

// Helper for typed mocks
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fn = jest.fn as any

// Import from 'robo.js' to use the mocked module
const roboMock = (await import('robo.js')) as unknown as {
	portal: {
		getByType: jest.Mock
		getRecord: jest.Mock
		importHandler: jest.Mock
		module: jest.Mock
	}
	getForkedLogger: (key: string) => {
		debug: jest.Mock
		info: jest.Mock
		warn: jest.Mock
		error: jest.Mock
	}
	Mode: { isDev: jest.Mock }
	clearForkedLoggers: () => void
}

const { portal, getForkedLogger, Mode } = roboMock

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

// Helper to create mock interaction
function createMockInteraction(overrides = {}) {
	return {
		commandName: 'ping',
		options: {
			getSubcommand: fn(() => null),
			getSubcommandGroup: fn(() => null),
			getString: fn(),
			getInteger: fn(),
			getBoolean: fn(),
			getUser: fn(),
			getChannel: fn(),
			getRole: fn(),
			getMentionable: fn(),
			getNumber: fn(),
			getAttachment: fn()
		},
		replied: false,
		deferred: false,
		reply: fn().mockResolvedValue({}),
		deferReply: fn().mockResolvedValue({}),
		editReply: fn().mockResolvedValue({}),
		followUp: fn().mockResolvedValue({}),
		...overrides
	}
}

// Helper to setup portal mock for a specific command
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setupCommandMock(commandKey: string, record: any, middleware: any[] = []) {
	portal.getRecord.mockImplementation(((ns: string, route: string, key: string) => {
		if (ns === 'discordjs' && route === 'commands' && key === commandKey) {
			return record
		}
		return undefined
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	}) as any)

	portal.getByType.mockImplementation(((type: string) => {
		if (type === 'discordjs:middleware') {
			if (middleware.length === 0) return {}
			return { default: middleware }
		}
		return {}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	}) as any)
}

// Import after mocking
const { executeCommandHandler } = await import('../../src/core/handlers/command.js')

describe('Command Handler', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		clearLoggerMocks()
		Mode.isDev.mockReturnValue(true)

		// Default mock for module check
		portal.module.mockReturnValue({ isEnabled: () => true })
	})

	describe('executeCommandHandler', () => {
		it('should log error when command is not found', async () => {
			portal.getRecord.mockReturnValue(undefined)

			const interaction = createMockInteraction()
			await executeCommandHandler(interaction as any, 'unknown-command')

			expect(discordLogger.error).toHaveBeenCalledWith(expect.stringContaining('unknown-command'))
		})

		it('should execute handler when command is found', async () => {
			const mockHandler = fn().mockReturnValue('Pong!')
			const record = {
				key: 'ping',
				path: 'commands/ping.js',
				enabled: true,
				handler: { default: mockHandler }
			}

			setupCommandMock('ping', record)

			const interaction = createMockInteraction()
			await executeCommandHandler(interaction as any, 'ping')

			expect(mockHandler).toHaveBeenCalled()
			expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: 'Pong!' }))
		})

		it('should skip command when module is disabled', async () => {
			const mockHandler = fn()
			const record = {
				key: 'ping',
				path: 'commands/ping.js',
				enabled: true,
				module: 'admin',
				handler: { default: mockHandler }
			}

			setupCommandMock('ping', record)
			portal.module.mockReturnValue({ isEnabled: () => false })

			const interaction = createMockInteraction()
			await executeCommandHandler(interaction as any, 'ping')

			expect(mockHandler).not.toHaveBeenCalled()
			expect(discordLogger.debug).toHaveBeenCalledWith(expect.stringContaining('disabled command from module'))
		})

		it('should skip disabled command', async () => {
			const mockHandler = fn()
			const record = {
				key: 'ping',
				path: 'commands/ping.js',
				enabled: false,
				handler: { default: mockHandler }
			}

			setupCommandMock('ping', record)

			const interaction = createMockInteraction()
			await executeCommandHandler(interaction as any, 'ping')

			expect(mockHandler).not.toHaveBeenCalled()
			expect(discordLogger.debug).toHaveBeenCalledWith(expect.stringContaining('disabled command'))
		})

		it('should import handler if not already imported', async () => {
			const mockHandler = fn().mockReturnValue('Imported!')
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const record: any = {
				key: 'ping',
				path: 'commands/ping.js',
				enabled: true,
				handler: null
			}

			portal.importHandler.mockImplementation((async () => {
				record.handler = { default: mockHandler }
			}) as any)

			setupCommandMock('ping', record)

			const interaction = createMockInteraction()
			await executeCommandHandler(interaction as any, 'ping')

			expect(portal.importHandler).toHaveBeenCalledWith('discordjs', 'commands', 'ping')
			expect(mockHandler).toHaveBeenCalled()
		})

		it('should handle string response from command', async () => {
			const mockHandler = fn().mockReturnValue('Hello, World!')
			const record = {
				key: 'hello',
				path: 'commands/hello.js',
				enabled: true,
				handler: { default: mockHandler }
			}

			setupCommandMock('hello', record)

			const interaction = createMockInteraction()
			await executeCommandHandler(interaction as any, 'hello')

			expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: 'Hello, World!' }))
		})

		it('should handle object response from command', async () => {
			const response = { content: 'Hello!', ephemeral: true }
			const mockHandler = fn().mockReturnValue(response)
			const record = {
				key: 'hello',
				path: 'commands/hello.js',
				enabled: true,
				handler: { default: mockHandler }
			}

			setupCommandMock('hello', record)

			const interaction = createMockInteraction()
			await executeCommandHandler(interaction as any, 'hello')

			expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining(response))
		})

		it('should skip response when command returns undefined', async () => {
			const mockHandler = fn().mockReturnValue(undefined)
			const record = {
				key: 'silent',
				path: 'commands/silent.js',
				enabled: true,
				handler: { default: mockHandler }
			}

			setupCommandMock('silent', record)

			const interaction = createMockInteraction()
			await executeCommandHandler(interaction as any, 'silent')

			expect(mockHandler).toHaveBeenCalled()
			expect(interaction.reply).not.toHaveBeenCalled()
			expect(discordLogger.debug).toHaveBeenCalledWith(expect.stringContaining('returned void'))
		})

		it('should use editReply when interaction is already deferred', async () => {
			const mockHandler = fn().mockReturnValue('Done!')
			const record = {
				key: 'ping',
				path: 'commands/ping.js',
				enabled: true,
				handler: { default: mockHandler }
			}

			setupCommandMock('ping', record)

			const interaction = createMockInteraction({ deferred: true })
			await executeCommandHandler(interaction as any, 'ping')

			expect(interaction.editReply).toHaveBeenCalledWith({ content: 'Done!' })
			expect(interaction.reply).not.toHaveBeenCalled()
		})

		it('should handle errors gracefully', async () => {
			const error = new Error('Command failed')
			const mockHandler = fn().mockImplementation(() => {
				throw error
			})
			const record = {
				key: 'error',
				path: 'commands/error.js',
				enabled: true,
				handler: { default: mockHandler }
			}

			setupCommandMock('error', record)

			const interaction = createMockInteraction()
			await executeCommandHandler(interaction as any, 'error')

			expect(discordLogger.error).toHaveBeenCalledWith(error)
		})

		it('should print error response in dev mode', async () => {
			Mode.isDev.mockReturnValue(true)
			const error = new Error('Something went wrong')
			const mockHandler = fn().mockImplementation(() => {
				throw error
			})
			const record = {
				key: 'error',
				path: 'commands/error.js',
				enabled: true,
				handler: { default: mockHandler, config: {} }
			}

			setupCommandMock('error', record)

			const interaction = createMockInteraction()
			await executeCommandHandler(interaction as any, 'error')

			expect(interaction.reply).toHaveBeenCalledWith(
				expect.objectContaining({
					content: expect.stringContaining('Something went wrong'),
					ephemeral: true
				})
			)
		})

		it('should not print error response in production mode', async () => {
			Mode.isDev.mockReturnValue(false)
			const error = new Error('Something went wrong')
			const mockHandler = fn().mockImplementation(() => {
				throw error
			})
			const record = {
				key: 'error',
				path: 'commands/error.js',
				enabled: true,
				handler: { default: mockHandler }
			}

			setupCommandMock('error', record)

			const interaction = createMockInteraction()
			await executeCommandHandler(interaction as any, 'error')

			expect(discordLogger.error).toHaveBeenCalledWith(error)
			// Should NOT call reply with error message in production
			expect(interaction.reply).not.toHaveBeenCalled()
		})

		it('should throw error when handler has no default export', async () => {
			const record = {
				key: 'broken',
				path: 'commands/broken.js',
				enabled: true,
				handler: {} // No default export
			}

			setupCommandMock('broken', record)

			const interaction = createMockInteraction()
			await executeCommandHandler(interaction as any, 'broken')

			// Should log error
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
				return 'Done'
			})

			const record = {
				key: 'ping',
				path: 'commands/ping.js',
				enabled: true,
				handler: { default: mockHandler }
			}

			setupCommandMock('ping', record, [
				{ key: 'auth', path: 'middleware/auth.js', enabled: true, handler: { default: mockMiddleware } }
			])

			const interaction = createMockInteraction()
			await executeCommandHandler(interaction as any, 'ping')

			expect(executionOrder).toEqual(['middleware', 'handler'])
		})

		it('should abort command when middleware returns abort', async () => {
			const mockMiddleware = fn(() => ({ abort: true }))
			const mockHandler = fn()

			const record = {
				key: 'ping',
				path: 'commands/ping.js',
				enabled: true,
				handler: { default: mockHandler }
			}

			setupCommandMock('ping', record, [
				{ key: 'auth', path: 'middleware/auth.js', enabled: true, handler: { default: mockMiddleware } }
			])

			const interaction = createMockInteraction()
			await executeCommandHandler(interaction as any, 'ping')

			expect(mockMiddleware).toHaveBeenCalled()
			expect(mockHandler).not.toHaveBeenCalled()
			expect(discordLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Middleware aborted'))
		})
	})

	describe('Sage mode', () => {
		it('should handle slow async commands by awaiting them', async () => {
			// Create a slow handler that returns a promise
			const mockHandler = fn(() => new Promise((resolve) => setTimeout(() => resolve('Done!'), 100)))
			const record = {
				key: 'slow',
				path: 'commands/slow.js',
				enabled: true,
				handler: { default: mockHandler, config: { sage: { defer: true, deferBuffer: 10 } } }
			}

			setupCommandMock('slow', record)

			// Track whether deferReply was called
			let wasDeferred = false
			const interaction = createMockInteraction()
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			;(interaction as any).deferReply = fn(async () => {
				wasDeferred = true
				;(interaction as any).deferred = true
			})

			await executeCommandHandler(interaction as any, 'slow')

			// Handler should have been called
			expect(mockHandler).toHaveBeenCalled()
			// Sage should have deferred the reply
			expect(wasDeferred).toBe(true)
			// Result should have been sent via editReply
			expect(interaction.editReply).toHaveBeenCalledWith({ content: 'Done!' })
		})

		it('should wait for promise when sage.defer is false', async () => {
			const mockHandler = fn(() => new Promise((resolve) => setTimeout(() => resolve('Quick!'), 100)))
			const record = {
				key: 'nodefer',
				path: 'commands/nodefer.js',
				enabled: true,
				handler: { default: mockHandler, config: { sage: { defer: false } } }
			}

			setupCommandMock('nodefer', record)

			const interaction = createMockInteraction()
			await executeCommandHandler(interaction as any, 'nodefer')

			// Handler should still complete
			expect(mockHandler).toHaveBeenCalled()
		})

		it('should use ephemeral flag when sage.ephemeral is true', async () => {
			const mockHandler = fn().mockReturnValue('Secret!')
			const record = {
				key: 'secret',
				path: 'commands/secret.js',
				enabled: true,
				handler: { default: mockHandler, config: { sage: { ephemeral: true } } }
			}

			setupCommandMock('secret', record)

			const interaction = createMockInteraction()
			await executeCommandHandler(interaction as any, 'secret')

			// Should be called with either ephemeral: true or flags: 64 (MessageFlags.Ephemeral)
			expect(interaction.reply).toHaveBeenCalledWith(
				expect.objectContaining({ content: 'Secret!' })
			)
			// Verify ephemeral is set (via flags or ephemeral property)
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const replyArg = (interaction.reply as jest.Mock).mock.calls[0][0] as any
			expect(replyArg.flags === 64 || replyArg.ephemeral === true).toBe(true)
		})
	})

	describe('isValidReply fix', () => {
		it('should warn when handler returns a Message-like object', async () => {
			const messageObj = { id: '123', content: 'Hello', author: { id: '456' }, channelId: '789' }
			const mockHandler = fn().mockReturnValue(messageObj)
			const record = {
				key: 'test',
				path: 'commands/test.js',
				enabled: true,
				handler: { default: mockHandler }
			}

			setupCommandMock('test', record)

			const interaction = createMockInteraction()
			await executeCommandHandler(interaction as any, 'test')

			expect(discordLogger.warn).toHaveBeenCalledWith(
				expect.stringContaining('Invalid return value')
			)
			expect(interaction.reply).not.toHaveBeenCalled()
			expect(interaction.editReply).not.toHaveBeenCalled()
		})

		it('should send reply for plain object with id field that is not a Message', async () => {
			const plainObj = { id: '123', content: 'Hello' }
			const mockHandler = fn().mockReturnValue(plainObj)
			const record = {
				key: 'test',
				path: 'commands/test.js',
				enabled: true,
				handler: { default: mockHandler }
			}

			setupCommandMock('test', record)

			const interaction = createMockInteraction()
			await executeCommandHandler(interaction as any, 'test')

			// Should still send as reply because it's not a Message object (no author/channelId)
			expect(interaction.reply).toHaveBeenCalled()
		})

		it('should send reply for object with author but no channelId', async () => {
			// This is the boundary case: old code checked only `id`, which would
			// incorrectly treat this as a Message. New code requires both author AND channelId.
			const obj = { id: '123', author: { id: '456' } }
			const mockHandler = fn().mockReturnValue(obj)
			const record = {
				key: 'test',
				path: 'commands/test.js',
				enabled: true,
				handler: { default: mockHandler }
			}

			setupCommandMock('test', record)

			const interaction = createMockInteraction()
			await executeCommandHandler(interaction as any, 'test')

			// Should send as reply — has author but no channelId, so not a Message
			expect(interaction.reply).toHaveBeenCalled()
			expect(discordLogger.warn).not.toHaveBeenCalled()
		})

		it('should send reply for object with channelId but no author', async () => {
			const obj = { id: '123', channelId: '789' }
			const mockHandler = fn().mockReturnValue(obj)
			const record = {
				key: 'test',
				path: 'commands/test.js',
				enabled: true,
				handler: { default: mockHandler }
			}

			setupCommandMock('test', record)

			const interaction = createMockInteraction()
			await executeCommandHandler(interaction as any, 'test')

			// Should send as reply — has channelId but no author, so not a Message
			expect(interaction.reply).toHaveBeenCalled()
			expect(discordLogger.warn).not.toHaveBeenCalled()
		})
	})

	describe('server restrictions', () => {
		it('should skip command when server is not in serverOnly list', async () => {
			const mockHandler = fn()
			const record = {
				key: 'restricted',
				path: 'commands/restricted.js',
				enabled: true,
				metadata: { serverOnly: ['allowed-guild-id'] },
				handler: { default: mockHandler }
			}

			setupCommandMock('restricted', record)

			const interaction = createMockInteraction({ guildId: 'other-guild' })
			await executeCommandHandler(interaction as any, 'restricted')

			expect(mockHandler).not.toHaveBeenCalled()
			expect(discordLogger.debug).toHaveBeenCalledWith(
				expect.stringContaining('restricted to specific servers')
			)
		})

		it('should execute command when server is in serverOnly list', async () => {
			const mockHandler = fn().mockReturnValue('Allowed!')
			const record = {
				key: 'restricted',
				path: 'commands/restricted.js',
				enabled: true,
				metadata: { serverOnly: ['allowed-guild-id'] },
				handler: { default: mockHandler }
			}

			setupCommandMock('restricted', record)

			const interaction = createMockInteraction({ guildId: 'allowed-guild-id' })
			await executeCommandHandler(interaction as any, 'restricted')

			expect(mockHandler).toHaveBeenCalled()
		})

		it('should skip command when guildId is null (DM) and serverOnly is set', async () => {
			const mockHandler = fn()
			const record = {
				key: 'restricted',
				path: 'commands/restricted.js',
				enabled: true,
				metadata: { serverOnly: ['some-guild'] },
				handler: { default: mockHandler }
			}

			setupCommandMock('restricted', record)

			const interaction = createMockInteraction({ guildId: null })
			await executeCommandHandler(interaction as any, 'restricted')

			expect(mockHandler).not.toHaveBeenCalled()
		})

		it('should handle serverOnly as a single string', async () => {
			const mockHandler = fn().mockReturnValue('OK')
			const record = {
				key: 'restricted',
				path: 'commands/restricted.js',
				enabled: true,
				metadata: { serverOnly: 'the-guild' },
				handler: { default: mockHandler }
			}

			setupCommandMock('restricted', record)

			const interaction = createMockInteraction({ guildId: 'the-guild' })
			await executeCommandHandler(interaction as any, 'restricted')

			expect(mockHandler).toHaveBeenCalled()
		})

		it('should reject serverOnly single string with non-matching guild', async () => {
			const mockHandler = fn()
			const record = {
				key: 'restricted',
				path: 'commands/restricted.js',
				enabled: true,
				metadata: { serverOnly: 'the-guild' },
				handler: { default: mockHandler }
			}

			setupCommandMock('restricted', record)

			const interaction = createMockInteraction({ guildId: 'wrong-guild' })
			await executeCommandHandler(interaction as any, 'restricted')

			expect(mockHandler).not.toHaveBeenCalled()
			expect(discordLogger.debug).toHaveBeenCalledWith(
				expect.stringContaining('restricted to specific servers')
			)
		})
	})

	describe('Error objects', () => {
		it('should throw Error objects instead of strings for missing exports', async () => {
			const record = {
				key: 'broken',
				path: 'commands/broken.js',
				enabled: true,
				handler: {} // No default export
			}

			setupCommandMock('broken', record)

			const interaction = createMockInteraction()
			await executeCommandHandler(interaction as any, 'broken')

			// Should log an Error object (not a string)
			const errorArg = (discordLogger.error as jest.Mock).mock.calls[0]?.[0]
			expect(errorArg).toBeInstanceOf(Error)
		})
	})
})

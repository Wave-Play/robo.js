/**
 * Tests for context menu handler execution
 *
 * Verifies that:
 * - Context menu handlers are found and executed
 * - Disabled handlers/modules are skipped
 * - Middleware chain executes before handler
 * - Target user/message is passed correctly
 * - Error handling works correctly
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

// Helper to create mock user context interaction
function createMockUserContextInteraction(overrides = {}) {
	return {
		commandName: 'Get User Info',
		targetUser: { id: '123', username: 'testuser', tag: 'testuser#0001' },
		replied: false,
		deferred: false,
		reply: fn().mockResolvedValue({}),
		deferReply: fn().mockResolvedValue({}),
		editReply: fn().mockResolvedValue({}),
		followUp: fn().mockResolvedValue({}),
		isMessageContextMenuCommand: () => false,
		isUserContextMenuCommand: () => true,
		...overrides
	}
}

// Helper to create mock message context interaction
function createMockMessageContextInteraction(overrides = {}) {
	return {
		commandName: 'Report Message',
		targetMessage: { id: '456', content: 'Hello world', author: { id: '789' } },
		replied: false,
		deferred: false,
		reply: fn().mockResolvedValue({}),
		deferReply: fn().mockResolvedValue({}),
		editReply: fn().mockResolvedValue({}),
		followUp: fn().mockResolvedValue({}),
		isMessageContextMenuCommand: () => true,
		isUserContextMenuCommand: () => false,
		...overrides
	}
}

// Helper to setup portal mock for a specific context menu
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setupContextMock(commandKey: string, record: any, middleware: any[] = []) {
	portal.getRecord.mockImplementation(((ns: string, route: string, key: string) => {
		if (ns === 'discordjs' && route === 'context' && key === commandKey) {
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
const { executeContextHandler } = await import('../../src/core/handlers/context.js')

describe('Context Handler', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		clearLoggerMocks()
		Mode.isDev.mockReturnValue(true)

		// Default mock for module check
		portal.module.mockReturnValue({ isEnabled: () => true })
	})

	describe('executeContextHandler', () => {
		it('should log error when context menu is not found', async () => {
			portal.getRecord.mockReturnValue(undefined)

			const interaction = createMockUserContextInteraction()
			await executeContextHandler(interaction as any, 'Unknown Menu')

			expect(discordLogger.error).toHaveBeenCalledWith(expect.stringContaining('Unknown Menu'))
		})

		it('should execute handler when user context menu is found', async () => {
			const mockHandler = fn().mockReturnValue('User info displayed!')
			const record = {
				key: 'Get User Info',
				path: 'context/user/Get User Info.js',
				enabled: true,
				handler: { default: mockHandler }
			}

			setupContextMock('Get User Info', record)

			const interaction = createMockUserContextInteraction()
			await executeContextHandler(interaction as any, 'Get User Info')

			expect(mockHandler).toHaveBeenCalledWith(interaction, interaction.targetUser)
			expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: 'User info displayed!' }))
		})

		it('should execute handler when message context menu is found', async () => {
			const mockHandler = fn().mockReturnValue('Message reported!')
			const record = {
				key: 'Report Message',
				path: 'context/message/Report Message.js',
				enabled: true,
				handler: { default: mockHandler }
			}

			setupContextMock('Report Message', record)

			const interaction = createMockMessageContextInteraction()
			await executeContextHandler(interaction as any, 'Report Message')

			expect(mockHandler).toHaveBeenCalledWith(interaction, interaction.targetMessage)
			expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: 'Message reported!' }))
		})

		it('should skip context menu when module is disabled', async () => {
			const mockHandler = fn()
			const record = {
				key: 'Get User Info',
				path: 'context/user/Get User Info.js',
				enabled: true,
				module: 'admin',
				handler: { default: mockHandler }
			}

			setupContextMock('Get User Info', record)
			portal.module.mockReturnValue({ isEnabled: () => false })

			const interaction = createMockUserContextInteraction()
			await executeContextHandler(interaction as any, 'Get User Info')

			expect(mockHandler).not.toHaveBeenCalled()
			expect(discordLogger.debug).toHaveBeenCalledWith(expect.stringContaining('disabled context menu command from module'))
		})

		it('should skip disabled context menu', async () => {
			const mockHandler = fn()
			const record = {
				key: 'Get User Info',
				path: 'context/user/Get User Info.js',
				enabled: false,
				handler: { default: mockHandler }
			}

			setupContextMock('Get User Info', record)

			const interaction = createMockUserContextInteraction()
			await executeContextHandler(interaction as any, 'Get User Info')

			expect(mockHandler).not.toHaveBeenCalled()
			expect(discordLogger.debug).toHaveBeenCalledWith(expect.stringContaining('disabled context menu command'))
		})

		it('should import handler if not already imported', async () => {
			const mockHandler = fn().mockReturnValue('Imported!')
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const record: any = {
				key: 'Get User Info',
				path: 'context/user/Get User Info.js',
				enabled: true,
				handler: null
			}

			portal.importHandler.mockImplementation((async () => {
				record.handler = { default: mockHandler }
			}) as any)

			setupContextMock('Get User Info', record)

			const interaction = createMockUserContextInteraction()
			await executeContextHandler(interaction as any, 'Get User Info')

			expect(portal.importHandler).toHaveBeenCalledWith('discordjs', 'context', 'Get User Info')
			expect(mockHandler).toHaveBeenCalled()
		})

		it('should skip response when handler returns undefined', async () => {
			const mockHandler = fn().mockReturnValue(undefined)
			const record = {
				key: 'Silent Action',
				path: 'context/user/Silent Action.js',
				enabled: true,
				handler: { default: mockHandler }
			}

			setupContextMock('Silent Action', record)

			const interaction = createMockUserContextInteraction()
			await executeContextHandler(interaction as any, 'Silent Action')

			expect(mockHandler).toHaveBeenCalled()
			expect(interaction.reply).not.toHaveBeenCalled()
			expect(discordLogger.debug).toHaveBeenCalledWith(expect.stringContaining('returned void'))
		})

		it('should use editReply when interaction is already deferred', async () => {
			const mockHandler = fn().mockReturnValue('Done!')
			const record = {
				key: 'Get User Info',
				path: 'context/user/Get User Info.js',
				enabled: true,
				handler: { default: mockHandler }
			}

			setupContextMock('Get User Info', record)

			const interaction = createMockUserContextInteraction({ deferred: true })
			await executeContextHandler(interaction as any, 'Get User Info')

			expect(interaction.editReply).toHaveBeenCalledWith({ content: 'Done!' })
			expect(interaction.reply).not.toHaveBeenCalled()
		})

		it('should handle errors gracefully', async () => {
			const error = new Error('Context menu failed')
			const mockHandler = fn().mockImplementation(() => {
				throw error
			})
			const record = {
				key: 'Broken Menu',
				path: 'context/user/Broken Menu.js',
				enabled: true,
				handler: { default: mockHandler }
			}

			setupContextMock('Broken Menu', record)

			const interaction = createMockUserContextInteraction()
			await executeContextHandler(interaction as any, 'Broken Menu')

			expect(discordLogger.error).toHaveBeenCalledWith(error)
		})

		it('should print error response in dev mode', async () => {
			Mode.isDev.mockReturnValue(true)
			const error = new Error('Something went wrong')
			const mockHandler = fn().mockImplementation(() => {
				throw error
			})
			const record = {
				key: 'Error Menu',
				path: 'context/user/Error Menu.js',
				enabled: true,
				handler: { default: mockHandler, config: {} }
			}

			setupContextMock('Error Menu', record)

			const interaction = createMockUserContextInteraction()
			await executeContextHandler(interaction as any, 'Error Menu')

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
				key: 'Error Menu',
				path: 'context/user/Error Menu.js',
				enabled: true,
				handler: { default: mockHandler }
			}

			setupContextMock('Error Menu', record)

			const interaction = createMockUserContextInteraction()
			await executeContextHandler(interaction as any, 'Error Menu')

			expect(discordLogger.error).toHaveBeenCalledWith(error)
			expect(interaction.reply).not.toHaveBeenCalled()
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
				key: 'Get User Info',
				path: 'context/user/Get User Info.js',
				enabled: true,
				handler: { default: mockHandler }
			}

			setupContextMock('Get User Info', record, [
				{ key: 'auth', path: 'middleware/auth.js', enabled: true, handler: { default: mockMiddleware } }
			])

			const interaction = createMockUserContextInteraction()
			await executeContextHandler(interaction as any, 'Get User Info')

			expect(executionOrder).toEqual(['middleware', 'handler'])
		})

		it('should abort context menu when middleware returns abort', async () => {
			const mockMiddleware = fn(() => ({ abort: true }))
			const mockHandler = fn()

			const record = {
				key: 'Get User Info',
				path: 'context/user/Get User Info.js',
				enabled: true,
				handler: { default: mockHandler }
			}

			setupContextMock('Get User Info', record, [
				{ key: 'auth', path: 'middleware/auth.js', enabled: true, handler: { default: mockMiddleware } }
			])

			const interaction = createMockUserContextInteraction()
			await executeContextHandler(interaction as any, 'Get User Info')

			expect(mockMiddleware).toHaveBeenCalled()
			expect(mockHandler).not.toHaveBeenCalled()
			expect(discordLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Middleware aborted'))
		})
	})

	describe('target resolution', () => {
		it('should pass targetUser to user context handler', async () => {
			const mockHandler = fn().mockReturnValue('User info!')
			const record = {
				key: 'Get User Info',
				path: 'context/user/Get User Info.js',
				enabled: true,
				handler: { default: mockHandler }
			}

			setupContextMock('Get User Info', record)

			const targetUser = { id: '123', username: 'testuser' }
			const interaction = createMockUserContextInteraction({ targetUser })
			await executeContextHandler(interaction as any, 'Get User Info')

			expect(mockHandler).toHaveBeenCalledWith(interaction, targetUser)
		})

		it('should pass targetMessage to message context handler', async () => {
			const mockHandler = fn().mockReturnValue('Message info!')
			const record = {
				key: 'Report Message',
				path: 'context/message/Report Message.js',
				enabled: true,
				handler: { default: mockHandler }
			}

			setupContextMock('Report Message', record)

			const targetMessage = { id: '456', content: 'Hello' }
			const interaction = createMockMessageContextInteraction({ targetMessage })
			await executeContextHandler(interaction as any, 'Report Message')

			expect(mockHandler).toHaveBeenCalledWith(interaction, targetMessage)
		})
	})

	describe('patchDeferReply and defer handling', () => {
		it('should handle deferReply errors from already-acknowledged interactions', async () => {
			const mockHandler = fn(
				() => new Promise((resolve) => setTimeout(() => resolve('Done!'), 100))
			)
			const record = {
				key: 'Get User Info',
				path: 'context/user/Get User Info.js',
				enabled: true,
				handler: {
					default: mockHandler,
					config: { sage: { defer: true, deferBuffer: 10 } }
				}
			}

			setupContextMock('Get User Info', record)

			let wasDeferred = false
			const interaction = createMockUserContextInteraction()
			;(interaction as any).deferReply = fn(async () => {
				wasDeferred = true
				;(interaction as any).deferred = true
			})

			await executeContextHandler(interaction as any, 'Get User Info')

			expect(mockHandler).toHaveBeenCalled()
			expect(wasDeferred).toBe(true)
			expect(interaction.editReply).toHaveBeenCalledWith({ content: 'Done!' })
		})

		it('should gracefully handle "Unknown interaction" during defer', async () => {
			const mockHandler = fn(
				() => new Promise((resolve) => setTimeout(() => resolve('Done!'), 100))
			)
			const record = {
				key: 'Get User Info',
				path: 'context/user/Get User Info.js',
				enabled: true,
				handler: {
					default: mockHandler,
					config: { sage: { defer: true, deferBuffer: 10 } }
				}
			}

			setupContextMock('Get User Info', record)

			const interaction = createMockUserContextInteraction()
			;(interaction as any).deferReply = fn(async () => {
				throw new Error('Unknown interaction')
			})

			// Should not throw
			await executeContextHandler(interaction as any, 'Get User Info')

			expect(discordLogger.debug).toHaveBeenCalledWith(
				expect.stringContaining('already handled')
			)
		})

		it('should gracefully handle "Interaction has already been acknowledged" during defer', async () => {
			const mockHandler = fn(
				() => new Promise((resolve) => setTimeout(() => resolve('Done!'), 100))
			)
			const record = {
				key: 'Get User Info',
				path: 'context/user/Get User Info.js',
				enabled: true,
				handler: {
					default: mockHandler,
					config: { sage: { defer: true, deferBuffer: 10 } }
				}
			}

			setupContextMock('Get User Info', record)

			const interaction = createMockUserContextInteraction()
			;(interaction as any).deferReply = fn(async () => {
				throw new Error('Interaction has already been acknowledged')
			})

			// Should not throw
			await executeContextHandler(interaction as any, 'Get User Info')

			expect(discordLogger.debug).toHaveBeenCalledWith(
				expect.stringContaining('already handled')
			)
		})
	})

	describe('async handler with sage.defer disabled', () => {
		it('should await async handler and send reply when sage.defer is false', async () => {
			const mockHandler = fn(() => new Promise((resolve) => setTimeout(() => resolve('Async done!'), 50)))
			const record = {
				key: 'Get User Info',
				path: 'context/user/Get User Info.js',
				enabled: true,
				handler: { default: mockHandler, config: { sage: { defer: false } } }
			}

			setupContextMock('Get User Info', record)

			const interaction = createMockUserContextInteraction()
			await executeContextHandler(interaction as any, 'Get User Info')

			expect(mockHandler).toHaveBeenCalled()
		})
	})

	describe('undefined target guard', () => {
		it('should warn and return early when neither user nor message context', async () => {
			const mockHandler = fn().mockReturnValue('Result')
			const record = {
				key: 'Mystery Menu',
				path: 'context/user/Mystery Menu.js',
				enabled: true,
				handler: { default: mockHandler }
			}

			setupContextMock('Mystery Menu', record)

			const interaction = {
				...createMockUserContextInteraction(),
				isMessageContextMenuCommand: () => false,
				isUserContextMenuCommand: () => false
			}

			await executeContextHandler(interaction as any, 'Mystery Menu')

			expect(discordLogger.warn).toHaveBeenCalledWith(
				expect.stringContaining('no target')
			)
			expect(mockHandler).not.toHaveBeenCalled()
		})
	})

	describe('isValidReply check', () => {
		it('should warn when handler returns a Message-like object', async () => {
			const messageObj = { id: '123', content: 'Hello', author: { id: '456' }, channelId: '789' }
			const mockHandler = fn().mockReturnValue(messageObj)
			const record = {
				key: 'Get User Info',
				path: 'context/user/Get User Info.js',
				enabled: true,
				handler: { default: mockHandler }
			}

			setupContextMock('Get User Info', record)

			const interaction = createMockUserContextInteraction()
			await executeContextHandler(interaction as any, 'Get User Info')

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
				key: 'Get User Info',
				path: 'context/user/Get User Info.js',
				enabled: true,
				handler: { default: mockHandler }
			}

			setupContextMock('Get User Info', record)

			const interaction = createMockUserContextInteraction()
			await executeContextHandler(interaction as any, 'Get User Info')

			// Should still send as reply because it's not a Message object
			expect(interaction.reply).toHaveBeenCalled()
		})

		it('should send reply for object with author but no channelId', async () => {
			// Boundary case: old code checked only `id`. New code requires both author AND channelId.
			const obj = { id: '123', author: { id: '456' } }
			const mockHandler = fn().mockReturnValue(obj)
			const record = {
				key: 'Get User Info',
				path: 'context/user/Get User Info.js',
				enabled: true,
				handler: { default: mockHandler }
			}

			setupContextMock('Get User Info', record)

			const interaction = createMockUserContextInteraction()
			await executeContextHandler(interaction as any, 'Get User Info')

			expect(interaction.reply).toHaveBeenCalled()
			expect(discordLogger.warn).not.toHaveBeenCalled()
		})

		it('should send reply for object with channelId but no author', async () => {
			const obj = { id: '123', channelId: '789' }
			const mockHandler = fn().mockReturnValue(obj)
			const record = {
				key: 'Get User Info',
				path: 'context/user/Get User Info.js',
				enabled: true,
				handler: { default: mockHandler }
			}

			setupContextMock('Get User Info', record)

			const interaction = createMockUserContextInteraction()
			await executeContextHandler(interaction as any, 'Get User Info')

			expect(interaction.reply).toHaveBeenCalled()
			expect(discordLogger.warn).not.toHaveBeenCalled()
		})
	})

	describe('server restrictions', () => {
		it('should skip context menu when server is not in serverOnly list', async () => {
			const mockHandler = fn()
			const record = {
				key: 'Get User Info',
				path: 'context/user/Get User Info.js',
				enabled: true,
				metadata: { serverOnly: ['allowed-guild-id'] },
				handler: { default: mockHandler }
			}

			setupContextMock('Get User Info', record)

			const interaction = createMockUserContextInteraction({ guildId: 'other-guild' })
			await executeContextHandler(interaction as any, 'Get User Info')

			expect(mockHandler).not.toHaveBeenCalled()
			expect(discordLogger.debug).toHaveBeenCalledWith(
				expect.stringContaining('restricted to specific servers')
			)
		})

		it('should execute context menu when server is in serverOnly list', async () => {
			const mockHandler = fn().mockReturnValue('Allowed!')
			const record = {
				key: 'Get User Info',
				path: 'context/user/Get User Info.js',
				enabled: true,
				metadata: { serverOnly: ['allowed-guild-id'] },
				handler: { default: mockHandler }
			}

			setupContextMock('Get User Info', record)

			const interaction = createMockUserContextInteraction({ guildId: 'allowed-guild-id' })
			await executeContextHandler(interaction as any, 'Get User Info')

			expect(mockHandler).toHaveBeenCalled()
		})
	})

	describe('Error objects', () => {
		it('should throw Error objects instead of strings for missing exports', async () => {
			const record = {
				key: 'Broken Menu',
				path: 'context/user/Broken Menu.js',
				enabled: true,
				handler: {} // No default export
			}

			setupContextMock('Broken Menu', record)

			const interaction = createMockUserContextInteraction()
			await executeContextHandler(interaction as any, 'Broken Menu')

			// Should log an Error object (not a string)
			const errorArg = (discordLogger.error as jest.Mock).mock.calls[0]?.[0]
			expect(errorArg).toBeInstanceOf(Error)
		})
	})
})

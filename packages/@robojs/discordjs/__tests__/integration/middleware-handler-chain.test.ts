/**
 * Integration Tests: Middleware-Handler Chain
 *
 * Tests the full middleware -> command execution pipeline.
 * Verifies that:
 * - Middleware allows, command handler executes and returns value
 * - Middleware aborts, command handler never executes
 * - Multiple middleware run before handler
 * - Disabled middleware is skipped in chain
 * - Middleware error prevents handler execution
 * - Handler error with sage mode produces error reply
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals'

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
		module: jest.Mock
	}
	Mode: {
		isDev: jest.Mock
	}
	setPortalData: (type: string, data: Record<string, unknown>) => void
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

const { portal, Mode, clearPortalData } = roboMock

// Import the command handler
const { executeCommandHandler } = await import('../../src/core/handlers/command.js')

// Helper: create a mock interaction
function createMockInteraction(overrides: Record<string, unknown> = {}) {
	return {
		commandName: 'test',
		replied: false,
		deferred: false,
		reply: fn().mockResolvedValue(undefined),
		deferReply: fn().mockResolvedValue(undefined),
		editReply: fn().mockResolvedValue(undefined),
		followUp: fn().mockResolvedValue(undefined),
		options: {
			get: fn().mockReturnValue(null),
			getString: fn().mockReturnValue(null),
			getInteger: fn().mockReturnValue(null),
			getNumber: fn().mockReturnValue(null),
			getBoolean: fn().mockReturnValue(null),
			getUser: fn().mockReturnValue(null),
			getSubcommand: fn().mockReturnValue(null),
			getSubcommandGroup: fn().mockReturnValue(null)
		},
		...overrides
	}
}

describe('middleware-handler chain', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		clearPortalData()

		Mode.isDev.mockReturnValue(true)
		portal.ensureRoute.mockResolvedValue(undefined)
		portal.module.mockReturnValue({ isEnabled: fn().mockReturnValue(true) })
	})

	it('middleware allows, command handler executes and returns value', async () => {
		const commandHandler = fn().mockReturnValue('Pong!')
		const middlewareHandler = fn().mockReturnValue(undefined) // No abort

		// Set up portal to return command record with middleware
		portal.getRecord.mockReturnValue({
			key: 'ping',
			enabled: true,
			handler: { default: commandHandler, config: {} },
			metadata: {}
		})

		// Middleware data - executeMiddleware calls portal.getByType('discordjs:middleware')
		portal.getByType.mockImplementation((type: string) => {
			if (type === 'discordjs:middleware') {
				return {
					auth: {
						key: 'auth',
						enabled: true,
						handler: { default: middlewareHandler },
						metadata: {}
					}
				}
			}
			return {}
		})

		const interaction = createMockInteraction()

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await executeCommandHandler(interaction as any, 'ping')

		expect(middlewareHandler).toHaveBeenCalled()
		expect(commandHandler).toHaveBeenCalled()
		expect(interaction.reply).toHaveBeenCalledWith(
			expect.objectContaining({ content: 'Pong!' })
		)
	})

	it('middleware aborts, command handler never executes', async () => {
		const commandHandler = fn().mockReturnValue('Pong!')
		const middlewareHandler = fn().mockReturnValue({ abort: true })

		portal.getRecord.mockReturnValue({
			key: 'ping',
			enabled: true,
			handler: { default: commandHandler, config: {} },
			metadata: {}
		})

		portal.getByType.mockImplementation((type: string) => {
			if (type === 'discordjs:middleware') {
				return {
					auth: {
						key: 'auth',
						enabled: true,
						handler: { default: middlewareHandler },
						metadata: {}
					}
				}
			}
			return {}
		})

		const interaction = createMockInteraction()

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await executeCommandHandler(interaction as any, 'ping')

		expect(middlewareHandler).toHaveBeenCalled()
		expect(commandHandler).not.toHaveBeenCalled()
	})

	it('multiple middleware run before handler', async () => {
		const executionOrder: string[] = []
		const middleware1 = fn().mockImplementation(() => {
			executionOrder.push('middleware1')
		})
		const middleware2 = fn().mockImplementation(() => {
			executionOrder.push('middleware2')
		})
		const commandHandler = fn().mockImplementation(() => {
			executionOrder.push('handler')
		})

		portal.getRecord.mockReturnValue({
			key: 'test',
			enabled: true,
			handler: { default: commandHandler, config: {} },
			metadata: {}
		})

		portal.getByType.mockImplementation((type: string) => {
			if (type === 'discordjs:middleware') {
				return {
					first: {
						key: 'first',
						enabled: true,
						handler: { default: middleware1 },
						metadata: {}
					},
					second: {
						key: 'second',
						enabled: true,
						handler: { default: middleware2 },
						metadata: {}
					}
				}
			}
			return {}
		})

		const interaction = createMockInteraction()

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await executeCommandHandler(interaction as any, 'test')

		expect(executionOrder).toContain('middleware1')
		expect(executionOrder).toContain('middleware2')
		expect(executionOrder).toContain('handler')
		// Both middleware should run before handler
		expect(executionOrder.indexOf('handler')).toBeGreaterThan(executionOrder.indexOf('middleware1'))
		expect(executionOrder.indexOf('handler')).toBeGreaterThan(executionOrder.indexOf('middleware2'))
	})

	it('disabled middleware is skipped in chain', async () => {
		const activeMiddleware = fn().mockReturnValue(undefined)
		const disabledMiddleware = fn().mockReturnValue(undefined)
		const commandHandler = fn().mockReturnValue(undefined)

		portal.getRecord.mockReturnValue({
			key: 'test',
			enabled: true,
			handler: { default: commandHandler, config: {} },
			metadata: {}
		})

		portal.getByType.mockImplementation((type: string) => {
			if (type === 'discordjs:middleware') {
				return {
					active: {
						key: 'active',
						enabled: true,
						handler: { default: activeMiddleware },
						metadata: {}
					},
					disabled: {
						key: 'disabled',
						enabled: false,
						handler: { default: disabledMiddleware },
						metadata: {}
					}
				}
			}
			return {}
		})

		const interaction = createMockInteraction()

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await executeCommandHandler(interaction as any, 'test')

		expect(activeMiddleware).toHaveBeenCalled()
		expect(disabledMiddleware).not.toHaveBeenCalled()
		expect(commandHandler).toHaveBeenCalled()
	})

	it('middleware error prevents handler execution', async () => {
		const middlewareHandler = fn().mockRejectedValue(new Error('Middleware failed'))
		const commandHandler = fn().mockReturnValue('ok')

		portal.getRecord.mockReturnValue({
			key: 'test',
			enabled: true,
			handler: { default: commandHandler, config: {} },
			metadata: {}
		})

		portal.getByType.mockImplementation((type: string) => {
			if (type === 'discordjs:middleware') {
				return {
					failing: {
						key: 'failing',
						enabled: true,
						handler: { default: middlewareHandler },
						metadata: {}
					}
				}
			}
			return {}
		})

		const interaction = createMockInteraction()

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await executeCommandHandler(interaction as any, 'test')

		expect(middlewareHandler).toHaveBeenCalled()
		expect(commandHandler).not.toHaveBeenCalled()
	})

	it('disabled command is not executed even with middleware', async () => {
		const commandHandler = fn()

		portal.getRecord.mockReturnValue({
			key: 'disabled-cmd',
			enabled: false,
			handler: { default: commandHandler, config: {} },
			metadata: {}
		})

		const interaction = createMockInteraction()

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await executeCommandHandler(interaction as any, 'disabled-cmd')

		expect(commandHandler).not.toHaveBeenCalled()
	})

	it('command not found in portal does not crash', async () => {
		portal.getRecord.mockReturnValue(null)

		const interaction = createMockInteraction()

		// Should not throw
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await executeCommandHandler(interaction as any, 'nonexistent')

		expect(interaction.reply).not.toHaveBeenCalled()
	})
})

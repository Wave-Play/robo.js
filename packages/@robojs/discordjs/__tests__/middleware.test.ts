/**
 * Tests for middleware execution
 *
 * Verifies that:
 * - Middleware records are retrieved correctly from portal
 * - getHandlerPath formats paths correctly with plugin prefix
 * - Middleware chain executes in order
 * - Disabled middleware is skipped
 * - Abort behavior works correctly
 * - Errors are handled properly
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals'

// Helper for typed mocks
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fn = jest.fn as any

// Import from 'robo.js' to use the mocked module
const roboMock = (await import('robo.js')) as unknown as {
	portal: {
		getByType: jest.Mock
		importHandler: jest.Mock
	}
	getForkedLogger: (key: string) => {
		debug: jest.Mock
		info: jest.Mock
		warn: jest.Mock
		error: jest.Mock
	}
	clearForkedLoggers: () => void
}

const { portal, getForkedLogger } = roboMock

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

// Import after mocking
const { getMiddleware, getHandlerPath, executeMiddleware } = await import('../src/core/middleware.js')

describe('Middleware', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		clearLoggerMocks()
	})

	describe('getMiddleware', () => {
		it('should return empty array when no middleware registered', () => {
			portal.getByType.mockReturnValue(null)

			const result = getMiddleware()

			expect(result).toEqual([])
		})

		it('should return empty array when middleware object is empty', () => {
			portal.getByType.mockReturnValue({})

			const result = getMiddleware()

			expect(result).toEqual([])
		})

		it('should flatten array records', () => {
			const middleware1 = { key: 'auth', path: 'middleware/auth.js', enabled: true }
			const middleware2 = { key: 'logging', path: 'middleware/logging.js', enabled: true }

			portal.getByType.mockReturnValue({
				default: [middleware1, middleware2]
			})

			const result = getMiddleware()

			expect(result).toEqual([middleware1, middleware2])
		})

		it('should handle single record entries', () => {
			const middleware = { key: 'auth', path: 'middleware/auth.js', enabled: true }

			portal.getByType.mockReturnValue({
				auth: middleware
			})

			const result = getMiddleware()

			expect(result).toEqual([middleware])
		})

		it('should handle mixed array and single records', () => {
			const mw1 = { key: 'auth', path: 'middleware/auth.js', enabled: true }
			const mw2 = { key: 'logging', path: 'middleware/logging.js', enabled: true }
			const mw3 = { key: 'rate-limit', path: 'middleware/rate-limit.js', enabled: true }

			portal.getByType.mockReturnValue({
				default: [mw1, mw2],
				'rate-limit': mw3
			})

			const result = getMiddleware()

			expect(result).toHaveLength(3)
			expect(result).toContainEqual(mw1)
			expect(result).toContainEqual(mw2)
			expect(result).toContainEqual(mw3)
		})
	})

	describe('getHandlerPath', () => {
		it('should return path without prefix when no plugin', () => {
			const record = {
				key: 'auth',
				path: 'middleware/auth.js',
				enabled: true
			}

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = getHandlerPath(record as any)

			expect(result).toBe('middleware/auth.js')
		})

		it('should prefix path with plugin name', () => {
			const record = {
				key: 'auth',
				path: 'middleware/auth.js',
				enabled: true,
				plugin: { name: '@robojs/auth' }
			}

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = getHandlerPath(record as any)

			expect(result).toBe('[@robojs/auth] middleware/auth.js')
		})
	})

	describe('executeMiddleware', () => {
		it('should return true when no middleware registered', async () => {
			portal.getByType.mockReturnValue(null)

			const record = { key: 'ping', path: 'commands/ping.js', enabled: true }
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = await executeMiddleware([], record as any)

			expect(result).toBe(true)
		})

		it('should execute middleware in order', async () => {
			const executionOrder: string[] = []

			const mw1 = {
				key: 'first',
				path: 'middleware/first.js',
				enabled: true,
				handler: {
					default: fn(() => {
						executionOrder.push('first')
						return {}
					})
				}
			}
			const mw2 = {
				key: 'second',
				path: 'middleware/second.js',
				enabled: true,
				handler: {
					default: fn(() => {
						executionOrder.push('second')
						return {}
					})
				}
			}

			portal.getByType.mockReturnValue({
				default: [mw1, mw2]
			})

			const record = { key: 'ping', path: 'commands/ping.js', enabled: true }
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await executeMiddleware([], record as any)

			expect(executionOrder).toEqual(['first', 'second'])
		})

		it('should skip disabled middleware', async () => {
			const mockHandler = fn(() => ({}))

			const mw = {
				key: 'disabled',
				path: 'middleware/disabled.js',
				enabled: false,
				handler: { default: mockHandler }
			}

			portal.getByType.mockReturnValue({ default: [mw] })

			const record = { key: 'ping', path: 'commands/ping.js', enabled: true }
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = await executeMiddleware([], record as any)

			expect(result).toBe(true)
			expect(mockHandler).not.toHaveBeenCalled()
		})

		it('should return false when middleware returns abort', async () => {
			const mw = {
				key: 'auth',
				path: 'middleware/auth.js',
				enabled: true,
				handler: { default: fn(() => ({ abort: true })) }
			}

			portal.getByType.mockReturnValue({ default: [mw] })

			const record = { key: 'ping', path: 'commands/ping.js', enabled: true }
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = await executeMiddleware([], record as any)

			expect(result).toBe(false)
			expect(discordLogger.debug).toHaveBeenCalledWith(expect.stringContaining('aborted'))
		})

		it('should stop chain on abort', async () => {
			const secondHandler = fn(() => ({}))

			const mw1 = {
				key: 'abort',
				path: 'middleware/abort.js',
				enabled: true,
				handler: { default: fn(() => ({ abort: true })) }
			}
			const mw2 = {
				key: 'never',
				path: 'middleware/never.js',
				enabled: true,
				handler: { default: secondHandler }
			}

			portal.getByType.mockReturnValue({ default: [mw1, mw2] })

			const record = { key: 'ping', path: 'commands/ping.js', enabled: true }
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await executeMiddleware([], record as any)

			expect(secondHandler).not.toHaveBeenCalled()
		})

		it('should import handler if not loaded', async () => {
			const mockHandler = fn(() => ({}))
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const mw: any = {
				key: 'lazy',
				path: 'middleware/lazy.js',
				enabled: true,
				handler: null
			}

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			portal.importHandler.mockImplementation((async () => {
				mw.handler = { default: mockHandler }
			}) as any)

			portal.getByType.mockReturnValue({ default: [mw] })

			const record = { key: 'ping', path: 'commands/ping.js', enabled: true }
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await executeMiddleware([], record as any)

			expect(portal.importHandler).toHaveBeenCalledWith('discordjs', 'middleware', 'lazy')
			expect(mockHandler).toHaveBeenCalled()
		})

		it('should pass payload and record to middleware', async () => {
			const mockHandler = fn(() => ({}))

			const mw = {
				key: 'check',
				path: 'middleware/check.js',
				enabled: true,
				handler: { default: mockHandler }
			}

			portal.getByType.mockReturnValue({ default: [mw] })

			const payload = [{ id: '123' }, 'arg2']
			const record = { key: 'ping', path: 'commands/ping.js', enabled: true }
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await executeMiddleware(payload, record as any)

			expect(mockHandler).toHaveBeenCalledWith({
				payload,
				record
			})
		})

		it('should return false and log error on middleware exception', async () => {
			const error = new Error('Middleware failed')

			const mw = {
				key: 'failing',
				path: 'middleware/failing.js',
				enabled: true,
				handler: {
					default: fn(() => {
						throw error
					})
				}
			}

			portal.getByType.mockReturnValue({ default: [mw] })

			const record = { key: 'ping', path: 'commands/ping.js', enabled: true }
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = await executeMiddleware([], record as any)

			expect(result).toBe(false)
			expect(discordLogger.error).toHaveBeenCalledWith('Aborting due to middleware error:', error)
		})

		it('should handle middleware with no default export', async () => {
			const mw = {
				key: 'empty',
				path: 'middleware/empty.js',
				enabled: true,
				handler: {} // No default export
			}

			portal.getByType.mockReturnValue({ default: [mw] })

			const record = { key: 'ping', path: 'commands/ping.js', enabled: true }
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = await executeMiddleware([], record as any)

			// Should continue without error
			expect(result).toBe(true)
		})

		it('should return true when middleware returns non-abort result', async () => {
			const mw = {
				key: 'pass',
				path: 'middleware/pass.js',
				enabled: true,
				handler: { default: fn(() => ({ someData: 'value' })) }
			}

			portal.getByType.mockReturnValue({ default: [mw] })

			const record = { key: 'ping', path: 'commands/ping.js', enabled: true }
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = await executeMiddleware([], record as any)

			expect(result).toBe(true)
		})

		it('should return true when middleware returns undefined', async () => {
			const mw = {
				key: 'void',
				path: 'middleware/void.js',
				enabled: true,
				handler: { default: fn(() => undefined) }
			}

			portal.getByType.mockReturnValue({ default: [mw] })

			const record = { key: 'ping', path: 'commands/ping.js', enabled: true }
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = await executeMiddleware([], record as any)

			expect(result).toBe(true)
		})

		describe('order metadata sorting', () => {
			it('should execute middleware in order based on metadata.order', async () => {
				const executionOrder: string[] = []

				const mw1 = {
					key: 'second',
					path: 'middleware/second.js',
					enabled: true,
					metadata: { order: 2 },
					handler: {
						default: fn(() => {
							executionOrder.push('second')
							return {}
						})
					}
				}
				const mw2 = {
					key: 'first',
					path: 'middleware/first.js',
					enabled: true,
					metadata: { order: 1 },
					handler: {
						default: fn(() => {
							executionOrder.push('first')
							return {}
						})
					}
				}

				portal.getByType.mockReturnValue({
					default: [mw1, mw2]
				})

				const record = { key: 'ping', path: 'commands/ping.js', enabled: true }
				await executeMiddleware([], record as any)

				expect(executionOrder).toEqual(['first', 'second'])
			})

			it('should preserve insertion order for equal-order middleware', async () => {
				const executionOrder: string[] = []

				const mw1 = {
					key: 'alpha',
					path: 'middleware/alpha.js',
					enabled: true,
					metadata: { order: 0 },
					handler: {
						default: fn(() => {
							executionOrder.push('alpha')
							return {}
						})
					}
				}
				const mw2 = {
					key: 'beta',
					path: 'middleware/beta.js',
					enabled: true,
					metadata: { order: 0 },
					handler: {
						default: fn(() => {
							executionOrder.push('beta')
							return {}
						})
					}
				}

				portal.getByType.mockReturnValue({
					default: [mw1, mw2]
				})

				const record = { key: 'ping', path: 'commands/ping.js', enabled: true }
				await executeMiddleware([], record as any)

				expect(executionOrder).toEqual(['alpha', 'beta'])
			})

			it('should treat missing order as 0', async () => {
				const executionOrder: string[] = []

				const mw1 = {
					key: 'explicit',
					path: 'middleware/explicit.js',
					enabled: true,
					metadata: { order: 1 },
					handler: {
						default: fn(() => {
							executionOrder.push('explicit-1')
							return {}
						})
					}
				}
				const mw2 = {
					key: 'default',
					path: 'middleware/default.js',
					enabled: true,
					// No metadata.order — should default to 0
					handler: {
						default: fn(() => {
							executionOrder.push('default-0')
							return {}
						})
					}
				}

				portal.getByType.mockReturnValue({
					default: [mw1, mw2]
				})

				const record = { key: 'ping', path: 'commands/ping.js', enabled: true }
				await executeMiddleware([], record as any)

				// Default (0) should run before explicit (1)
				expect(executionOrder).toEqual(['default-0', 'explicit-1'])
			})

			it('should handle negative order values', async () => {
				const executionOrder: string[] = []

				const mw1 = {
					key: 'normal',
					path: 'middleware/normal.js',
					enabled: true,
					metadata: { order: 0 },
					handler: {
						default: fn(() => {
							executionOrder.push('normal')
							return {}
						})
					}
				}
				const mw2 = {
					key: 'priority',
					path: 'middleware/priority.js',
					enabled: true,
					metadata: { order: -10 },
					handler: {
						default: fn(() => {
							executionOrder.push('priority')
							return {}
						})
					}
				}

				portal.getByType.mockReturnValue({
					default: [mw1, mw2]
				})

				const record = { key: 'ping', path: 'commands/ping.js', enabled: true }
				await executeMiddleware([], record as any)

				expect(executionOrder).toEqual(['priority', 'normal'])
			})
		})
	})
})

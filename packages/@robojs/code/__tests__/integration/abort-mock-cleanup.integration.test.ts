/**
 * Integration tests for mock session cleanup on abort
 *
 * Tests that mock sessions are properly cleaned up when:
 * - Agent run is aborted
 * - Errors occur during mock execution
 * - Multiple sessions exist
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import type { ExecutionProvider } from '../../src/types/execution.js'
import type { TerminalSessionHandle, TerminalChunk, DirEntry, FileStat } from '../../src/types/terminal.js'
import type { AgentEvent } from '../../src/types/events.js'
import { MockRunner } from '../../src/verification/mock-runner.js'

/**
 * Create a mock execution provider for testing
 */
function createMockProvider(
	options: {
		serverOutput?: string[]
		streamExit?: number
		stopSessionFail?: boolean
		stopSessionDelay?: number
	} = {}
): ExecutionProvider & {
	mockHandle: TerminalSessionHandle
	stoppedSessions: string[]
} {
	const mockHandle: TerminalSessionHandle = { id: 'mock-session-' + Date.now() }
	const stoppedSessions: string[] = []

	const provider: ExecutionProvider & { mockHandle: TerminalSessionHandle; stoppedSessions: string[] } = {
		mockHandle,
		stoppedSessions,
		readFile: jest.fn(async () => ''),
		writeFile: jest.fn(async () => {}),
		deletePath: jest.fn(async () => {}),
		exists: jest.fn(async () => false),
		readdir: jest.fn(async (): Promise<DirEntry[]> => []),
		mkdir: jest.fn(async () => {}),
		stat: jest.fn(async (): Promise<FileStat> => ({ size: 0, isDirectory: false })),
		search: jest.fn(async () => []),
		snapshot: jest.fn(async () => ({})),
		run: jest.fn(async () => ({ exitCode: 0, output: '' })),
		runStream: jest.fn(async function* () {}),
		startSession: jest.fn(async () => {
			// Generate unique handle for each session
			return { id: 'session-' + Date.now() + '-' + Math.random().toString(36).slice(2) }
		}),
		stopSession: jest.fn(async (handle: TerminalSessionHandle) => {
			if (options.stopSessionDelay) {
				await new Promise((r) => setTimeout(r, options.stopSessionDelay))
			}
			if (options.stopSessionFail) {
				throw new Error('Failed to stop session')
			}
			stoppedSessions.push(handle.id)
		}),
		streamSession: jest.fn(async function* (): AsyncGenerator<TerminalChunk> {
			const outputs = options.serverOutput ?? ['Mock server ready', 'Listening on port 3000']
			for (const line of outputs) {
				yield { type: 'output', text: line + '\n' }
			}
			if (options.streamExit !== undefined) {
				yield { type: 'exit', exitCode: options.streamExit }
			}
		})
	}

	return provider
}

/**
 * Mock fetch for HTTP operations
 */
function mockFetch() {
	const originalFetch = globalThis.fetch
	let deletedSessions: string[] = []

	globalThis.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
		const urlStr = url instanceof Request ? url.url : String(url)

		if (urlStr.includes('/dispatch')) {
			return new Response(JSON.stringify({ success: true }), { status: 200 })
		}

		if (urlStr.includes('/state')) {
			return new Response(
				JSON.stringify({
					botUser: { id: '1', username: 'TestBot' },
					guilds: [{ id: '2', name: 'Test Guild' }]
				}),
				{ status: 200 }
			)
		}

		if (urlStr.includes('/api/control/sessions') && init?.method === 'POST') {
			return new Response(
				JSON.stringify({ session_id: 'sess-' + Date.now(), token: 'tok_' + Math.random().toString(36).slice(2) }),
				{ status: 200 }
			)
		}

		if (init?.method === 'DELETE') {
			// Track deleted sessions
			const match = urlStr.match(/sessions\/([^\/]+)/)
			if (match) {
				deletedSessions.push(match[1])
			}
			return new Response(null, { status: 204 })
		}

		return new Response('Not found', { status: 404 })
	}) as typeof fetch

	return {
		restore: () => {
			globalThis.fetch = originalFetch
		},
		getDeletedSessions: () => deletedSessions
	}
}

describe('Abort Mock Cleanup Integration', () => {
	let fetchMock: ReturnType<typeof mockFetch>

	beforeEach(() => {
		fetchMock = mockFetch()
	})

	afterEach(() => {
		fetchMock.restore()
	})

	describe('cleanup() method', () => {
		it('should stop all server handles on cleanup', async () => {
			const provider = createMockProvider()
			const runner = new MockRunner({ provider, serverTimeout: 1000 })

			// Start a session
			await runner.start()

			// Cleanup should stop the server
			await runner.cleanup()

			expect(provider.stopSession).toHaveBeenCalled()
		})

		it('should delete all sessions on cleanup', async () => {
			const provider = createMockProvider()
			const runner = new MockRunner({ provider, serverTimeout: 1000 })

			// Start a session
			const session = await runner.start()

			// Cleanup should delete the session via API
			await runner.cleanup()

			// Session should be deleted
			const deleted = fetchMock.getDeletedSessions()
			expect(deleted).toContain(session.sessionId)
		})

		it('should be idempotent - multiple cleanups should not error', async () => {
			const provider = createMockProvider()
			const runner = new MockRunner({ provider, serverTimeout: 1000 })

			await runner.start()

			// Multiple cleanups should not throw
			await expect(runner.cleanup()).resolves.not.toThrow()
			await expect(runner.cleanup()).resolves.not.toThrow()
			await expect(runner.cleanup()).resolves.not.toThrow()
		})

		it('should handle stopSession failures gracefully', async () => {
			const provider = createMockProvider({ stopSessionFail: true })
			const runner = new MockRunner({ provider, serverTimeout: 1000 })

			await runner.start()

			// Should not throw even if stopSession fails
			await expect(runner.cleanup()).resolves.not.toThrow()
		})

		it('should cleanup after scenario execution error', async () => {
			// Mock dispatch to fail
			fetchMock.restore()
			fetchMock = mockFetch()
			globalThis.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
				const urlStr = url instanceof Request ? url.url : String(url)

				if (urlStr.includes('/dispatch')) {
					throw new Error('Network error')
				}

				if (urlStr.includes('/state')) {
					return new Response(
						JSON.stringify({
							botUser: { id: '1', username: 'TestBot' },
							guilds: [{ id: '2', name: 'Test Guild' }]
						}),
						{ status: 200 }
					)
				}

				if (urlStr.includes('/api/control/sessions') && init?.method === 'POST') {
					return new Response(JSON.stringify({ session_id: 'sess-123', token: 'tok_abc' }), { status: 200 })
				}

				if (init?.method === 'DELETE') {
					return new Response(null, { status: 204 })
				}

				return new Response('Not found', { status: 404 })
			}) as typeof fetch

			const provider = createMockProvider()
			const runner = new MockRunner({ provider, serverTimeout: 1000, requestTimeout: 100 })

			const session = await runner.start()

			// Run scenario that will fail during dispatch
			const result = await runner.runScenario(session, {
				id: 'error-scenario',
				title: 'Error test',
				steps: [{ action: 'run /command' }]
			})

			expect(result.passed).toBe(false)

			// Cleanup should still work
			await expect(runner.cleanup()).resolves.not.toThrow()
		})
	})

	describe('stop() method', () => {
		it('should delete session then stop server', async () => {
			const provider = createMockProvider()
			const runner = new MockRunner({ provider, serverTimeout: 1000 })

			const session = await runner.start()
			await runner.stop(session)

			// Session should be deleted
			const deleted = fetchMock.getDeletedSessions()
			expect(deleted).toContain(session.sessionId)

			// Server should be stopped
			expect(provider.stopSession).toHaveBeenCalled()
		})

		it('should emit session_end event', async () => {
			const provider = createMockProvider()
			const events: AgentEvent[] = []
			const runner = new MockRunner({
				provider,
				serverTimeout: 1000,
				onEvent: (e) => events.push(e)
			})

			const session = await runner.start()
			await runner.stop(session)

			const endEvents = events.filter((e) => e.type === 'mock' && (e as any).event.type === 'session_end')
			expect(endEvents).toHaveLength(1)
		})
	})

	describe('resource tracking', () => {
		it('should track active sessions for cleanup', async () => {
			const provider = createMockProvider()
			const runner = new MockRunner({ provider, serverTimeout: 1000 })

			// Start session
			const session = await runner.start()

			// Session should be tracked internally
			// We verify this by checking that cleanup stops the server
			await runner.cleanup()

			expect(provider.stopSession).toHaveBeenCalled()
		})

		it('should remove session from tracking after stop', async () => {
			const provider = createMockProvider()
			const runner = new MockRunner({ provider, serverTimeout: 1000 })

			const session = await runner.start()
			await runner.stop(session)

			// Reset the mock
			;(provider.stopSession as jest.Mock).mockClear()

			// Cleanup should not call stopSession again
			await runner.cleanup()

			expect(provider.stopSession).not.toHaveBeenCalled()
		})
	})

	describe('concurrent cleanup', () => {
		it('should handle concurrent cleanup calls', async () => {
			const provider = createMockProvider({ stopSessionDelay: 10 })
			const runner = new MockRunner({ provider, serverTimeout: 1000 })

			await runner.start()

			// Call cleanup multiple times concurrently
			await Promise.all([runner.cleanup(), runner.cleanup(), runner.cleanup()])

			// Should complete without error
		})
	})

	describe('error scenarios', () => {
		it('should cleanup even when server fails to start', async () => {
			const provider = createMockProvider({
				serverOutput: ['Starting...']
				// No readiness signal - will timeout
			})
			const runner = new MockRunner({ provider, serverTimeout: 100 })

			// Start should fail
			await expect(runner.start()).rejects.toThrow()

			// Cleanup should not throw
			await expect(runner.cleanup()).resolves.not.toThrow()
		})

		it('should cleanup when session creation fails', async () => {
			fetchMock.restore()
			fetchMock = mockFetch()
			globalThis.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
				const urlStr = url instanceof Request ? url.url : String(url)

				if (urlStr.includes('/api/control/sessions') && init?.method === 'POST') {
					return new Response(JSON.stringify({ error: 'Failed' }), { status: 500 })
				}

				return new Response('Not found', { status: 404 })
			}) as typeof fetch

			const provider = createMockProvider()
			const runner = new MockRunner({ provider, serverTimeout: 1000 })

			// Start should fail
			await expect(runner.start()).rejects.toThrow('Failed to create session')

			// Server should be stopped after failure
			expect(provider.stopSession).toHaveBeenCalled()
		})
	})
})

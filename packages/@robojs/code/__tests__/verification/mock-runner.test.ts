/**
 * Unit tests for MockRunner
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import {
	MockRunner,
	type MockSession,
	type MockSessionConfig,
	type DispatchCommand
} from '../../src/verification/mock-runner.js'
import type { ExecutionProvider } from '../../src/types/execution.js'
import type { TerminalSessionHandle, TerminalChunk, DirEntry, FileStat } from '../../src/types/terminal.js'
import type { AgentEvent } from '../../src/types/events.js'

/**
 * Create a mock execution provider for testing
 */
function createMockProvider(
	options: {
		serverOutput?: string[]
		sessionResponse?: { session_id: string; token: string }
		stateResponse?: { botUser: { id: string; username: string }; guilds: Array<{ id: string; name: string }> }
		dispatchResponse?: { success: boolean }
		startSessionError?: Error
		streamExit?: number
	} = {}
): ExecutionProvider & { mockHandle: TerminalSessionHandle } {
	const mockHandle: TerminalSessionHandle = { id: 'mock-session-123' }

	const provider: ExecutionProvider & { mockHandle: TerminalSessionHandle } = {
		mockHandle,
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
			if (options.startSessionError) {
				throw options.startSessionError
			}
			return mockHandle
		}),
		stopSession: jest.fn(async () => {}),
		streamSession: jest.fn(async function* (handle: TerminalSessionHandle): AsyncGenerator<TerminalChunk> {
			// Yield server output lines
			const outputs = options.serverOutput ?? ['Mock server ready', 'Listening on port 3000']
			for (const line of outputs) {
				yield { type: 'output', text: line + '\n' }
			}

			// If exit code specified, yield exit chunk
			if (options.streamExit !== undefined) {
				yield { type: 'exit', exitCode: options.streamExit }
			}
		})
	}

	return provider
}

/**
 * Mock fetch globally for HTTP tests
 */
function mockFetch(responses: {
	sessions?: { status: number; body: unknown }
	state?: { status: number; body: unknown }
	dispatch?: { status: number; body: unknown }
	delete?: { status: number }
}) {
	const originalFetch = globalThis.fetch

	globalThis.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
		const urlStr = url instanceof Request ? url.url : String(url)

		// Check dispatch first (more specific URL pattern)
		if (urlStr.includes('/dispatch')) {
			return new Response(JSON.stringify(responses.dispatch?.body ?? { success: true }), {
				status: responses.dispatch?.status ?? 200
			})
		}

		if (urlStr.includes('/state')) {
			return new Response(
				JSON.stringify(
					responses.state?.body ?? {
						botUser: { id: '1', username: 'TestBot' },
						guilds: [{ id: '2', name: 'Test Guild' }]
					}
				),
				{ status: responses.state?.status ?? 200 }
			)
		}

		// Session creation (POST to /api/control/sessions without /dispatch)
		if (urlStr.includes('/api/control/sessions') && init?.method === 'POST') {
			return new Response(JSON.stringify(responses.sessions?.body ?? { session_id: 'test-123', token: 'tok_abc' }), {
				status: responses.sessions?.status ?? 200
			})
		}

		if (init?.method === 'DELETE') {
			return new Response(null, { status: responses.delete?.status ?? 204 })
		}

		return new Response('Not found', { status: 404 })
	}) as typeof fetch

	return () => {
		globalThis.fetch = originalFetch
	}
}

describe('MockRunner', () => {
	let restoreFetch: () => void

	beforeEach(() => {
		restoreFetch = mockFetch({})
	})

	afterEach(() => {
		restoreFetch()
	})

	describe('constructor', () => {
		it('should create instance with required options', () => {
			const provider = createMockProvider()
			const runner = new MockRunner({ provider })

			expect(runner).toBeInstanceOf(MockRunner)
		})

		it('should accept custom timeouts', () => {
			const provider = createMockProvider()
			const runner = new MockRunner({
				provider,
				serverTimeout: 60000,
				requestTimeout: 10000,
				port: 4000
			})

			expect(runner).toBeInstanceOf(MockRunner)
		})
	})

	describe('start', () => {
		it('should start server and create session', async () => {
			const provider = createMockProvider()
			const runner = new MockRunner({ provider, serverTimeout: 1000 })

			const session = await runner.start()

			expect(session.sessionId).toBe('test-123')
			expect(session.token).toBe('tok_abc')
			expect(session.serverUrl).toBe('http://localhost:3000')
			expect(session.serverHandle).toBe(provider.mockHandle)
		})

		it('should use custom session config', async () => {
			const provider = createMockProvider()
			const runner = new MockRunner({ provider, serverTimeout: 1000 })

			const config: MockSessionConfig = {
				name: 'custom-session',
				botUser: { username: 'MyBot' },
				guilds: [{ name: 'My Guild' }]
			}

			const session = await runner.start(config)

			expect(session.sessionId).toBeDefined()
			expect(fetch).toHaveBeenCalled()
		})

		it('should emit session_start event', async () => {
			const provider = createMockProvider()
			const events: AgentEvent[] = []
			const runner = new MockRunner({
				provider,
				serverTimeout: 1000,
				onEvent: (e) => events.push(e)
			})

			await runner.start()

			const sessionStartEvent = events.find(
				(e) => e.type === 'mock' && (e as { event: { type: string } }).event.type === 'session_start'
			)
			expect(sessionStartEvent).toBeDefined()
		})

		it('should detect port from different readiness patterns', async () => {
			const provider = createMockProvider({
				serverOutput: ['Starting...', 'Server running on http://localhost:4000']
			})
			const runner = new MockRunner({ provider, serverTimeout: 1000 })

			const session = await runner.start()

			expect(session.serverUrl).toBe('http://localhost:4000')
		})

		it('should cleanup server on session creation failure', async () => {
			restoreFetch()
			restoreFetch = mockFetch({
				sessions: { status: 500, body: { error: 'Internal error' } }
			})

			const provider = createMockProvider()
			const runner = new MockRunner({ provider, serverTimeout: 1000 })

			await expect(runner.start()).rejects.toThrow('Failed to create session')

			expect(provider.stopSession).toHaveBeenCalled()
		})
	})

	describe('runScenario', () => {
		let provider: ReturnType<typeof createMockProvider>
		let runner: MockRunner
		let session: MockSession

		beforeEach(async () => {
			provider = createMockProvider()
			runner = new MockRunner({ provider, serverTimeout: 1000, requestTimeout: 1000 })
			session = await runner.start()
		})

		it('should run scenario with no steps', async () => {
			const result = await runner.runScenario(session, {
				id: 'test-1',
				title: 'Empty scenario'
			})

			expect(result.id).toBe('test-1')
			expect(result.title).toBe('Empty scenario')
			expect(result.passed).toBe(true)
			expect(result.assertions).toEqual([])
		})

		it('should run scenario with steps', async () => {
			const result = await runner.runScenario(session, {
				id: 'test-1',
				title: 'With steps',
				steps: [{ action: 'send message', input: 'hello' }]
			})

			expect(result.passed).toBe(true)
		})

		it('should run scenario with assertions', async () => {
			const result = await runner.runScenario(session, {
				id: 'test-1',
				title: 'With assertions',
				assertions: ['response contains "pong"', 'bot replied']
			})

			expect(result.passed).toBe(true)
			expect(result.assertions).toHaveLength(2)
			expect(result.assertions[0].description).toBe('response contains "pong"')
			expect(result.assertions[0].passed).toBe(true)
		})

		it('should emit scenario events', async () => {
			const events: AgentEvent[] = []
			runner = new MockRunner({
				provider,
				serverTimeout: 1000,
				onEvent: (e) => events.push(e)
			})
			session = await runner.start()

			await runner.runScenario(session, {
				id: 'test-1',
				title: 'Event test'
			})

			const scenarioEvents = events.filter(
				(e) => e.type === 'mock' && ['scenario_start', 'scenario_end'].includes((e as any).event.type)
			)
			expect(scenarioEvents).toHaveLength(2)
		})

		it('should handle step failure', async () => {
			restoreFetch()
			restoreFetch = mockFetch({
				sessions: { status: 200, body: { session_id: 'test-123', token: 'tok_abc' } },
				dispatch: { status: 500, body: { error: 'Failed' } }
			})

			const result = await runner.runScenario(session, {
				id: 'test-1',
				title: 'Failing step',
				steps: [{ action: 'run command /ping' }]
			})

			expect(result.passed).toBe(false)
			expect(result.error).toBeDefined()
		})
	})

	describe('dispatchCommand', () => {
		let provider: ReturnType<typeof createMockProvider>
		let runner: MockRunner
		let session: MockSession

		beforeEach(async () => {
			provider = createMockProvider()
			runner = new MockRunner({ provider, serverTimeout: 1000, requestTimeout: 1000 })
			session = await runner.start()
		})

		it('should dispatch message command', async () => {
			const command: DispatchCommand = {
				type: 'message',
				channelId: '123',
				content: 'Hello world'
			}

			const result = await runner.dispatchCommand(session, command)

			expect(result.success).toBe(true)
		})

		it('should dispatch slash command', async () => {
			const command: DispatchCommand = {
				type: 'slash_command',
				channelId: '123',
				commandName: 'ping'
			}

			const result = await runner.dispatchCommand(session, command)

			expect(result.success).toBe(true)
		})

		it('should dispatch button interaction', async () => {
			const command: DispatchCommand = {
				type: 'button',
				customId: 'confirm_button'
			}

			const result = await runner.dispatchCommand(session, command)

			expect(result.success).toBe(true)
		})

		it('should dispatch select menu interaction', async () => {
			const command: DispatchCommand = {
				type: 'select_menu',
				customId: 'role_select',
				values: ['admin', 'mod']
			}

			const result = await runner.dispatchCommand(session, command)

			expect(result.success).toBe(true)
		})

		it('should dispatch modal submission', async () => {
			const command: DispatchCommand = {
				type: 'modal',
				customId: 'feedback_modal',
				fields: { title: 'Bug report', description: 'Something broke' }
			}

			const result = await runner.dispatchCommand(session, command)

			expect(result.success).toBe(true)
		})

		it('should handle dispatch failure', async () => {
			restoreFetch()
			restoreFetch = mockFetch({
				sessions: { status: 200, body: { session_id: 'test-123', token: 'tok_abc' } },
				dispatch: { status: 400, body: { error: 'Invalid command' } }
			})

			const command: DispatchCommand = {
				type: 'message',
				content: 'test'
			}

			const result = await runner.dispatchCommand(session, command)

			expect(result.success).toBe(false)
			expect(result.error).toContain('400')
		})
	})

	describe('stop', () => {
		it('should delete session and stop server', async () => {
			const provider = createMockProvider()
			const runner = new MockRunner({ provider, serverTimeout: 1000 })
			const session = await runner.start()

			await runner.stop(session)

			expect(provider.stopSession).toHaveBeenCalledWith(provider.mockHandle)
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

			const endEvent = events.find((e) => e.type === 'mock' && (e as any).event.type === 'session_end')
			expect(endEvent).toBeDefined()
		})
	})

	describe('cleanup', () => {
		it('should cleanup all active sessions and servers', async () => {
			const provider = createMockProvider()
			const runner = new MockRunner({ provider, serverTimeout: 1000 })

			// Start multiple sessions
			await runner.start()

			await runner.cleanup()

			// stopSession should be called for each server
			expect(provider.stopSession).toHaveBeenCalled()
		})

		it('should handle cleanup when no active sessions', async () => {
			const provider = createMockProvider()
			const runner = new MockRunner({ provider, serverTimeout: 1000 })

			// Should not throw
			await runner.cleanup()
		})

		it('should be safe to call cleanup multiple times', async () => {
			const provider = createMockProvider()
			const runner = new MockRunner({ provider, serverTimeout: 1000 })
			await runner.start()

			await runner.cleanup()
			await runner.cleanup()

			// Should not throw
		})
	})

	describe('error handling', () => {
		it('should timeout if server does not become ready', async () => {
			const provider = createMockProvider({
				serverOutput: ['Starting...', 'Loading...', 'Still loading...']
			})
			const runner = new MockRunner({ provider, serverTimeout: 100 })

			await expect(runner.start()).rejects.toThrow('without readiness signal')
		})

		it('should handle server exit during startup', async () => {
			const provider = createMockProvider({
				serverOutput: ['Starting...'],
				streamExit: 1
			})
			const runner = new MockRunner({ provider, serverTimeout: 1000 })

			await expect(runner.start()).rejects.toThrow('exited unexpectedly')
		})

		it('should handle session start failure', async () => {
			const provider = createMockProvider({
				startSessionError: new Error('Terminal start failed')
			})
			const runner = new MockRunner({ provider, serverTimeout: 1000 })

			await expect(runner.start()).rejects.toThrow('Terminal start failed')
		})
	})
})

describe('parseStepToCommand', () => {
	let provider: ReturnType<typeof createMockProvider>
	let runner: MockRunner
	let session: MockSession

	beforeEach(async () => {
		const restoreFetch = mockFetch({})

		provider = createMockProvider()
		runner = new MockRunner({ provider, serverTimeout: 1000 })
		session = await runner.start()

		// Don't need to restore fetch since we're not testing HTTP
	})

	it('should parse "send message" step', async () => {
		const result = await runner.runScenario(session, {
			id: 'test-1',
			title: 'Test',
			steps: [{ action: 'send message to channel', input: 'Hello!' }]
		})

		// If parsing worked, dispatch would be called
		expect(result.passed).toBe(true)
	})

	it('should parse slash command step', async () => {
		const result = await runner.runScenario(session, {
			id: 'test-1',
			title: 'Test',
			steps: [{ action: 'run /help command' }]
		})

		expect(result.passed).toBe(true)
	})

	it('should parse button click step', async () => {
		const result = await runner.runScenario(session, {
			id: 'test-1',
			title: 'Test',
			steps: [{ action: 'click button', input: 'confirm_btn' }]
		})

		expect(result.passed).toBe(true)
	})

	it('should skip unknown action types', async () => {
		const result = await runner.runScenario(session, {
			id: 'test-1',
			title: 'Test',
			steps: [{ action: 'do something unknown' }]
		})

		// Unknown actions are skipped, not failed
		expect(result.passed).toBe(true)
	})
})

/**
 * Integration tests for mock validation workflow
 *
 * Tests the verify-mock node and MockRunner integration with the agent system.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import type { ExecutionProvider } from '../../src/types/execution.js'
import type { TerminalSessionHandle, TerminalChunk, DirEntry, FileStat } from '../../src/types/terminal.js'
import type { AgentEvent } from '../../src/types/events.js'
import { MockRunner, type MockSession, type MockSessionConfig } from '../../src/verification/mock-runner.js'
import {
	mapScenariosToActions,
	groupActionsByType,
	requiresMockServer
} from '../../src/verification/scenario-mapper.js'
import type { ScenarioSpec } from '../../src/types/acceptance.js'
import type { ProjectProfile } from '../../src/types/robo.js'

/**
 * Create a mock execution provider for testing
 */
function createMockProvider(
	options: {
		serverOutput?: string[]
		streamExit?: number
		startSessionError?: Error
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
function mockFetch(responses: {
	sessions?: { status: number; body: unknown }
	state?: { status: number; body: unknown }
	dispatch?: { status: number; body: unknown }
	delete?: { status: number }
}) {
	const originalFetch = globalThis.fetch

	globalThis.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
		const urlStr = url instanceof Request ? url.url : String(url)

		// Check dispatch first
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

describe('Mock Validation Integration', () => {
	let restoreFetch: () => void

	beforeEach(() => {
		restoreFetch = mockFetch({})
	})

	afterEach(() => {
		restoreFetch()
	})

	describe('scenario mapping to actions', () => {
		const mockProfile: ProjectProfile = {
			kind: 'bot',
			plugins: ['@robojs/discordjs', '@robojs/mock'],
			hasMock: true,
			directories: { commands: '/src/commands' },
			hasConfig: true
		}

		it('should map mock scenarios to mock actions', () => {
			const scenarios: ScenarioSpec[] = [
				{
					id: 'mock-1',
					title: 'Ping command responds',
					description: 'Test /ping command',
					kind: 'mock',
					steps: [{ action: 'run /ping command' }],
					assertions: ['Bot responds with pong']
				}
			]

			const actions = mapScenariosToActions(scenarios, {
				profile: mockProfile,
				testRunner: null
			})

			expect(actions).toHaveLength(1)
			expect(actions[0].type).toBe('mock')
			if (actions[0].type === 'mock') {
				expect(actions[0].steps).toHaveLength(1)
				expect(actions[0].assertions).toHaveLength(1)
			}
		})

		it('should detect mock server requirement', () => {
			const scenariosWithMock: ScenarioSpec[] = [
				{ id: 'mock-1', title: 'Mock test', description: 'Test', kind: 'mock' }
			]
			const scenariosWithoutMock: ScenarioSpec[] = [
				{ id: 'test-1', title: 'Unit test', description: 'Test', kind: 'test' }
			]

			expect(requiresMockServer(scenariosWithMock)).toBe(true)
			expect(requiresMockServer(scenariosWithoutMock)).toBe(false)
		})

		it('should group mixed scenarios by type', () => {
			const scenarios: ScenarioSpec[] = [
				{ id: 'build-1', title: 'Build', description: 'Build test', kind: 'build' },
				{ id: 'test-1', title: 'Test', description: 'Unit test', kind: 'test' },
				{ id: 'mock-1', title: 'Mock', description: 'Mock test', kind: 'mock' },
				{ id: 'mock-2', title: 'Mock 2', description: 'Mock test 2', kind: 'mock' },
				{ id: 'manual-1', title: 'Manual', description: 'Manual test', kind: 'manual' }
			]

			const actions = mapScenariosToActions(scenarios, { profile: mockProfile, testRunner: null })
			const grouped = groupActionsByType(actions)

			expect(grouped.build).toHaveLength(1)
			expect(grouped.test).toHaveLength(1)
			expect(grouped.mock).toHaveLength(2)
			expect(grouped.manual).toHaveLength(1)
		})
	})

	describe('MockRunner lifecycle', () => {
		it('should complete full scenario lifecycle', async () => {
			const provider = createMockProvider()
			const events: AgentEvent[] = []
			const runner = new MockRunner({
				provider,
				serverTimeout: 1000,
				onEvent: (e) => events.push(e)
			})

			// Start session
			const session = await runner.start({
				name: 'integration-test',
				botUser: { username: 'IntegrationBot' },
				guilds: [{ name: 'Test Guild' }]
			})

			expect(session.sessionId).toBe('test-123')
			expect(session.serverUrl).toBe('http://localhost:3000')

			// Run a scenario
			const result = await runner.runScenario(session, {
				id: 'scenario-1',
				title: 'Test Scenario',
				steps: [{ action: 'send message', input: 'hello' }],
				assertions: ['message sent successfully']
			})

			expect(result.passed).toBe(true)
			expect(result.assertions).toHaveLength(1)

			// Stop session
			await runner.stop(session)

			// Verify events
			const mockEvents = events.filter((e) => e.type === 'mock')
			expect(mockEvents.length).toBeGreaterThan(0)

			// Check for session start/end events
			const hasSessionStart = mockEvents.some((e) => (e as any).event.type === 'session_start')
			const hasSessionEnd = mockEvents.some((e) => (e as any).event.type === 'session_end')
			expect(hasSessionStart).toBe(true)
			expect(hasSessionEnd).toBe(true)
		})

		it('should handle multiple scenarios in sequence', async () => {
			const provider = createMockProvider()
			const runner = new MockRunner({ provider, serverTimeout: 1000 })

			const session = await runner.start()

			const results = []
			for (let i = 1; i <= 3; i++) {
				const result = await runner.runScenario(session, {
					id: `scenario-${i}`,
					title: `Test ${i}`,
					steps: [{ action: `run /command${i}` }]
				})
				results.push(result)
			}

			expect(results).toHaveLength(3)
			expect(results.every((r) => r.passed)).toBe(true)

			await runner.stop(session)
		})

		it('should collect failed scenario results', async () => {
			restoreFetch()
			restoreFetch = mockFetch({
				dispatch: { status: 500, body: { error: 'Command failed' } }
			})

			const provider = createMockProvider()
			const runner = new MockRunner({ provider, serverTimeout: 1000, requestTimeout: 1000 })

			const session = await runner.start()

			const result = await runner.runScenario(session, {
				id: 'failing-scenario',
				title: 'This should fail',
				steps: [{ action: 'run /broken command' }]
			})

			expect(result.passed).toBe(false)
			expect(result.error).toBeDefined()

			await runner.stop(session)
		})
	})

	describe('cleanup on errors', () => {
		it('should cleanup on session creation failure', async () => {
			restoreFetch()
			restoreFetch = mockFetch({
				sessions: { status: 500, body: { error: 'Server error' } }
			})

			const provider = createMockProvider()
			const runner = new MockRunner({ provider, serverTimeout: 1000 })

			await expect(runner.start()).rejects.toThrow('Failed to create session')

			// Server should be stopped on failure
			expect(provider.stopSession).toHaveBeenCalled()
		})

		it('should cleanup all resources via cleanup()', async () => {
			const provider = createMockProvider()
			const runner = new MockRunner({ provider, serverTimeout: 1000 })

			// Start multiple sessions (simulated by calling start)
			await runner.start()

			// Force cleanup
			await runner.cleanup()

			// Verify stopSession was called
			expect(provider.stopSession).toHaveBeenCalled()
		})

		it('should handle cleanup when already stopped', async () => {
			const provider = createMockProvider()
			const runner = new MockRunner({ provider, serverTimeout: 1000 })

			const session = await runner.start()
			await runner.stop(session)

			// Cleanup after stop should not throw
			await expect(runner.cleanup()).resolves.not.toThrow()
		})
	})

	describe('event streaming', () => {
		it('should emit terminal events during server startup', async () => {
			const serverOutput = ['Starting Robo...', 'Loading plugins...', 'Listening on port 3000']
			const provider = createMockProvider({ serverOutput })
			const events: AgentEvent[] = []

			const runner = new MockRunner({
				provider,
				serverTimeout: 1000,
				onEvent: (e) => events.push(e)
			})

			await runner.start()

			const terminalEvents = events.filter((e) => e.type === 'terminal')
			expect(terminalEvents.length).toBeGreaterThan(0)
		})

		it('should emit scenario events during execution', async () => {
			const provider = createMockProvider()
			const events: AgentEvent[] = []

			const runner = new MockRunner({
				provider,
				serverTimeout: 1000,
				onEvent: (e) => events.push(e)
			})

			const session = await runner.start()
			await runner.runScenario(session, {
				id: 'test-scenario',
				title: 'Event Test',
				assertions: ['assertion 1', 'assertion 2']
			})
			await runner.stop(session)

			const mockEvents = events.filter((e) => e.type === 'mock')
			const scenarioEvents = mockEvents.filter((e) => {
				const evt = (e as any).event
				return evt.type === 'scenario_start' || evt.type === 'scenario_end'
			})
			const assertionEvents = mockEvents.filter((e) => (e as any).event.type === 'assertion')

			expect(scenarioEvents.length).toBe(2) // start + end
			expect(assertionEvents.length).toBe(2) // 2 assertions
		})
	})

	describe('dispatch commands', () => {
		it('should dispatch slash commands', async () => {
			const provider = createMockProvider()
			const runner = new MockRunner({ provider, serverTimeout: 1000 })
			const session = await runner.start()

			const result = await runner.dispatchCommand(session, {
				type: 'slash_command',
				commandName: 'ping',
				channelId: '123'
			})

			expect(result.success).toBe(true)
			await runner.stop(session)
		})

		it('should dispatch message commands', async () => {
			const provider = createMockProvider()
			const runner = new MockRunner({ provider, serverTimeout: 1000 })
			const session = await runner.start()

			const result = await runner.dispatchCommand(session, {
				type: 'message',
				content: 'Hello, bot!',
				channelId: '123'
			})

			expect(result.success).toBe(true)
			await runner.stop(session)
		})

		it('should dispatch button interactions', async () => {
			const provider = createMockProvider()
			const runner = new MockRunner({ provider, serverTimeout: 1000 })
			const session = await runner.start()

			const result = await runner.dispatchCommand(session, {
				type: 'button',
				customId: 'confirm_action'
			})

			expect(result.success).toBe(true)
			await runner.stop(session)
		})
	})
})

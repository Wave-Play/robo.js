/**
 * Integration tests for abort and cleanup functionality
 *
 * Tests session cleanup on abort and proper resource management.
 */

import { jest } from '@jest/globals'
import { CodeAgent, type CodeAgentConfig } from '../../src/agent/CodeAgent.js'
import type { AgentPolicy } from '../../src/types/policy.js'
import type { ExecutionProvider } from '../../src/types/execution.js'
import type { LLMProvider } from '../../src/types/llm.js'
import type { ToolRegistry } from '../../src/tools/types.js'
import { ToolExecutor } from '../../src/tools/runtime/executor.js'
import type { ProjectIndexer } from '../../src/project/indexer.js'
import type { ProjectOverviewBuilder } from '../../src/project/overview.js'

// Test fixtures
const files: Record<string, string> = {
	'/project/package.json': JSON.stringify({ name: 'test-project', version: '1.0.0' }),
	'/project/src/index.ts': 'console.log("hello")'
}

function createMockProvider(overrides: Partial<ExecutionProvider> = {}): ExecutionProvider {
	const base = {
		readFile: jest.fn(async (path: string) => {
			if (files[path]) return files[path]
			throw new Error(`File not found: ${path}`)
		}),
		writeFile: jest.fn(async (_path: string, _content: string) => undefined),
		deletePath: jest.fn(async (_path: string) => undefined),
		exists: jest.fn(async (path: string) => !!files[path]),
		readdir: jest.fn(async (_path: string) => []),
		mkdir: jest.fn(async (_path: string) => undefined),
		search: jest.fn(async (_pattern: string) => []),
		snapshot: jest.fn(async () => ({})),
		stat: jest.fn(async (_path: string) => ({ isFile: true, isDirectory: false, size: 100, mtime: new Date() })),
		run: jest.fn(async (_command: string) => ({ exitCode: 0, stdout: '', stderr: '' })),
		runStream: jest.fn((_command: string) => (async function* () {})()),
		startSession: jest.fn(async () => ({ id: `session_${Date.now()}` })),
		stopSession: jest.fn(async (_session: { id: string }) => undefined),
		streamSession: jest.fn((_session: { id: string }) => (async function* () {})())
	}

	return { ...base, ...overrides } as unknown as ExecutionProvider
}

function createMockLLM(): LLMProvider {
	return {
		chat: jest.fn(async () => ({
			id: 'test-response',
			content: 'Task completed successfully.',
			toolCalls: [],
			finishReason: 'stop' as const
		})),
		stream: jest.fn(() =>
			(async function* () {
				yield { type: 'text' as const, text: 'Done' }
				yield { type: 'done' as const, finishReason: 'stop' as const }
			})()
		)
	} as unknown as LLMProvider
}

function createMockToolRegistry(): ToolRegistry {
	return {
		register: jest.fn(),
		get: jest.fn(() => undefined),
		getAll: jest.fn(() => []),
		has: jest.fn(() => false),
		getSchemas: jest.fn(() => [])
	} as unknown as ToolRegistry
}

function createMockToolExecutor(
	registry: ToolRegistry,
	provider: ExecutionProvider,
	policy: AgentPolicy
): ToolExecutor {
	// Use the real executor so CodeAgent can safely fork per-run instances.
	// These tests don't execute tools, but they do require a valid ToolExecutor.
	return new ToolExecutor(registry, {
		context: {
			provider,
			policy,
			runId: 'template-run'
		}
	})
}

function createMockProjectIndexer(): ProjectIndexer {
	return {
		refresh: jest.fn(async () => ({
			fingerprint: 'test-fingerprint',
			timestamp: new Date().toISOString(),
			fileCount: 10,
			files: [],
			totalBytes: 1000
		})),
		needsRefresh: jest.fn(async () => false)
	} as unknown as ProjectIndexer
}

function createMockProjectOverviewBuilder(): ProjectOverviewBuilder {
	return {
		refresh: jest.fn(async () => ({
			summary: 'Test project',
			keyFiles: [],
			robo: null,
			package: { name: 'test', version: '1.0.0', dependencies: {}, devDependencies: {}, scripts: {} },
			decisions: [],
			changelog: []
		})),
		addDecision: jest.fn(),
		addChange: jest.fn()
	} as unknown as ProjectOverviewBuilder
}

function createTestPolicy(): AgentPolicy {
	return {
		autoApprove: false,
		maxIterations: 10,
		commandAllowlist: ['npm', 'node', 'npx'],
		denyPaths: ['.env', '.git'],
		context: {
			enableCompaction: false,
			maxMessagesBeforeCompaction: 50,
			keepLastMessages: 10,
			maxSummaryChars: 2000
		}
	}
}

function createTestConfig(provider: ExecutionProvider): CodeAgentConfig {
	const policy = createTestPolicy()
	const toolRegistry = createMockToolRegistry()
	const toolExecutor = createMockToolExecutor(toolRegistry, provider, policy)

	return {
		provider,
		policy,
		llm: createMockLLM(),
		toolRegistry,
		toolExecutor,
		projectIndexer: createMockProjectIndexer(),
		projectOverviewBuilder: createMockProjectOverviewBuilder()
	}
}

describe('Abort and Cleanup Integration', () => {
	describe('session cleanup on abort', () => {
		it('should stop all active sessions on abort', async () => {
			const mockStopSession = jest.fn(async (_session: { id: string }) => undefined)

			const provider = createMockProvider({
				stopSession: mockStopSession
			})

			const config = createTestConfig(provider)

			const agent = new CodeAgent(config)
			const { runId } = await agent.start({ input: 'Long running task' })

			// Simulate terminal sessions being registered
			agent.registerSession(runId, 'term_1')
			agent.registerSession(runId, 'term_2')
			agent.registerSession(runId, 'term_3')

			// Abort should clean up all sessions
			await agent.abort({ runId, reason: 'User cancelled' })

			expect(mockStopSession).toHaveBeenCalledTimes(3)
			expect(mockStopSession).toHaveBeenCalledWith({ id: 'term_1' })
			expect(mockStopSession).toHaveBeenCalledWith({ id: 'term_2' })
			expect(mockStopSession).toHaveBeenCalledWith({ id: 'term_3' })
		})

		it('should handle partial session cleanup failures', async () => {
			let callCount = 0
			const mockStopSession = jest.fn(async (session: { id: string }) => {
				callCount++
				// Fail on second call
				if (callCount === 2) {
					throw new Error(`Failed to stop session ${session.id}`)
				}
			})

			const provider = createMockProvider({
				stopSession: mockStopSession
			})

			const config = createTestConfig(provider)

			const agent = new CodeAgent(config)
			const { runId } = await agent.start({ input: 'Task' })

			agent.registerSession(runId, 'session_1')
			agent.registerSession(runId, 'session_2')
			agent.registerSession(runId, 'session_3')

			// Should not throw even if some sessions fail to stop
			await expect(agent.abort({ runId, reason: 'Cancelled' })).resolves.not.toThrow()

			// All sessions should have been attempted
			expect(mockStopSession).toHaveBeenCalledTimes(3)
		})

		it('should not attempt cleanup for runs without sessions', async () => {
			const mockStopSession = jest.fn(async () => undefined)

			const provider = createMockProvider({
				stopSession: mockStopSession
			})

			const config = createTestConfig(provider)

			const agent = new CodeAgent(config)
			const { runId } = await agent.start({ input: 'Task without sessions' })

			// No sessions registered
			await agent.abort({ runId, reason: 'Done' })

			expect(mockStopSession).not.toHaveBeenCalled()
		})
	})

	describe('session management', () => {
		it('should not affect other runs when aborting one', async () => {
			const mockStopSession = jest.fn(async (_session: { id: string }) => undefined)

			const provider = createMockProvider({
				stopSession: mockStopSession
			})

			const config = createTestConfig(provider)

			const agent = new CodeAgent(config)

			const { runId: run1 } = await agent.start({ input: 'Task 1' })
			const { runId: run2 } = await agent.start({ input: 'Task 2' })

			// Register sessions for both runs
			agent.registerSession(run1, 'session_a')
			agent.registerSession(run2, 'session_b')

			// Abort only run1
			await agent.abort({ runId: run1, reason: 'Cancelled' })

			// Only run1's session should be stopped
			expect(mockStopSession).toHaveBeenCalledTimes(1)
			expect(mockStopSession).toHaveBeenCalledWith({ id: 'session_a' })
		})

		it('should allow session unregistration', async () => {
			const mockStopSession = jest.fn(async (_session: { id: string }) => undefined)

			const provider = createMockProvider({
				stopSession: mockStopSession
			})

			const config = createTestConfig(provider)

			const agent = new CodeAgent(config)
			const { runId } = await agent.start({ input: 'Task' })

			// Register then unregister
			agent.registerSession(runId, 'session_1')
			agent.registerSession(runId, 'session_2')
			agent.unregisterSession(runId, 'session_1')

			// Abort
			await agent.abort({ runId, reason: 'Done' })

			// Only session_2 should be stopped
			expect(mockStopSession).toHaveBeenCalledTimes(1)
			expect(mockStopSession).toHaveBeenCalledWith({ id: 'session_2' })
		})
	})

	describe('cleanup operations', () => {
		it('should remove run on cleanup', async () => {
			const config = createTestConfig(createMockProvider())

			const agent = new CodeAgent(config)
			const { runId } = await agent.start({ input: 'Task' })

			expect(agent.hasRun(runId)).toBe(true)
			expect(agent.listRuns().length).toBe(1)

			agent.cleanup(runId)

			expect(agent.hasRun(runId)).toBe(false)
			expect(agent.listRuns().length).toBe(0)
		})

		it('should handle cleanup of non-existent run', () => {
			const config = createTestConfig(createMockProvider())

			const agent = new CodeAgent(config)

			// Should not throw
			expect(() => {
				agent.cleanup('non_existent')
			}).not.toThrow()
		})

		it('should clean up multiple runs selectively', async () => {
			const config = createTestConfig(createMockProvider())

			const agent = new CodeAgent(config)

			const runs = await Promise.all([
				agent.start({ input: 'Task 1' }),
				agent.start({ input: 'Task 2' }),
				agent.start({ input: 'Task 3' }),
				agent.start({ input: 'Task 4' })
			])

			// Clean up alternating runs
			agent.cleanup(runs[0].runId)
			agent.cleanup(runs[2].runId)

			// Only even-indexed runs should remain
			expect(agent.hasRun(runs[0].runId)).toBe(false)
			expect(agent.hasRun(runs[1].runId)).toBe(true)
			expect(agent.hasRun(runs[2].runId)).toBe(false)
			expect(agent.hasRun(runs[3].runId)).toBe(true)

			expect(agent.listRuns().length).toBe(2)
		})
	})
})

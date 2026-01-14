/**
 * Unit tests for CodeAgent diff and run APIs (Phase 5)
 */

import { jest } from '@jest/globals'
import { CodeAgent, createCodeAgent, type CodeAgentConfig } from '../../src/agent/CodeAgent.js'
import type { AgentPolicy } from '../../src/types/policy.js'
import type { ExecutionProvider } from '../../src/types/execution.js'
import type { LLMProvider } from '../../src/types/llm.js'
import type { ToolRegistry } from '../../src/tools/types.js'
import { ToolExecutor } from '../../src/tools/runtime/executor.js'
import type { ProjectIndexer } from '../../src/project/indexer.js'
import type { ProjectOverviewBuilder } from '../../src/project/overview.js'

// Mock execution provider with all required methods
function createMockProvider(): ExecutionProvider {
	return {
		readFile: jest.fn(async (_path: string) => 'content'),
		writeFile: jest.fn(async (_path: string, _content: string) => undefined),
		deletePath: jest.fn(async (_path: string) => undefined),
		exists: jest.fn(async (_path: string) => true),
		readdir: jest.fn(async (_path: string) => []),
		mkdir: jest.fn(async (_path: string) => undefined),
		search: jest.fn(async (_pattern: string) => []),
		snapshot: jest.fn(async () => ({})),
		stat: jest.fn(async (_path: string) => ({ isFile: true, isDirectory: false, size: 100, mtime: new Date() })),
		run: jest.fn(async (_command: string) => ({ exitCode: 0, stdout: '', stderr: '' })),
		runStream: jest.fn((_command: string) => (async function* () {})()),
		startSession: jest.fn(async () => ({ id: 'session_1' })),
		stopSession: jest.fn(async (_session: { id: string }) => undefined),
		streamSession: jest.fn((_session: { id: string }) => (async function* () {})())
	} as unknown as ExecutionProvider
}

// Mock LLM provider
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

// Mock tool registry
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

// Mock project indexer
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

// Mock project overview builder
function createMockProjectOverviewBuilder(): ProjectOverviewBuilder {
	return {
		refresh: jest.fn(async () => ({
			summary: 'Test project',
			keyFiles: [],
			robo: null,
			package: null,
			decisions: [],
			changelog: []
		})),
		addDecision: jest.fn(),
		addChange: jest.fn()
	} as unknown as ProjectOverviewBuilder
}

// Create a complete AgentPolicy
function createTestPolicy(): AgentPolicy {
	return {
		autoApprove: true,
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

function createTestConfig(): CodeAgentConfig {
	const provider = createMockProvider()
	const policy = createTestPolicy()
	const toolRegistry = createMockToolRegistry()

	return {
		provider,
		policy,
		llm: createMockLLM(),
		toolRegistry,
		toolExecutor: createMockToolExecutor(toolRegistry, provider, policy),
		projectIndexer: createMockProjectIndexer(),
		projectOverviewBuilder: createMockProjectOverviewBuilder()
	}
}

describe('CodeAgent', () => {
	describe('constructor', () => {
		it('should create a CodeAgent instance', () => {
			const agent = new CodeAgent(createTestConfig())
			expect(agent).toBeInstanceOf(CodeAgent)
		})
	})

	describe('start', () => {
		it('should start a new run and return runId', async () => {
			const agent = new CodeAgent(createTestConfig())
			const { runId } = await agent.start({ input: 'Add a hello command' })

			expect(runId).toBeDefined()
			expect(typeof runId).toBe('string')
			expect(agent.hasRun(runId)).toBe(true)
		})

		it('should use default mode as execute', async () => {
			const agent = new CodeAgent(createTestConfig())
			const { runId } = await agent.start({ input: 'Add a hello command' })

			const meta = await agent.getRun(runId)
			expect(meta?.mode).toBe('execute')
		})

		it('should use specified mode', async () => {
			const agent = new CodeAgent(createTestConfig())
			const { runId } = await agent.start({ input: 'Explain the code', mode: 'explain' })

			const meta = await agent.getRun(runId)
			expect(meta?.mode).toBe('explain')
		})
	})

	describe('getPendingDiffs', () => {
		it('should return empty array for new run', async () => {
			const agent = new CodeAgent(createTestConfig())
			const { runId } = await agent.start({ input: 'Add a feature' })

			const diffs = await agent.getPendingDiffs(runId)
			expect(diffs).toEqual([])
		})

		it('should return empty array for non-existent run', async () => {
			const agent = new CodeAgent(createTestConfig())
			const diffs = await agent.getPendingDiffs('non_existent')
			expect(diffs).toEqual([])
		})
	})

	describe('getAppliedDiffs', () => {
		it('should return empty array for new run', async () => {
			const agent = new CodeAgent(createTestConfig())
			const { runId } = await agent.start({ input: 'Add a feature' })

			const diffs = await agent.getAppliedDiffs(runId)
			expect(diffs).toEqual([])
		})

		it('should return empty array for non-existent run', async () => {
			const agent = new CodeAgent(createTestConfig())
			const diffs = await agent.getAppliedDiffs('non_existent')
			expect(diffs).toEqual([])
		})
	})

	describe('getRun', () => {
		it('should return RunMeta for existing run', async () => {
			const agent = new CodeAgent(createTestConfig())
			const { runId } = await agent.start({ input: 'Add a feature' })

			const meta = await agent.getRun(runId)

			expect(meta).not.toBeNull()
			expect(meta?.runId).toBe(runId)
			expect(meta?.instruction).toBe('Add a feature')
			expect(meta?.mode).toBe('execute')
			expect(meta?.status).toBeDefined()
			expect(meta?.createdAt).toBeDefined()
		})

		it('should return null for non-existent run', async () => {
			const agent = new CodeAgent(createTestConfig())
			const meta = await agent.getRun('non_existent')
			expect(meta).toBeNull()
		})
	})

	describe('listRuns', () => {
		it('should return array of run IDs', async () => {
			const agent = new CodeAgent(createTestConfig())

			await agent.start({ input: 'Task 1' })
			await agent.start({ input: 'Task 2' })
			await agent.start({ input: 'Task 3' })

			const runs = agent.listRuns()
			expect(runs.length).toBe(3)
		})
	})

	describe('listRunsWithMeta', () => {
		it('should return array of RunMeta', async () => {
			const agent = new CodeAgent(createTestConfig())

			const { runId: id1 } = await agent.start({ input: 'Task 1' })
			const { runId: id2 } = await agent.start({ input: 'Task 2' })

			const runs = await agent.listRunsWithMeta()
			expect(runs.length).toBe(2)
			expect(runs.some((r) => r.runId === id1)).toBe(true)
			expect(runs.some((r) => r.runId === id2)).toBe(true)
		})

		it('should filter by mode', async () => {
			const agent = new CodeAgent(createTestConfig())

			await agent.start({ input: 'Execute task', mode: 'execute' })
			await agent.start({ input: 'Explain code', mode: 'explain' })
			await agent.start({ input: 'Plan task', mode: 'plan' })

			const runs = await agent.listRunsWithMeta({ mode: 'execute' })
			expect(runs.length).toBe(1)
			expect(runs[0].mode).toBe('execute')
		})

		it('should apply limit', async () => {
			const agent = new CodeAgent(createTestConfig())

			await agent.start({ input: 'Task 1' })
			await agent.start({ input: 'Task 2' })
			await agent.start({ input: 'Task 3' })

			const runs = await agent.listRunsWithMeta({ limit: 2 })
			expect(runs.length).toBe(2)
		})

		it('should sort by creation time descending', async () => {
			const agent = new CodeAgent(createTestConfig())

			const { runId: id1 } = await agent.start({ input: 'First' })
			// Small delay to ensure different timestamps
			await new Promise((resolve) => setTimeout(resolve, 10))
			const { runId: id2 } = await agent.start({ input: 'Second' })
			await new Promise((resolve) => setTimeout(resolve, 10))
			const { runId: id3 } = await agent.start({ input: 'Third' })

			const runs = await agent.listRunsWithMeta()
			expect(runs[0].runId).toBe(id3)
			expect(runs[2].runId).toBe(id1)
		})
	})

	describe('session tracking', () => {
		it('should register and unregister sessions', async () => {
			const agent = new CodeAgent(createTestConfig())
			const { runId } = await agent.start({ input: 'Task' })

			// Register sessions (this is normally done by terminal tools)
			agent.registerSession(runId, 'session_1')
			agent.registerSession(runId, 'session_2')

			// Unregister one
			agent.unregisterSession(runId, 'session_1')

			// Both operations should succeed without error
			expect(agent.hasRun(runId)).toBe(true)
		})

		it('should handle session registration for non-existent run', () => {
			const agent = new CodeAgent(createTestConfig())

			// Should not throw
			agent.registerSession('non_existent', 'session_1')
			agent.unregisterSession('non_existent', 'session_1')
		})
	})

	describe('abort with session cleanup', () => {
		it('should stop active sessions on abort', async () => {
			// Create a mock stopSession function we can verify
			const mockStopSession = jest.fn(async (_session: { id: string }) => undefined)

			const provider = {
				...createMockProvider(),
				stopSession: mockStopSession
			} as unknown as ExecutionProvider

			const policy = createTestPolicy()
			const toolRegistry = createMockToolRegistry()
			const toolExecutor = createMockToolExecutor(toolRegistry, provider, policy)

			const config: CodeAgentConfig = {
				provider,
				policy,
				llm: createMockLLM(),
				toolRegistry,
				toolExecutor,
				projectIndexer: createMockProjectIndexer(),
				projectOverviewBuilder: createMockProjectOverviewBuilder()
			}

			const agent = new CodeAgent(config)
			const { runId } = await agent.start({ input: 'Long running task' })

			// Register some sessions
			agent.registerSession(runId, 'session_1')
			agent.registerSession(runId, 'session_2')

			// Abort the run
			await agent.abort({ runId, reason: 'User cancelled' })

			// Sessions should have been stopped
			expect(mockStopSession).toHaveBeenCalledTimes(2)
			expect(mockStopSession).toHaveBeenCalledWith({ id: 'session_1' })
			expect(mockStopSession).toHaveBeenCalledWith({ id: 'session_2' })
		})

		it('should handle session stop failures gracefully', async () => {
			// Create a provider with a failing stopSession
			const failingProvider = {
				...createMockProvider(),
				stopSession: jest.fn(async () => {
					throw new Error('Session already closed')
				})
			} as unknown as ExecutionProvider

			const policy = createTestPolicy()
			const toolRegistry = createMockToolRegistry()
			const toolExecutor = createMockToolExecutor(toolRegistry, failingProvider, policy)

			const config: CodeAgentConfig = {
				provider: failingProvider,
				policy,
				llm: createMockLLM(),
				toolRegistry,
				toolExecutor,
				projectIndexer: createMockProjectIndexer(),
				projectOverviewBuilder: createMockProjectOverviewBuilder()
			}

			const agent = new CodeAgent(config)
			const { runId } = await agent.start({ input: 'Task' })

			agent.registerSession(runId, 'session_1')

			// Should not throw even if session stop fails
			await expect(agent.abort({ runId, reason: 'Cancelled' })).resolves.not.toThrow()
		})
	})

	describe('hasRun', () => {
		it('should return true for existing run', async () => {
			const agent = new CodeAgent(createTestConfig())
			const { runId } = await agent.start({ input: 'Task' })

			expect(agent.hasRun(runId)).toBe(true)
		})

		it('should return false for non-existent run', () => {
			const agent = new CodeAgent(createTestConfig())
			expect(agent.hasRun('non_existent')).toBe(false)
		})
	})

	describe('cleanup', () => {
		it('should remove a run', async () => {
			const agent = new CodeAgent(createTestConfig())
			const { runId } = await agent.start({ input: 'Task' })

			expect(agent.hasRun(runId)).toBe(true)

			agent.cleanup(runId)

			expect(agent.hasRun(runId)).toBe(false)
		})
	})

	describe('createCodeAgent', () => {
		it('should create a CodeAgent instance', () => {
			const agent = createCodeAgent(createTestConfig())
			expect(agent).toBeInstanceOf(CodeAgent)
		})
	})
})

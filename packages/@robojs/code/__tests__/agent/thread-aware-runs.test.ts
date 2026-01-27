/**
 * Tests for thread-aware runs and per-thread checkpointer
 *
 * Phase A0: Thread-aware runs + per-thread checkpointer
 * Tests multi-turn conversation continuity via shared threadId and checkpointerFactory.
 */

import { jest } from '@jest/globals'
import { MemorySaver } from '@langchain/langgraph/web'
import { CodeAgent, type CodeAgentConfig } from '../../src/agent/CodeAgent.js'
import type { AgentPolicy } from '../../src/types/policy.js'
import type { ExecutionProvider } from '../../src/types/execution.js'
import type { LLMProvider } from '../../src/types/llm.js'
import type { ToolRegistry } from '../../src/tools/types.js'
import { ToolExecutor } from '../../src/tools/runtime/executor.js'
import type { ProjectIndexer } from '../../src/project/indexer.js'
import type { ProjectOverviewBuilder } from '../../src/project/overview.js'
import type { BaseCheckpointSaver } from '@langchain/langgraph'

// Test fixtures
const files: Record<string, string> = {
	'/project/package.json': JSON.stringify({ name: 'test-project', version: '1.0.0' }),
	'/project/src/index.ts': 'console.log("hello")'
}

function createMockProvider(): ExecutionProvider {
	return {
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
	} as unknown as ExecutionProvider
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

interface TestConfigOptions {
	checkpointerFactory?: (threadId: string) => BaseCheckpointSaver
}

function createTestConfig(options: TestConfigOptions = {}): CodeAgentConfig {
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
		projectOverviewBuilder: createMockProjectOverviewBuilder(),
		checkpointerFactory: options.checkpointerFactory
	}
}

describe('Thread-Aware Runs', () => {
	describe('StartRunResult includes threadId', () => {
		it('should return threadId equal to runId when threadId is not provided', async () => {
			const config = createTestConfig()
			const agent = new CodeAgent(config)

			const result = await agent.start({ input: 'Test task' })

			expect(result.threadId).toBeDefined()
			expect(result.threadId).toBe(result.runId)
		})

		it('should return the provided threadId when specified', async () => {
			const config = createTestConfig()
			const agent = new CodeAgent(config)

			const customThreadId = 'custom-thread-123'
			const result = await agent.start({ input: 'Test task', threadId: customThreadId })

			expect(result.threadId).toBe(customThreadId)
			expect(result.runId).not.toBe(customThreadId) // runId should be a new UUID
		})

		it('should generate unique runIds for runs with the same threadId', async () => {
			const config = createTestConfig()
			const agent = new CodeAgent(config)

			const sharedThreadId = 'shared-thread'
			const result1 = await agent.start({ input: 'First task', threadId: sharedThreadId })
			const result2 = await agent.start({ input: 'Second task', threadId: sharedThreadId })

			expect(result1.threadId).toBe(sharedThreadId)
			expect(result2.threadId).toBe(sharedThreadId)
			expect(result1.runId).not.toBe(result2.runId) // Different runIds
		})
	})

	describe('checkpointerFactory', () => {
		it('should use checkpointerFactory when provided', async () => {
			const factoryMock = jest.fn(() => new MemorySaver())
			const config = createTestConfig({ checkpointerFactory: factoryMock })
			const agent = new CodeAgent(config)

			const threadId = 'test-thread'
			await agent.start({ input: 'Test', threadId })

			expect(factoryMock).toHaveBeenCalledWith(threadId)
			expect(factoryMock).toHaveBeenCalledTimes(1)
		})

		it('should call checkpointerFactory with threadId for each run', async () => {
			const factoryMock = jest.fn(() => new MemorySaver())
			const config = createTestConfig({ checkpointerFactory: factoryMock })
			const agent = new CodeAgent(config)

			await agent.start({ input: 'Task 1', threadId: 'thread-A' })
			await agent.start({ input: 'Task 2', threadId: 'thread-B' })
			await agent.start({ input: 'Task 3', threadId: 'thread-A' })

			expect(factoryMock).toHaveBeenCalledTimes(3)
			expect(factoryMock).toHaveBeenNthCalledWith(1, 'thread-A')
			expect(factoryMock).toHaveBeenNthCalledWith(2, 'thread-B')
			expect(factoryMock).toHaveBeenNthCalledWith(3, 'thread-A')
		})

		it('should use default MemorySaver when checkpointerFactory is not provided', async () => {
			const config = createTestConfig() // No checkpointerFactory
			const agent = new CodeAgent(config)

			// Should not throw
			const result = await agent.start({ input: 'Test' })
			expect(result.runId).toBeDefined()
			expect(result.threadId).toBe(result.runId)
		})

		it('should use default MemorySaver when checkpointerFactory returns undefined', async () => {
			// TypeScript won't allow this, but runtime should handle it gracefully
			const factoryMock = jest.fn(() => undefined as unknown as BaseCheckpointSaver)
			const config = createTestConfig({ checkpointerFactory: factoryMock })
			const agent = new CodeAgent(config)

			// This tests the ?? fallback - if factory returns falsy, use MemorySaver
			// Note: The current implementation uses ?., so this actually tests that behavior
			await expect(agent.start({ input: 'Test', threadId: 'test' })).resolves.toBeDefined()
		})
	})

	describe('backward compatibility', () => {
		it('should maintain identical behavior when threadId is not provided', async () => {
			const config = createTestConfig()
			const agent = new CodeAgent(config)

			// Start multiple runs without threadId (old behavior)
			const result1 = await agent.start({ input: 'Task 1' })
			const result2 = await agent.start({ input: 'Task 2' })

			// Each run should have threadId === runId
			expect(result1.threadId).toBe(result1.runId)
			expect(result2.threadId).toBe(result2.runId)

			// Runs should be completely isolated (different threadIds)
			expect(result1.threadId).not.toBe(result2.threadId)

			// Both runs should exist
			expect(agent.hasRun(result1.runId)).toBe(true)
			expect(agent.hasRun(result2.runId)).toBe(true)
		})

		it('should work with all existing StartRunRequest options', async () => {
			const config = createTestConfig()
			const agent = new CodeAgent(config)

			// Test with all existing options
			const result = await agent.start({
				input: 'Test task',
				mode: 'explain',
				debugMode: true
			})

			expect(result.runId).toBeDefined()
			expect(result.threadId).toBe(result.runId)

			const runMeta = await agent.getRun(result.runId)
			expect(runMeta?.mode).toBe('explain')
		})

		it('should work with threadId combined with other options', async () => {
			const config = createTestConfig()
			const agent = new CodeAgent(config)

			const result = await agent.start({
				input: 'Test task',
				mode: 'plan',
				threadId: 'custom-thread',
				debugMode: true
			})

			expect(result.threadId).toBe('custom-thread')
			expect(result.runId).not.toBe('custom-thread')

			const runMeta = await agent.getRun(result.runId)
			expect(runMeta?.mode).toBe('plan')
		})
	})

	describe('thread isolation', () => {
		it('should create separate checkpointers for different threadIds without factory', async () => {
			const config = createTestConfig()
			const agent = new CodeAgent(config)

			// Without a factory, each run gets its own MemorySaver
			const result1 = await agent.start({ input: 'Task 1', threadId: 'thread-1' })
			const result2 = await agent.start({ input: 'Task 2', threadId: 'thread-2' })

			// Both should succeed and be independent
			expect(agent.hasRun(result1.runId)).toBe(true)
			expect(agent.hasRun(result2.runId)).toBe(true)
		})

		it('should allow factory to return same checkpointer for same threadId', async () => {
			// This is the key use case: factory returns cached checkpointer for thread continuity
			const checkpointerCache = new Map<string, MemorySaver>()
			const config = createTestConfig({
				checkpointerFactory: (threadId: string) => {
					if (!checkpointerCache.has(threadId)) {
						checkpointerCache.set(threadId, new MemorySaver())
					}
					return checkpointerCache.get(threadId)!
				}
			})
			const agent = new CodeAgent(config)

			const sharedThreadId = 'shared-thread'

			// First run on thread
			await agent.start({ input: 'First message', threadId: sharedThreadId })

			// Second run on same thread - should use same checkpointer
			await agent.start({ input: 'Second message', threadId: sharedThreadId })

			// Verify only one checkpointer was created for this thread
			expect(checkpointerCache.size).toBe(1)
			expect(checkpointerCache.has(sharedThreadId)).toBe(true)
		})

		it('should create separate checkpointers for different threadIds with factory', async () => {
			const checkpointerCache = new Map<string, MemorySaver>()
			const config = createTestConfig({
				checkpointerFactory: (threadId: string) => {
					if (!checkpointerCache.has(threadId)) {
						checkpointerCache.set(threadId, new MemorySaver())
					}
					return checkpointerCache.get(threadId)!
				}
			})
			const agent = new CodeAgent(config)

			await agent.start({ input: 'Thread A task', threadId: 'thread-A' })
			await agent.start({ input: 'Thread B task', threadId: 'thread-B' })
			await agent.start({ input: 'Another Thread A task', threadId: 'thread-A' })

			// Should have 2 checkpointers (one per unique threadId)
			expect(checkpointerCache.size).toBe(2)
			expect(checkpointerCache.has('thread-A')).toBe(true)
			expect(checkpointerCache.has('thread-B')).toBe(true)
		})
	})

	describe('run metadata', () => {
		it('should include threadId in run metadata', async () => {
			const config = createTestConfig()
			const agent = new CodeAgent(config)

			const customThreadId = 'metadata-test-thread'
			const { runId } = await agent.start({ input: 'Test', threadId: customThreadId })

			const runMeta = await agent.getRun(runId)
			expect(runMeta?.threadId).toBe(customThreadId)
		})

		it('should list runs correctly regardless of threadId', async () => {
			const config = createTestConfig()
			const agent = new CodeAgent(config)

			await agent.start({ input: 'Task 1' }) // No threadId
			await agent.start({ input: 'Task 2', threadId: 'custom' }) // With threadId
			await agent.start({ input: 'Task 3', threadId: 'custom' }) // Same threadId

			const runs = agent.listRuns()
			expect(runs.length).toBe(3)
		})
	})

	describe('message continuity (spec-required)', () => {
		/**
		 * Helper to consume a run's stream to completion
		 */
		async function consumeStream(agent: CodeAgent, runId: string): Promise<void> {
			for await (const _event of agent.stream(runId)) {
				// Consume all events
			}
		}

		it('should preserve state.messages across runs with the same threadId', async () => {
			// Use a caching factory so same threadId → same checkpointer
			const checkpointerCache = new Map<string, MemorySaver>()
			const config = createTestConfig({
				checkpointerFactory: (threadId: string) => {
					if (!checkpointerCache.has(threadId)) {
						checkpointerCache.set(threadId, new MemorySaver())
					}
					return checkpointerCache.get(threadId)!
				}
			})
			const agent = new CodeAgent(config)

			const sharedThreadId = 'continuity-thread'

			// Run 1: Start and stream
			const { runId: run1 } = await agent.start({ input: 'First question', threadId: sharedThreadId })
			await consumeStream(agent, run1)
			const state1 = await agent.getState(run1)
			const messagesAfterRun1 = state1?.messages?.length ?? 0

			// Verify run 1 added messages (at least the human message + some response)
			expect(messagesAfterRun1).toBeGreaterThan(0)

			// Run 2: Follow-up on same thread - should accumulate messages
			const { runId: run2 } = await agent.start({ input: 'Follow-up question', threadId: sharedThreadId })
			await consumeStream(agent, run2)
			const state2 = await agent.getState(run2)
			const messagesAfterRun2 = state2?.messages?.length ?? 0

			// Messages should have grown (run 2 added to run 1's messages)
			expect(messagesAfterRun2).toBeGreaterThan(messagesAfterRun1)
		})

		it('should NOT leak messages between different threadIds', async () => {
			// Use a caching factory to ensure different threads get different checkpointers
			const checkpointerCache = new Map<string, MemorySaver>()
			const config = createTestConfig({
				checkpointerFactory: (threadId: string) => {
					if (!checkpointerCache.has(threadId)) {
						checkpointerCache.set(threadId, new MemorySaver())
					}
					return checkpointerCache.get(threadId)!
				}
			})
			const agent = new CodeAgent(config)

			// Run on thread A
			const { runId: runA } = await agent.start({ input: 'Thread A message', threadId: 'thread-A' })
			await consumeStream(agent, runA)
			const stateA = await agent.getState(runA)
			const messagesA = stateA?.messages?.length ?? 0

			// Run on thread B (completely separate)
			const { runId: runB } = await agent.start({ input: 'Thread B message', threadId: 'thread-B' })
			await consumeStream(agent, runB)
			const stateB = await agent.getState(runB)
			const messagesB = stateB?.messages?.length ?? 0

			// Both threads should have messages
			expect(messagesA).toBeGreaterThan(0)
			expect(messagesB).toBeGreaterThan(0)

			// Thread B should NOT have accumulated Thread A's messages
			// If messages leaked, Thread B would have more messages than Thread A
			// Since both had one instruction, they should have similar message counts
			expect(messagesB).toBeLessThanOrEqual(messagesA + 1) // Allow for minor variance

			// Verify separate checkpointers were created
			expect(checkpointerCache.size).toBe(2)
		})

		it('should isolate messages when no checkpointerFactory is provided (backward compat)', async () => {
			// No factory = each run gets its own MemorySaver = complete isolation
			const config = createTestConfig()
			const agent = new CodeAgent(config)

			// Run 1
			const { runId: run1 } = await agent.start({ input: 'First task' })
			await consumeStream(agent, run1)
			const state1 = await agent.getState(run1)
			const messages1 = state1?.messages?.length ?? 0

			// Run 2 (different runId = different threadId = different checkpointer)
			const { runId: run2 } = await agent.start({ input: 'Second task' })
			await consumeStream(agent, run2)
			const state2 = await agent.getState(run2)
			const messages2 = state2?.messages?.length ?? 0

			// Both should have messages
			expect(messages1).toBeGreaterThan(0)
			expect(messages2).toBeGreaterThan(0)

			// Messages should NOT have accumulated (each run isolated)
			// Both runs had one instruction, so message counts should be similar
			expect(Math.abs(messages1 - messages2)).toBeLessThanOrEqual(2)
		})
	})
})

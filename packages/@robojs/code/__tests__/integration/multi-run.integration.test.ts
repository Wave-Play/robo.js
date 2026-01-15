/**
 * Integration tests for multi-run isolation
 *
 * Tests concurrent runs isolation and proper state management.
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

describe('Multi-Run Isolation Integration', () => {
	describe('run listing', () => {
		it('should list all runs', async () => {
			const agent = new CodeAgent(createTestConfig())

			await agent.start({ input: 'Task 1' })
			await agent.start({ input: 'Task 2' })
			await agent.start({ input: 'Task 3' })

			const runs = agent.listRuns()
			expect(runs.length).toBe(3)
		})

		it('should list runs with full metadata', async () => {
			const agent = new CodeAgent(createTestConfig())

			await agent.start({ input: 'Execute task', mode: 'execute' })
			await agent.start({ input: 'Explain code', mode: 'explain' })

			const runs = await agent.listRunsWithMeta()
			expect(runs.length).toBe(2)
			expect(runs.every((r) => r.runId && r.instruction && r.mode)).toBe(true)
		})

		it('should filter runs by mode', async () => {
			const agent = new CodeAgent(createTestConfig())

			await agent.start({ input: 'Task 1', mode: 'execute' })
			await agent.start({ input: 'Task 2', mode: 'explain' })
			await agent.start({ input: 'Task 3', mode: 'plan' })
			await agent.start({ input: 'Task 4', mode: 'execute' })

			const executeRuns = await agent.listRunsWithMeta({ mode: 'execute' })
			expect(executeRuns.length).toBe(2)
			expect(executeRuns.every((r) => r.mode === 'execute')).toBe(true)
		})

		it('should limit number of runs returned', async () => {
			const agent = new CodeAgent(createTestConfig())

			for (let i = 0; i < 5; i++) {
				await agent.start({ input: `Task ${i + 1}` })
			}

			const runs = await agent.listRunsWithMeta({ limit: 3 })
			expect(runs.length).toBe(3)
		})

		it('should sort runs by creation time (newest first)', async () => {
			const agent = new CodeAgent(createTestConfig())

			const { runId: first } = await agent.start({ input: 'First' })
			await new Promise((resolve) => setTimeout(resolve, 10))
			const { runId: second } = await agent.start({ input: 'Second' })
			await new Promise((resolve) => setTimeout(resolve, 10))
			const { runId: third } = await agent.start({ input: 'Third' })

			const runs = await agent.listRunsWithMeta()

			// Newest should be first
			expect(runs[0].runId).toBe(third)
			expect(runs[1].runId).toBe(second)
			expect(runs[2].runId).toBe(first)
		})
	})

	describe('run isolation', () => {
		it('should isolate pending diffs between runs', async () => {
			const agent = new CodeAgent(createTestConfig())

			const { runId: run1 } = await agent.start({ input: 'Task 1' })
			const { runId: run2 } = await agent.start({ input: 'Task 2' })

			// Each run has its own empty diffs
			const diffs1 = await agent.getPendingDiffs(run1)
			const diffs2 = await agent.getPendingDiffs(run2)

			expect(diffs1).toEqual([])
			expect(diffs2).toEqual([])
		})

		it('should isolate applied diffs between runs', async () => {
			const agent = new CodeAgent(createTestConfig())

			const { runId: run1 } = await agent.start({ input: 'Task 1' })
			const { runId: run2 } = await agent.start({ input: 'Task 2' })

			const diffs1 = await agent.getAppliedDiffs(run1)
			const diffs2 = await agent.getAppliedDiffs(run2)

			expect(diffs1).toEqual([])
			expect(diffs2).toEqual([])
		})

		it('should allow cleanup of individual runs', async () => {
			const agent = new CodeAgent(createTestConfig())

			const { runId: run1 } = await agent.start({ input: 'Task 1' })
			const { runId: run2 } = await agent.start({ input: 'Task 2' })
			const { runId: run3 } = await agent.start({ input: 'Task 3' })

			// Clean up one run
			agent.cleanup(run2)

			// Only that run should be gone
			expect(agent.hasRun(run1)).toBe(true)
			expect(agent.hasRun(run2)).toBe(false)
			expect(agent.hasRun(run3)).toBe(true)
		})

		it('should isolate abort between runs', async () => {
			const agent = new CodeAgent(createTestConfig())

			const { runId: run1 } = await agent.start({ input: 'Task 1' })
			const { runId: run2 } = await agent.start({ input: 'Task 2' })

			// Abort only one run
			await agent.abort({ runId: run1, reason: 'User cancelled' })

			// Other run should still exist
			expect(agent.hasRun(run1)).toBe(true)
			expect(agent.hasRun(run2)).toBe(true)
		})
	})

	describe('concurrent run operations', () => {
		it('should handle rapid run creation', async () => {
			const agent = new CodeAgent(createTestConfig())

			const runPromises = Array.from({ length: 10 }, (_, i) => agent.start({ input: `Task ${i + 1}` }))

			const runs = await Promise.all(runPromises)
			const runIds = runs.map((r) => r.runId)

			// All run IDs should be unique
			expect(new Set(runIds).size).toBe(10)

			// All runs should exist
			runIds.forEach((id) => {
				expect(agent.hasRun(id)).toBe(true)
			})
		})

		it('should handle interleaved operations', async () => {
			const agent = new CodeAgent(createTestConfig())

			const { runId: run1 } = await agent.start({ input: 'Task 1' })
			const { runId: run2 } = await agent.start({ input: 'Task 2' })

			// Interleave operations
			const meta1 = await agent.getRun(run1)
			const diffs2 = await agent.getPendingDiffs(run2)
			const meta2 = await agent.getRun(run2)
			const diffs1 = await agent.getAppliedDiffs(run1)

			// All should return correct data
			expect(meta1?.instruction).toBe('Task 1')
			expect(meta2?.instruction).toBe('Task 2')
			expect(diffs1).toEqual([])
			expect(diffs2).toEqual([])
		})
	})
})

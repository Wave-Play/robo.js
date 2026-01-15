/**
 * Integration tests for interrupt/resume functionality
 *
 * Tests pause/resume idempotency and correct state handling.
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
		startSession: jest.fn(async () => ({ id: 'session_1' })),
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

describe('Interrupt/Resume Integration', () => {
	describe('run state consistency', () => {
		it('should maintain run state after start', async () => {
			const agent = new CodeAgent(createTestConfig())
			const { runId } = await agent.start({ input: 'Add a feature' })

			// State should be consistent
			expect(agent.hasRun(runId)).toBe(true)
			const meta = await agent.getRun(runId)
			expect(meta).not.toBeNull()
			expect(meta?.status).toBeDefined()
		})

		it('should preserve instruction across run operations', async () => {
			const agent = new CodeAgent(createTestConfig())
			const instruction = 'Implement user authentication'
			const { runId } = await agent.start({ input: instruction })

			const meta = await agent.getRun(runId)
			expect(meta?.instruction).toBe(instruction)
		})

		it('should preserve mode across run operations', async () => {
			const agent = new CodeAgent(createTestConfig())
			const { runId } = await agent.start({ input: 'Explain the code', mode: 'explain' })

			const meta = await agent.getRun(runId)
			expect(meta?.mode).toBe('explain')
		})
	})

	describe('diff state tracking', () => {
		it('should start with empty pending diffs', async () => {
			const agent = new CodeAgent(createTestConfig())
			const { runId } = await agent.start({ input: 'Add a feature' })

			const pendingDiffs = await agent.getPendingDiffs(runId)
			expect(pendingDiffs).toEqual([])
		})

		it('should start with empty applied diffs', async () => {
			const agent = new CodeAgent(createTestConfig())
			const { runId } = await agent.start({ input: 'Add a feature' })

			const appliedDiffs = await agent.getAppliedDiffs(runId)
			expect(appliedDiffs).toEqual([])
		})

		it('should return empty arrays for non-existent runs', async () => {
			const agent = new CodeAgent(createTestConfig())

			const pendingDiffs = await agent.getPendingDiffs('invalid_run_id')
			const appliedDiffs = await agent.getAppliedDiffs('invalid_run_id')

			expect(pendingDiffs).toEqual([])
			expect(appliedDiffs).toEqual([])
		})
	})

	describe('abort behavior', () => {
		it('should abort a running task', async () => {
			const agent = new CodeAgent(createTestConfig())
			const { runId } = await agent.start({ input: 'Long running task' })

			await agent.abort({ runId, reason: 'User requested' })

			// Run should still exist but be in aborted state
			expect(agent.hasRun(runId)).toBe(true)
		})

		it('should throw for abort of non-existent run', async () => {
			const agent = new CodeAgent(createTestConfig())

			// Should throw for non-existent run
			await expect(agent.abort({ runId: 'non_existent', reason: 'Test' })).rejects.toThrow(
				'Run not found: non_existent'
			)
		})
	})

	describe('multiple runs', () => {
		it('should handle multiple concurrent runs', async () => {
			const agent = new CodeAgent(createTestConfig())

			const run1 = await agent.start({ input: 'Task 1' })
			const run2 = await agent.start({ input: 'Task 2' })
			const run3 = await agent.start({ input: 'Task 3' })

			// All runs should exist
			expect(agent.hasRun(run1.runId)).toBe(true)
			expect(agent.hasRun(run2.runId)).toBe(true)
			expect(agent.hasRun(run3.runId)).toBe(true)

			// All run IDs should be unique
			expect(new Set([run1.runId, run2.runId, run3.runId]).size).toBe(3)
		})

		it('should isolate run state between runs', async () => {
			const agent = new CodeAgent(createTestConfig())

			const { runId: run1 } = await agent.start({ input: 'Task 1', mode: 'execute' })
			const { runId: run2 } = await agent.start({ input: 'Task 2', mode: 'explain' })

			const meta1 = await agent.getRun(run1)
			const meta2 = await agent.getRun(run2)

			// Each run should have its own state
			expect(meta1?.instruction).toBe('Task 1')
			expect(meta2?.instruction).toBe('Task 2')
			expect(meta1?.mode).toBe('execute')
			expect(meta2?.mode).toBe('explain')
		})
	})
})

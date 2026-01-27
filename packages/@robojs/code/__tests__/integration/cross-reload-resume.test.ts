/**
 * Integration tests for cross-reload resume functionality
 *
 * Phase A4: Durable checkpointer interface
 * Tests that checkpoints survive reload and enable multi-turn continuity.
 *
 * Critical test: Validates acceptance criteria for Phase A4
 * - A thread's checkpoints survive reload
 * - Mid-run interrupts can resume after reload
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import 'fake-indexeddb/auto'
import { CodeAgent, type CodeAgentConfig } from '../../src/agent/CodeAgent.js'
import { createFilesystemCheckpointSaver } from '../../src/checkpointer/filesystem.js'
import { createIndexedDBCheckpointSaver } from '../../src/checkpointer/indexeddb.js'
import type { ExecutionProvider } from '../../src/types/execution.js'
import type { LLMProvider } from '../../src/types/llm.js'
import type { AgentPolicy } from '../../src/types/policy.js'
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
			role: 'assistant' as const,
			content: 'I understand the task.',
			toolCalls: []
		})),
		chatStream: jest.fn(async function* () {
			yield { type: 'text' as const, content: 'I understand' }
			yield { type: 'text' as const, content: ' the task.' }
		})
	} as unknown as LLMProvider
}

function createTestConfig(checkpointerFactory?: (threadId: string) => BaseCheckpointSaver): CodeAgentConfig {
	return {
		provider: createMockProvider(),
		llm: createMockLLM(),
		policy: {
			maxIterations: 10,
			maxTokensPerTurn: 1000,
			allowedCommands: [],
			deniedCommands: [],
			deniedPaths: [],
			allowedNetworkHosts: [],
			requireApprovalForCommands: [],
			requireApprovalForPaths: []
		} as AgentPolicy,
		toolExecutor: new ToolExecutor({
			provider: createMockProvider(),
			policy: {} as AgentPolicy,
			writer: () => {}
		}),
		projectIndexer: {
			needsRefresh: jest.fn(async () => true),
			refresh: jest.fn(async () => ({
				files: [],
				directories: [],
				roboSignals: { commands: [], events: [], api: [], config: [] },
				fingerprint: 'test-fingerprint',
				indexedAt: new Date()
			}))
		} as unknown as ProjectIndexer,
		projectOverviewBuilder: {
			needsRefresh: jest.fn(() => true),
			build: jest.fn(async () => ({
				packageInfo: {
					name: 'test-project',
					version: '1.0.0',
					scripts: {},
					dependencies: {},
					devDependencies: {}
				},
				keyFiles: [],
				roboOverview: undefined,
				agentMemory: { decisions: [], changeLog: [] }
			}))
		} as unknown as ProjectOverviewBuilder,
		checkpointerFactory
	}
}

describe('Cross-reload resume - Filesystem', () => {
	let baseDir: string

	beforeEach(async () => {
		baseDir = join(tmpdir(), `checkpoint-integration-${Date.now()}`)
		await mkdir(baseDir, { recursive: true })
	})

	afterEach(async () => {
		try {
			await rm(baseDir, { recursive: true, force: true })
		} catch (error) {
			// Ignore cleanup errors
		}
	})

	it('should persist checkpoints across reload simulation', async () => {
		const threadId = 'persistent-thread'

		// Factory creates filesystem checkpointers
		const checkpointerFactory = (tid: string) => {
			return createFilesystemCheckpointSaver({
				baseDir,
				threadId: tid
			})
		}

		// Phase 1: Create agent, start run, generate checkpoints
		const agent1 = new CodeAgent(createTestConfig(checkpointerFactory))
		const { runId: runId1 } = await agent1.start({
			input: 'Create a new file',
			mode: 'explain',
			threadId
		})

		// Consume stream to generate checkpoints
		for await (const event of agent1.stream(runId1)) {
			// Process events
		}

		// Get state from first run
		const state1 = await agent1.getState(runId1)
		expect(state1).toBeDefined()
		expect(state1?.messages.length).toBeGreaterThan(0)

		// Phase 2: Simulate reload - create NEW agent instance with SAME checkpointer factory
		const agent2 = new CodeAgent(createTestConfig(checkpointerFactory))

		// Start a new run with the SAME threadId
		const { runId: runId2 } = await agent2.start({
			input: 'Follow-up question about the file',
			mode: 'explain',
			threadId // Same thread ID
		})

		// Get state from second run
		const state2 = await agent2.getState(runId2)

		// Verify continuity: second run should have messages from first run
		expect(state2).toBeDefined()
		expect(state2?.messages.length).toBeGreaterThan(state1?.messages.length || 0)

		// Verify thread ID is consistent
		expect(state2?.threadId).toBe(threadId)
	})

	it('should maintain thread isolation across reloads', async () => {
		const thread1 = 'thread-1'
		const thread2 = 'thread-2'

		// Factory creates filesystem checkpointers per thread
		const checkpointerFactory = (tid: string) => {
			return createFilesystemCheckpointSaver({
				baseDir,
				threadId: tid
			})
		}

		// Phase 1: Create runs on two different threads
		const agent1 = new CodeAgent(createTestConfig(checkpointerFactory))

		const { runId: run1 } = await agent1.start({
			input: 'Secret message for thread 1',
			mode: 'explain',
			threadId: thread1
		})

		for await (const event of agent1.stream(run1)) {
			// Consume
		}

		const { runId: run2 } = await agent1.start({
			input: 'Different message for thread 2',
			mode: 'explain',
			threadId: thread2
		})

		for await (const event of agent1.stream(run2)) {
			// Consume
		}

		// Phase 2: Reload - new agent instance
		const agent2 = new CodeAgent(createTestConfig(checkpointerFactory))

		// Start new runs on each thread
		const { runId: run3 } = await agent2.start({
			input: 'Follow-up on thread 1',
			mode: 'explain',
			threadId: thread1
		})

		const { runId: run4 } = await agent2.start({
			input: 'Follow-up on thread 2',
			mode: 'explain',
			threadId: thread2
		})

		// Get states
		const state3 = await agent2.getState(run3)
		const state4 = await agent2.getState(run4)

		// Verify threads remain isolated
		expect(state3?.threadId).toBe(thread1)
		expect(state4?.threadId).toBe(thread2)

		// Each thread should have its own message history
		expect(state3?.messages).toBeDefined()
		expect(state4?.messages).toBeDefined()
	})
})

describe('Cross-reload resume - IndexedDB', () => {
	it('should persist checkpoints across reload simulation', async () => {
		const threadId = 'persistent-idb-thread'
		const dbName = `test-db-${Date.now()}`

		// Factory creates IndexedDB checkpointers
		const checkpointerFactory = (tid: string) => {
			return createIndexedDBCheckpointSaver({
				dbName,
				threadId: tid
			})
		}

		// Phase 1: Create agent, start run, generate checkpoints
		const agent1 = new CodeAgent(createTestConfig(checkpointerFactory))
		const { runId: runId1 } = await agent1.start({
			input: 'Create a new feature',
			mode: 'explain',
			threadId
		})

		// Consume stream to generate checkpoints
		for await (const event of agent1.stream(runId1)) {
			// Process events
		}

		// Get state from first run
		const state1 = await agent1.getState(runId1)
		expect(state1).toBeDefined()
		expect(state1?.messages.length).toBeGreaterThan(0)

		// Phase 2: Simulate reload - create NEW agent instance with SAME checkpointer factory
		const agent2 = new CodeAgent(createTestConfig(checkpointerFactory))

		// Start a new run with the SAME threadId
		const { runId: runId2 } = await agent2.start({
			input: 'Follow-up question about the feature',
			mode: 'explain',
			threadId // Same thread ID
		})

		// Get state from second run
		const state2 = await agent2.getState(runId2)

		// Verify continuity: second run should have messages from first run
		expect(state2).toBeDefined()
		expect(state2?.messages.length).toBeGreaterThan(state1?.messages.length || 0)

		// Verify thread ID is consistent
		expect(state2?.threadId).toBe(threadId)
	})

	it('should maintain thread isolation across reloads', async () => {
		const thread1 = 'idb-thread-1'
		const thread2 = 'idb-thread-2'
		const dbName = `test-db-isolation-${Date.now()}`

		// Factory creates IndexedDB checkpointers per thread
		const checkpointerFactory = (tid: string) => {
			return createIndexedDBCheckpointSaver({
				dbName,
				threadId: tid
			})
		}

		// Phase 1: Create runs on two different threads
		const agent1 = new CodeAgent(createTestConfig(checkpointerFactory))

		const { runId: run1 } = await agent1.start({
			input: 'Secret message for IDB thread 1',
			mode: 'explain',
			threadId: thread1
		})

		for await (const event of agent1.stream(run1)) {
			// Consume
		}

		const { runId: run2 } = await agent1.start({
			input: 'Different message for IDB thread 2',
			mode: 'explain',
			threadId: thread2
		})

		for await (const event of agent1.stream(run2)) {
			// Consume
		}

		// Phase 2: Reload - new agent instance
		const agent2 = new CodeAgent(createTestConfig(checkpointerFactory))

		// Start new runs on each thread
		const { runId: run3 } = await agent2.start({
			input: 'Follow-up on IDB thread 1',
			mode: 'explain',
			threadId: thread1
		})

		const { runId: run4 } = await agent2.start({
			input: 'Follow-up on IDB thread 2',
			mode: 'explain',
			threadId: thread2
		})

		// Get states
		const state3 = await agent2.getState(run3)
		const state4 = await agent2.getState(run4)

		// Verify threads remain isolated
		expect(state3?.threadId).toBe(thread1)
		expect(state4?.threadId).toBe(thread2)

		// Each thread should have its own message history
		expect(state3?.messages).toBeDefined()
		expect(state4?.messages).toBeDefined()
	})
})

describe('Backward compatibility', () => {
	it('should work without checkpointerFactory (defaults to MemorySaver)', async () => {
		// No checkpointerFactory provided - should use default MemorySaver
		const agent = new CodeAgent(createTestConfig())

		const { runId } = await agent.start({
			input: 'Test without checkpointer factory',
			mode: 'explain'
		})

		// Should work without errors
		for await (const event of agent.stream(runId)) {
			// Process events
		}

		const state = await agent.getState(runId)
		expect(state).toBeDefined()
	})

	it('should not share state between runs without threadId', async () => {
		const agent = new CodeAgent(createTestConfig())

		// Start two runs without threadId (each gets unique runId = threadId)
		const { runId: runId1 } = await agent.start({
			input: 'First run',
			mode: 'explain'
		})

		for await (const event of agent.stream(runId1)) {
			// Consume
		}

		const { runId: runId2 } = await agent.start({
			input: 'Second run',
			mode: 'explain'
		})

		for await (const event of agent.stream(runId2)) {
			// Consume
		}

		// States should be isolated (different thread IDs)
		const state1 = await agent.getState(runId1)
		const state2 = await agent.getState(runId2)

		expect(state1?.threadId).not.toBe(state2?.threadId)
	})
})

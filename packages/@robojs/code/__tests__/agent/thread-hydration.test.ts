/**
 * Tests for thread hydration API
 *
 * Verifies that hosts can restore conversation history after reload
 * without a durable checkpointer by seeding messages and summary.
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
import type { BaseCheckpointSaver } from '@langchain/langgraph'
import { MemorySaver } from '@langchain/langgraph/web'
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'

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

function createTestConfig(checkpointerFactory?: (threadId: string) => BaseCheckpointSaver): CodeAgentConfig {
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
		checkpointerFactory
	}
}

describe('Thread Hydration', () => {
	describe('basic hydration', () => {
		it('should hydrate thread with messages', async () => {
			const agent = new CodeAgent(createTestConfig())

			// Start a run with explicit threadId
			const { runId, threadId } = await agent.start({
				input: 'Follow-up question',
				threadId: 'test-thread-1'
			})

			// Hydrate with messages
			await agent.hydrateThread({
				threadId: 'test-thread-1',
				messages: [
					{ role: 'user', content: 'What is this project?' },
					{ role: 'assistant', content: 'This is a test project.' },
					{ role: 'user', content: 'What files are there?' }
				]
			})

			// Verify messages are in state
			const state = await agent.getState(runId)
			expect(state).toBeDefined()
			expect(state!.messages.length).toBe(3)

			// Verify message types
			expect(state!.messages[0]).toBeInstanceOf(HumanMessage)
			expect(state!.messages[0].content).toBe('What is this project?')
			expect(state!.messages[1]).toBeInstanceOf(AIMessage)
			expect(state!.messages[1].content).toBe('This is a test project.')
			expect(state!.messages[2]).toBeInstanceOf(HumanMessage)
			expect(state!.messages[2].content).toBe('What files are there?')
		})

		it('should hydrate thread with summary', async () => {
			const agent = new CodeAgent(createTestConfig())

			const { runId } = await agent.start({
				input: 'Continue task',
				threadId: 'test-thread-2'
			})

			// Hydrate with summary only
			await agent.hydrateThread({
				threadId: 'test-thread-2',
				summary: 'User asked about the project structure. I explained it uses TypeScript.'
			})

			// Verify summary is in state
			const state = await agent.getState(runId)
			expect(state).toBeDefined()
			expect(state!.summary).toBe('User asked about the project structure. I explained it uses TypeScript.')
		})

		it('should hydrate with both messages and summary', async () => {
			const agent = new CodeAgent(createTestConfig())

			const { runId } = await agent.start({
				input: 'More questions',
				threadId: 'test-thread-3'
			})

			await agent.hydrateThread({
				threadId: 'test-thread-3',
				messages: [
					{ role: 'user', content: 'Tell me about this codebase' },
					{ role: 'assistant', content: 'This is a TypeScript project with tests.' }
				],
				summary: 'Previous conversation covered project overview and architecture.'
			})

			const state = await agent.getState(runId)
			expect(state).toBeDefined()
			expect(state!.messages.length).toBe(2)
			expect(state!.summary).toBe('Previous conversation covered project overview and architecture.')
		})

		it('should handle system messages', async () => {
			const agent = new CodeAgent(createTestConfig())

			const { runId } = await agent.start({
				input: 'Task',
				threadId: 'test-thread-4'
			})

			await agent.hydrateThread({
				threadId: 'test-thread-4',
				messages: [
					{ role: 'system', content: 'You are a helpful coding assistant.' },
					{ role: 'user', content: 'Hello' },
					{ role: 'assistant', content: 'Hi! How can I help?' }
				]
			})

			const state = await agent.getState(runId)
			expect(state).toBeDefined()
			expect(state!.messages.length).toBe(3)
			expect(state!.messages[0]).toBeInstanceOf(SystemMessage)
			expect(state!.messages[0].content).toBe('You are a helpful coding assistant.')
		})
	})

	describe('error handling', () => {
		it('should throw if threadId has no associated run', async () => {
			const agent = new CodeAgent(createTestConfig())

			await expect(
				agent.hydrateThread({
					threadId: 'non-existent-thread',
					messages: [{ role: 'user', content: 'Test' }]
				})
			).rejects.toThrow(/No run found for threadId/)
		})

		it('should provide helpful error message', async () => {
			const agent = new CodeAgent(createTestConfig())

			await expect(
				agent.hydrateThread({
					threadId: 'missing-thread',
					messages: []
				})
			).rejects.toThrow("Call start({ threadId: 'missing-thread' }) first")
		})
	})

	describe('message ordering', () => {
		it('should preserve hydrated messages before new message', async () => {
			const agent = new CodeAgent(createTestConfig())

			const { runId } = await agent.start({
				input: 'New question',
				threadId: 'test-thread-5'
			})

			// Hydrate with historical messages
			await agent.hydrateThread({
				threadId: 'test-thread-5',
				messages: [
					{ role: 'user', content: 'First question' },
					{ role: 'assistant', content: 'First answer' }
				]
			})

			// Start streaming (this appends the new HumanMessage)
			const events = []
			for await (const event of agent.stream(runId)) {
				events.push(event)
				if (event.type === 'abort' || event.type === 'complete') break
			}

			// Verify message order: hydrated messages come first, then new message
			const state = await agent.getState(runId)
			expect(state).toBeDefined()
			expect(state!.messages.length).toBeGreaterThanOrEqual(3) // 2 hydrated + 1 new

			// First two are the hydrated messages
			expect(state!.messages[0].content).toBe('First question')
			expect(state!.messages[1].content).toBe('First answer')

			// Third is the new message from start()
			expect(state!.messages[2].content).toBe('New question')
		})
	})

	describe('multi-run continuity with hydration', () => {
		it('should support hydration across runs on same thread', async () => {
			// Use a shared checkpointer factory to enable true continuity
			const checkpointers = new Map<string, BaseCheckpointSaver>()
			const checkpointerFactory = (threadId: string) => {
				if (!checkpointers.has(threadId)) {
					checkpointers.set(threadId, new MemorySaver())
				}
				return checkpointers.get(threadId)!
			}

			const agent = new CodeAgent(createTestConfig(checkpointerFactory))
			const threadId = 'persistent-thread'

			// Run 1: Hydrate and stream
			const { runId: run1 } = await agent.start({
				input: 'First question',
				threadId
			})

			await agent.hydrateThread({
				threadId,
				messages: [
					{ role: 'user', content: 'What is TypeScript?' },
					{ role: 'assistant', content: 'TypeScript is a typed superset of JavaScript.' }
				]
			})

			// Stream run 1
			for await (const event of agent.stream(run1)) {
				if (event.type === 'abort' || event.type === 'complete') break
			}

			const state1 = await agent.getState(run1)
			expect(state1).toBeDefined()
			expect(state1!.messages.length).toBeGreaterThanOrEqual(3) // 2 hydrated + 1 new

			// Run 2: Same thread, should preserve previous messages
			const { runId: run2 } = await agent.start({
				input: 'Second question',
				threadId
			})

			// Stream run 2 without hydrating (thread should already have history)
			for await (const event of agent.stream(run2)) {
				if (event.type === 'abort' || event.type === 'complete') break
			}

			const state2 = await agent.getState(run2)
			expect(state2).toBeDefined()

			// Should have all messages from run1 plus the new message from run2
			expect(state2!.messages.length).toBeGreaterThan(state1!.messages.length)
		})
	})

	describe('hydration timing', () => {
		it('should work when called before first stream', async () => {
			const agent = new CodeAgent(createTestConfig())

			const { runId } = await agent.start({
				input: 'Question',
				threadId: 'test-thread-6'
			})

			// Hydrate before streaming
			await agent.hydrateThread({
				threadId: 'test-thread-6',
				messages: [{ role: 'user', content: 'Previous context' }]
			})

			const state = await agent.getState(runId)
			expect(state).toBeDefined()
			expect(state!.messages.length).toBe(1)
			expect(state!.messages[0].content).toBe('Previous context')
		})

		it('should allow empty messages array', async () => {
			const agent = new CodeAgent(createTestConfig())

			const { runId } = await agent.start({
				input: 'Task',
				threadId: 'test-thread-7'
			})

			// Hydrate with only summary, no messages
			await agent.hydrateThread({
				threadId: 'test-thread-7',
				messages: [],
				summary: 'Summary only, no messages'
			})

			const state = await agent.getState(runId)
			expect(state).toBeDefined()
			expect(state!.messages.length).toBe(0)
			expect(state!.summary).toBe('Summary only, no messages')
		})
	})
})

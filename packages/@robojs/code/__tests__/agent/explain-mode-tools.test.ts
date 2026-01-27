/**
 * Integration tests for explain mode with tool calling
 *
 * Phase A1: Allow tools in explain/ask mode
 *
 * Tests verify that:
 * - Explain mode can now call read-only tools
 * - Tool call → tool result → final answer flow works
 * - No file modifications occur (appliedChanges remains empty)
 * - Explain mode without tool calls still ends normally
 */

import { CodeAgent, createCodeAgent } from '../../src/agent/CodeAgent.js'
import { MockLLMProvider, MockResponses } from '../../src/llm/MockLLMProvider.js'
import { createDefaultToolRegistry } from '../../src/tools/index.js'
import { createToolExecutor } from '../../src/tools/runtime/executor.js'
import { createProjectIndexer } from '../../src/project/indexer.js'
import { createProjectOverviewBuilder } from '../../src/project/overview.js'
import { NodeProvider } from '../../src/providers/node/index.js'
import type { AgentEvent } from '../../src/types/events.js'
import type { AgentPolicy } from '../../src/types/policy.js'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

const TEST_TIMEOUT = 30000

describe('Explain Mode with Tools (Phase A1)', () => {
	let tempDir: string
	let provider: NodeProvider
	let mockLLM: MockLLMProvider
	let agent: CodeAgent

	beforeEach(async () => {
		// Create temp directory for test files
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'explain-mode-tools-test-'))

		// Create a simple package.json
		await fs.writeFile(
			path.join(tempDir, 'package.json'),
			JSON.stringify({
				name: 'test-project',
				version: '1.0.0',
				type: 'module'
			})
		)

		// Create a test file for reading
		await fs.mkdir(path.join(tempDir, 'src'), { recursive: true })
		await fs.writeFile(path.join(tempDir, 'src', 'index.ts'), 'export const hello = "world";')

		// Initialize provider
		provider = new NodeProvider({ rootDir: tempDir })

		// Initialize mock LLM
		mockLLM = new MockLLMProvider()

		// Create policy
		const policy: AgentPolicy = {
			autoApprove: true,
			maxIterations: 5,
			commandAllowlist: ['npm', 'node']
		}

		// Create tool registry and executor
		const toolRegistry = createDefaultToolRegistry()
		const toolExecutor = createToolExecutor(toolRegistry, {
			context: {
				provider,
				policy,
				runId: 'explain-test-run'
			}
		})

		// Create project indexer and overview builder
		const projectIndexer = createProjectIndexer({ provider, policy })
		const projectOverviewBuilder = createProjectOverviewBuilder({ provider, policy, indexer: projectIndexer })

		// Create agent
		agent = createCodeAgent({
			provider,
			policy,
			llm: mockLLM,
			toolRegistry,
			toolExecutor,
			projectIndexer,
			projectOverviewBuilder
		})
	})

	afterEach(async () => {
		// Cleanup temp directory
		await fs.rm(tempDir, { recursive: true, force: true })
	})

	describe('tool-enabled explain mode', () => {
		it(
			'should call tools and return answer in explain mode',
			async () => {
				// Queue responses:
				// 1. Planner (explain mode may skip LLM here, but add fallback)
				mockLLM.addResponse({
					content: JSON.stringify({
						needsClarification: false,
						requirements: { featureBullets: ['Explain'], constraints: [], nonGoals: [] },
						scenarios: [],
						mustPass: [],
						plan: []
					})
				})

				// 2. Agent calls fs_read tool to explore the codebase
				mockLLM.addResponse(MockResponses.fsRead('/src/index.ts'))

				// 3. Agent provides final answer based on tool result
				mockLLM.addResponse({
					content: 'Based on reading the file, this project exports a hello constant with value "world".'
				})

				const { runId } = await agent.start({
					input: 'What does src/index.ts export?',
					mode: 'explain'
				})

				const events: AgentEvent[] = []
				for await (const event of agent.stream(runId)) {
					events.push(event)
				}

				// Should have start event
				expect(events.find((e) => e.type === 'start')).toBeDefined()

				// Should have tool_call event for fs_read
				const toolCallEvent = events.find((e) => e.type === 'tool_call')
				expect(toolCallEvent).toBeDefined()

				// Should have tool_result event
				const toolResultEvent = events.find((e) => e.type === 'tool_result')
				expect(toolResultEvent).toBeDefined()

				// Should not have abort event (run completed normally)
				expect(events.find((e) => e.type === 'abort')).toBeUndefined()

				// Verify mode is explain
				const state = await agent.getState(runId)
				expect(state?.mode).toBe('explain')

				// No file modifications should have occurred
				expect(state?.appliedChanges ?? []).toHaveLength(0)
			},
			TEST_TIMEOUT
		)

		it(
			'should loop through multiple tool calls before final answer',
			async () => {
				// Queue responses for multi-tool exploration
				// 1. Planner fallback
				mockLLM.addResponse({
					content: JSON.stringify({
						needsClarification: false,
						requirements: { featureBullets: ['Explain'], constraints: [], nonGoals: [] },
						scenarios: [],
						mustPass: [],
						plan: []
					})
				})

				// 2. First tool call - list files
				mockLLM.addResponse(MockResponses.fsRead('/package.json'))

				// 3. Second tool call - read specific file
				mockLLM.addResponse(MockResponses.fsRead('/src/index.ts'))

				// 4. Final answer after reading both files
				mockLLM.addResponse({
					content: 'This is a module project that exports a hello constant.'
				})

				const { runId } = await agent.start({
					input: 'Describe this project',
					mode: 'explain'
				})

				const events: AgentEvent[] = []
				for await (const event of agent.stream(runId)) {
					events.push(event)
				}

				// Should have multiple tool_call events
				const toolCallEvents = events.filter((e) => e.type === 'tool_call')
				expect(toolCallEvents.length).toBeGreaterThanOrEqual(2)

				// Should have multiple tool_result events
				const toolResultEvents = events.filter((e) => e.type === 'tool_result')
				expect(toolResultEvents.length).toBeGreaterThanOrEqual(2)

				// No file modifications
				const state = await agent.getState(runId)
				expect(state?.appliedChanges ?? []).toHaveLength(0)
			},
			TEST_TIMEOUT
		)
	})

	describe('explain mode without tool calls', () => {
		it(
			'should end normally when no tools are called',
			async () => {
				// Queue responses - explain mode without tool usage
				mockLLM.addResponse({
					content: JSON.stringify({
						needsClarification: false,
						requirements: { featureBullets: ['Explain'], constraints: [], nonGoals: [] },
						scenarios: [],
						mustPass: [],
						plan: []
					})
				})

				// Direct answer without using tools
				mockLLM.addResponse({
					content: 'Based on the project context, this is a TypeScript project.'
				})

				const { runId } = await agent.start({
					input: 'What type of project is this?',
					mode: 'explain'
				})

				const events: AgentEvent[] = []
				for await (const event of agent.stream(runId)) {
					events.push(event)
				}

				// Should have start event
				expect(events.find((e) => e.type === 'start')).toBeDefined()

				// Should NOT have tool_call events
				const toolCallEvents = events.filter((e) => e.type === 'tool_call')
				expect(toolCallEvents).toHaveLength(0)

				// Should not have abort event
				expect(events.find((e) => e.type === 'abort')).toBeUndefined()

				// Verify mode is explain
				const state = await agent.getState(runId)
				expect(state?.mode).toBe('explain')
			},
			TEST_TIMEOUT
		)
	})

	describe('explain mode does not enter verification loops', () => {
		it(
			'should not route to reviewer or verification nodes',
			async () => {
				// Queue responses with tool call
				mockLLM.addResponse({
					content: JSON.stringify({
						needsClarification: false,
						requirements: { featureBullets: ['Explain'], constraints: [], nonGoals: [] },
						scenarios: [],
						mustPass: [],
						plan: []
					})
				})

				mockLLM.addResponse(MockResponses.fsRead('/package.json'))

				mockLLM.addResponse({
					content: 'This project is configured as an ESM module.'
				})

				const { runId } = await agent.start({
					input: 'Is this an ESM project?',
					mode: 'explain'
				})

				const events: AgentEvent[] = []
				for await (const event of agent.stream(runId)) {
					events.push(event)
				}

				// Should NOT have verification events
				const verifyEvents = events.filter(
					(e) => e.type === 'verify_build' || e.type === 'verify_tests' || e.type === 'verify_mock'
				)
				expect(verifyEvents).toHaveLength(0)

				// Should NOT have reviewer events
				const reviewEvents = events.filter((e) => e.type === 'review')
				expect(reviewEvents).toHaveLength(0)

				// Final state should show no verification occurred
				const state = await agent.getState(runId)
				expect(state?.lastVerification).toBeNull()
			},
			TEST_TIMEOUT
		)
	})
})

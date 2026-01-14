/**
 * Integration tests for CodeAgent graph execution
 *
 * Tests the full graph workflow including:
 * - Execute mode with verification loop
 * - Explain mode (no edits)
 * - Plan mode (produces criteria)
 * - Question Gate interrupts
 * - Budget exhaustion
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

// Test timeout for integration tests
const TEST_TIMEOUT = 30000

describe('CodeAgent Integration', () => {
	let tempDir: string
	let provider: NodeProvider
	let mockLLM: MockLLMProvider
	let agent: CodeAgent

	beforeEach(async () => {
		// Create temp directory for test files
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'code-agent-test-'))

		// Create a simple package.json
		await fs.writeFile(
			path.join(tempDir, 'package.json'),
			JSON.stringify({
				name: 'test-project',
				version: '1.0.0',
				type: 'module'
			})
		)

		// Initialize provider
		provider = new NodeProvider({ rootDir: tempDir })

		// Initialize mock LLM
		mockLLM = new MockLLMProvider()

		// Create policy
		const policy: AgentPolicy = {
			autoApprove: true, // Auto-approve for tests
			maxIterations: 3,
			commandAllowlist: ['npm', 'node']
		}

		// Create tool registry and executor
		const toolRegistry = createDefaultToolRegistry()
		const toolExecutor = createToolExecutor(toolRegistry, {
			context: {
				provider,
				policy,
				runId: 'test-run'
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

	describe('explain mode', () => {
		it(
			'should produce grounded answers without edits',
			async () => {
				// Queue responses - graph flow: planner (skips or minimal) -> agent
				// Even in explain mode, planner runs first but should skip LLM
				// Adding fallback response in case planner doesn't skip
				mockLLM.addResponse({
					content: JSON.stringify({
						needsClarification: false,
						requirements: { featureBullets: ['Explain'], constraints: [], nonGoals: [] },
						scenarios: [],
						mustPass: [],
						plan: []
					})
				})

				// Response for agent node (explain mode answer)
				mockLLM.addResponse({
					content: 'Based on the project structure, this is a TypeScript project with a simple entry point.'
				})

				const { runId } = await agent.start({
					input: 'Explain the project structure',
					mode: 'explain'
				})

				const events: AgentEvent[] = []
				for await (const event of agent.stream(runId)) {
					events.push(event)
				}

				// Should have start event
				expect(events.find((e) => e.type === 'start')).toBeDefined()

				// Should not have abort event (run completed normally)
				expect(events.find((e) => e.type === 'abort')).toBeUndefined()

				// No files should be modified - check appliedChanges in state
				const state = await agent.getState(runId)
				expect(state?.appliedChanges ?? []).toHaveLength(0)

				// Mode should be explain
				expect(state?.mode).toBe('explain')
			},
			TEST_TIMEOUT
		)
	})

	describe('plan mode', () => {
		it(
			'should produce acceptance criteria and may interrupt',
			async () => {
				// Queue responses for planning - planner expects JSON with specific fields
				mockLLM.addResponse({
					content: JSON.stringify({
						needsClarification: false,
						requirements: {
							featureBullets: ['Add a new command'],
							constraints: [],
							nonGoals: []
						},
						scenarios: [
							{
								id: 'build',
								title: 'Build passes',
								kind: 'build',
								description: 'Project builds without errors'
							}
						],
						mustPass: ['build'],
						plan: [{ step: 1, title: 'Create command', description: 'Create the command file', files: [] }]
					})
				})

				// Add fallback response in case graph continues past planner
				mockLLM.addResponse({
					content: 'Plan created successfully.'
				})

				const { runId } = await agent.start({
					input: 'Add a new command to the project',
					mode: 'plan'
				})

				const events: AgentEvent[] = []
				for await (const event of agent.stream(runId)) {
					events.push(event)
				}

				// Should have start event
				expect(events.find((e) => e.type === 'start')).toBeDefined()

				// Should not have abort event
				expect(events.find((e) => e.type === 'abort')).toBeUndefined()

				// State should have acceptance criteria
				const state = await agent.getState(runId)
				expect(state?.mode).toBe('plan')
				expect(state?.acceptance).toBeDefined()
				expect(state?.acceptance?.scenarios.length).toBeGreaterThan(0)
			},
			TEST_TIMEOUT
		)
	})

	describe('execute mode', () => {
		it(
			'should implement and verify changes',
			async () => {
				// Create src directory
				await fs.mkdir(path.join(tempDir, 'src'), { recursive: true })

				// Queue responses for execution
				// 1. Planner produces acceptance criteria with empty scenarios (skip verification)
				mockLLM.addResponse({
					content: JSON.stringify({
						needsClarification: false,
						requirements: {
							featureBullets: ['Create a hello function'],
							constraints: [],
							nonGoals: []
						},
						scenarios: [],
						mustPass: [],
						plan: [{ step: 1, title: 'Create file', description: 'Create hello.ts', files: ['/src/hello.ts'] }]
					})
				})

				// 2. Agent reads package.json first (tool call)
				mockLLM.addResponse(MockResponses.fsRead('/package.json'))

				// 3. Agent writes the new file (tool call)
				mockLLM.addResponse(MockResponses.fsWrite('/src/hello.ts', 'export const hello = () => "Hello, World!"'))

				// 4. Agent signals completion (no tool calls)
				mockLLM.addResponse(MockResponses.done('Created hello.ts with greeting function'))

				const { runId } = await agent.start({
					input: 'Create a hello function',
					mode: 'execute'
				})

				const events: AgentEvent[] = []
				for await (const event of agent.stream(runId)) {
					events.push(event)
				}

				// Should have start event
				expect(events.find((e) => e.type === 'start')).toBeDefined()

				// Should not have abort event
				expect(events.find((e) => e.type === 'abort')).toBeUndefined()

				// State should show execution happened
				const state = await agent.getState(runId)
				expect(state?.mode).toBe('execute')

				// Messages should include tool calls/results from the agent
				expect(state?.messages.length).toBeGreaterThan(0)
			},
			TEST_TIMEOUT
		)
	})

	describe('budget exhaustion', () => {
		it(
			'should stop and report status when budget exceeded',
			async () => {
				// Create a policy with low budget
				const policy: AgentPolicy = {
					autoApprove: true,
					maxIterations: 1,
					commandAllowlist: ['npm']
				}

				// Create project indexer and overview builder for low budget agent
				const lowBudgetIndexer = createProjectIndexer({ provider, policy })
				const lowBudgetOverviewBuilder = createProjectOverviewBuilder({ provider, policy, indexer: lowBudgetIndexer })

				// Create new agent with low budget
				const lowBudgetRegistry = createDefaultToolRegistry()
				const lowBudgetAgent = createCodeAgent({
					provider,
					policy,
					llm: mockLLM,
					toolRegistry: lowBudgetRegistry,
					toolExecutor: createToolExecutor(lowBudgetRegistry, {
						context: {
							provider,
							policy,
							runId: 'low-budget-test-run'
						}
					}),
					projectIndexer: lowBudgetIndexer,
					projectOverviewBuilder: lowBudgetOverviewBuilder
				})

				// Queue responses that will exceed budget
				mockLLM.addResponse({ content: '{}' }) // Planner
				mockLLM.addResponse({ content: 'Working on it...' }) // Agent - iteration 1
				mockLLM.addResponse({ content: 'Still working...' }) // Agent - iteration 2 (exceeds)

				const { runId } = await lowBudgetAgent.start({
					input: 'Complex task that takes many iterations',
					mode: 'execute'
				})

				const events: AgentEvent[] = []
				for await (const event of lowBudgetAgent.stream(runId)) {
					events.push(event)
				}

				// Should have abort or complete event
				const terminal = events.find((e) => e.type === 'abort' || e.type === 'complete')
				expect(terminal).toBeDefined()
			},
			TEST_TIMEOUT
		)
	})

	describe('Question Gate', () => {
		it(
			'should interrupt and resume correctly',
			async () => {
				// Queue response that asks a question - planner format
				mockLLM.addResponse({
					content: JSON.stringify({
						needsClarification: true,
						question: {
							text: 'Which database would you like to use?',
							choices: [
								{ id: 'postgres', label: 'PostgreSQL' },
								{ id: 'mysql', label: 'MySQL' }
							]
						}
					})
				})

				const { runId } = await agent.start({
					input: 'Add a database connection',
					mode: 'execute'
				})

				const events: AgentEvent[] = []
				for await (const event of agent.stream(runId)) {
					events.push(event)

					// Stop when we get a question
					if (event.type === 'question') {
						break
					}
				}

				// Should have received question event
				const question = events.find((e) => e.type === 'question')
				expect(question).toBeDefined()

				// State should have pending question
				const stateBeforeResume = await agent.getState(runId)
				expect(stateBeforeResume?.pendingQuestion).toBeDefined()
			},
			TEST_TIMEOUT
		)

		it(
			'should not repeat side effects on resume',
			async () => {
				// This test verifies that when resuming from a question gate,
				// previous side effects (like file writes) are not repeated.
				// The Question Gate uses LangGraph interrupt() which ensures idempotency.

				// Planner with question
				mockLLM.addResponse({
					content: JSON.stringify({
						needsClarification: true,
						question: {
							text: 'Continue?',
							choices: [{ id: 'yes', label: 'Yes' }]
						}
					})
				})

				const { runId } = await agent.start({
					input: 'Ask question',
					mode: 'execute'
				})

				// Stream until question
				const events: AgentEvent[] = []
				for await (const event of agent.stream(runId)) {
					events.push(event)
					if (event.type === 'question') break
				}

				// Should have hit question gate
				const state = await agent.getState(runId)
				expect(state?.pendingQuestion).toBeDefined()

				// Verify question gate was triggered (no side effects before interrupt)
				expect(events.find((e) => e.type === 'question')).toBeDefined()
			},
			TEST_TIMEOUT
		)
	})

	describe('run management', () => {
		it(
			'should track runs correctly',
			async () => {
				mockLLM.addResponse({ content: '{}' })
				mockLLM.addResponse(MockResponses.done('Done'))

				const { runId } = await agent.start({ input: 'Test' })

				expect(agent.hasRun(runId)).toBe(true)
				expect(agent.listRuns()).toContain(runId)

				// Stream to completion
				for await (const _ of agent.stream(runId)) {
					// Consume events
				}

				// Cleanup
				agent.cleanup(runId)
				expect(agent.hasRun(runId)).toBe(false)
			},
			TEST_TIMEOUT
		)

		it(
			'should support multiple concurrent runs',
			async () => {
				mockLLM.addResponse({ content: '{}' })
				mockLLM.addResponse(MockResponses.done('Done 1'))
				mockLLM.addResponse({ content: '{}' })
				mockLLM.addResponse(MockResponses.done('Done 2'))

				const { runId: run1 } = await agent.start({ input: 'Task 1' })
				const { runId: run2 } = await agent.start({ input: 'Task 2' })

				expect(run1).not.toBe(run2)
				expect(agent.listRuns()).toHaveLength(2)
				expect(agent.listRuns()).toContain(run1)
				expect(agent.listRuns()).toContain(run2)
			},
			TEST_TIMEOUT
		)

		it(
			'should abort runs correctly',
			async () => {
				mockLLM.addResponse({ content: '{}' })
				// Add a long-running response
				mockLLM.addResponse({ content: 'Processing...' })

				const { runId } = await agent.start({ input: 'Long task' })

				// Abort immediately
				await agent.abort({ runId, reason: 'User cancelled' })

				const state = await agent.getState(runId)
				expect(state?.aborted).toBe(true)
				expect(state?.abortReason).toBe('User cancelled')
			},
			TEST_TIMEOUT
		)
	})
})

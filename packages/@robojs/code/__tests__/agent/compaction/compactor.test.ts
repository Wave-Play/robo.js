/**
 * Unit tests for context compaction engine
 */

import { AIMessage, HumanMessage, ToolMessage, SystemMessage } from '@langchain/core/messages'
import { ContextCompactor, createContextCompactor, type CompactionResult } from '../../../src/agent/compaction/index.js'
import { DEFAULT_TOKEN_USAGE, type AgentState } from '../../../src/agent/state.js'

// Helper to create a minimal state for testing
function createTestState(overrides: Partial<AgentState> = {}): AgentState {
	return {
		mode: 'execute',
		phase: 'agent_done',
		instruction: 'Add a hello command',
		plan: [],
		currentStep: 0,
		acceptance: null,
		acceptanceStatus: null,
		pendingQuestion: null,
		lastAnswer: null,
		projectProfile: null,
		projectIndex: null,
		projectOverview: null,
		pendingChanges: [],
		pendingDiffs: [],
		pendingCommand: null,
		lastVerification: null,
		appliedChanges: [],
		appliedDiffs: [],
		summary: null,
		tokenUsage: DEFAULT_TOKEN_USAGE,
		currentContextTokens: 0,
		awaitingApproval: false,
		approved: null,
		approvalReason: null,
		aborted: false,
		abortReason: null,
		completionSummary: null,
		iterations: 0,
		budgetExceeded: false,
		limitReached: false,
		limitContinue: false,
		messages: [],
		...overrides
	}
}

describe('ContextCompactor', () => {
	describe('shouldCompact', () => {
		it('should return false when compaction is disabled', () => {
			const compactor = new ContextCompactor({ enableCompaction: false })
			const state = createTestState({
				messages: Array(100).fill(new HumanMessage('test'))
			})

			expect(compactor.shouldCompact(state)).toBe(false)
		})

		it('should return false when message count is below threshold', () => {
			const compactor = new ContextCompactor({
				enableCompaction: true,
				maxMessagesBeforeCompaction: 50
			})
			const state = createTestState({
				messages: Array(30).fill(new HumanMessage('test'))
			})

			expect(compactor.shouldCompact(state)).toBe(false)
		})

		it('should return true when message count exceeds threshold', () => {
			const compactor = new ContextCompactor({
				enableCompaction: true,
				maxMessagesBeforeCompaction: 50
			})
			const state = createTestState({
				messages: Array(51).fill(new HumanMessage('test'))
			})

			expect(compactor.shouldCompact(state)).toBe(true)
		})

		it('should return true at exactly threshold + 1', () => {
			const compactor = new ContextCompactor({
				enableCompaction: true,
				maxMessagesBeforeCompaction: 10
			})
			const state = createTestState({
				messages: Array(11).fill(new HumanMessage('test'))
			})

			expect(compactor.shouldCompact(state)).toBe(true)
		})
	})

	describe('compact', () => {
		it('should keep only the last N turns', () => {
			const compactor = new ContextCompactor({
				enableCompaction: true,
				maxMessagesBeforeCompaction: 10,
				keepLastMessages: 3
			})

			// Create 10 turns (each a HumanMessage)
			const messages = Array(10)
				.fill(null)
				.map((_, i) => new HumanMessage(`message ${i}`))

			const state = createTestState({ messages })
			const result = compactor.compact(state)

			// Should keep last 3 turns
			expect(result.trimmedMessages.length).toBe(3)
			expect(result.droppedCount).toBe(7)
		})

		it('should never split tool-call turns', () => {
			const compactor = new ContextCompactor({
				enableCompaction: true,
				maxMessagesBeforeCompaction: 5,
				keepLastMessages: 2
			})

			// Create messages with tool calls
			const aiWithTools = new AIMessage({
				content: 'Let me check',
				tool_calls: [{ id: 'call_1', name: 'fs_read', args: { path: '/test' } }]
			})
			const toolResult1 = new ToolMessage({
				content: 'file content',
				tool_call_id: 'call_1',
				name: 'fs_read'
			})
			const toolResult2 = new ToolMessage({
				content: 'more content',
				tool_call_id: 'call_2',
				name: 'fs_read'
			})

			const messages = [
				new HumanMessage('turn 1'),
				new HumanMessage('turn 2'),
				aiWithTools,
				toolResult1,
				toolResult2,
				new HumanMessage('turn 4')
			]

			const state = createTestState({ messages })
			const result = compactor.compact(state)

			// Last 2 turns: (AIMessage + 2 ToolMessages) and (HumanMessage)
			// So we should have 4 messages (the tool-call turn has 3 messages + 1 human)
			expect(result.trimmedMessages.length).toBe(4)

			// Verify the tool-call group is intact
			const aiMessage = result.trimmedMessages.find((m) => m instanceof AIMessage)
			expect(aiMessage).toBeDefined()
			const toolMessages = result.trimmedMessages.filter((m) => m instanceof ToolMessage)
			expect(toolMessages.length).toBe(2)
		})

		it('should group AIMessage with following ToolMessages', () => {
			const compactor = new ContextCompactor({
				enableCompaction: true,
				maxMessagesBeforeCompaction: 5,
				keepLastMessages: 1
			})

			const aiWithTools = new AIMessage({
				content: 'Running command',
				tool_calls: [
					{ id: 'call_1', name: 'terminal_run', args: { command: 'npm build' } },
					{ id: 'call_2', name: 'fs_read', args: { path: '/package.json' } }
				]
			})
			const toolResult1 = new ToolMessage({
				content: 'success',
				tool_call_id: 'call_1',
				name: 'terminal_run'
			})
			const toolResult2 = new ToolMessage({
				content: '{"name": "test"}',
				tool_call_id: 'call_2',
				name: 'fs_read'
			})

			const messages = [new HumanMessage('start'), aiWithTools, toolResult1, toolResult2]

			const state = createTestState({ messages })
			const result = compactor.compact(state)

			// keepLastMessages=1 means keep last 1 turn
			// The tool-call turn (AI + 2 ToolMessages) is one turn
			expect(result.trimmedMessages.length).toBe(3)
			expect(result.trimmedMessages[0]).toBe(aiWithTools)
			expect(result.trimmedMessages[1]).toBe(toolResult1)
			expect(result.trimmedMessages[2]).toBe(toolResult2)
		})

		it('should handle standalone AI messages without tool calls', () => {
			const compactor = new ContextCompactor({
				enableCompaction: true,
				maxMessagesBeforeCompaction: 5,
				keepLastMessages: 2
			})

			const messages = [
				new HumanMessage('question 1'),
				new AIMessage('answer 1'),
				new HumanMessage('question 2'),
				new AIMessage('answer 2'),
				new HumanMessage('question 3'),
				new AIMessage('answer 3')
			]

			const state = createTestState({ messages })
			const result = compactor.compact(state)

			// 6 messages = 6 turns (each is standalone)
			// Keep last 2 turns
			expect(result.trimmedMessages.length).toBe(2)
			expect((result.trimmedMessages[0] as HumanMessage).content).toBe('question 3')
			expect((result.trimmedMessages[1] as AIMessage).content).toBe('answer 3')
		})

		it('should preserve SystemMessages as standalone turns', () => {
			const compactor = new ContextCompactor({
				enableCompaction: true,
				maxMessagesBeforeCompaction: 5,
				keepLastMessages: 2
			})

			const messages = [
				new SystemMessage('system context'),
				new HumanMessage('question'),
				new AIMessage('answer'),
				new HumanMessage('follow up')
			]

			const state = createTestState({ messages })
			const result = compactor.compact(state)

			// 4 turns, keep last 2
			expect(result.trimmedMessages.length).toBe(2)
		})
	})

	describe('summary generation', () => {
		it('should include instruction in summary', () => {
			const compactor = new ContextCompactor({
				enableCompaction: true,
				maxMessagesBeforeCompaction: 5,
				keepLastMessages: 1
			})

			const state = createTestState({
				instruction: 'Add user authentication',
				messages: [new HumanMessage('start'), new AIMessage('working'), new HumanMessage('continue')]
			})

			const result = compactor.compact(state)
			expect(result.summary).toContain('Add user authentication')
			expect(result.summary).toContain('Goals')
		})

		it('should include plan steps in summary', () => {
			const compactor = new ContextCompactor({
				enableCompaction: true,
				maxMessagesBeforeCompaction: 5,
				keepLastMessages: 1
			})

			const state = createTestState({
				plan: [
					{ step: 1, title: 'Create route', description: 'Add API route', status: 'completed' as const },
					{ step: 2, title: 'Add validation', description: 'Input validation', status: 'pending' as const }
				],
				messages: [new HumanMessage('start'), new AIMessage('working'), new HumanMessage('continue')]
			})

			const result = compactor.compact(state)
			expect(result.summary).toContain('Plan')
			expect(result.summary).toContain('Create route')
			expect(result.summary).toContain('[completed]')
		})

		it('should include applied changes in summary', () => {
			const compactor = new ContextCompactor({
				enableCompaction: true,
				maxMessagesBeforeCompaction: 5,
				keepLastMessages: 1
			})

			const state = createTestState({
				appliedChanges: [
					{ path: 'src/index.ts', type: 'create' as const, content: 'new content' },
					{ path: 'src/utils.ts', type: 'modify' as const, content: 'modified' }
				],
				messages: [new HumanMessage('start'), new AIMessage('working'), new HumanMessage('continue')]
			})

			const result = compactor.compact(state)
			expect(result.summary).toContain('Files Changed')
			expect(result.summary).toContain('src/index.ts')
			expect(result.summary).toContain('(create)')
		})

		it('should include verification status in summary', () => {
			const compactor = new ContextCompactor({
				enableCompaction: true,
				maxMessagesBeforeCompaction: 5,
				keepLastMessages: 1
			})

			const state = createTestState({
				lastVerification: {
					success: false,
					timestamp: new Date().toISOString(),
					build: {
						success: false,
						command: 'npm',
						args: ['run', 'build'],
						exitCode: 1,
						output: 'Build failed',
						durationMs: 1000,
						errors: [
							{ file: 'src/index.ts', line: 10, column: 5, message: 'Type error' },
							{ file: 'src/utils.ts', line: 20, column: 3, message: 'Missing export' }
						],
						warnings: []
					}
				},
				messages: [new HumanMessage('start'), new AIMessage('working'), new HumanMessage('continue')]
			})

			const result = compactor.compact(state)
			expect(result.summary).toContain('Last Verification')
			expect(result.summary).toContain('FAILED')
			expect(result.summary).toContain('Build errors: 2')
		})

		it('should truncate summary at maxSummaryChars', () => {
			const compactor = new ContextCompactor({
				enableCompaction: true,
				maxMessagesBeforeCompaction: 5,
				keepLastMessages: 1,
				maxSummaryChars: 100
			})

			const state = createTestState({
				instruction: 'A'.repeat(200), // Very long instruction
				messages: [new HumanMessage('start'), new HumanMessage('continue')]
			})

			const result = compactor.compact(state)
			expect(result.summary.length).toBeLessThanOrEqual(100)
			expect(result.summary.endsWith('...')).toBe(true)
		})

		it('should extract decisions from dropped AI messages', () => {
			const compactor = new ContextCompactor({
				enableCompaction: true,
				maxMessagesBeforeCompaction: 5,
				keepLastMessages: 1
			})

			const state = createTestState({
				messages: [
					new HumanMessage('start'),
					new AIMessage('I will create a new authentication module.'),
					new HumanMessage('continue'),
					new AIMessage('Let me add input validation to the form.'),
					new HumanMessage('final')
				]
			})

			const result = compactor.compact(state)
			expect(result.summary).toContain('Key Decisions')
			expect(result.summary).toContain('create a new authentication module')
		})
	})

	describe('createContextCompactor', () => {
		it('should create a compactor with default policy', () => {
			const compactor = createContextCompactor()
			expect(compactor).toBeInstanceOf(ContextCompactor)

			// Default enables compaction for safety (message-count fallback)
			const state = createTestState({
				messages: Array(100).fill(new HumanMessage('test'))
			})
			expect(compactor.shouldCompact(state)).toBe(true)
		})

		it('should create a compactor with custom policy', () => {
			const compactor = createContextCompactor({
				enableCompaction: true,
				maxMessagesBeforeCompaction: 20
			})

			const state = createTestState({
				messages: Array(21).fill(new HumanMessage('test'))
			})
			expect(compactor.shouldCompact(state)).toBe(true)
		})
	})

	describe('edge cases', () => {
		it('should handle empty messages array', () => {
			const compactor = new ContextCompactor({
				enableCompaction: true,
				maxMessagesBeforeCompaction: 5,
				keepLastMessages: 3
			})

			const state = createTestState({ messages: [] })
			const result = compactor.compact(state)

			expect(result.trimmedMessages.length).toBe(0)
			expect(result.droppedCount).toBe(0)
		})

		it('should handle fewer messages than keepLastMessages', () => {
			const compactor = new ContextCompactor({
				enableCompaction: true,
				maxMessagesBeforeCompaction: 5,
				keepLastMessages: 10
			})

			const messages = [new HumanMessage('one'), new AIMessage('two'), new HumanMessage('three')]

			const state = createTestState({ messages })
			const result = compactor.compact(state)

			// All messages should be kept
			expect(result.trimmedMessages.length).toBe(3)
			expect(result.droppedCount).toBe(0)
		})

		it('should handle mixed message types correctly', () => {
			const compactor = new ContextCompactor({
				enableCompaction: true,
				maxMessagesBeforeCompaction: 5,
				keepLastMessages: 2
			})

			const aiWithTools = new AIMessage({
				content: 'checking',
				tool_calls: [{ id: 'call_1', name: 'fs_read', args: {} }]
			})

			const messages = [
				new SystemMessage('context'),
				new HumanMessage('question'),
				aiWithTools,
				new ToolMessage({ content: 'result', tool_call_id: 'call_1', name: 'fs_read' }),
				new HumanMessage('follow up')
			]

			const state = createTestState({ messages })
			const result = compactor.compact(state)

			// Turns: System, Human, (AI+Tool), Human = 4 turns
			// Keep last 2: (AI+Tool) and Human
			expect(result.trimmedMessages.length).toBe(3) // AI + ToolMessage + Human
			expect(result.droppedCount).toBe(2) // System + first Human
		})
	})
})

/**
 * Unit tests for stream adapter
 */

import {
	StreamAdapter,
	createStreamAdapter,
	extractToolEventsFromMessages
} from '../../src/agent/events/stream-adapter.js'
import { AIMessage, ToolMessage } from '@langchain/core/messages'
import type { AgentEvent } from '../../src/types/events.js'
import type { AgentState } from '../../src/agent/state.js'

describe('StreamAdapter', () => {
	let events: AgentEvent[]
	let adapter: StreamAdapter

	beforeEach(() => {
		events = []
		adapter = createStreamAdapter({
			runId: 'test-run-123',
			mode: 'execute',
			onEvent: (event) => events.push(event)
		})
	})

	describe('processStateUpdate', () => {
		it('should emit phase event on phase change', () => {
			adapter.processStateUpdate({ phase: 'planner' })

			expect(events).toHaveLength(1)
			expect(events[0]).toEqual({ type: 'phase', phase: 'planner' })
		})

		it('should not emit duplicate phase events', () => {
			adapter.processStateUpdate({ phase: 'agent' })
			adapter.processStateUpdate({ phase: 'agent' })
			adapter.processStateUpdate({ phase: 'agent' })

			expect(events.filter((e) => e.type === 'phase')).toHaveLength(1)
		})

		it('should emit plan event when plan updates', () => {
			const plan = [{ step: 1, title: 'Read files', description: 'Read relevant files', status: 'pending' as const }]

			adapter.processStateUpdate({ plan })

			expect(events.find((e) => e.type === 'plan')).toEqual({
				type: 'plan',
				steps: plan
			})
		})

		it('should emit progress event on step change', () => {
			const plan = [
				{ step: 1, title: 'Step 1', description: 'First step', status: 'pending' as const },
				{ step: 2, title: 'Step 2', description: 'Second step', status: 'pending' as const }
			]

			adapter.processStateUpdate({ plan, currentStep: 0 })

			const progressEvent = events.find((e) => e.type === 'progress')
			expect(progressEvent).toEqual({
				type: 'progress',
				step: 1,
				of: 2,
				label: 'Step 1' // Uses title as label
			})
		})

		it('should emit question event when pending question', () => {
			adapter.processStateUpdate({
				pendingQuestion: {
					text: 'Which database should I use?',
					choices: [
						{ id: 'postgres', label: 'PostgreSQL' },
						{ id: 'mysql', label: 'MySQL' }
					],
					askedAt: '2024-01-01T00:00:00Z'
				}
			})

			expect(events.find((e) => e.type === 'question')).toEqual({
				type: 'question',
				runId: 'test-run-123',
				text: 'Which database should I use?',
				choices: [
					{ id: 'postgres', label: 'PostgreSQL' },
					{ id: 'mysql', label: 'MySQL' }
				]
			})
		})

		it('should emit approval_required when awaiting approval', () => {
			const changes = [{ path: '/src/index.ts', type: 'create' as const, content: 'test' }]
			const diffs = [{ path: '/src/index.ts', type: 'create' as const, before: null, after: 'test', hunks: [] }]

			adapter.processStateUpdate({
				awaitingApproval: true,
				pendingChanges: changes,
				pendingDiffs: diffs
			})

			expect(events.find((e) => e.type === 'approval_required')).toEqual({
				type: 'approval_required',
				runId: 'test-run-123',
				changes,
				diffs
			})
		})

		it('should emit file_proposed when changes pending but not awaiting', () => {
			const changes = [{ path: '/src/util.ts', type: 'modify' as const, content: 'updated' }]

			adapter.processStateUpdate({
				awaitingApproval: false,
				pendingChanges: changes
			})

			expect(events.find((e) => e.type === 'file_proposed')).toEqual({
				type: 'file_proposed',
				changes
			})
		})

		it('should emit complete event on completion summary', () => {
			const appliedChanges = [{ path: '/src/index.ts', type: 'create' as const, content: 'done' }]
			const verification = {
				success: true,
				timestamp: '2024-01-01T00:00:00Z',
				build: {
					success: true,
					command: 'npm',
					args: ['run', 'build'],
					exitCode: 0,
					output: '',
					errors: [],
					warnings: [],
					durationMs: 100
				}
			}

			adapter.processStateUpdate({
				completionSummary: 'Task completed successfully',
				appliedChanges,
				lastVerification: verification
			})

			expect(events.find((e) => e.type === 'complete')).toEqual({
				type: 'complete',
				summary: 'Task completed successfully',
				changes: appliedChanges,
				verification
			})
		})

		it('should emit abort event when aborted', () => {
			adapter.processStateUpdate({
				aborted: true,
				abortReason: 'User cancelled'
			})

			expect(events.find((e) => e.type === 'abort')).toEqual({
				type: 'abort',
				reason: 'User cancelled'
			})
		})

		it('should emit abort on budget exceeded', () => {
			adapter.processStateUpdate({
				budgetExceeded: true,
				iterations: 5
			})

			expect(events.find((e) => e.type === 'abort')).toEqual({
				type: 'abort',
				reason: 'Budget exceeded after 5 iterations'
			})
		})

		it('should emit profile event when detected', () => {
			const profile = {
				kind: 'bot' as const,
				plugins: ['@robojs/server'],
				hasMock: false,
				directories: {
					commands: '/src/commands',
					events: '/src/events'
				},
				roboVersion: '0.10.0',
				hasConfig: true
			}

			adapter.processStateUpdate({ projectProfile: profile })

			expect(events.find((e) => e.type === 'profile')).toEqual({
				type: 'profile',
				profile
			})
		})

		it('should emit retry event on iteration with failure', () => {
			adapter.processStateUpdate({
				iterations: 2,
				lastVerification: {
					success: false,
					timestamp: '2024-01-01T00:00:00Z',
					build: {
						success: false,
						command: 'npm',
						args: ['run', 'build'],
						exitCode: 1,
						output: 'Build failed',
						errors: [{ file: 'test.ts', line: 1, message: 'Error in test.ts' }],
						warnings: [],
						durationMs: 100
					}
				}
			})

			expect(events.find((e) => e.type === 'retry')).toEqual({
				type: 'retry',
				iteration: 2,
				reason: 'Error in test.ts'
			})
		})
	})

	describe('options filtering', () => {
		it('should filter out plan events when includePlan is false', () => {
			const adapter = createStreamAdapter({
				runId: 'test',
				mode: 'execute',
				options: { includePlan: false },
				onEvent: (event) => events.push(event)
			})

			adapter.processStateUpdate({
				plan: [{ step: 1, title: 'Step', description: 'Desc', status: 'pending' }]
			})

			expect(events.filter((e) => e.type === 'plan')).toHaveLength(0)
		})

		it('should filter out progress events when includeProgress is false', () => {
			const adapter = createStreamAdapter({
				runId: 'test',
				mode: 'execute',
				options: { includeProgress: false },
				onEvent: (event) => events.push(event)
			})

			adapter.processStateUpdate({
				plan: [{ step: 1, title: 'Step', description: 'Desc', status: 'pending' }],
				currentStep: 0
			})

			expect(events.filter((e) => e.type === 'progress')).toHaveLength(0)
		})
	})
})

describe('extractToolEventsFromMessages', () => {
	it('should extract tool calls from AI messages', () => {
		const aiMessage = new AIMessage({
			content: 'Reading file',
			tool_calls: [
				{
					id: 'call_1',
					name: 'fs_read',
					args: { path: '/test.ts' }
				}
			]
		})

		const events = extractToolEventsFromMessages([aiMessage])

		expect(events).toHaveLength(1)
		expect(events[0]).toEqual({
			type: 'tool_call',
			source: 'core',
			name: 'fs_read',
			args: { path: '/test.ts' }
		})
	})

	it('should extract tool results from tool messages', () => {
		const toolMessage = new ToolMessage({
			content: 'File contents here',
			tool_call_id: 'call_1',
			name: 'fs_read'
		})

		const events = extractToolEventsFromMessages([toolMessage])

		expect(events).toHaveLength(1)
		expect(events[0]).toEqual({
			type: 'tool_result',
			source: 'core',
			name: 'fs_read',
			result: 'File contents here'
		})
	})

	it('should filter based on options', () => {
		const aiMessage = new AIMessage({
			content: '',
			tool_calls: [{ id: 'call_1', name: 'fs_read', args: {} }]
		})
		const toolMessage = new ToolMessage({
			content: 'result',
			tool_call_id: 'call_1',
			name: 'fs_read'
		})

		const events = extractToolEventsFromMessages([aiMessage, toolMessage], {
			includeToolCalls: false
		})

		// Only tool result should be included
		expect(events.filter((e) => e.type === 'tool_call')).toHaveLength(0)
		expect(events.filter((e) => e.type === 'tool_result')).toHaveLength(1)
	})

	it('should handle messages without tool calls', () => {
		const aiMessage = new AIMessage({ content: 'Just text' })

		const events = extractToolEventsFromMessages([aiMessage])

		expect(events).toHaveLength(0)
	})
})

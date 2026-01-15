/**
 * Unit tests for edge routing functions
 */

import { END } from '@langchain/langgraph/web'
import { AIMessage } from '@langchain/core/messages'
import {
	NODE,
	routeAfterPlanner,
	routeAfterAgent,
	routeAfterTools,
	routeAfterReviewer,
	routeAfterVerification
} from '../../src/agent/edges/routing.js'
import { DEFAULT_TOKEN_USAGE, type AgentState } from '../../src/agent/state.js'
import type { AcceptanceCriteria } from '../../src/types/acceptance.js'
import type {
	BuildVerificationResult,
	TestVerificationResult,
	ProjectProfile,
	VerificationResult
} from '../../src/types/robo.js'

// Helper to create minimal build verification result
function createBuildResult(success: boolean): BuildVerificationResult {
	return {
		success,
		command: 'npm',
		args: ['run', 'build'],
		exitCode: success ? 0 : 1,
		output: success ? 'Build complete' : 'Build failed',
		errors: success ? [] : [{ message: 'Build error' }],
		warnings: [],
		durationMs: 1000
	}
}

// Helper to create minimal test verification result
function createTestResult(success: boolean): TestVerificationResult {
	return {
		success,
		command: 'npm',
		args: ['test'],
		exitCode: success ? 0 : 1,
		output: success ? 'Tests passed' : 'Tests failed',
		passed: success ? 10 : 5,
		failed: success ? 0 : 5,
		skipped: 0,
		durationMs: 2000,
		failures: success ? [] : [{ name: 'test', message: 'failed' }]
	}
}

// Helper to create acceptance criteria
function createAcceptance(
	scenarios: Array<{ id: string; kind: 'build' | 'test' | 'mock' | 'manual'; title: string }>,
	mustPass: string[] = []
): AcceptanceCriteria {
	return {
		requirements: {
			featureBullets: ['Feature 1']
		},
		scenarios: scenarios.map((s) => ({
			id: s.id,
			title: s.title,
			description: `${s.title} scenario`,
			kind: s.kind
		})),
		mustPass: mustPass.length > 0 ? mustPass : scenarios.map((s) => s.id)
	}
}

// Helper to create minimal state for testing
function createTestState(overrides: Partial<AgentState> = {}): AgentState {
	return {
		mode: 'execute',
		phase: 'test',
		instruction: 'test instruction',
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

describe('routeAfterPlanner', () => {
	it('should return END when aborted', () => {
		const state = createTestState({ aborted: true })
		expect(routeAfterPlanner(state)).toBe(END)
	})

	it('should return AGENT for explain mode', () => {
		const state = createTestState({ mode: 'explain' })
		expect(routeAfterPlanner(state)).toBe(NODE.AGENT)
	})

	it('should return END for plan mode with acceptance and no question', () => {
		const state = createTestState({
			mode: 'plan',
			acceptance: createAcceptance([{ id: 'build', kind: 'build', title: 'Build passes' }])
		})
		expect(routeAfterPlanner(state)).toBe(END)
	})

	it('should return QUESTION_GATE when pending question', () => {
		const state = createTestState({
			mode: 'execute',
			pendingQuestion: {
				text: 'Which database should I use?',
				askedAt: new Date().toISOString()
			}
		})
		expect(routeAfterPlanner(state)).toBe(NODE.QUESTION_GATE)
	})

	it('should return AGENT for execute mode with no question', () => {
		const state = createTestState({
			mode: 'execute',
			acceptance: createAcceptance([], [])
		})
		expect(routeAfterPlanner(state)).toBe(NODE.AGENT)
	})
})

describe('routeAfterAgent', () => {
	it('should return END when aborted', () => {
		const state = createTestState({ aborted: true })
		expect(routeAfterAgent(state)).toBe(END)
	})

	it('should return END for explain mode after producing answer', () => {
		const state = createTestState({ mode: 'explain' })
		expect(routeAfterAgent(state)).toBe(END)
	})

	it('should return TOOLS when message has tool calls', () => {
		const aiMessage = new AIMessage({
			content: 'I will read the file',
			tool_calls: [
				{
					id: 'call_1',
					name: 'fs_read',
					args: { path: '/src/index.ts' }
				}
			]
		})

		const state = createTestState({
			messages: [aiMessage]
		})
		expect(routeAfterAgent(state)).toBe(NODE.TOOLS)
	})

	it('should return REVIEWER when no tool calls', () => {
		const aiMessage = new AIMessage({
			content: 'I have completed the task'
		})

		const state = createTestState({
			messages: [aiMessage]
		})
		expect(routeAfterAgent(state)).toBe(NODE.REVIEWER)
	})

	it('should return REVIEWER when last message is not AI', () => {
		const state = createTestState({
			messages: []
		})
		expect(routeAfterAgent(state)).toBe(NODE.REVIEWER)
	})
})

describe('routeAfterTools', () => {
	it('should return END when aborted', () => {
		const state = createTestState({ aborted: true })
		expect(routeAfterTools(state)).toBe(END)
	})

	it('should return APPROVAL_GATE when awaiting approval', () => {
		const state = createTestState({ awaitingApproval: true })
		expect(routeAfterTools(state)).toBe(NODE.APPROVAL_GATE)
	})

	it('should return AGENT to continue processing', () => {
		const state = createTestState()
		expect(routeAfterTools(state)).toBe(NODE.AGENT)
	})
})

describe('routeAfterReviewer', () => {
	it('should return END when aborted', () => {
		const state = createTestState({ aborted: true })
		expect(routeAfterReviewer(state)).toBe(END)
	})

	it('should return END when budget exceeded', () => {
		const state = createTestState({ budgetExceeded: true })
		expect(routeAfterReviewer(state)).toBe(END)
	})

	it('should return END when completion summary present', () => {
		const state = createTestState({
			completionSummary: 'Task completed successfully'
		})
		expect(routeAfterReviewer(state)).toBe(END)
	})

	it('should return VERIFY_BUILD when build verification needed', () => {
		const state = createTestState({
			acceptance: createAcceptance([{ id: 'build-scenario', kind: 'build', title: 'Build passes' }])
		})
		expect(routeAfterReviewer(state)).toBe(NODE.VERIFY_BUILD)
	})

	it('should skip VERIFY_BUILD when already passed', () => {
		const verification: VerificationResult = {
			success: true,
			build: createBuildResult(true),
			timestamp: new Date().toISOString()
		}
		const state = createTestState({
			acceptance: createAcceptance([{ id: 'build-scenario', kind: 'build', title: 'Build passes' }]),
			lastVerification: verification
		})
		// Should move to agent
		expect(routeAfterReviewer(state)).toBe(NODE.AGENT)
	})

	it('should return VERIFY_TESTS when test verification needed', () => {
		const verification: VerificationResult = {
			success: true,
			build: createBuildResult(true),
			timestamp: new Date().toISOString()
		}
		const state = createTestState({
			lastVerification: verification,
			acceptance: createAcceptance([{ id: 'test-scenario', kind: 'test', title: 'Tests pass' }])
		})
		expect(routeAfterReviewer(state)).toBe(NODE.VERIFY_TESTS)
	})

	it('should return VERIFY_MOCK when mock verification needed', () => {
		const verification: VerificationResult = {
			success: true,
			build: createBuildResult(true),
			tests: createTestResult(true),
			timestamp: new Date().toISOString()
		}
		const profile: ProjectProfile = {
			kind: 'bot',
			plugins: [],
			hasMock: true,
			directories: {},
			hasConfig: true
		}
		const state = createTestState({
			lastVerification: verification,
			acceptance: createAcceptance([{ id: 'mock-scenario', kind: 'mock', title: 'Mock passes' }]),
			projectProfile: profile
		})
		expect(routeAfterReviewer(state)).toBe(NODE.VERIFY_MOCK)
	})

	it('should return REFRESH_OVERVIEW after changes applied when verifications passed', () => {
		// All verifications passed, so we can refresh overview
		const verification: VerificationResult = {
			success: true,
			build: createBuildResult(true),
			timestamp: new Date().toISOString()
		}
		const state = createTestState({
			acceptance: createAcceptance([{ id: 'build-scenario', kind: 'build', title: 'Build passes' }]),
			lastVerification: verification,
			appliedChanges: [
				{ path: 'file1.ts', type: 'create', content: '' },
				{ path: 'file2.ts', type: 'create', content: '' },
				{ path: 'file3.ts', type: 'create', content: '' },
				{ path: 'file4.ts', type: 'create', content: '' },
				{ path: 'file5.ts', type: 'create', content: '' }
			]
		})
		expect(routeAfterReviewer(state)).toBe(NODE.REFRESH_OVERVIEW)
	})

	it('should return VERIFY_BUILD when no acceptance criteria (default behavior)', () => {
		// Without acceptance criteria, we always want a build verification first
		const state = createTestState()
		expect(routeAfterReviewer(state)).toBe(NODE.VERIFY_BUILD)
	})
})

describe('routeAfterVerification', () => {
	it('should always return REVIEWER', () => {
		expect(routeAfterVerification()).toBe(NODE.REVIEWER)
	})
})

describe('NODE constants', () => {
	it('should have all required node names', () => {
		expect(NODE.DETECT_PROFILE).toBe('detect_profile')
		expect(NODE.REFRESH_INDEX).toBe('refresh_index')
		expect(NODE.REFRESH_OVERVIEW).toBe('refresh_overview')
		expect(NODE.PLANNER).toBe('planner')
		expect(NODE.QUESTION_GATE).toBe('question_gate')
		expect(NODE.AGENT).toBe('agent')
		expect(NODE.TOOLS).toBe('tools')
		expect(NODE.REVIEWER).toBe('reviewer')
		expect(NODE.VERIFY_BUILD).toBe('verify_build')
		expect(NODE.VERIFY_TESTS).toBe('verify_tests')
		expect(NODE.VERIFY_MOCK).toBe('verify_mock')
	})
})

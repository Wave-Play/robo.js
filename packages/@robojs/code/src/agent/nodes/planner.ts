/**
 * Planner node - transforms user input into acceptance criteria
 */

import { HumanMessage, AIMessage } from '@langchain/core/messages'
import type { AgentState, AgentStateUpdate, PendingQuestion } from '../state.js'
import type { AcceptanceCriteria, Requirements, ScenarioSpec } from '../../types/acceptance.js'
import type { TaskStep } from '../../types/run.js'
import type { CodeAgentContext } from '../types.js'
import { codeLogger } from '../../core/logger.js'

/**
 * System prompt for the planner
 */
const PLANNER_SYSTEM_PROMPT = `You are a planning assistant for a coding agent. Your job is to:
1. Analyze the user's request
2. Identify requirements, constraints, and non-goals
3. Generate testable acceptance criteria
4. Create a plan with clear steps

If the request is ambiguous, you MUST ask clarifying questions before proceeding.

Output Format:
You must respond with a JSON object containing:
{
  "needsClarification": boolean,
  "question": { "text": string, "choices": [{ "id": string, "label": string }] } | null,
  "requirements": { "featureBullets": string[], "constraints": string[], "nonGoals": string[] },
  "scenarios": [{ "id": string, "title": string, "description": string, "kind": "build"|"test"|"mock"|"manual", "assertions": string[] }],
  "mustPass": string[],
  "plan": [{ "step": number, "title": string, "description": string, "files": string[] }]
}

Guidelines:
- For Robo.js projects, include a "build" scenario that runs "robo build"
- If @robojs/mock is available, include "mock" scenarios for Discord interactions
- Include "test" scenarios if tests exist in the project
- Set mustPass to include all scenarios that must pass for completion
- Ask clarifying questions for: command names, API routes, permission levels, error handling strategies
`

/**
 * Creates the planner node
 *
 * Transforms user input into structured acceptance criteria.
 * May trigger Question Gate if requirements are ambiguous.
 */
export function plannerNode(context: CodeAgentContext) {
	return async (state: AgentState): Promise<AgentStateUpdate> => {
		codeLogger.debug('[Planner] Node entered', {
			mode: state.mode,
			instruction: state.instruction?.slice(0, 100),
			hasAcceptance: !!state.acceptance,
			hasLastAnswer: !!state.lastAnswer,
			messageCount: state.messages?.length ?? 0
		})

		// In explain mode, skip planning
		if (state.mode === 'explain') {
			return { phase: 'planner_skip_explain' }
		}

		// If we already have acceptance criteria, skip planning
		if (state.acceptance) {
			codeLogger.debug('[Planner] Already have acceptance, skipping')
			return {
				pendingQuestion: null,
				phase: 'planner_done'
			}
		}

		const { llm } = context

		// Determine if this is a follow-up after user answered a question
		const hasUserAnswer = !!state.lastAnswer

		// Build context for the planner
		const contextInfo = buildPlannerContext(state)

		// Build system prompt - if user already answered, tell LLM to proceed
		let systemPrompt = PLANNER_SYSTEM_PROMPT
		if (hasUserAnswer) {
			systemPrompt += `

IMPORTANT: The user has already answered your clarifying question. DO NOT ask more questions.
You MUST now proceed to generate the requirements, scenarios, and plan based on the user's answer.
Set "needsClarification": false and provide the full plan.`
			codeLogger.debug('[Planner] User answered, forcing plan generation')
		}

		// Call LLM to generate plan
		const response = await llm.chat({
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: contextInfo }
			],
			temperature: 0.3 // Lower temperature for more deterministic planning
		})

		// Parse the response
		let parsed: PlannerResponse
		try {
			parsed = parsePlannerResponse(response.content)
		} catch (error) {
			codeLogger.warn('Failed to parse planner response:', error)
			// Fallback to basic plan
			parsed = createFallbackPlan(state.instruction)
		}

		// Check if clarification is needed - BUT only allow if user hasn't answered yet
		if (parsed.needsClarification && parsed.question && !hasUserAnswer) {
			const pendingQuestion: PendingQuestion = {
				text: parsed.question.text,
				choices: parsed.question.choices,
				askedAt: new Date().toISOString()
			}

			return {
				pendingQuestion,
				phase: 'planner_needs_clarification'
			}
		}

		// If LLM still asked a question after user already answered, log warning and proceed anyway
		if (parsed.needsClarification && hasUserAnswer) {
			codeLogger.warn('[Planner] LLM tried to ask another question after user answered, proceeding with fallback plan')
			parsed = createFallbackPlan(state.instruction)
		}

		// Build acceptance criteria
		const acceptance: AcceptanceCriteria = {
			requirements: parsed.requirements ?? {
				featureBullets: [state.instruction],
				constraints: [],
				nonGoals: []
			},
			scenarios: parsed.scenarios ?? [],
			mustPass: parsed.mustPass ?? []
		}

		// Build task steps
		const plan: TaskStep[] = (parsed.plan ?? []).map((step, index) => ({
			step: step.step ?? index + 1,
			title: step.title,
			description: step.description,
			status: 'pending',
			files: step.files
		}))

		// Emit plan event
		context.onEvent?.({ type: 'plan', steps: plan })

		// Add AI message with the plan summary
		const planSummary = formatPlanSummary(acceptance, plan)
		const aiMessage = new AIMessage(planSummary)

		codeLogger.debug('[Planner] Plan generated', {
			planSteps: plan.length,
			scenarioCount: acceptance.scenarios.length,
			mustPassCount: acceptance.mustPass.length,
			phase: 'planner_done'
		})

		return {
			acceptance,
			plan,
			acceptanceStatus: {
				satisfied: false,
				scenarios: acceptance.scenarios.map((s) => ({
					id: s.id,
					status: 'pending',
					attempts: 0
				})),
				iterations: 0,
				budgetExceeded: false,
				updatedAt: new Date().toISOString()
			},
			messages: [aiMessage],
			phase: 'planner_done'
		}
	}
}

/**
 * Build context string for the planner
 */
function buildPlannerContext(state: AgentState): string {
	const parts: string[] = []

	parts.push(`User Request: ${state.instruction}`)

	if (state.projectProfile) {
		parts.push(`\nProject Type: ${state.projectProfile.kind}`)
		if (state.projectProfile.plugins.length > 0) {
			parts.push(`Plugins: ${state.projectProfile.plugins.join(', ')}`)
		}
		if (state.projectProfile.hasMock) {
			parts.push(`Mock Server: Available (@robojs/mock)`)
		}
	}

	if (state.projectOverview) {
		parts.push(`\nProject Summary: ${state.projectOverview.summary}`)
		if (state.projectOverview.package?.scripts) {
			const scripts = Object.keys(state.projectOverview.package.scripts).slice(0, 10)
			parts.push(`Available Scripts: ${scripts.join(', ')}`)
		}
	}

	// Include question context so LLM knows what was asked
	if (state.pendingQuestion) {
		parts.push(`\nClarifying Question Asked: ${state.pendingQuestion.text}`)
	}

	if (state.lastAnswer) {
		parts.push(`User Answer: ${state.lastAnswer.text}`)
		if (state.lastAnswer.choiceId) {
			parts.push(`Selected Choice: ${state.lastAnswer.choiceId}`)
		}
	}

	return parts.join('\n')
}

/**
 * Response shape from planner
 */
interface PlannerResponse {
	needsClarification?: boolean
	question?: {
		text: string
		choices?: Array<{ id: string; label: string }>
	}
	requirements?: Requirements
	scenarios?: ScenarioSpec[]
	mustPass?: string[]
	plan?: Array<{
		step?: number
		title: string
		description: string
		files?: string[]
	}>
}

/**
 * Parse the planner response JSON
 */
function parsePlannerResponse(content: string): PlannerResponse {
	// Try to extract JSON from the response
	const jsonMatch = content.match(/\{[\s\S]*\}/)
	if (!jsonMatch) {
		throw new Error('No JSON found in response')
	}

	return JSON.parse(jsonMatch[0])
}

/**
 * Create a fallback plan when parsing fails
 */
function createFallbackPlan(instruction: string): PlannerResponse {
	return {
		needsClarification: false,
		requirements: {
			featureBullets: [instruction],
			constraints: [],
			nonGoals: []
		},
		scenarios: [
			{
				id: 'build',
				title: 'Build succeeds',
				description: 'The project builds without errors',
				kind: 'build',
				assertions: ['Build completes with exit code 0']
			}
		],
		mustPass: ['build'],
		plan: [
			{
				step: 1,
				title: 'Analyze request',
				description: 'Understand what needs to be implemented',
				files: []
			},
			{
				step: 2,
				title: 'Implement changes',
				description: 'Make the necessary code changes',
				files: []
			},
			{
				step: 3,
				title: 'Verify',
				description: 'Run build and tests to verify changes',
				files: []
			}
		]
	}
}

/**
 * Format plan summary for AI message
 */
function formatPlanSummary(acceptance: AcceptanceCriteria, plan: TaskStep[]): string {
	const parts: string[] = ["I've analyzed your request and created a plan:"]

	parts.push('\n**Requirements:**')
	for (const bullet of acceptance.requirements.featureBullets) {
		parts.push(`- ${bullet}`)
	}

	if (plan.length > 0) {
		parts.push('\n**Plan:**')
		for (const step of plan) {
			parts.push(`${step.step}. ${step.title}`)
		}
	}

	if (acceptance.scenarios.length > 0) {
		parts.push('\n**Verification:**')
		for (const scenario of acceptance.scenarios) {
			const mustPass = acceptance.mustPass.includes(scenario.id) ? '(required)' : '(optional)'
			parts.push(`- ${scenario.title} ${mustPass}`)
		}
	}

	return parts.join('\n')
}

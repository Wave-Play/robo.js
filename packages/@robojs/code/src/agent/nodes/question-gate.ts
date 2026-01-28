/**
 * Question Gate node - pauses for user input when clarification is needed
 *
 * Uses a state-based approach for browser compatibility:
 * - If pendingQuestion exists and no lastAnswer, throw NodeInterrupt to pause
 * - When resumed, the SDK's resume() method sets lastAnswer on state
 * - On next execution, we detect lastAnswer and continue
 */

import { NodeInterrupt } from '@langchain/langgraph/web'
import type { AgentState, AgentStateUpdate } from '../state.js'
import type { CodeAgentContext } from '../types.js'
import { codeLogger } from '../../core/logger.js'

/**
 * Creates the question_gate node
 *
 * Browser-compatible implementation using state-based pause:
 * 1. Check if there's a pending question
 * 2. If we already have an answer (from resume), clear question and continue
 * 3. If no answer yet, emit event and throw NodeInterrupt to pause
 *
 * The SDK's resume() method sets lastAnswer on state, which is detected
 * on the next execution of this node.
 */
export function questionGateNode(context: CodeAgentContext) {
	return async (state: AgentState): Promise<AgentStateUpdate> => {
		codeLogger.debug('[QuestionGate] Node entered', {
			hasPendingQuestion: !!state.pendingQuestion,
			hasLastAnswer: !!state.lastAnswer,
			questionText: state.pendingQuestion?.text?.slice(0, 100),
			answerText: state.lastAnswer?.text?.slice(0, 100),
			messageCount: state.messages?.length ?? 0
		})

		const { pendingQuestion, lastAnswer } = state

		if (!pendingQuestion) {
			// No question to ask, pass through
			codeLogger.debug('[QuestionGate] No pending question, passing through')
			return { phase: 'question_gate_skip' }
		}

		// Check if we already have an answer (from resume)
		if (lastAnswer) {
			codeLogger.debug('[QuestionGate] Answer received, continuing', {
				answerText: lastAnswer.text?.slice(0, 100),
				choiceId: lastAnswer.choiceId,
				answersCount: lastAnswer.answers?.length
			})
			return {
				pendingQuestion: null,
				phase: 'question_gate_done'
			}
		}

		// Emit question event before pausing
		// Support both legacy single-question and new multi-question formats
		if (pendingQuestion.questions && pendingQuestion.questions.length > 0) {
			// Multi-question format
			context.onEvent?.({
				type: 'question',
				runId: context.runId,
				// New: include questions array
				questions: pendingQuestion.questions,
				// Backwards compat: also set text/choices from first question
				text: pendingQuestion.questions[0].text,
				choices: pendingQuestion.questions[0].choices
			})
		} else {
			// Legacy single-question format
			context.onEvent?.({
				type: 'question',
				runId: context.runId,
				text: pendingQuestion.text,
				choices: pendingQuestion.choices
			})
		}

		// Throw NodeInterrupt to pause graph execution
		// The SDK's resume() method will set lastAnswer and re-invoke the graph
		const questionText = pendingQuestion.questions?.[0]?.text ?? pendingQuestion.text
		codeLogger.debug('[QuestionGate] Throwing NodeInterrupt to pause', {
			questionText: questionText?.slice(0, 100),
			questionCount: pendingQuestion.questions?.length ?? 1
		})
		throw new NodeInterrupt(`Waiting for answer to: ${questionText}`)
	}
}

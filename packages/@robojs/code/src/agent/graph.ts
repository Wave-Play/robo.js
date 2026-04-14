/**
 * StateGraph builder for the CodeAgent
 *
 * Assembles all nodes and edges into a compiled LangGraph.
 */

import { END, MemorySaver, START, StateGraph } from '@langchain/langgraph/web'
import type { BaseCheckpointSaver } from '@langchain/langgraph'
import { AgentStateAnnotation } from './state.js'
import { RECURSION_LIMIT } from './constants.js'
import {
	NODE,
	routeAfterPlanner,
	routeAfterQuestionGate,
	routeAfterAgent,
	routeAfterTools,
	routeAfterApprovalGate,
	routeAfterReviewer,
	routeAfterVerification
} from './edges/index.js'
import {
	detectProfileNode,
	refreshIndexNode,
	refreshOverviewNode,
	plannerNode,
	questionGateNode,
	approvalGateNode,
	agentNode,
	toolsNode,
	reviewerNode,
	verifyBuildNode,
	verifyTestsNode,
	verifyMockNode
} from './nodes/index.js'
import type { CodeAgentContext } from './types.js'

/**
 * Configuration for building the agent graph
 */
export interface GraphConfig {
	/**
	 * Agent context with all dependencies
	 */
	context: CodeAgentContext

	/**
	 * Optional custom checkpointer (defaults to MemorySaver).
	 * Can be any LangGraph-compatible checkpointer (MemorySaver, PostgresSaver, etc.)
	 */
	checkpointer?: BaseCheckpointSaver

	/**
	 * If true, disables the built-in question gate node.
	 * When disabled, the planner can still set pendingQuestion, but the question gate
	 * won't interrupt - execution routes directly to the agent node.
	 * Use this when implementing custom question handling via tools.
	 * @default false
	 */
	disableQuestionGate?: boolean
}

/**
 * Build the CodeAgent graph
 *
 * Graph topology:
 * ```
 * START → detect_profile → refresh_index → refresh_overview → planner
 *                                                                 ↓
 *                          ┌─────────────────────────────────────┴───────────────┐
 *                          ↓                                                     ↓
 *                   question_gate (interrupt)                              agent (LLM)
 *                          ↓                                                ↓   ↑
 *                          └─────────────────────────────────────────→ tools ───┘
 *                                                                          ↓
 *                                                                     reviewer
 *                                                                       ↓
 *                     ┌───────────────┬──────────────┬──────────────────┴───────┐
 *                     ↓               ↓              ↓                          ↓
 *               verify_build    verify_tests   verify_mock                     END
 *                     └───────────────┴──────────────┘
 *                                     ↓
 *                                 reviewer
 * ```
 */
export function buildAgentGraph(config: GraphConfig) {
	const { context, checkpointer = new MemorySaver(), disableQuestionGate = false } = config

	// Create state graph with annotation
	 
	const graph = new StateGraph(AgentStateAnnotation) as any

	// Add all nodes with bound context
	// Node functions are curried: context -> (state) -> Promise<update>
	graph.addNode(NODE.DETECT_PROFILE, detectProfileNode(context))
	graph.addNode(NODE.REFRESH_INDEX, refreshIndexNode(context))
	graph.addNode(NODE.REFRESH_OVERVIEW, refreshOverviewNode(context))
	graph.addNode(NODE.PLANNER, plannerNode(context))
	graph.addNode(NODE.APPROVAL_GATE, approvalGateNode(context))
	graph.addNode(NODE.AGENT, agentNode(context))
	graph.addNode(NODE.TOOLS, toolsNode(context))
	graph.addNode(NODE.REVIEWER, reviewerNode(context))
	graph.addNode(NODE.VERIFY_BUILD, verifyBuildNode(context))
	graph.addNode(NODE.VERIFY_TESTS, verifyTestsNode(context))
	graph.addNode(NODE.VERIFY_MOCK, verifyMockNode(context))

	// Only add question gate node if not disabled
	if (!disableQuestionGate) {
		graph.addNode(NODE.QUESTION_GATE, questionGateNode(context))
	}

	// Add edges - linear path from START to planner
	graph.addEdge(START, NODE.DETECT_PROFILE)
	graph.addEdge(NODE.DETECT_PROFILE, NODE.REFRESH_INDEX)
	graph.addEdge(NODE.REFRESH_INDEX, NODE.REFRESH_OVERVIEW)
	graph.addEdge(NODE.REFRESH_OVERVIEW, NODE.PLANNER)

	// Conditional edge from planner
	// When question gate is disabled, route directly to agent instead of question_gate
	if (disableQuestionGate) {
		graph.addConditionalEdges(NODE.PLANNER, routeAfterPlanner, {
			// Route question_gate to agent when disabled
			[NODE.QUESTION_GATE]: NODE.AGENT,
			[NODE.AGENT]: NODE.AGENT,
			[END]: END
		})
	} else {
		graph.addConditionalEdges(NODE.PLANNER, routeAfterPlanner, {
			[NODE.QUESTION_GATE]: NODE.QUESTION_GATE,
			[NODE.AGENT]: NODE.AGENT,
			[END]: END
		})

		// Question gate routes back to planner (if no acceptance) or agent (if has acceptance)
		graph.addConditionalEdges(NODE.QUESTION_GATE, routeAfterQuestionGate, {
			[NODE.PLANNER]: NODE.PLANNER,
			[NODE.AGENT]: NODE.AGENT,
			[END]: END
		})
	}

	// Conditional edge from agent
	graph.addConditionalEdges(NODE.AGENT, routeAfterAgent, {
		[NODE.TOOLS]: NODE.TOOLS,
		[NODE.REVIEWER]: NODE.REVIEWER,
		[END]: END
	})

	// Conditional edge from tools
	graph.addConditionalEdges(NODE.TOOLS, routeAfterTools, {
		[NODE.AGENT]: NODE.AGENT,
		[NODE.APPROVAL_GATE]: NODE.APPROVAL_GATE,
		[END]: END
	})

	// Conditional edge from approval gate (after approval is processed)
	graph.addConditionalEdges(NODE.APPROVAL_GATE, routeAfterApprovalGate, {
		[NODE.AGENT]: NODE.AGENT,
		[END]: END
	})

	// Conditional edge from reviewer
	graph.addConditionalEdges(NODE.REVIEWER, routeAfterReviewer, {
		[NODE.VERIFY_BUILD]: NODE.VERIFY_BUILD,
		[NODE.VERIFY_TESTS]: NODE.VERIFY_TESTS,
		[NODE.VERIFY_MOCK]: NODE.VERIFY_MOCK,
		[NODE.REFRESH_OVERVIEW]: NODE.REFRESH_OVERVIEW,
		[NODE.AGENT]: NODE.AGENT,
		[END]: END
	})

	// Verification nodes all route back to reviewer
	graph.addConditionalEdges(NODE.VERIFY_BUILD, routeAfterVerification, {
		[NODE.REVIEWER]: NODE.REVIEWER
	})
	graph.addConditionalEdges(NODE.VERIFY_TESTS, routeAfterVerification, {
		[NODE.REVIEWER]: NODE.REVIEWER
	})
	graph.addConditionalEdges(NODE.VERIFY_MOCK, routeAfterVerification, {
		[NODE.REVIEWER]: NODE.REVIEWER
	})

	// Compile with checkpointer and increased recursion limit
	return graph.compile({
		checkpointer,
		recursionLimit: RECURSION_LIMIT
	})
}

/**
 * Type for the compiled graph
 */
export type CompiledAgentGraph = ReturnType<typeof buildAgentGraph>

/**
 * CodeAgent - Main public API for @robojs/code SDK
 *
 * Provides a clean interface for starting, streaming, resuming, and aborting runs.
 * Manages LangGraph thread lifecycle and event streaming.
 */

import { v4 as uuid } from 'uuid'
import { MemorySaver } from '@langchain/langgraph/web'
import { HumanMessage } from '@langchain/core/messages'
import { buildAgentGraph, type CompiledAgentGraph } from './graph.js'
import { AgentStateAnnotation, type AgentState, createInitialState } from './state.js'
import { RECURSION_LIMIT } from './constants.js'
import { createStreamAdapter, type StreamAdapter } from './events/index.js'
import { codeLogger } from '../core/logger.js'
import type { McpClientManager } from '../mcp/McpClientManager.js'
import type { CodeAgentContext, RoboConfig } from './types.js'
import type { ExecutionProvider, LocalServiceDiscovery } from '../types/execution.js'
import type { AgentPolicy, DEFAULT_POLICY } from '../types/policy.js'
import type { LLMProvider } from '../types/llm.js'
import type { ToolRegistry } from '../tools/types.js'
import type { ToolExecutor } from '../tools/runtime/executor.js'
import type { ProjectIndexer } from '../project/indexer.js'
import type { ProjectOverviewBuilder } from '../project/overview.js'
import type { McpConfig } from '../mcp/types.js'
import type {
	StartRunRequest,
	StartRunResult,
	ResumeRunRequest,
	AbortRunRequest,
	RunMode,
	RunMeta,
	RunFilter,
	RunStatus
} from '../types/run.js'
import type { AgentEvent, StreamOptions } from '../types/events.js'
import type { FileDiff } from '../types/changes.js'

/**
 * Configuration for CodeAgent
 */
export interface CodeAgentConfig {
	/**
	 * ExecutionProvider for filesystem and terminal access
	 */
	provider: ExecutionProvider

	/**
	 * Agent policy configuration
	 */
	policy: AgentPolicy

	/**
	 * LLM provider for chat completions
	 */
	llm: LLMProvider

	/**
	 * Tool registry with available tools
	 */
	toolRegistry: ToolRegistry

	/**
	 * Tool executor for serialized execution
	 */
	toolExecutor: ToolExecutor

	/**
	 * Project indexer for building project index
	 */
	projectIndexer: ProjectIndexer

	/**
	 * Project overview builder for mental model
	 */
	projectOverviewBuilder: ProjectOverviewBuilder

	/**
	 * Robo-specific configuration
	 */
	roboConfig?: RoboConfig

	/**
	 * MCP (Model Context Protocol) configuration
	 * Optional - agent works without MCP
	 */
	mcpConfig?: McpConfig

	/**
	 * Service discovery for local services (dev/mock/mcp)
	 * Required if using local MCP servers with url: '__DISCOVERED__'
	 */
	serviceDiscovery?: LocalServiceDiscovery
}

/**
 * Internal run tracking
 */
interface RunInfo {
	runId: string
	threadId: string
	mode: RunMode
	instruction: string
	graph: CompiledAgentGraph
	context: CodeAgentContext
	checkpointer: MemorySaver
	streamAdapter: StreamAdapter | null
	abortController: AbortController
	createdAt: Date
	/** Active terminal sessions for this run (for cleanup on abort) */
	activeSessions: Set<string>
	/** Pending resume data (set by resume(), used by stream()) */
	pendingResume: Partial<AgentState> | null
	/** Track if first stream has completed (for proper resume behavior) */
	hasStarted: boolean
	/** State inherited from a previous run (via continueFrom) */
	inheritedState: Partial<AgentState> | null
	/** Debug mode for deep inspection */
	debugMode: boolean
}

/**
 * CodeAgent - Main entry point for @robojs/code SDK
 *
 * Usage:
 * ```typescript
 * const agent = new CodeAgent(config)
 *
 * // Start a new run
 * const { runId } = await agent.start({ input: 'Add a hello command' })
 *
 * // Stream events
 * for await (const event of agent.stream(runId)) {
 *   console.log(event)
 * }
 *
 * // Resume if paused for approval/question
 * await agent.resume({ runId, approval: { approved: true } })
 *
 * // Or abort
 * await agent.abort({ runId, reason: 'User cancelled' })
 * ```
 */
export class CodeAgent {
	private readonly config: CodeAgentConfig
	private readonly runs: Map<string, RunInfo> = new Map()
	private mcpManager: McpClientManager | null = null
	private mcpInitialized = false

	constructor(config: CodeAgentConfig) {
		this.config = config
	}

	/**
	 * Initialize MCP client if configured
	 * Called automatically on first run start
	 *
	 * Note: MCP module is dynamically imported to avoid bundling Node.js
	 * dependencies in browser builds. MCP requires Node.js and won't work
	 * in browser environments.
	 */
	private async initializeMcp(signal?: AbortSignal): Promise<void> {
		if (this.mcpInitialized) return
		if (!this.config.mcpConfig?.enabled) {
			this.mcpInitialized = true
			return
		}

		codeLogger.info('Initializing MCP client...')

		try {
			// Dynamic import to avoid bundling Node.js dependencies in browser
			const { createMcpClientManager, registerMcpTools } = await import('../mcp/index.js')

			this.mcpManager = createMcpClientManager({
				config: this.config.mcpConfig,
				provider: this.config.provider,
				serviceDiscovery: this.config.serviceDiscovery,
				signal
			})

			await this.mcpManager.connect()

			// Register MCP tools to the tool registry
			const mcpTools = this.mcpManager.getTools()
			if (mcpTools.length > 0) {
				registerMcpTools(this.config.toolRegistry, mcpTools)
				codeLogger.info(`MCP initialized with ${mcpTools.length} tool(s)`)
			} else {
				codeLogger.warn('MCP connected but no tools available')
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)
			codeLogger.error(`Failed to initialize MCP: ${errorMessage}`)
			// MCP is optional, so we continue without it
		}

		this.mcpInitialized = true
	}

	/**
	 * Start a new run
	 *
	 * Creates a new LangGraph thread and initializes the agent state.
	 * The run is started but not streamed - use stream() to get events.
	 */
	async start(request: StartRunRequest): Promise<StartRunResult> {
		const runId = uuid()
		const threadId = runId // 1:1 mapping as per spec
		const mode = request.mode ?? 'execute'
		const debugMode = request.debugMode ?? false

		// Handle continueFrom - inherit state from previous run
		let inheritedState: Partial<AgentState> | null = null
		if (request.continueFrom) {
			const previousRun = this.runs.get(request.continueFrom)
			if (previousRun) {
				try {
					const config = { configurable: { thread_id: previousRun.threadId } }
					const snapshot = await previousRun.graph.getState(config)

					if (snapshot.values) {
						inheritedState = {
							acceptance: snapshot.values.acceptance,
							plan: snapshot.values.plan,
							projectProfile: snapshot.values.projectProfile,
							projectOverview: snapshot.values.projectOverview,
							projectIndex: snapshot.values.projectIndex,
							acceptanceStatus: snapshot.values.acceptanceStatus
						}
						codeLogger.debug('[CodeAgent.start] Inheriting state from previous run', {
							previousRunId: request.continueFrom,
							hasAcceptance: !!inheritedState.acceptance,
							hasPlan: !!inheritedState.plan,
							planSteps: inheritedState.plan?.length ?? 0
						})
					}
				} catch (error) {
					codeLogger.warn('[CodeAgent.start] Failed to load state from previous run:', error)
				}
			} else {
				codeLogger.warn('[CodeAgent.start] Previous run not found:', request.continueFrom)
			}
		}

		// Create abort controller for this run
		const abortController = new AbortController()

		// Initialize MCP if configured (lazy initialization on first run)
		await this.initializeMcp(abortController.signal)

		// Create context for this run
		const context: CodeAgentContext = {
			runId,
			provider: this.config.provider,
			policy: this.config.policy,
			llm: this.config.llm,
			toolRegistry: this.config.toolRegistry,
			// Bind the shared ToolExecutor template to this run.
			// This prevents cross-run leakage (runId, fileTracker, queue) and ensures correct attribution.
			toolExecutor: this.config.toolExecutor.fork({
				runId,
				provider: this.config.provider,
				policy: this.config.policy,
				signal: abortController.signal
			}),
			projectIndexer: this.config.projectIndexer,
			projectOverviewBuilder: this.config.projectOverviewBuilder,
			roboConfig: this.config.roboConfig,
			mcpConfig: this.config.mcpConfig,
			mcpManager: this.mcpManager ?? undefined,
			serviceDiscovery: this.config.serviceDiscovery,
			signal: abortController.signal,
			modelAlias: request.modelAlias,
			debugMode
		}

		// Create checkpointer for this run
		const checkpointer = new MemorySaver()

		// Build the graph
		const graph = buildAgentGraph({ context, checkpointer })

		// Store run info
		const runInfo: RunInfo = {
			runId,
			threadId,
			mode,
			instruction: request.input,
			graph,
			context,
			checkpointer,
			streamAdapter: null,
			abortController,
			createdAt: new Date(),
			activeSessions: new Set(),
			pendingResume: null,
			hasStarted: false,
			inheritedState,
			debugMode
		}

		this.runs.set(runId, runInfo)

		return { runId }
	}

	/**
	 * Stream events for a run
	 *
	 * Returns an async generator that yields AgentEvents.
	 * The generator will complete when the run finishes or is aborted.
	 */
	async *stream(runId: string, options?: StreamOptions): AsyncGenerator<AgentEvent> {
		const runInfo = this.runs.get(runId)
		if (!runInfo) {
			throw new Error(`Run not found: ${runId}`)
		}

		// Debug logging for stream start
		codeLogger.debug('[CodeAgent.stream] Starting', {
			runId,
			hasPendingResume: !!runInfo.pendingResume,
			hasStarted: runInfo.hasStarted
		})

		// Create event queue for streaming
		const eventQueue: AgentEvent[] = []
		let resolveWait: (() => void) | null = null
		let isComplete = false

		// Create stream adapter with debug mode support
		const streamOptions = {
			...options,
			includeDebugEvents: runInfo.debugMode || options?.includeDebugEvents
		}
		const streamAdapter = createStreamAdapter({
			runId,
			mode: runInfo.mode,
			options: streamOptions,
			debugMode: runInfo.debugMode,
			onEvent: (event) => {
				eventQueue.push(event)
				if (resolveWait) {
					resolveWait()
					resolveWait = null
				}
			}
		})

		runInfo.streamAdapter = streamAdapter

		// CRITICAL: Wire up context.onEvent to push to the event queue
		// This allows nodes (like agent node) to emit events directly
		runInfo.context.onEvent = (event) => {
			eventQueue.push(event)
			if (resolveWait) {
				resolveWait()
				resolveWait = null
			}
		}

		// Bind tool executor event + abort wiring for this stream invocation.
		// (ToolExecutor is created per run in start(), but the onEvent sink is set when stream() begins.)
		runInfo.context.toolExecutor.setOnEvent(runInfo.context.onEvent)
		runInfo.context.toolExecutor.setSignal(runInfo.abortController.signal)

		// Emit start event
		yield {
			type: 'start',
			runId,
			instruction: runInfo.instruction,
			mode: runInfo.mode
		}

		// Create initial state (with optional inherited state from continueFrom)
		const initialState = createInitialState({
			instruction: runInfo.instruction,
			mode: runInfo.mode,
			overrides: runInfo.inheritedState ?? undefined
		})

		// Run configuration
		const config = {
			configurable: {
				thread_id: runInfo.threadId
			},
			recursionLimit: RECURSION_LIMIT
		}

		// Determine input state based on run phase
		let inputState: Partial<AgentState> | null

		if (runInfo.pendingResume) {
			// CRITICAL FIX: Resuming after question/approval
			// Use updateState() to update the checkpoint, then pass null to RESUME
			// Passing non-null input (even {}) would restart from START!
			codeLogger.debug('[CodeAgent.stream] Resuming with updateState', {
				pendingResumeKeys: Object.keys(runInfo.pendingResume),
				hasLastAnswer: 'lastAnswer' in runInfo.pendingResume,
				hasApproval: 'approved' in runInfo.pendingResume
			})

			try {
				await runInfo.graph.updateState(config, runInfo.pendingResume)
				codeLogger.debug('[CodeAgent.stream] State updated, resuming with null input')
			} catch (error) {
				codeLogger.error('[CodeAgent.stream] Failed to updateState:', error)
				throw error
			}

			runInfo.pendingResume = null
			inputState = null // null = resume from checkpoint (NOT {} which starts fresh!)
		} else if (!runInfo.hasStarted) {
			// Fresh start - first time streaming this run
			inputState = {
				...initialState,
				messages: [new HumanMessage(runInfo.instruction)]
			}
			runInfo.hasStarted = true

			codeLogger.debug('[CodeAgent.stream] Fresh start', {
				instruction: runInfo.instruction.slice(0, 100),
				mode: runInfo.mode
			})
		} else {
			// Continuing existing run (e.g., streaming again after pause)
			inputState = null // null = resume from checkpoint
			codeLogger.debug('[CodeAgent.stream] Continuing with null input')
		}

		try {
			// Stream the graph execution with dual mode for real-time events
			// 'updates' - state updates after node completion
			// 'custom' - real-time events via config.writer() during node execution
			const stream = await runInfo.graph.stream(inputState, {
				...config,
				streamMode: ['updates', 'custom'] as const
			})

			for await (const output of stream) {
				// Check for abort
				if (runInfo.abortController.signal.aborted) {
					break
				}

				// Dual stream mode returns [mode, data] tuples
				if (Array.isArray(output) && output.length === 2) {
					const [mode, data] = output

					if (mode === 'custom') {
						// Custom events emitted via config.writer() - yield immediately
						const event = data as AgentEvent
						codeLogger.debug('[CodeAgent.stream] Yielding custom event:', event.type)
						yield event

						// Check for terminal events
						if (event.type === 'complete' || event.type === 'abort') {
							isComplete = true
						}
					} else if (mode === 'updates') {
						// State updates - process through adapter
						for (const [nodeName, nodeState] of Object.entries(data as Record<string, unknown>)) {
							codeLogger.debug('[CodeAgent.stream] Processing node update', { nodeName })
							// Process state update through adapter
							streamAdapter.processStateUpdate(nodeState as Partial<AgentState>)

							// Yield queued events from context.onEvent
							codeLogger.debug('[CodeAgent.stream] Event queue length after processStateUpdate:', eventQueue.length)
							while (eventQueue.length > 0) {
								const event = eventQueue.shift()!
								codeLogger.debug('[CodeAgent.stream] Yielding event:', event.type)
								yield event

								// Check for terminal events
								if (event.type === 'complete' || event.type === 'abort') {
									isComplete = true
								}
							}
						}
					}
				} else {
					// Fallback for single-mode output (backward compatibility)
					for (const [nodeName, nodeState] of Object.entries(output as Record<string, unknown>)) {
						codeLogger.debug('[CodeAgent.stream] Processing node update (fallback)', { nodeName })
						streamAdapter.processStateUpdate(nodeState as Partial<AgentState>)

						while (eventQueue.length > 0) {
							const event = eventQueue.shift()!
							codeLogger.debug('[CodeAgent.stream] Yielding event:', event.type)
							yield event

							if (event.type === 'complete' || event.type === 'abort') {
								isComplete = true
							}
						}
					}
				}
			}

			// Yield any remaining events
			while (eventQueue.length > 0) {
				yield eventQueue.shift()!
			}

			// If we finished without terminal event, check state
			if (!isComplete) {
				const finalState = await this.getState(runId)
				if (finalState) {
					if (finalState.completionSummary) {
						yield {
							type: 'complete',
							summary: finalState.completionSummary,
							changes: finalState.appliedChanges ?? [],
							verification: finalState.lastVerification ?? undefined
						}
					} else if (finalState.aborted) {
						yield {
							type: 'abort',
							reason: finalState.abortReason ?? 'Run aborted'
						}
					} else if (finalState.pendingQuestion) {
						// Paused for question - already emitted
					} else if (finalState.awaitingApproval) {
						// Paused for approval - already emitted
					}
				}
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error)

			// Check if this is a recursion limit error - pause instead of abort
			if (errorMessage.includes('Recursion limit') || errorMessage.includes('recursion limit')) {
				// Get current state for context
				const currentState = await this.getState(runId)
				const currentStep = currentState?.currentStep ?? 0
				const plan = currentState?.plan ?? []
				const phase = currentState?.phase ?? 'unknown'
				const iterations = currentState?.iterations ?? 0

				// Build a friendly, context-aware message
				const stepProgress =
					plan.length > 0
						? { current: currentStep + 1, total: plan.length, label: plan[currentStep]?.title ?? 'current step' }
						: undefined

				const message = this.buildLimitMessage(phase, stepProgress, iterations)

				// Update state to mark limit reached (so resume knows to continue)
				const config = { configurable: { thread_id: runInfo.threadId } }
				try {
					await runInfo.graph.updateState(config, {
						limitReached: true,
						limitContinue: false
					})
				} catch (updateError) {
					codeLogger.warn('[CodeAgent.stream] Failed to update state for limit pause:', updateError)
				}

				// Emit the limit_reached event (pauses for user decision)
				yield {
					type: 'limit_reached',
					runId,
					iteration: iterations,
					limit: RECURSION_LIMIT,
					phase,
					stepProgress,
					message
				}

				// Don't emit abort - this is a pause, not a failure
				return
			}

			// Other errors still abort
			yield {
				type: 'abort',
				reason: `Error during execution: ${errorMessage}`
			}
		}
	}

	/**
	 * Build a friendly message when the iteration limit is reached
	 */
	private buildLimitMessage(
		phase: string,
		stepProgress?: { current: number; total: number; label: string },
		iterations?: number
	): string {
		const parts: string[] = []

		parts.push("I've been working on this task for a while and hit my iteration limit.")

		if (stepProgress) {
			parts.push(`I'm on step ${stepProgress.current} of ${stepProgress.total}: "${stepProgress.label}".`)
		}

		if (phase) {
			const phaseLabel = phase.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
			parts.push(`Currently in the ${phaseLabel} phase.`)
		}

		parts.push("\nWould you like me to continue, or would you prefer to take a break and review what I've done so far?")

		return parts.join(' ')
	}

	/**
	 * Resume a paused run
	 *
	 * Use this after the run pauses for approval, question, or limit.
	 * Provide approval, answer, or continueAfterLimit (not multiple).
	 *
	 * This method stores the resume data. Call stream() after to continue execution.
	 */
	async resume(request: ResumeRunRequest): Promise<void> {
		const runInfo = this.runs.get(request.runId)
		if (!runInfo) {
			throw new Error(`Run not found: ${request.runId}`)
		}

		// Prepare state update based on what we're resuming from
		const stateUpdate: Partial<AgentState> = {}

		if (request.approval) {
			// Resuming from approval
			// IMPORTANT: Only set the approval, do NOT clear awaitingApproval here!
			// The approval_gate node needs awaitingApproval=true to:
			// 1. Detect that approval was granted
			// 2. Add the ToolMessage for apply_changes
			// 3. Clear awaitingApproval after processing
			// If we clear it here, routeAfterTools skips approval_gate entirely
			stateUpdate.approved = request.approval
		}

		if (request.answer) {
			// Resuming from question
			// Note: Don't clear pendingQuestion here - let question_gate do it
			// so planner can see what question was asked if it runs again
			stateUpdate.lastAnswer = request.answer
		}

		if (request.continueAfterLimit) {
			// Resuming after hitting iteration limit
			// Clear the limit flags so we can continue with fresh cycles
			stateUpdate.limitReached = false
			stateUpdate.limitContinue = true
			codeLogger.info('[CodeAgent.resume] Continuing after limit reached')
		}

		// Store the resume data - stream() will use it
		runInfo.pendingResume = stateUpdate
		codeLogger.debug('Resume data stored, call stream() to continue')
	}

	/**
	 * Abort a running or paused run
	 */
	async abort(request: AbortRunRequest): Promise<void> {
		const runInfo = this.runs.get(request.runId)
		if (!runInfo) {
			throw new Error(`Run not found: ${request.runId}`)
		}

		// Signal abort to the run
		runInfo.abortController.abort()

		// Abort any queued tool executions for this run
		try {
			runInfo.context.toolExecutor.abort(request.reason)
		} catch {
			// Best-effort; abort should not throw
		}

		// Stop all active terminal sessions (Phase 5: session cleanup)
		if (runInfo.activeSessions.size > 0) {
			codeLogger.debug(`Cleaning up ${runInfo.activeSessions.size} active sessions`)
			for (const sessionId of runInfo.activeSessions) {
				try {
					await this.config.provider.stopSession({ id: sessionId })
				} catch (e) {
					codeLogger.warn(`Failed to stop session ${sessionId}: ${e}`)
				}
			}
			runInfo.activeSessions.clear()
		}

		// Update state to mark as aborted
		const config = {
			configurable: {
				thread_id: runInfo.threadId
			}
		}

		await runInfo.graph.invoke(
			{
				aborted: true,
				abortReason: request.reason
			},
			config
		)

		// Emit abort event if stream adapter exists
		if (runInfo.streamAdapter) {
			runInfo.context.onEvent?.({
				type: 'abort',
				reason: request.reason
			})
		}
	}

	/**
	 * Get current state for a run
	 */
	async getState(runId: string): Promise<AgentState | null> {
		const runInfo = this.runs.get(runId)
		if (!runInfo) {
			return null
		}

		const config = {
			configurable: {
				thread_id: runInfo.threadId
			}
		}

		try {
			const state = await runInfo.graph.getState(config)
			return state?.values as AgentState | null
		} catch {
			return null
		}
	}

	/**
	 * Check if a run exists
	 */
	hasRun(runId: string): boolean {
		return this.runs.has(runId)
	}

	/**
	 * List all active run IDs
	 */
	listRuns(): string[] {
		return Array.from(this.runs.keys())
	}

	/**
	 * Clean up a completed or aborted run
	 */
	cleanup(runId: string): void {
		this.runs.delete(runId)
	}

	/**
	 * Register an active session for a run (for cleanup on abort)
	 */
	registerSession(runId: string, sessionId: string): void {
		const runInfo = this.runs.get(runId)
		if (runInfo) {
			runInfo.activeSessions.add(sessionId)
			codeLogger.debug(`Registered session ${sessionId} for run ${runId}`)
		}
	}

	/**
	 * Unregister a session when it's stopped
	 */
	unregisterSession(runId: string, sessionId: string): void {
		const runInfo = this.runs.get(runId)
		if (runInfo) {
			runInfo.activeSessions.delete(sessionId)
			codeLogger.debug(`Unregistered session ${sessionId} from run ${runId}`)
		}
	}

	// === Phase 5: Diff and Run APIs ===

	/**
	 * Get pending diffs awaiting approval for a run
	 */
	async getPendingDiffs(runId: string): Promise<FileDiff[]> {
		const state = await this.getState(runId)
		return state?.pendingDiffs ?? []
	}

	/**
	 * Get applied diffs for a run (cumulative history)
	 */
	async getAppliedDiffs(runId: string): Promise<FileDiff[]> {
		const state = await this.getState(runId)
		return state?.appliedDiffs ?? []
	}

	/**
	 * Get run metadata
	 */
	async getRun(runId: string): Promise<RunMeta | null> {
		const runInfo = this.runs.get(runId)
		if (!runInfo) {
			return null
		}
		return this.buildRunMeta(runInfo)
	}

	/**
	 * List all runs with metadata
	 */
	async listRunsWithMeta(filter?: RunFilter): Promise<RunMeta[]> {
		const runs: RunMeta[] = []
		for (const runInfo of this.runs.values()) {
			runs.push(await this.buildRunMeta(runInfo))
		}
		return this.applyFilter(runs, filter)
	}

	/**
	 * Build RunMeta from RunInfo and current state
	 */
	private async buildRunMeta(runInfo: RunInfo): Promise<RunMeta> {
		const state = await this.getState(runInfo.runId)
		const status = this.determineStatus(runInfo, state)

		return {
			runId: runInfo.runId,
			threadId: runInfo.threadId,
			createdAt: runInfo.createdAt.toISOString(),
			updatedAt: new Date().toISOString(),
			status,
			instruction: runInfo.instruction,
			mode: runInfo.mode,
			lastPhase: state?.phase,
			iterations: state?.iterations,
			summary: state?.summary ?? state?.completionSummary ?? undefined
		}
	}

	/**
	 * Determine run status from state
	 */
	private determineStatus(runInfo: RunInfo, state: AgentState | null): RunStatus {
		if (runInfo.abortController.signal.aborted) {
			return 'aborted'
		}
		if (!state) {
			return 'running'
		}
		if (state.aborted) {
			return 'aborted'
		}
		if (state.completionSummary || state.budgetExceeded) {
			return 'completed'
		}
		if (state.awaitingApproval || state.pendingQuestion || state.limitReached) {
			return 'paused'
		}
		return 'running'
	}

	/**
	 * Apply filter to runs list
	 */
	private applyFilter(runs: RunMeta[], filter?: RunFilter): RunMeta[] {
		if (!filter) {
			return runs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
		}

		let filtered = runs

		if (filter.status) {
			filtered = filtered.filter((r) => r.status === filter.status)
		}
		if (filter.mode) {
			filtered = filtered.filter((r) => r.mode === filter.mode)
		}
		if (filter.since) {
			const since = new Date(filter.since)
			filtered = filtered.filter((r) => new Date(r.createdAt) >= since)
		}

		// Sort by creation time descending
		filtered = filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

		if (filter.limit) {
			filtered = filtered.slice(0, filter.limit)
		}

		return filtered
	}

	// === MCP-related methods ===

	/**
	 * Check if MCP is available and connected
	 */
	isMcpConnected(): boolean {
		return this.mcpManager?.isConnected() ?? false
	}

	/**
	 * Get MCP server information
	 */
	getMcpServerInfos() {
		return this.mcpManager?.getServerInfos() ?? []
	}

	/**
	 * Dispose of the agent and clean up all resources
	 *
	 * This should be called when the agent is no longer needed.
	 * It will:
	 * - Abort all running runs
	 * - Disconnect from MCP servers
	 * - Clean up all sessions
	 */
	async dispose(): Promise<void> {
		codeLogger.info('Disposing CodeAgent...')

		// Abort all running runs
		for (const [runId, runInfo] of this.runs) {
			if (!runInfo.abortController.signal.aborted) {
				try {
					await this.abort({ runId, reason: 'Agent disposed' })
				} catch (error) {
					codeLogger.warn(`Error aborting run ${runId}: ${error}`)
				}
			}
		}
		this.runs.clear()

		// Disconnect MCP
		if (this.mcpManager) {
			try {
				await this.mcpManager.disconnect()
			} catch (error) {
				codeLogger.warn(`Error disconnecting MCP: ${error}`)
			}
			this.mcpManager = null
		}

		this.mcpInitialized = false
		codeLogger.info('CodeAgent disposed')
	}
}

/**
 * Create a CodeAgent instance
 */
export function createCodeAgent(config: CodeAgentConfig): CodeAgent {
	return new CodeAgent(config)
}

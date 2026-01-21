import type {
	ScenarioStep,
	ScenarioRunState,
	ScenarioStepResult,
	ScenarioDispatchStep,
	ScenarioWaitStep,
	ScenarioAssertStep,
	ScenarioInteractStep,
	ActionType,
	SnapshotStoreConfig
} from '../../types/index.js'
import type { Session } from '../session.js'
import type { IScenarioManager } from './index.js'
import { executeDispatchStep, executeWaitStep, executeAssertStep, executeInteractStep } from './step-executors/index.js'
import type { StepExecutionContext } from './step-executors/index.js'
import type { StageEventType, StageStateRequestResult } from '../../types/stage.js'
import { getStageServer } from '../../core/stage.js'
import { getControlEventsHub } from '../../core/control-events.js'
import { SnapshotStore } from './snapshots.js'

/** Default timeout for waiting for significant output (5 seconds) */
const DEFAULT_COMPLETION_TIMEOUT = 5000

/** Polling interval for significant output detection (50ms) */
const COMPLETION_POLL_INTERVAL = 50

/**
 * Idle window after significant output before considering the step "complete".
 * This helps capture follow-up actions that occur shortly after the first response.
 */
const COMPLETION_IDLE_WINDOW_MS = 250

/** Action types considered "significant" for completion detection */
const SIGNIFICANT_ACTION_TYPES: ActionType[] = [
	'interaction_response',
	'interaction_followup',
	'message_sent',
	'rest_request'
]

/**
 * ScenarioRunner executes a loaded scenario step by step.
 *
 * State Machine:
 * - loaded → [start] → running
 * - running → [pause] → paused
 * - running → [all steps done] → completed | failed (depending on failures)
 * - running → [assertion fails] → failed (resumable)
 * - running → [fatal error] → error (not resumable)
 * - running → [stop] → stopped
 * - paused → [resume] → running
 * - paused → [stop] → stopped
 * - failed → [resume] → running
 * - failed → [stop] → stopped
 */
export class ScenarioRunner {
	private session: Session
	private manager: IScenarioManager

	/** Resolve function to unpause the run loop */
	private pauseResolve: (() => void) | null = null
	/** Promise that blocks the run loop when paused */
	private pausePromise: Promise<void> | null = null
	/** Flag to signal the run loop to abort */
	private aborted = false
	/** Navigation pointer (separate from execution pointer for seek) */
	private navigationIndex = 0
	/** Last step result for step() return value */
	private lastStepResult: ScenarioStepResult | null = null
	/** Snapshot store for backward navigation (Phase 6) */
	private snapshotStore: SnapshotStore

	constructor(session: Session, manager: IScenarioManager, snapshotConfig?: SnapshotStoreConfig) {
		this.session = session
		this.manager = manager
		this.snapshotStore = new SnapshotStore(snapshotConfig)
	}

	/**
	 * Get the snapshot store for external access.
	 * Used by seek endpoint to retrieve snapshot data.
	 */
	getSnapshotStore(): SnapshotStore {
		return this.snapshotStore
	}

	/**
	 * Start executing the scenario.
	 *
	 * @param mode - 'continuous' runs all steps, 'step' runs one step then pauses
	 * @returns Updated run state
	 */
	async start(mode: 'continuous' | 'step' = 'continuous'): Promise<ScenarioRunState> {
		const state = this.manager.getRunState()

		// Validate state
		if (state.status !== 'loaded') {
			throw new Error(`Cannot start: scenario status is '${state.status}', expected 'loaded'`)
		}

		// Mark as started
		this.manager.markStarted()
		this.aborted = false

		// Run the loop (non-blocking for continuous mode, blocking for step mode)
		if (mode === 'continuous') {
			this.manager.setStatus('running')
			this.emitRunLifecycleEvent('scenario.run.started')
			this.emitRunEvent()

			// Don't await - let it run in background
			this.runLoop().catch((error) => {
				this.handleFatalError(error)
			})
		} else {
			// Step mode: execute one step and pause
			await this.step()
		}

		return this.manager.getRunState()
	}

	/**
	 * Execute a single step and return the result.
	 *
	 * @returns Object containing updated state and step result
	 */
	async step(): Promise<{ state: ScenarioRunState; stepResult?: ScenarioStepResult }> {
		const state = this.manager.getRunState()

		// Validate state - allow from loaded, paused, or failed (resumable).
		if (state.status !== 'loaded' && state.status !== 'paused' && state.status !== 'failed') {
			throw new Error(
				`Cannot step: scenario status is '${state.status}', expected 'loaded', 'paused', or 'failed'`
			)
		}

		// Disallow stepping once finished.
		if (state.currentStepIndex >= state.totalSteps) {
			throw new Error('Cannot step: scenario is already finished')
		}

		// If loaded, mark as started
		if (state.status === 'loaded') {
			this.manager.markStarted()
		}

		this.manager.setStatus('running')
		this.emitRunLifecycleEvent(state.status === 'loaded' ? 'scenario.run.started' : 'scenario.run.resumed')
		this.emitRunEvent()

		await this.executeSingleStep()

		// If the step completed successfully, pause for manual stepping unless we're finished.
		const after = this.manager.getRunState()
		const scenario = this.manager.getScenario()
		if (after.status === 'running') {
			const isDone = scenario
				? after.currentStepIndex >= scenario.steps.length
				: after.currentStepIndex >= after.totalSteps
			if (isDone) {
				this.manager.setStatus(after.hasFailures ? 'failed' : 'completed')
				this.manager.markEnded()
				this.emitRunEvent()
			} else {
				this.manager.setStatus('paused')
				this.emitRunEvent()
			}
		}

		return {
			state: this.manager.getRunState(),
			stepResult: this.lastStepResult ?? undefined
		}
	}

	/**
	 * Pause the running scenario.
	 *
	 * @returns Updated run state
	 */
	pause(): ScenarioRunState {
		const state = this.manager.getRunState()

		if (state.status !== 'running') {
			throw new Error(`Cannot pause: scenario status is '${state.status}', expected 'running'`)
		}

		this.manager.setStatus('paused')
		this.emitRunEvent()

		// Create pause promise that run loop will await
		this.pausePromise = new Promise((resolve) => {
			this.pauseResolve = resolve
		})

		return this.manager.getRunState()
	}

	/**
	 * Resume a paused scenario.
	 *
	 * @returns Updated run state
	 */
	async resume(): Promise<ScenarioRunState> {
		const state = this.manager.getRunState()

		if (state.status !== 'paused' && state.status !== 'failed') {
			throw new Error(`Cannot resume: scenario status is '${state.status}', expected 'paused' or 'failed'`)
		}

		if (state.currentStepIndex >= state.totalSteps) {
			throw new Error('Cannot resume: scenario is already finished')
		}

		this.manager.setStatus('running')
		this.emitRunLifecycleEvent('scenario.run.resumed')
		this.emitRunEvent()

		// Unblock the run loop
		if (this.pauseResolve) {
			this.pauseResolve()
			this.pauseResolve = null
			this.pausePromise = null
		} else {
			// Was paused/failed outside the background run loop (e.g. step() boundaries), start a new loop
			this.runLoop().catch((error) => {
				this.handleFatalError(error)
			})
		}

		return this.manager.getRunState()
	}

	/**
	 * Stop the scenario execution.
	 *
	 * @returns Updated run state
	 */
	stop(): ScenarioRunState {
		const state = this.manager.getRunState()

		if (state.currentStepIndex >= state.totalSteps) {
			throw new Error('Cannot stop: scenario is already finished')
		}

		if (state.status !== 'running' && state.status !== 'paused' && state.status !== 'failed') {
			throw new Error(
				`Cannot stop: scenario status is '${state.status}', expected 'running', 'paused', or 'failed'`
			)
		}

		this.aborted = true
		this.manager.setStatus('stopped')
		this.manager.markEnded()
		this.emitRunEvent()

		// Unblock pause if needed
		if (this.pauseResolve) {
			this.pauseResolve()
			this.pauseResolve = null
			this.pausePromise = null
		}

		return this.manager.getRunState()
	}

	/**
	 * Seek to a specific step index (navigation only, not re-execution).
	 *
	 * @param stepIndex - Target step index (must be within executed range)
	 * @returns Updated run state
	 */
	seek(stepIndex: number): ScenarioRunState {
		const state = this.manager.getRunState()

		// Validate step index is within executed range
		if (stepIndex < 0 || stepIndex >= state.stepResults.length) {
			throw new Error(
				`Cannot seek to step ${stepIndex}: must be within executed range (0-${state.stepResults.length - 1})`
			)
		}

		this.navigationIndex = stepIndex

		// Emit navigation event
		this.emitNavigationEvent()

		return this.manager.getRunState()
	}

	/**
	 * Whether the runner is currently running.
	 */
	get isRunning(): boolean {
		return this.manager.getRunState().status === 'running'
	}

	/**
	 * Whether the runner is currently paused.
	 */
	get isPaused(): boolean {
		return this.manager.getRunState().status === 'paused'
	}

	/**
	 * Main run loop that executes steps sequentially.
	 */
	private async runLoop(): Promise<void> {
		const scenario = this.manager.getScenario()
		if (!scenario) {
			throw new Error('No scenario loaded')
		}

		while (!this.aborted) {
			const state = this.manager.getRunState()

			// Check if we've completed all steps
			if (state.currentStepIndex >= scenario.steps.length) {
				this.manager.setStatus(state.hasFailures ? 'failed' : 'completed')
				this.manager.markEnded()
				this.emitRunEvent()
				break
			}

			// Check if execution is halted (paused or failed).
			if (state.status === 'paused' || state.status === 'failed') {
				// Wait for resume (or stop).
				if (this.pausePromise) await this.pausePromise
				if (this.aborted) break
			}

			// Execute the next step
			await this.executeSingleStep({ inRunLoop: true })

			// If we're now past the last step, finalize immediately (avoid an extra loop turn).
			const afterStep = this.manager.getRunState()
			if (afterStep.currentStepIndex >= scenario.steps.length) {
				if (afterStep.status === 'running') {
					this.manager.setStatus(afterStep.hasFailures ? 'failed' : 'completed')
					this.manager.markEnded()
					this.emitRunEvent()
				} else if (!afterStep.endedAt && (afterStep.status === 'failed' || afterStep.status === 'error')) {
					this.manager.markEnded()
					this.emitRunEvent()
				}
				break
			}

			// Check if step execution halted execution (pause or failure).
			const newState = this.manager.getRunState()
			if (newState.status === 'paused' || newState.status === 'failed') {
				if (this.pausePromise) await this.pausePromise
				if (this.aborted) break
			}
		}
	}

	/**
	 * Execute a single step at the current index.
	 */
	private async executeSingleStep(options?: { inRunLoop?: boolean }): Promise<void> {
		const inRunLoop = options?.inRunLoop ?? false
		const scenario = this.manager.getScenario()
		if (!scenario) {
			throw new Error('No scenario loaded')
		}

		const state = this.manager.getRunState()
		const stepIndex = state.currentStepIndex

		// Check if we've completed all steps
		if (stepIndex >= scenario.steps.length) {
			this.manager.setStatus(state.hasFailures ? 'failed' : 'completed')
			this.manager.markEnded()
			this.emitRunEvent()
			return
		}

		const step = scenario.steps[stepIndex]
		const startTimestamp = Date.now()

		// Emit step started event
		this.emitStepEvent('started', {
			runId: state.runId,
			scenarioId: state.scenarioId,
			stepIndex,
			stepType: step.type,
			stepId: step.id,
			description: step.description,
			expectedNodeId: step.expectedNodeId,
			timestamp: startTimestamp
		})

		// Build execution context
		const context: StepExecutionContext = {
			stepIndex,
			runId: state.runId,
			scenarioId: state.scenarioId,
			startTimestamp
		}

		// Execute the step based on type
		const result = await this.executeStep(step, context)

		// Wait for significant output after dispatch/interact steps before finalizing results.
		// This ensures step results and snapshots include bot outputs, and metadata context stays active.
		const shouldWaitForOutput = result.success && (step.type === 'dispatch' || step.type === 'interact')
		try {
			if (shouldWaitForOutput) {
				const timeout = step.timeout ?? DEFAULT_COMPLETION_TIMEOUT
				await this.waitForStepOutput(timeout, startTimestamp)
			}
		} finally {
			// Clear action context after the step completes to prevent leakage into subsequent steps.
			// Dispatch/interact executors set action context; other step types do not.
			if (step.type === 'dispatch' || step.type === 'interact') {
				this.session.clearActionContext()
			}
		}

		// Collect action IDs recorded since step start (after output wait).
		const actionsSinceStart = this.session.recorder.getSince(startTimestamp)
		const recordedActionIds = actionsSinceStart.map((a) => a.id)

		// Build step result
		const completedAt = Date.now()
		const stepResult: ScenarioStepResult = {
			stepIndex,
			stepId: step.id,
			stepType: step.type,
			status: result.success ? 'ok' : 'failed',
			startedAt: startTimestamp,
			completedAt,
			duration: completedAt - startTimestamp,
			recordedActionIds,
			metadata: {
				scenarioId: state.scenarioId,
				runId: state.runId,
				stepIndex,
				nodeId: step.expectedNodeId
			},
			error: result.error,
			assertionResult: result.assertionResult,
			executedNodeId: step.expectedNodeId
		}

		// Store the result for step() return
		this.lastStepResult = stepResult

		// Add result to manager
		this.manager.addStepResult(stepResult)

		// Capture snapshot at step boundary (Phase 6: Backward Navigation)
		const lastActionId = recordedActionIds.length > 0 ? recordedActionIds[recordedActionIds.length - 1] : ''
		const playback = await this.getStagePlaybackBoundarySnapshot()
		this.snapshotStore.capture(stepIndex, stepResult, lastActionId, playback)

		// Update navigation index to track the latest executed step
		this.navigationIndex = stepIndex

		// Advance step index
		this.manager.setCurrentStepIndex(stepIndex + 1)

		// Emit step event
		if (result.success) {
			this.emitStepEvent('completed', {
				runId: state.runId,
				scenarioId: state.scenarioId,
				stepIndex,
				stepType: step.type,
				stepId: step.id,
				status: 'ok',
				duration: stepResult.duration,
				recordedActionIds: stepResult.recordedActionIds,
				executedNodeId: step.expectedNodeId,
				timestamp: completedAt
			})
		} else {
			this.emitStepEvent('failed', {
				runId: state.runId,
				scenarioId: state.scenarioId,
				stepIndex,
				stepType: step.type,
				stepId: step.id,
				status: stepResult.status,
				error: result.error,
				errorDetails: result.assertionResult,
				duration: stepResult.duration,
				assertionResult: result.assertionResult,
				timestamp: completedAt
			})

			// Add error to run state
			this.manager.addError({
				stepIndex,
				message: result.error ?? 'Step failed',
				details: result.assertionResult
			})

			// Halt on failure (resumable if there are remaining steps)
			const isDone = stepIndex + 1 >= scenario.steps.length
			this.manager.setStatus('failed')
			if (isDone) {
				this.manager.markEnded()
			}
			this.emitRunEvent()

			// If we're in the background run loop, halt execution until resume().
			if (inRunLoop && !isDone) {
				this.pausePromise = new Promise((resolve) => {
					this.pauseResolve = resolve
				})
			}
		}
	}

	/**
	 * Best-effort Stage playback snapshot capture for backward navigation.
	 *
	 * Captures the Stage UI's current recording duration (ms) and event count so `seek`
	 * can restore the UI to the same boundary later. If no Stage client is connected,
	 * returns undefined (navigation still works, but UI rewind is unavailable).
	 */
	private async getStagePlaybackBoundarySnapshot(): Promise<{ time: number; eventCount: number } | undefined> {
		try {
			const stageServer = getStageServer()
			if (!stageServer.hasStageClients(this.session.id)) {
				return undefined
			}

			// Request state from Stage UI (Phase 8 control command protocol).
			const response = await stageServer.sendControlCommand(this.session.id, 'state_request', {}, 1000)
			if (!response.success) {
				return undefined
			}

			const result = response.result as unknown

			// Current shape: { playback, navigation }
			if (typeof result === 'object' && result !== null && 'playback' in result) {
				const { playback } = result as StageStateRequestResult
				if (
					typeof playback === 'object' &&
					playback !== null &&
					typeof playback.duration === 'number' &&
					typeof playback.totalEvents === 'number'
				) {
					return {
						time: playback.duration,
						eventCount: playback.totalEvents
					}
				}
			}

			// Back-compat: older Stage UI returned the playback snapshot directly.
			if (typeof result === 'object' && result !== null && 'duration' in result && 'totalEvents' in result) {
				const legacy = result as { duration: unknown; totalEvents: unknown }
				if (typeof legacy.duration === 'number' && typeof legacy.totalEvents === 'number') {
					return { time: legacy.duration, eventCount: legacy.totalEvents }
				}
			}
		} catch {
			// Ignore Stage snapshot capture failures (timeouts / disconnected clients)
		}

		return undefined
	}

	/**
	 * Execute a step using the appropriate executor.
	 */
	private async executeStep(
		step: ScenarioStep,
		context: StepExecutionContext
	): Promise<{
		success: boolean
		recordedActionIds: string[]
		error?: string
		assertionResult?: ScenarioStepResult['assertionResult']
	}> {
		switch (step.type) {
			case 'dispatch':
				return executeDispatchStep(this.session, step as ScenarioDispatchStep, context)
			case 'wait':
				return executeWaitStep(this.session, step as ScenarioWaitStep, context)
			case 'assert':
				return executeAssertStep(this.session, step as ScenarioAssertStep, context)
			case 'interact':
				return executeInteractStep(this.session, step as ScenarioInteractStep, context)
			default:
				return {
					success: false,
					recordedActionIds: [],
					error: `Unknown step type: ${(step as { type: string }).type}`
				}
		}
	}

	/**
	 * Wait for step output completion after dispatch/interact steps.
	 *
	 * Semantics (MVP):
	 * - Wait until at least one "significant" action is recorded, then wait for an idle window.
	 * - If no significant output arrives, time out and continue (not an error).
	 */
	private async waitForStepOutput(timeoutMs: number, startTimestamp: number): Promise<void> {
		const startTime = Date.now()
		let lastActionCount = -1
		let lastActionChangeAt = Date.now()
		let hasSignificant = false

		while (Date.now() - startTime < timeoutMs) {
			const actions = this.session.recorder.getSince(startTimestamp)
			if (actions.length !== lastActionCount) {
				lastActionCount = actions.length
				lastActionChangeAt = Date.now()
			}

			if (!hasSignificant) {
				hasSignificant = actions.some((a) => SIGNIFICANT_ACTION_TYPES.includes(a.type as ActionType))
			}

			if (hasSignificant) {
				const idleForMs = Date.now() - lastActionChangeAt
				if (idleForMs >= COMPLETION_IDLE_WINDOW_MS) {
					return
				}
			}

			await sleep(COMPLETION_POLL_INTERVAL)
		}

		// Timeout reached - not an error, just continue
	}

	/**
	 * Emit a run lifecycle event (started/resumed) in addition to state events.
	 * Payload matches `StageScenarioRunEventData` (status reflects current run status).
	 */
	private emitRunLifecycleEvent(eventType: 'scenario.run.started' | 'scenario.run.resumed'): void {
		const state = this.manager.getRunState()
		const data = {
			runId: state.runId,
			scenarioId: state.scenarioId,
			status: state.status === 'running' ? 'running' : state.status,
			currentStepIndex: state.currentStepIndex,
			totalSteps: state.totalSteps,
			successCount: state.successCount,
			failureCount: state.failureCount,
			skippedCount: state.skippedCount,
			timestamp: Date.now()
		}

		try {
			getStageServer().broadcastToSession(this.session.id, {
				type: eventType,
				data
			})
		} catch {
			// Stage server may not be available in all contexts
		}

		try {
			getControlEventsHub().broadcast(this.session.id, eventType, data)
		} catch {
			// Control events hub may not be initialized
		}
	}

	/**
	 * Handle a fatal error during execution.
	 */
	private handleFatalError(error: unknown): void {
		const message = error instanceof Error ? error.message : String(error)

		this.manager.addError({
			stepIndex: -1,
			message: `Fatal error: ${message}`,
			code: 'FATAL_ERROR'
		})

		this.manager.setStatus('error')
		this.manager.markEnded()
		this.emitRunEvent()
	}

	/**
	 * Emit a step lifecycle event to Stage clients and Control Events clients.
	 */
	private emitStepEvent(type: 'started' | 'completed' | 'failed', data: object): void {
		const eventType = `scenario.step.${type}` as StageEventType

		// Emit to Stage WS (for Stage UI clients)
		try {
			getStageServer().broadcastToSession(this.session.id, {
				type: eventType,
				data
			})
		} catch {
			// Stage server may not be available in all contexts
		}

		// Emit to Control Events WS (for SDK/Disgraph clients)
		try {
			getControlEventsHub().broadcast(this.session.id, eventType, data)
		} catch {
			// Control events hub may not be initialized
		}
	}

	/**
	 * Emit a run lifecycle event to Stage clients and Control Events clients.
	 */
	private emitRunEvent(): void {
		const state = this.manager.getRunState()
		const eventType = `scenario.run.${state.status}` as StageEventType
		const data = {
			runId: state.runId,
			scenarioId: state.scenarioId,
			status: state.status,
			currentStepIndex: state.currentStepIndex,
			totalSteps: state.totalSteps,
			successCount: state.successCount,
			failureCount: state.failureCount,
			skippedCount: state.skippedCount,
			timestamp: Date.now()
		}

		// Emit to Stage WS (for Stage UI clients)
		try {
			getStageServer().broadcastToSession(this.session.id, {
				type: eventType,
				data
			})
		} catch {
			// Stage server may not be available in all contexts
		}

		// Emit to Control Events WS (for SDK/Disgraph clients)
		try {
			getControlEventsHub().broadcast(this.session.id, eventType, data)
		} catch {
			// Control events hub may not be initialized
		}
	}

	/**
	 * Emit a navigation event when seek is called.
	 * Includes snapshot data for the navigated step (Phase 6).
	 */
	private emitNavigationEvent(): void {
		const state = this.manager.getRunState()
		const snapshot = this.snapshotStore.get(this.navigationIndex)
		const eventType = 'stage.navigation.changed'
		const data = {
			// Standard navigation fields (set to null for scenario navigation)
			guildId: null,
			channelId: null,
			timestamp: Date.now(),
			// Scenario navigation fields (Phase 6)
			runId: state.runId,
			scenarioId: state.scenarioId,
			navigationIndex: this.navigationIndex,
			stepResult: snapshot?.stepResult,
			actionIdsBoundary: snapshot?.actionIdsBoundary
		}

		// Emit to Stage WS (for Stage UI clients)
		try {
			getStageServer().broadcastToSession(this.session.id, {
				type: eventType,
				data
			})
		} catch {
			// Stage server may not be available in all contexts
		}

		// Emit to Control Events WS (for SDK/Disgraph clients)
		try {
			getControlEventsHub().broadcast(this.session.id, eventType, data)
		} catch {
			// Control events hub may not be initialized
		}
	}

	/**
	 * Clear the snapshot store.
	 * Called when the scenario is cleared.
	 */
	clearSnapshots(): void {
		this.snapshotStore.clear()
	}
}

/**
 * Sleep for the specified number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

import type {
	ScenarioDefinition,
	ScenarioRunState,
	ScenarioRunStatus,
	ScenarioRunError,
	ScenarioStepResult
} from '../../types/index.js'
import type { Session } from '../session.js'
import { ScenarioRunner } from './runner.js'
import { randomUUID } from 'node:crypto'

/**
 * Result of loading a scenario into the manager.
 */
export interface ScenarioLoadResult {
	/** Unique identifier for this run */
	runId: string
	/** Scenario ID from the definition */
	scenarioId: string
	/** Total number of steps */
	stepCount: number
	/** Warnings about unsupported features (e.g., Flashcore) */
	warnings: string[]
}

/**
 * Validation error from scenario validation.
 */
export interface ScenarioValidationError {
	/** Field that failed validation */
	field: string
	/** Error message */
	message: string
}

/**
 * Interface for ScenarioManager to allow mocking in tests.
 */
export interface IScenarioManager {
	/**
	 * Load a scenario definition into the manager.
	 * Validates the scenario and initializes run state.
	 * @throws Error if validation fails
	 */
	load(scenario: ScenarioDefinition): ScenarioLoadResult

	/**
	 * Clear the loaded scenario and run state.
	 */
	clear(): void

	/**
	 * Get the loaded scenario definition, if any.
	 */
	getScenario(): ScenarioDefinition | null

	/**
	 * Get the current run state.
	 * Returns an idle state if no scenario is loaded.
	 */
	getRunState(): ScenarioRunState

	/**
	 * Check if a scenario is currently loaded.
	 */
	hasScenario(): boolean

	/**
	 * Update the run status.
	 * Used by the scenario runner (Phase 5) to update execution state.
	 */
	setStatus(status: ScenarioRunStatus): void

	/**
	 * Add a step result to the run state.
	 * Used by the scenario runner (Phase 5) to record step outcomes.
	 */
	addStepResult(result: ScenarioStepResult): void

	/**
	 * Add an error to the run state.
	 * Used for both step-level and run-level errors.
	 */
	addError(error: ScenarioRunError): void

	/**
	 * Set the current step index.
	 * Used by the scenario runner to track progress.
	 */
	setCurrentStepIndex(index: number): void

	/**
	 * Mark the run as started.
	 */
	markStarted(): void

	/**
	 * Mark the run as ended.
	 */
	markEnded(): void
}

/**
 * Manages scenario lifecycle for a session.
 * Handles scenario storage, validation, run state tracking, and runner management.
 *
 * This class is owned by a Session and provides the foundation for
 * scenario execution.
 */
export class ScenarioManager implements IScenarioManager {
	/** Loaded scenario definition */
	private scenario: ScenarioDefinition | null = null

	/** Current run state */
	private runState: ScenarioRunState | null = null

	/** Session reference for runner creation */
	private _session: Session | null = null

	/** Scenario runner instance */
	private _runner: ScenarioRunner | null = null

	/**
	 * Set the session reference for runner creation.
	 * Called by the Session constructor after creating the manager.
	 */
	setSession(session: Session): void {
		this._session = session
	}

	/**
	 * Get the scenario runner.
	 * @throws Error if no scenario is loaded
	 */
	getRunner(): ScenarioRunner {
		if (!this._runner) {
			throw new Error('No scenario loaded')
		}
		return this._runner
	}

	/**
	 * Check if a runner is available.
	 */
	hasRunner(): boolean {
		return this._runner !== null
	}

	/**
	 * Load a scenario definition into the manager.
	 * @param scenario - The scenario definition to load
	 * @returns Load result with run_id, scenario_id, step_count, and warnings
	 * @throws Error if validation fails
	 */
	load(scenario: ScenarioDefinition): ScenarioLoadResult {
		// If a scenario is already loaded/running, clear it first to ensure a clean state
		if (this.scenario || this.runState || this._runner) {
			this.clear()
		}

		// Validate the scenario
		const errors = this.validateScenario(scenario)
		if (errors.length > 0) {
			const messages = errors.map((e) => `${e.field}: ${e.message}`).join('; ')
			throw new Error(`Invalid scenario: ${messages}`)
		}

		// Generate a unique run ID
		const runId = randomUUID()

		// Collect warnings for unsupported features
		const warnings: string[] = []

		// Check for Flashcore data (explicitly deferred per spec)
		if (scenario.mockConfig?.flashcoreData && Object.keys(scenario.mockConfig.flashcoreData).length > 0) {
			warnings.push('Flashcore seeding is not supported yet; flashcoreData will be stored but not applied')
		}

		// Check for API mocks (also deferred)
		if (scenario.mockConfig?.apiMocks && Object.keys(scenario.mockConfig.apiMocks).length > 0) {
			warnings.push('API mocking is not supported yet; apiMocks will be stored but not applied')
		}

		// Store the scenario
		this.scenario = scenario

		// Initialize run state
		this.runState = {
			runId,
			scenarioId: scenario.id,
			status: 'loaded',
			currentStepIndex: 0,
			totalSteps: scenario.steps.length,
			stepResults: [],
			successCount: 0,
			failureCount: 0,
			skippedCount: 0,
			hasFailures: false,
			errors: []
		}

		// Create the runner if session is available
		if (this._session) {
			this._runner = new ScenarioRunner(this._session, this)
		}

		return {
			runId,
			scenarioId: scenario.id,
			stepCount: scenario.steps.length,
			warnings
		}
	}

	/**
	 * Clear the loaded scenario and run state.
	 */
	clear(): void {
		// Stop the runner if it's running
		if (this._runner) {
			try {
				const state = this.getRunState()
				if (state.status === 'running' || state.status === 'paused' || state.status === 'failed') {
					this._runner.stop()
				}
				// Clear snapshots (Phase 6)
				this._runner.clearSnapshots()
			} catch {
				// Ignore errors during cleanup
			}
			this._runner = null
		}

		this.scenario = null
		this.runState = null
	}

	/**
	 * Get the loaded scenario definition.
	 */
	getScenario(): ScenarioDefinition | null {
		return this.scenario
	}

	/**
	 * Get the current run state.
	 * Returns an idle state if no scenario is loaded.
	 */
	getRunState(): ScenarioRunState {
		if (!this.runState) {
			// Return idle state when no scenario is loaded
			return {
				runId: '',
				scenarioId: '',
				status: 'idle',
				currentStepIndex: 0,
				totalSteps: 0,
				stepResults: [],
				successCount: 0,
				failureCount: 0,
				skippedCount: 0,
				hasFailures: false,
				errors: []
			}
		}

		return { ...this.runState }
	}

	/**
	 * Check if a scenario is currently loaded.
	 */
	hasScenario(): boolean {
		return this.scenario !== null
	}

	/**
	 * Update the run status.
	 */
	setStatus(status: ScenarioRunStatus): void {
		if (this.runState) {
			this.runState.status = status
		}
	}

	/**
	 * Add a step result to the run state.
	 */
	addStepResult(result: ScenarioStepResult): void {
		if (!this.runState) {
			return
		}

		this.runState.stepResults.push(result)

		// Update counts
		switch (result.status) {
			case 'ok':
				this.runState.successCount++
				break
			case 'failed':
			case 'timeout':
				this.runState.failureCount++
				this.runState.hasFailures = true
				break
			case 'skipped':
				this.runState.skippedCount++
				break
		}

		// Update last step timestamp
		if (result.completedAt) {
			this.runState.lastStepAt = result.completedAt
		}
	}

	/**
	 * Add an error to the run state.
	 */
	addError(error: ScenarioRunError): void {
		if (this.runState) {
			this.runState.errors.push(error)
			this.runState.hasFailures = true
		}
	}

	/**
	 * Set the current step index.
	 */
	setCurrentStepIndex(index: number): void {
		if (this.runState) {
			this.runState.currentStepIndex = index
		}
	}

	/**
	 * Mark the run as started.
	 */
	markStarted(): void {
		if (this.runState) {
			this.runState.startedAt = Date.now()
		}
	}

	/**
	 * Mark the run as ended.
	 */
	markEnded(): void {
		if (this.runState) {
			this.runState.endedAt = Date.now()
		}
	}

	/**
	 * Validate a scenario definition against the schema.
	 * @param scenario - The scenario to validate
	 * @returns Array of validation errors (empty if valid)
	 */
	private validateScenario(scenario: ScenarioDefinition): ScenarioValidationError[] {
		const errors: ScenarioValidationError[] = []

		const isObject = (value: unknown): value is Record<string, unknown> =>
			typeof value === 'object' && value !== null && !Array.isArray(value)

		const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0

		// Check version (must be 1 for current schema)
		if (scenario.version !== 1) {
			errors.push({
				field: 'version',
				message: `Unsupported scenario version: ${scenario.version}. Only version 1 is supported.`
			})
		}

		// Check required id field
		if (!scenario.id || typeof scenario.id !== 'string') {
			errors.push({
				field: 'id',
				message: 'Scenario must have a valid id string'
			})
		}

		// Check required metadata
		if (!scenario.metadata) {
			errors.push({
				field: 'metadata',
				message: 'Scenario must have metadata'
			})
		} else if (!scenario.metadata.name || typeof scenario.metadata.name !== 'string') {
			errors.push({
				field: 'metadata.name',
				message: 'Scenario metadata must have a name string'
			})
		}

		// Check steps array
		if (!Array.isArray(scenario.steps)) {
			errors.push({
				field: 'steps',
				message: 'Scenario must have a steps array'
			})
		} else {
			// Validate each step has a valid type
			scenario.steps.forEach((step, index) => {
				if (!step.type || !['dispatch', 'wait', 'assert', 'interact'].includes(step.type)) {
					errors.push({
						field: `steps[${index}].type`,
						message: `Invalid step type: ${step.type}. Must be one of: dispatch, wait, assert, interact`
					})
					return
				}

				// Validate step config object exists for each type (prevents executor crashes).
				if (step.type === 'dispatch') {
					const dispatch = (step as unknown as { dispatch?: unknown }).dispatch
					if (!isObject(dispatch)) {
						errors.push({
							field: `steps[${index}].dispatch`,
							message: 'Dispatch step must include a dispatch object'
						})
						return
					}

					if (!isNonEmptyString(dispatch.kind)) {
						errors.push({
							field: `steps[${index}].dispatch.kind`,
							message:
								'Dispatch step must include a non-empty dispatch.kind (e.g. slash_command, message_create)'
						})
						return
					}

					// Ensure payload exists (shape validated by executor-specific logic at runtime).
					if (!('payload' in dispatch)) {
						errors.push({
							field: `steps[${index}].dispatch.payload`,
							message: 'Dispatch step must include dispatch.payload'
						})
						return
					}
				}

				if (step.type === 'wait') {
					const wait = (step as unknown as { wait?: unknown }).wait
					if (!isObject(wait)) {
						errors.push({
							field: `steps[${index}].wait`,
							message: 'Wait step must include a wait object'
						})
						return
					}

					const hasAnyCondition =
						wait.duration !== undefined ||
						wait.forActionType !== undefined ||
						wait.forAnyActionType !== undefined ||
						wait.forAction !== undefined

					if (!hasAnyCondition) {
						errors.push({
							field: `steps[${index}].wait`,
							message:
								'Wait step must specify at least one condition (duration, forActionType, forAnyActionType, or forAction)'
						})
					}
				}

				if (step.type === 'assert') {
					const assert = (step as unknown as { assert?: unknown }).assert
					if (!isObject(assert)) {
						errors.push({
							field: `steps[${index}].assert`,
							message: 'Assert step must include an assert object'
						})
						return
					}

					// Prevent "no-op" asserts that would always pass.
					const hasSupportedAssertion =
						assert.actionRecorded !== undefined ||
						assert.messageSent !== undefined ||
						assert.interactionResponse !== undefined

					if (assert.custom !== undefined) {
						errors.push({
							field: `steps[${index}].assert.custom`,
							message: 'Custom assertions are not supported yet (assert.custom must be omitted)'
						})
					}

					if (!hasSupportedAssertion) {
						errors.push({
							field: `steps[${index}].assert`,
							message:
								'Assert step must specify at least one supported assertion (actionRecorded, messageSent, or interactionResponse)'
						})
					}
				}

				if (step.type === 'interact') {
					const interact = (step as unknown as { interact?: unknown }).interact
					if (!isObject(interact)) {
						errors.push({
							field: `steps[${index}].interact`,
							message: 'Interact step must include an interact object'
						})
						return
					}

					if (!isNonEmptyString(interact.componentType)) {
						errors.push({
							field: `steps[${index}].interact.componentType`,
							message: 'Interact step must include interact.componentType (button | select | modal)'
						})
						return
					}

					if (!isNonEmptyString(interact.customId)) {
						errors.push({
							field: `steps[${index}].interact.customId`,
							message: 'Interact step must include interact.customId'
						})
						return
					}

					if (interact.componentType === 'select') {
						if (!Array.isArray(interact.selectValues) || interact.selectValues.length === 0) {
							errors.push({
								field: `steps[${index}].interact.selectValues`,
								message: 'Select interactions require interact.selectValues (non-empty array)'
							})
						}
					}

					if (interact.componentType === 'modal') {
						if (!isObject(interact.modalFields) || Object.keys(interact.modalFields).length === 0) {
							errors.push({
								field: `steps[${index}].interact.modalFields`,
								message: 'Modal interactions require interact.modalFields (non-empty object)'
							})
						}
					}
				}
			})
		}

		return errors
	}
}

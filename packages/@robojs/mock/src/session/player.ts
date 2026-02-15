import type {
	SessionRecording,
	RecordedAction,
	ReplayOptions,
	ReplayState,
	ReplayResult,
	ValidationResult,
	ValidationMode,
	ActionType,
	MockGuildConfig
} from '../types/index.js'
import type { Session } from './session.js'
import { createDefaultGuildWithChannel, createMockChannel } from './state.js'
import { mockLogger } from '../core/logger.js'

// Default timeout for waiting on bot responses (5 seconds)
const DEFAULT_RESPONSE_TIMEOUT = 5000

// Input action types (events sent to bot that we replay)
const INPUT_ACTION_TYPES: ActionType[] = [
	'dispatch',
	'activity_launch',
	'activity_close',
	'activity_rpc_inbound'
]

// Output action types (bot responses used for validation)
const OUTPUT_ACTION_TYPES: ActionType[] = [
	'message_sent',
	'message_edited',
	'message_deleted',
	'reaction_added',
	'reaction_removed',
	'interaction_response',
	'interaction_followup',
	'interaction_edit',
	'rest_request',
	'activity_rpc_outbound',
	'activity_proxy_http'
]

/**
 * RecordingPlayer - Replays recorded sessions with timing and validation
 *
 * Designed for UI compatibility with real-time state updates.
 */
export class RecordingPlayer {
	private readonly recording: SessionRecording
	private state: ReplayState
	private pausePromise: Promise<void> | null = null
	private pauseResolve: (() => void) | null = null
	private stopped = false
	private replayStartTime = 0

	constructor(recording: SessionRecording) {
		this.recording = recording
		this.state = this.createInitialState()
	}

	/**
	 * Load a recording from a JSON file
	 */
	static async loadFromFile(filePath: string): Promise<SessionRecording> {
		const fs = await import('node:fs/promises')
		const content = await fs.readFile(filePath, 'utf-8')
		const recording = JSON.parse(content) as SessionRecording

		// Validate recording format
		if (recording.version !== 1) {
			throw new Error(`Unsupported recording version: ${recording.version}`)
		}
		if (!recording.metadata || !recording.actions) {
			throw new Error('Invalid recording format: missing metadata or actions')
		}

		return recording
	}

	/**
	 * Get current playback state (for UI binding)
	 */
	getState(): ReplayState {
		return { ...this.state }
	}

	/**
	 * Play the recording into a session
	 */
	async play(session: Session, options?: ReplayOptions): Promise<ReplayResult> {
		const speed = options?.speed ?? 1
		const validate = options?.validate ?? false
		const validationMode = options?.validationMode ?? 'flexible'
		const responseTimeout = options?.responseTimeout ?? DEFAULT_RESPONSE_TIMEOUT

		// Reset state
		this.stopped = false
		this.pausePromise = null
		this.pauseResolve = null
		this.state = this.createInitialState()
		this.state.speed = speed
		this.state.mode = 'playing'

		// Initialize session with recording's initial config
		await this.initializeSession(session)

		const inputActions = this.getInputActions()
		const outputActions = validate ? this.getOutputActions() : []
		const startTime = this.recording.metadata.startTime
		this.replayStartTime = Date.now()

		let actionsReplayed = 0
		const validation: ValidationResult = {
			passed: true,
			matched: 0,
			mismatched: 0,
			extra: 0,
			missing: 0,
			mismatches: []
		}

		// Notify progress
		options?.onProgress?.(this.getState())

		mockLogger.debug(`Starting replay of ${inputActions.length} actions at ${speed}x speed`)

		for (let i = 0; i < inputActions.length; i++) {
			// Check for pause - mode can change asynchronously, so we need to re-read it
			const currentMode = this.state.mode as ReplayState['mode']
			if (currentMode === 'paused') {
				await this.waitForResume()
			}

			// Check for stop
			if (this.stopped || this.state.mode !== 'playing') {
				break
			}

			const action = inputActions[i]
			const targetTime = action.timestamp - startTime

			// Wait for timing (adjusted by speed)
			await this.waitUntilTime(targetTime, speed)

			// Update state before replay
			this.state.currentIndex = i
			this.state.currentTime = targetTime
			this.state.currentAction = action

			// Replay the action
			await this.replayAction(session, action)
			actionsReplayed++

			// Notify progress
			options?.onProgress?.(this.getState())

			// Validate if enabled
			if (validate) {
				const expectedOutputs = this.getExpectedOutputsForAction(action, outputActions, i)
				if (expectedOutputs.length > 0) {
					const validationResult = await this.validateResponses(
						session,
						expectedOutputs,
						validationMode,
						responseTimeout
					)
					validation.matched += validationResult.matched
					validation.mismatched += validationResult.mismatched
					validation.missing += validationResult.missing
					validation.extra += validationResult.extra
					validation.mismatches.push(...validationResult.mismatches)
				}
			}
		}

		// Mark completed
		this.state.mode = 'completed'
		this.state.currentTime = this.recording.metadata.duration

		validation.passed = validation.mismatched === 0 && validation.missing === 0

		const result: ReplayResult = {
			success: !this.stopped,
			actionsReplayed,
			duration: Date.now() - this.replayStartTime,
			validation: validate ? validation : undefined
		}

		// Notify completion
		options?.onComplete?.(result)
		options?.onProgress?.(this.getState())

		mockLogger.info(`Replay completed: ${actionsReplayed} actions in ${result.duration}ms`)

		return result
	}

	/**
	 * Pause playback
	 */
	pause(): void {
		if (this.state.mode !== 'playing') {
			return
		}

		this.state.mode = 'paused'
		this.pausePromise = new Promise((resolve) => {
			this.pauseResolve = resolve
		})

		mockLogger.debug('Replay paused')
	}

	/**
	 * Resume playback
	 */
	resume(): void {
		if (this.state.mode !== 'paused') {
			return
		}

		this.state.mode = 'playing'
		if (this.pauseResolve) {
			this.pauseResolve()
			this.pauseResolve = null
			this.pausePromise = null
		}

		mockLogger.debug('Replay resumed')
	}

	/**
	 * Stop playback
	 */
	stop(): void {
		this.stopped = true
		this.state.mode = 'idle'

		// Release any pause wait
		if (this.pauseResolve) {
			this.pauseResolve()
			this.pauseResolve = null
			this.pausePromise = null
		}

		mockLogger.debug('Replay stopped')
	}

	/**
	 * Seek to a specific time in the recording
	 * Note: This only updates the state, actual seeking happens on next play
	 */
	seek(timeMs: number): void {
		const clampedTime = Math.max(0, Math.min(timeMs, this.recording.metadata.duration))
		this.state.currentTime = clampedTime

		// Find the action index at this time
		const inputActions = this.getInputActions()
		const startTime = this.recording.metadata.startTime
		let newIndex = 0
		for (let i = 0; i < inputActions.length; i++) {
			if (inputActions[i].timestamp - startTime <= clampedTime) {
				newIndex = i
			} else {
				break
			}
		}
		this.state.currentIndex = newIndex

		mockLogger.debug(`Seek to ${clampedTime}ms (action index ${newIndex})`)
	}

	/**
	 * Change playback speed
	 */
	setSpeed(speed: number): void {
		this.state.speed = Math.max(0, speed)
		mockLogger.debug(`Speed changed to ${speed}x`)
	}

	// ============================================================================
	// Private Methods
	// ============================================================================

	private createInitialState(): ReplayState {
		const inputActions = this.getInputActions()
		return {
			mode: 'idle',
			currentTime: 0,
			duration: this.recording.metadata.duration,
			currentIndex: 0,
			totalActions: inputActions.length,
			speed: 1
		}
	}

	/**
	 * Initialize session state from recording's initialConfig
	 */
	private async initializeSession(session: Session): Promise<void> {
		// Reset the session state
		session.state.reset()

		const config = this.recording.initialConfig

		// Set application ID if provided
		// Note: applicationId is readonly, so we skip this
		// The session will use its default applicationId

		// Create guilds from config
		if (config.guilds && config.guilds.length > 0) {
			for (const guildConfig of config.guilds) {
				this.createGuildFromConfig(session, guildConfig)
			}
		}

		// Add users from config
		if (config.users) {
			for (const userConfig of config.users) {
				const user = {
					id: userConfig.id!,
					username: userConfig.username ?? 'User',
					discriminator: userConfig.discriminator ?? '0',
					globalName: userConfig.globalName ?? userConfig.username ?? 'User',
					avatar: userConfig.avatar ?? null,
					bot: userConfig.bot ?? false
				}
				session.state.addUser(user)
			}
		}

		mockLogger.debug(`Session initialized from recording config`)
	}

	/**
	 * Create a guild from config including its channels
	 */
	private createGuildFromConfig(session: Session, guildConfig: MockGuildConfig): void {
		// Create the guild with a channel
		const guild = createDefaultGuildWithChannel(session.state, {
			guildName: guildConfig.name ?? 'Test Guild',
			channelName: 'general'
		})

		// If the config has specific channels, we need to handle them
		if (guildConfig.channels && guildConfig.channels.length > 0) {
			// Clear the default channel that was created
			const defaultChannelId = guild.channels[0]
			if (defaultChannelId) {
				session.state.channels.delete(defaultChannelId)
				guild.channels.length = 0
			}

			// Add configured channels
			for (const channelConfig of guildConfig.channels) {
				const channel = createMockChannel({
					id: channelConfig.id,
					guildId: guild.id,
					name: channelConfig.name ?? 'channel',
					type: channelConfig.type ?? 0,
					parentId: channelConfig.parentId
				})
				session.state.addChannelToGuild(guild.id, channel)
			}
		}
	}

	/**
	 * Get input actions (events to replay to bot)
	 */
	private getInputActions(): RecordedAction[] {
		return this.recording.actions.filter((a) => INPUT_ACTION_TYPES.includes(a.type))
	}

	/**
	 * Get output actions (bot responses for validation)
	 */
	private getOutputActions(): RecordedAction[] {
		return this.recording.actions.filter((a) => OUTPUT_ACTION_TYPES.includes(a.type))
	}

	/**
	 * Wait until the target time in the recording (adjusted by speed)
	 */
	private async waitUntilTime(targetTime: number, speed: number): Promise<void> {
		if (speed === 0) {
			// Instant mode - no waiting
			return
		}

		const elapsed = Date.now() - this.replayStartTime
		const targetElapsed = targetTime / speed
		const waitTime = targetElapsed - elapsed

		if (waitTime > 0) {
			await this.sleep(waitTime)
		}
	}

	/**
	 * Wait for resume when paused
	 */
	private async waitForResume(): Promise<void> {
		if (this.pausePromise) {
			await this.pausePromise
		}
	}

	/**
	 * Replay a single action to the session
	 */
	private async replayAction(session: Session, action: RecordedAction): Promise<void> {
		switch (action.type) {
			case 'dispatch': {
				const data = action.data as { event: string; payload: unknown }
				if (!data.event || !data.payload) {
					mockLogger.warn(`Invalid dispatch action data: ${JSON.stringify(action.data)}`)
					return
				}

				// Dispatch the event to the session
				await session.dispatch(data.event, data.payload)

				mockLogger.debug(`Replayed: ${data.event}`)
				break
			}

			case 'activity_launch':
			case 'activity_close':
			case 'activity_rpc_inbound':
			case 'activity_rpc_outbound':
			case 'activity_proxy_http':
			case 'activity_proxy_ws':
				// Activity actions are NOT replayed as live interactions.
				// They are logged for the timeline/event viewer.
				mockLogger.debug(`Playback activity action: ${action.type}`)
				break

			default:
				return
		}
	}

	/**
	 * Get expected output actions that should follow a given input action
	 */
	private getExpectedOutputsForAction(
		inputAction: RecordedAction,
		outputActions: RecordedAction[],
		inputIndex: number
	): RecordedAction[] {
		// Find outputs that have triggeredBy pointing to this action
		const byTriggeredBy = outputActions.filter((o) => o.triggeredBy === inputAction.id)
		if (byTriggeredBy.length > 0) {
			return byTriggeredBy
		}

		// Fallback: find outputs between this input and the next input
		const inputActions = this.getInputActions()
		const nextInput = inputActions[inputIndex + 1]
		const currentTime = inputAction.timestamp
		const nextTime = nextInput?.timestamp ?? this.recording.metadata.endTime

		return outputActions.filter((o) => o.timestamp >= currentTime && o.timestamp < nextTime)
	}

	/**
	 * Validate bot responses against expected outputs
	 */
	private async validateResponses(
		session: Session,
		expectedOutputs: RecordedAction[],
		mode: ValidationMode,
		timeout: number
	): Promise<ValidationResult> {
		const result: ValidationResult = {
			passed: true,
			matched: 0,
			mismatched: 0,
			extra: 0,
			missing: 0,
			mismatches: []
		}

		// Wait for bot to respond
		const startTime = Date.now()
		await this.sleep(Math.min(timeout, 100)) // Brief wait for response

		// Get actions recorded since we dispatched
		const actualActions = session.getActionsSince(startTime).filter((a) => OUTPUT_ACTION_TYPES.includes(a.type))

		// Match expected with actual
		const matchedExpected = new Set<number>()
		const matchedActual = new Set<number>()

		for (let i = 0; i < expectedOutputs.length; i++) {
			const expected = expectedOutputs[i]
			let matched = false

			for (let j = 0; j < actualActions.length; j++) {
				if (matchedActual.has(j)) continue

				if (this.actionsMatch(expected, actualActions[j], mode)) {
					matchedExpected.add(i)
					matchedActual.add(j)
					result.matched++
					matched = true
					break
				}
			}

			if (!matched) {
				result.missing++
				result.mismatches.push({
					index: i,
					expected,
					actual: null,
					reason: `Expected ${expected.type} action not found`
				})
			}
		}

		// Count extra (unexpected) actions
		result.extra = actualActions.length - matchedActual.size

		result.passed = result.mismatched === 0 && result.missing === 0

		return result
	}

	/**
	 * Check if two actions match based on validation mode
	 */
	private actionsMatch(expected: RecordedAction, actual: RecordedAction, mode: ValidationMode): boolean {
		// Type must always match
		if (expected.type !== actual.type) {
			return false
		}

		if (mode === 'type-only') {
			return true
		}

		const expectedData = expected.data as Record<string, unknown>
		const actualData = actual.data as Record<string, unknown>

		if (mode === 'flexible') {
			// Check key identifiers match
			return this.flexibleMatch(expectedData, actualData, expected.type)
		}

		// Strict mode - deep equality
		return JSON.stringify(expectedData) === JSON.stringify(actualData)
	}

	/**
	 * Flexible matching - checks key identifiers
	 */
	private flexibleMatch(
		expected: Record<string, unknown>,
		actual: Record<string, unknown>,
		type: ActionType
	): boolean {
		switch (type) {
			case 'message_sent':
			case 'message_edited':
				// Match on channel and similar content
				if (expected.channelId !== actual.channelId) return false
				if (expected.content && actual.content) {
					const expContent = String(expected.content).toLowerCase()
					const actContent = String(actual.content).toLowerCase()
					// Content should be similar (allow for minor differences)
					if (!actContent.includes(expContent.slice(0, 20))) return false
				}
				return true

			case 'interaction_response':
			case 'interaction_followup':
			case 'interaction_edit':
				// Match on interaction ID and response type
				if (expected.interactionId !== actual.interactionId) return false
				if (expected.type !== actual.type) return false
				return true

			case 'message_deleted':
				// Match on message ID
				return expected.messageId === actual.messageId

			default:
				// For other types, just check type matches (already done)
				return true
		}
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}
}

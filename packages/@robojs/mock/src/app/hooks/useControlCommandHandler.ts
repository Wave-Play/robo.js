/**
 * Control Command Handler Hook (Phase 8)
 *
 * Listens for control_command events from the Stage WebSocket and
 * processes them using the playback and selection stores.
 *
 * Sends control_response back to the server with the result.
 */

import { useEffect, useCallback } from 'react'
import { usePlaybackControls, getPlaybackStateSnapshot } from '../stores/playbackStore'
import { useUnifiedSelection, getNavigationStateSnapshot } from '../stores/unifiedSelectionStore'
import type {
	StageControlCommand,
	StageControlResponseData,
	StagePlaybackControlPayload,
	StageNavigationControlPayload,
	StagePlaybackChangedData,
	StageNavigationChangedData,
	StageStateRequestResult
} from '../types/stage'

interface UseControlCommandHandlerOptions {
	/**
	 * Function to send commands back to the Stage WebSocket server
	 */
	sendCommand: <T = unknown>(type: string, data: unknown) => Promise<T>
	/**
	 * Whether the handler is enabled (typically when connected)
	 */
	enabled?: boolean
}

/**
 * Result of a playback control action including whether it was applied
 */
interface PlaybackControlResult {
	data: StagePlaybackChangedData
	applied: boolean
	warning?: string
}

/**
 * Result of a navigation control action including whether it was applied
 */
interface NavigationControlResult {
	data: StageNavigationChangedData
	applied: boolean
	warning?: string
}

/**
 * Detect if a playback control action actually changed the state
 */
function detectPlaybackStateChange(
	before: StagePlaybackChangedData,
	after: StagePlaybackChangedData,
	action: string
): boolean {
	switch (action) {
		case 'play':
		case 'pause':
			return before.isPlaying !== after.isPlaying
		case 'step_forward':
		case 'step_backward':
		case 'seek_to_event':
		case 'seek_to_time':
			return before.currentTime !== after.currentTime || before.eventIndex !== after.eventIndex
		case 'set_speed':
			return before.speed !== after.speed
		case 'set_mode':
			return before.mode !== after.mode
		default:
			return true
	}
}

/**
 * Get a human-readable reason why a playback action was a no-op
 */
function getPlaybackNoOpReason(state: StagePlaybackChangedData, action: string): string {
	switch (action) {
		case 'play':
			if (state.mode !== 'playback') return 'Cannot play: not in playback mode'
			if (state.totalEvents === 0) return 'Cannot play: no events recorded'
			if (state.isPlaying) return 'Already playing'
			return 'Play action had no effect'
		case 'pause':
			if (!state.isPlaying) return 'Already paused'
			return 'Pause action had no effect'
		case 'step_forward':
			if (state.totalEvents === 0) return 'Cannot step: no events recorded'
			if (state.eventIndex >= state.totalEvents - 1) return 'Already at end of recording'
			return 'Step forward had no effect'
		case 'step_backward':
			if (state.totalEvents === 0) return 'Cannot step: no events recorded'
			if (state.currentTime === 0) return 'Already at start of recording'
			return 'Step backward had no effect'
		case 'seek_to_event':
			return 'Seek to event had no effect (invalid index or same position)'
		case 'seek_to_time':
			return 'Seek to time had no effect'
		case 'set_speed':
			return 'Speed already at requested value'
		case 'set_mode':
			return 'Already in requested mode'
		default:
			return 'Action had no effect'
	}
}

/**
 * Detect if a navigation control action actually changed the state
 */
function detectNavigationStateChange(
	before: StageNavigationChangedData,
	after: StageNavigationChangedData,
	action: string
): boolean {
	switch (action) {
		case 'select_guild':
			return before.guildId !== after.guildId
		case 'select_channel':
		case 'open_dm':
		case 'open_thread':
			return before.channelId !== after.channelId
		default:
			return true
	}
}

/**
 * Get a human-readable reason why a navigation action was a no-op
 */
function getNavigationNoOpReason(state: StageNavigationChangedData, action: string): string {
	switch (action) {
		case 'select_guild':
			return 'Already viewing the requested guild'
		case 'select_channel':
			return 'Already viewing the requested channel'
		case 'open_dm':
			return 'Already viewing the requested DM'
		case 'open_thread':
			return 'Already viewing the requested thread'
		default:
			return 'Navigation had no effect'
	}
}

/**
 * Hook that handles incoming control commands from the server.
 * Processes playback and navigation control commands and sends responses.
 */
export function useControlCommandHandler({ sendCommand, enabled = true }: UseControlCommandHandlerOptions): void {
	const playbackControls = usePlaybackControls()
	const selection = useUnifiedSelection()

	// Handle playback control commands with state change detection
	const handlePlaybackControl = useCallback(
		(payload: StagePlaybackControlPayload): PlaybackControlResult => {
			// Capture state BEFORE action
			const stateBefore = getPlaybackStateSnapshot()

			switch (payload.action) {
				case 'play':
					playbackControls.play()
					break
				case 'pause':
					playbackControls.pause()
					break
				case 'step_forward':
					playbackControls.stepForward()
					break
				case 'step_backward':
					playbackControls.stepBackward()
					break
				case 'seek_to_event':
					if (typeof payload.eventIndex === 'number') {
						playbackControls.seekToEvent(payload.eventIndex)
					}
					break
				case 'seek_to_time':
					if (typeof payload.time === 'number') {
						playbackControls.seek(payload.time)
					}
					break
				case 'set_speed':
					if (typeof payload.speed === 'number') {
						playbackControls.setSpeed(payload.speed)
					}
					break
				case 'set_mode':
					if (payload.mode) {
						playbackControls.setMode(payload.mode)
					}
					break
			}

			// Capture state AFTER action
			const stateAfter = getPlaybackStateSnapshot()

			// Detect if action was a no-op
			const applied = detectPlaybackStateChange(stateBefore, stateAfter, payload.action)
			const warning = !applied ? getPlaybackNoOpReason(stateBefore, payload.action) : undefined

			return { data: stateAfter, applied, warning }
		},
		[playbackControls]
	)

	// Handle navigation control commands with state change detection
	const handleNavigationControl = useCallback(
		(payload: StageNavigationControlPayload): NavigationControlResult => {
			// Capture state BEFORE action
			const stateBefore = getNavigationStateSnapshot()

			switch (payload.action) {
				case 'select_guild':
					selection.navigateToGuild(payload.guildId ?? null)
					break
				case 'select_channel':
					if (payload.channelId) {
						selection.navigateToChannel(payload.channelId)
					}
					break
				case 'open_dm':
					if (payload.userId) {
						selection.navigateToDM(payload.userId)
					}
					break
				case 'open_thread':
					if (payload.threadId) {
						selection.navigateToThread(payload.threadId)
					}
					break
			}

			// Capture state AFTER action
			const stateAfter = getNavigationStateSnapshot()

			// Detect if action was a no-op
			const applied = detectNavigationStateChange(stateBefore, stateAfter, payload.action)
			const warning = !applied ? getNavigationNoOpReason(stateBefore, payload.action) : undefined

			return { data: stateAfter, applied, warning }
		},
		[selection]
	)

	// Main event handler
	const handleControlCommand = useCallback(
		async (event: CustomEvent<StageControlCommand>) => {
			const { commandId, kind, payload } = event.detail
			let success = false
			let result: StagePlaybackChangedData | StageNavigationChangedData | StageStateRequestResult | undefined
			let error: string | undefined

			try {
				switch (kind) {
					case 'playback_control': {
						const playbackResult = handlePlaybackControl(payload as StagePlaybackControlPayload)
						result = playbackResult.data
						success = playbackResult.applied
						if (!success && playbackResult.warning) {
							error = playbackResult.warning
						}
						break
					}
					case 'navigation_control': {
						const navResult = handleNavigationControl(payload as StageNavigationControlPayload)
						result = navResult.data
						success = navResult.applied
						if (!success && navResult.warning) {
							error = navResult.warning
						}
						break
					}
					case 'state_request':
						result = {
							playback: getPlaybackStateSnapshot(),
							navigation: getNavigationStateSnapshot()
						}
						success = true
						break
					default:
						error = `Unknown control command kind: ${kind}`
				}
			} catch (e) {
				error = e instanceof Error ? e.message : String(e)
			}

			// Send response back to server
			const response: StageControlResponseData = {
				commandId,
				success,
				result,
				error
			}

			try {
				await sendCommand('control_response', response)
			} catch (e) {
				console.error('[ControlCommandHandler] Failed to send response:', e)
			}
		},
		[handlePlaybackControl, handleNavigationControl, sendCommand]
	)

	// Listen for control_command events
	useEffect(() => {
		if (!enabled) {
			return
		}

		const handler = (event: Event) => {
			handleControlCommand(event as CustomEvent<StageControlCommand>)
		}

		window.addEventListener('stage:control_command', handler)

		return () => {
			window.removeEventListener('stage:control_command', handler)
		}
	}, [enabled, handleControlCommand])
}

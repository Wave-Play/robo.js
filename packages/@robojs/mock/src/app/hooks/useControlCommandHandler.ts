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
 * Hook that handles incoming control commands from the server.
 * Processes playback and navigation control commands and sends responses.
 */
export function useControlCommandHandler({ sendCommand, enabled = true }: UseControlCommandHandlerOptions): void {
	const playbackControls = usePlaybackControls()
	const selection = useUnifiedSelection()

	// Handle playback control commands
	const handlePlaybackControl = useCallback(
		(payload: StagePlaybackControlPayload): StagePlaybackChangedData => {
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

			// Return current state after the action
			return getPlaybackStateSnapshot()
		},
		[playbackControls]
	)

	// Handle navigation control commands
	const handleNavigationControl = useCallback(
		(payload: StageNavigationControlPayload): StageNavigationChangedData => {
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

			// Return current state after the action
			return getNavigationStateSnapshot()
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
					case 'playback_control':
						result = handlePlaybackControl(payload as StagePlaybackControlPayload)
						success = true
						break
					case 'navigation_control':
						result = handleNavigationControl(payload as StageNavigationControlPayload)
						success = true
						break
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

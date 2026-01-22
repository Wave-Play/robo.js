import {
	createContext,
	useContext,
	useReducer,
	useRef,
	useCallback,
	useEffect,
	useMemo,
	type ReactNode,
	type Dispatch
} from 'react'
import type {
	StageEventType,
	StageMessage,
	StageMessageCreateData,
	StageChannel,
	StageMember,
	StageGuild,
	StateSyncPayload,
	StagePlaybackChangedData
} from '../types/stage'

// ============================================================================
// Playback Types
// ============================================================================

/**
 * Default significant event types for step navigation
 */
const DEFAULT_SIGNIFICANT_TYPES: StageEventType[] = [
	'message_create',
	'interaction_create',
	'interaction_response',
	'typing_start'
]

/**
 * A recorded event for playback
 */
export interface RecordedEvent {
	id: string
	seq: number
	type: StageEventType
	timestamp: number
	data: unknown
}

/**
 * Playback state shape
 */
export interface PlaybackState {
	/** Current mode - live records events, playback replays them */
	mode: 'live' | 'playback'
	/** Whether playback is currently running */
	isPlaying: boolean
	/** Current playback position in ms from first event */
	currentTime: number
	/** Total duration of recording in ms */
	duration: number
	/** Playback speed multiplier */
	speed: number
	/** All recorded events */
	events: RecordedEvent[]
	/** Event types considered "significant" for step navigation */
	significantTypes: StageEventType[]
}

// ============================================================================
// Actions
// ============================================================================

/**
 * External playback state for SYNC_STATE action (from server broadcast)
 */
export interface ExternalPlaybackState {
	mode: 'live' | 'playback'
	isPlaying: boolean
	speed: number
	currentTime: number
	eventIndex: number
}

type PlaybackAction =
	| { type: 'SET_MODE'; payload: 'live' | 'playback' }
	| { type: 'SET_PLAYING'; payload: boolean }
	| { type: 'SEEK'; payload: number }
	| { type: 'SET_SPEED'; payload: number }
	| { type: 'ADD_EVENT'; payload: RecordedEvent }
	| { type: 'ADD_EVENTS'; payload: RecordedEvent[] }
	| { type: 'CLEAR_EVENTS' }
	| { type: 'UPDATE_TIME'; payload: number }
	| { type: 'STEP_FORWARD' }
	| { type: 'STEP_BACKWARD' }
	| { type: 'SEEK_TO_EVENT'; payload: number }
	| { type: 'SET_SIGNIFICANT_TYPES'; payload: StageEventType[] }
	| { type: 'SYNC_STATE'; payload: ExternalPlaybackState }

// ============================================================================
// Initial State
// ============================================================================

const initialState: PlaybackState = {
	mode: 'live',
	isPlaying: false,
	currentTime: 0,
	duration: 0,
	speed: 1,
	events: [],
	significantTypes: DEFAULT_SIGNIFICANT_TYPES
}

// ============================================================================
// Significant Event Helpers
// ============================================================================

/**
 * Get indices of events that are considered "significant" for step navigation
 */
function getSignificantEventIndices(state: PlaybackState): number[] {
	return state.events
		.map((e, i) => ({ event: e, index: i }))
		.filter(({ event }) => state.significantTypes.includes(event.type))
		.map(({ index }) => index)
}

/**
 * Get the time offset for an event relative to the first event
 */
function getEventTime(event: RecordedEvent, state: PlaybackState): number {
	if (state.events.length === 0) return 0
	return event.timestamp - state.events[0].timestamp
}

/**
 * Find the index of the next significant event after currentTime
 */
function findNextSignificantEventIndex(state: PlaybackState): number {
	const indices = getSignificantEventIndices(state)
	const startTime = state.events[0]?.timestamp ?? 0
	const currentTimestamp = startTime + state.currentTime

	for (const idx of indices) {
		if (state.events[idx].timestamp > currentTimestamp) {
			return idx
		}
	}
	return -1 // No next significant event
}

/**
 * Find the index of the previous significant event before currentTime
 */
function findPrevSignificantEventIndex(state: PlaybackState): number {
	const indices = getSignificantEventIndices(state)
	const startTime = state.events[0]?.timestamp ?? 0
	const currentTimestamp = startTime + state.currentTime

	for (let i = indices.length - 1; i >= 0; i--) {
		if (state.events[indices[i]].timestamp < currentTimestamp) {
			return indices[i]
		}
	}
	return -1 // No previous significant event
}

// ============================================================================
// Reducer
// ============================================================================

function playbackReducer(state: PlaybackState, action: PlaybackAction): PlaybackState {
	switch (action.type) {
		case 'SET_MODE': {
			const mode = action.payload
			if (mode === 'playback' && state.events.length > 0) {
				// When switching to playback, calculate duration and reset position
				const firstTimestamp = state.events[0].timestamp
				const lastTimestamp = state.events[state.events.length - 1].timestamp
				return {
					...state,
					mode,
					isPlaying: false,
					currentTime: 0,
					duration: lastTimestamp - firstTimestamp
				}
			}
			return { ...state, mode, isPlaying: false }
		}

		case 'SET_PLAYING':
			// Only allow playing in playback mode with events
			if (state.mode !== 'playback' || state.events.length === 0) {
				return state
			}
			return { ...state, isPlaying: action.payload }

		case 'SEEK': {
			const time = Math.max(0, Math.min(action.payload, state.duration))
			return { ...state, currentTime: time }
		}

		case 'SET_SPEED':
			return { ...state, speed: action.payload }

		case 'ADD_EVENT': {
			// Only record in live mode
			if (state.mode !== 'live') {
				return state
			}
			const newEvents = [...state.events, action.payload]
			const duration = newEvents.length > 1 ? newEvents[newEvents.length - 1].timestamp - newEvents[0].timestamp : 0
			return { ...state, events: newEvents, duration }
		}

		case 'ADD_EVENTS': {
			const newEvents = [...state.events, ...action.payload]
			const duration = newEvents.length > 1 ? newEvents[newEvents.length - 1].timestamp - newEvents[0].timestamp : 0
			return { ...state, events: newEvents, duration }
		}

		case 'CLEAR_EVENTS':
			return { ...state, events: [], duration: 0, currentTime: 0, isPlaying: false }

		case 'UPDATE_TIME': {
			const newTime = action.payload
			// Auto-pause at end
			if (newTime >= state.duration) {
				return { ...state, currentTime: state.duration, isPlaying: false }
			}
			return { ...state, currentTime: newTime }
		}

		case 'STEP_FORWARD': {
			// Find next significant event after current time
			const nextIndex = findNextSignificantEventIndex(state)
			if (nextIndex !== -1) {
				const targetTime = getEventTime(state.events[nextIndex], state)
				return { ...state, currentTime: targetTime }
			}
			// No next event - stay at current position
			return state
		}

		case 'STEP_BACKWARD': {
			// Find previous significant event before current time
			const prevIndex = findPrevSignificantEventIndex(state)
			if (prevIndex !== -1) {
				const targetTime = getEventTime(state.events[prevIndex], state)
				return { ...state, currentTime: targetTime }
			}
			// No previous event - go to start
			return { ...state, currentTime: 0 }
		}

		case 'SEEK_TO_EVENT': {
			const eventIndex = action.payload
			if (eventIndex >= 0 && eventIndex < state.events.length) {
				const targetTime = getEventTime(state.events[eventIndex], state)
				return { ...state, currentTime: targetTime }
			}
			return state
		}

		case 'SET_SIGNIFICANT_TYPES':
			return { ...state, significantTypes: action.payload }

		case 'SYNC_STATE': {
			// Sync external playback state from server broadcast
			// Preserve local-only state (events, significantTypes)
			const external = action.payload
			return {
				...state,
				mode: external.mode,
				isPlaying: external.isPlaying,
				speed: external.speed,
				currentTime: external.currentTime
				// Note: events and significantTypes are preserved from local state
			}
		}

		default:
			return state
	}
}

// ============================================================================
// Context
// ============================================================================

interface PlaybackContextValue {
	state: PlaybackState
	dispatch: Dispatch<PlaybackAction>
}

const PlaybackContext = createContext<PlaybackContextValue | null>(null)

// Module-level ref for accessing state outside React components
let _currentPlaybackState: PlaybackState = initialState

/**
 * Dispatch an action and update the module-level state synchronously.
 * This ensures getPlaybackStateSnapshot() returns the correct state immediately
 * after a control action, without waiting for React's async useEffect.
 */
function dispatchWithSync(dispatch: Dispatch<PlaybackAction>, action: PlaybackAction): void {
	// Update module-level state synchronously BEFORE React processes the dispatch
	_currentPlaybackState = playbackReducer(_currentPlaybackState, action)
	// Now dispatch to trigger React re-render
	dispatch(action)
}

// ============================================================================
// Provider
// ============================================================================

interface PlaybackProviderProps {
	children: ReactNode
}

export function PlaybackProvider({ children }: PlaybackProviderProps) {
	const [state, dispatch] = useReducer(playbackReducer, initialState)
	const lastFrameTimeRef = useRef<number | null>(null)
	const animationFrameRef = useRef<number | null>(null)
	const currentTimeRef = useRef(state.currentTime)
	const speedRef = useRef(state.speed)

	// Keep refs in sync with state (for use in animation loop without causing re-initialization)
	useEffect(() => {
		currentTimeRef.current = state.currentTime
	}, [state.currentTime])

	useEffect(() => {
		speedRef.current = state.speed
	}, [state.speed])

	// Keep module-level ref in sync for getPlaybackStateSnapshot
	useEffect(() => {
		_currentPlaybackState = state
	}, [state])

	// Playback animation loop - only depends on isPlaying to avoid re-initialization
	useEffect(() => {
		if (!state.isPlaying) {
			lastFrameTimeRef.current = null
			if (animationFrameRef.current) {
				cancelAnimationFrame(animationFrameRef.current)
				animationFrameRef.current = null
			}
			return
		}

		const tick = (frameTime: number) => {
			if (lastFrameTimeRef.current !== null) {
				const delta = (frameTime - lastFrameTimeRef.current) * speedRef.current
				const newTime = currentTimeRef.current + delta

				dispatch({ type: 'UPDATE_TIME', payload: newTime })
			}

			lastFrameTimeRef.current = frameTime
			animationFrameRef.current = requestAnimationFrame(tick)
		}

		animationFrameRef.current = requestAnimationFrame(tick)

		return () => {
			if (animationFrameRef.current) {
				cancelAnimationFrame(animationFrameRef.current)
			}
		}
	}, [state.isPlaying])

	return <PlaybackContext.Provider value={{ state, dispatch }}>{children}</PlaybackContext.Provider>
}

// ============================================================================
// Hooks
// ============================================================================

export function usePlaybackStore() {
	const context = useContext(PlaybackContext)
	if (!context) {
		throw new Error('usePlaybackStore must be used within a PlaybackProvider')
	}
	return context
}

export function usePlayback() {
	const { state } = usePlaybackStore()
	return state
}

export function usePlaybackDispatch() {
	const { dispatch } = usePlaybackStore()
	return dispatch
}

/**
 * Hook providing playback state and actions
 */
export function usePlaybackControls() {
	const { state, dispatch } = usePlaybackStore()

	// Use dispatchWithSync for control methods that need immediate state updates
	// for getPlaybackStateSnapshot() to return accurate state in control responses
	const setMode = useCallback(
		(mode: 'live' | 'playback') => {
			dispatchWithSync(dispatch, { type: 'SET_MODE', payload: mode })
		},
		[dispatch]
	)

	const togglePlay = useCallback(() => {
		dispatchWithSync(dispatch, { type: 'SET_PLAYING', payload: !state.isPlaying })
	}, [dispatch, state.isPlaying])

	const play = useCallback(() => {
		dispatchWithSync(dispatch, { type: 'SET_PLAYING', payload: true })
	}, [dispatch])

	const pause = useCallback(() => {
		dispatchWithSync(dispatch, { type: 'SET_PLAYING', payload: false })
	}, [dispatch])

	const seek = useCallback(
		(time: number) => {
			dispatchWithSync(dispatch, { type: 'SEEK', payload: time })
		},
		[dispatch]
	)

	const setSpeed = useCallback(
		(speed: number) => {
			dispatchWithSync(dispatch, { type: 'SET_SPEED', payload: speed })
		},
		[dispatch]
	)

	const addEvent = useCallback(
		(event: RecordedEvent) => {
			dispatch({ type: 'ADD_EVENT', payload: event })
		},
		[dispatch]
	)

	const addEvents = useCallback(
		(events: RecordedEvent[]) => {
			dispatch({ type: 'ADD_EVENTS', payload: events })
		},
		[dispatch]
	)

	const clearEvents = useCallback(() => {
		dispatch({ type: 'CLEAR_EVENTS' })
	}, [dispatch])

	const stepForward = useCallback(() => {
		dispatchWithSync(dispatch, { type: 'STEP_FORWARD' })
	}, [dispatch])

	const stepBackward = useCallback(() => {
		dispatchWithSync(dispatch, { type: 'STEP_BACKWARD' })
	}, [dispatch])

	const seekToEvent = useCallback(
		(eventIndex: number) => {
			dispatchWithSync(dispatch, { type: 'SEEK_TO_EVENT', payload: eventIndex })
		},
		[dispatch]
	)

	const setSignificantTypes = useCallback(
		(types: StageEventType[]) => {
			dispatch({ type: 'SET_SIGNIFICANT_TYPES', payload: types })
		},
		[dispatch]
	)

	// Get events that have occurred up to currentTime
	const getEventsAtCurrentTime = useCallback(() => {
		if (state.events.length === 0) return []
		const startTimestamp = state.events[0].timestamp
		const currentTimestamp = startTimestamp + state.currentTime
		return state.events.filter((e) => e.timestamp <= currentTimestamp)
	}, [state.events, state.currentTime])

	// Get significant event markers for timeline
	const getEventMarkers = useCallback(() => {
		if (state.events.length === 0) return []
		const startTimestamp = state.events[0].timestamp
		const significantTypes: StageEventType[] = [
			'message_create',
			'interaction_create',
			'interaction_response',
			'typing_start'
		]

		return state.events
			.filter((e) => significantTypes.includes(e.type))
			.map((e) => ({
				time: e.timestamp - startTimestamp,
				type: e.type,
				label: getEventLabel(e)
			}))
	}, [state.events])

	// Get the current event index based on currentTime
	const getCurrentEventIndex = useCallback(() => {
		if (state.events.length === 0) return -1
		const startTime = state.events[0].timestamp
		const currentTimestamp = startTime + state.currentTime
		const idx = state.events.findIndex((e) => e.timestamp >= currentTimestamp)
		return idx === -1 ? state.events.length : idx
	}, [state.events, state.currentTime])

	return {
		// State
		mode: state.mode,
		isPlaying: state.isPlaying,
		currentTime: state.currentTime,
		duration: state.duration,
		speed: state.speed,
		events: state.events,
		eventCount: state.events.length,
		significantTypes: state.significantTypes,

		// Actions
		setMode,
		togglePlay,
		play,
		pause,
		seek,
		setSpeed,
		addEvent,
		addEvents,
		clearEvents,
		stepForward,
		stepBackward,
		seekToEvent,
		setSignificantTypes,

		// Derived
		getEventsAtCurrentTime,
		getEventMarkers,
		getCurrentEventIndex
	}
}

// ============================================================================
// Helpers
// ============================================================================

function getEventLabel(event: RecordedEvent): string {
	switch (event.type) {
		case 'message_create': {
			const data = event.data as { message?: { content?: string; author?: { username?: string } } }
			const author = data?.message?.author?.username || 'User'
			const content = data?.message?.content || ''
			const preview = content.slice(0, 25) + (content.length > 25 ? '...' : '')
			return `${author}: ${preview}`
		}
		case 'interaction_create': {
			const data = event.data as { interaction?: { name?: string } }
			return `/${data?.interaction?.name || 'command'}`
		}
		case 'interaction_response':
			return 'Bot Response'
		case 'typing_start': {
			const data = event.data as { user?: { username?: string } }
			return `${data?.user?.username || 'User'} typing...`
		}
		default:
			return event.type
	}
}

/**
 * Format milliseconds as MM:SS
 */
export function formatTime(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000)
	const minutes = Math.floor(totalSeconds / 60)
	const seconds = totalSeconds % 60
	return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/**
 * Hook that provides messages filtered by playback time and channel.
 * When in live mode, returns null (use normal session messages).
 * When in playback mode, reconstructs the message state based on recorded events up to currentTime.
 *
 * Messages are filtered by channel_id so each channel shows only its own messages.
 */
export function usePlaybackMessages(channelId: string | null): StageMessage[] | null {
	const { state } = usePlaybackStore()

	return useMemo(() => {
		// Debug logging
		console.log(
			'[usePlaybackMessages] mode:',
			state.mode,
			'events:',
			state.events.length,
			'currentTime:',
			state.currentTime,
			'duration:',
			state.duration,
			'channelId:',
			channelId
		)

		// In live mode, return null to signal "use normal session messages"
		if (state.mode === 'live' || state.events.length === 0) {
			console.log('[usePlaybackMessages] Returning null - live mode or no events')
			return null
		}

		// Get the timestamp cutoff for current playback position
		const startTimestamp = state.events[0].timestamp
		const currentTimestamp = startTimestamp + state.currentTime

		// Filter events up to current time
		const eventsAtTime = state.events.filter((e) => e.timestamp <= currentTimestamp)
		console.log('[usePlaybackMessages] eventsAtTime:', eventsAtTime.length, 'of', state.events.length)

		// Build message state from events
		const messages: Map<string, StageMessage> = new Map()

		for (const event of eventsAtTime) {
			switch (event.type) {
				case 'message_create': {
					const data = event.data as StageMessageCreateData
					console.log('[usePlaybackMessages] message_create event, has message:', !!data?.message)
					if (data?.message) {
						// Only add messages that belong to the selected channel
						// (or all messages if no channel is selected)
						if (!channelId || data.message.channel_id === channelId) {
							messages.set(data.message.id, data.message)
							console.log(
								'[usePlaybackMessages] Added message:',
								data.message.id,
								data.message.content?.substring(0, 30)
							)
						}
					}
					break
				}
				case 'message_update': {
					const data = event.data as { message: StageMessage }
					if (data?.message && messages.has(data.message.id)) {
						messages.set(data.message.id, data.message)
					}
					break
				}
				case 'message_delete': {
					const data = event.data as { message_id: string }
					if (data?.message_id) {
						messages.delete(data.message_id)
					}
					break
				}
				case 'message_reaction_add': {
					const data = event.data as {
						channel_id: string
						message_id: string
						emoji: { id: string | null; name: string }
					}
					const msg = messages.get(data?.message_id)
					if (msg && data?.emoji) {
						const reactions = [...(msg.reactions || [])]
						const emojiKey = data.emoji.id || data.emoji.name
						const existingIdx = reactions.findIndex((r) => (r.emoji.id || r.emoji.name) === emojiKey)
						if (existingIdx >= 0) {
							reactions[existingIdx] = { ...reactions[existingIdx], count: reactions[existingIdx].count + 1 }
						} else {
							reactions.push({ count: 1, me: true, emoji: data.emoji })
						}
						messages.set(msg.id, { ...msg, reactions })
					}
					break
				}
				case 'message_reaction_remove': {
					const data = event.data as {
						channel_id: string
						message_id: string
						emoji: { id: string | null; name: string }
					}
					const msg = messages.get(data?.message_id)
					if (msg && data?.emoji) {
						const reactions = [...(msg.reactions || [])]
						const emojiKey = data.emoji.id || data.emoji.name
						const updated = reactions
							.map((r) => {
								if ((r.emoji.id || r.emoji.name) !== emojiKey) return r
								return r.count > 1 ? { ...r, count: r.count - 1 } : null
							})
							.filter(Boolean) as typeof reactions
						messages.set(msg.id, { ...msg, reactions: updated })
					}
					break
				}
				// Handle dispatch events (gateway events from recordings)
				case 'dispatch': {
					const data = event.data as { event?: string; payload?: StageMessage }
					console.log('[usePlaybackMessages] dispatch event:', data?.event, 'has payload:', !!data?.payload)
					if (data?.event === 'MESSAGE_CREATE' && data?.payload) {
						const message = data.payload
						console.log(
							'[usePlaybackMessages] dispatch MESSAGE_CREATE, channel match:',
							!channelId || message.channel_id === channelId,
							'msg channel:',
							message.channel_id,
							'filter channel:',
							channelId
						)
						if (!channelId || message.channel_id === channelId) {
							messages.set(message.id, message)
							console.log(
								'[usePlaybackMessages] Added dispatch message:',
								message.id,
								message.content?.substring(0, 30)
							)
						}
					} else if (data?.event === 'MESSAGE_UPDATE' && data?.payload) {
						const message = data.payload
						if (messages.has(message.id)) {
							messages.set(message.id, message)
						}
					} else if (data?.event === 'MESSAGE_DELETE' && data?.payload) {
						const payload = data.payload as unknown as { id: string }
						if (payload?.id) {
							messages.delete(payload.id)
						}
					}
					break
				}
			}
		}

		// Return sorted by message ID (which is a snowflake, so chronological)
		const result = Array.from(messages.values()).sort((a, b) => {
			// Snowflakes can be compared as strings for chronological order
			return a.id.localeCompare(b.id)
		})
		console.log('[usePlaybackMessages] Returning', result.length, 'messages')
		return result
	}, [state.mode, state.events, state.currentTime, channelId])
}

/**
 * Hook that returns whether playback mode is active
 */
export function useIsPlaybackMode(): boolean {
	const { state } = usePlaybackStore()
	return state.mode === 'playback'
}

/**
 * Typing user structure matching TypingIndicator component
 */
interface PlaybackTypingUser {
	userId: string
	username: string
	expiresAt: number
}

/**
 * Hook that provides typing users based on playback time.
 * When in live mode, returns null (use normal session typing users).
 * When in playback mode, reconstructs typing state from recorded events.
 *
 * Typing indicators last for 10 seconds from their event timestamp.
 */
export function usePlaybackTypingUsers(channelId: string | null): PlaybackTypingUser[] | null {
	const { state } = usePlaybackStore()

	return useMemo(() => {
		// In live mode, return null to signal "use normal session typing users"
		if (state.mode === 'live' || state.events.length === 0 || !channelId) {
			return null
		}

		// Get the timestamp cutoff for current playback position
		const startTimestamp = state.events[0].timestamp
		const currentTimestamp = startTimestamp + state.currentTime

		// Typing indicator duration (10 seconds)
		const TYPING_DURATION = 10000

		// Current real-world time (for converting expiresAt)
		const now = Date.now()

		// Find typing_start events within the last 10 seconds of playback time
		const typingUsers: Map<string, PlaybackTypingUser> = new Map()

		for (const event of state.events) {
			if (event.type !== 'typing_start') continue
			if (event.timestamp > currentTimestamp) continue // Event hasn't happened yet

			const data = event.data as {
				user?: { id: string; username: string }
				user_id?: string
				channel_id?: string
			}

			// Check if this typing event is still "active" (within 10 seconds)
			const timeSinceEvent = currentTimestamp - event.timestamp
			if (timeSinceEvent > TYPING_DURATION) continue // Expired

			// In playback mode, show typing from any channel (test data uses fake channel IDs)
			const user = data?.user
			const userId = user?.id || data?.user_id
			const username = user?.username || 'User'

			if (userId) {
				// Calculate remaining time in playback and convert to real-world expiresAt
				const remainingTime = TYPING_DURATION - timeSinceEvent
				typingUsers.set(userId, {
					userId,
					username,
					expiresAt: now + remainingTime
				})
			}
		}

		return Array.from(typingUsers.values())
	}, [state.mode, state.events, state.currentTime, channelId])
}

/**
 * Hook that provides channels based on playback time.
 * When in live mode, returns null (use normal session channels).
 * When in playback mode, reconstructs channel state from state_sync event.
 *
 * Note: Currently only extracts from state_sync since channel_create/delete events
 * are not part of the current protocol. Channels appear at the time of state_sync.
 */
export function usePlaybackChannels(guildId: string | null): StageChannel[] | null {
	const { state } = usePlaybackStore()

	return useMemo(() => {
		// In live mode, return null to signal "use normal session channels"
		if (state.mode === 'live' || state.events.length === 0) {
			return null
		}

		// Get the timestamp cutoff for current playback position
		const startTimestamp = state.events[0].timestamp
		const currentTimestamp = startTimestamp + state.currentTime

		// Find the most recent state_sync event up to current time
		let channels: StageChannel[] = []

		for (const event of state.events) {
			if (event.timestamp > currentTimestamp) break

			if (event.type === 'state_sync') {
				const data = event.data as StateSyncPayload
				if (data?.channels) {
					channels = data.channels
				}
			}
		}

		// Filter by guild if specified
		if (guildId) {
			return channels.filter((c) => c.guild_id === guildId)
		}

		return channels
	}, [state.mode, state.events, state.currentTime, guildId])
}

/**
 * Hook that provides members based on playback time.
 * When in live mode, returns null (use normal session members).
 * When in playback mode, reconstructs member state from state_sync event.
 *
 * Note: Currently only extracts from state_sync since member_add/remove events
 * are not part of the current protocol. Members appear at the time of state_sync.
 */
export function usePlaybackMembers(guildId: string | null): StageMember[] | null {
	const { state } = usePlaybackStore()

	return useMemo(() => {
		// In live mode, return null to signal "use normal session members"
		if (state.mode === 'live' || state.events.length === 0) {
			return null
		}

		// Get the timestamp cutoff for current playback position
		const startTimestamp = state.events[0].timestamp
		const currentTimestamp = startTimestamp + state.currentTime

		// Find the most recent state_sync event up to current time
		let members: StageMember[] = []

		for (const event of state.events) {
			if (event.timestamp > currentTimestamp) break

			if (event.type === 'state_sync') {
				const data = event.data as StateSyncPayload
				if (data?.members) {
					members = data.members
				}
			}
		}

		// Filter by guild if specified
		if (guildId) {
			return members.filter((m) => m.guild_id === guildId)
		}

		return members
	}, [state.mode, state.events, state.currentTime, guildId])
}

/**
 * Hook that provides guilds based on playback time.
 * When in live mode, returns null (use normal session guilds).
 * When in playback mode, extracts guilds from state_sync event.
 */
export function usePlaybackGuilds(): StageGuild[] | null {
	const { state } = usePlaybackStore()

	return useMemo(() => {
		// In live mode, return null to signal "use normal session guilds"
		if (state.mode === 'live' || state.events.length === 0) {
			return null
		}

		// Get the timestamp cutoff for current playback position
		const startTimestamp = state.events[0].timestamp
		const currentTimestamp = startTimestamp + state.currentTime

		// Find the most recent state_sync event up to current time
		let guilds: StageGuild[] = []

		for (const event of state.events) {
			if (event.timestamp > currentTimestamp) break

			if (event.type === 'state_sync') {
				const data = event.data as StateSyncPayload
				if (data?.guilds) {
					guilds = data.guilds
				}
			}
		}

		return guilds
	}, [state.mode, state.events, state.currentTime])
}

// ============================================================================
// State Snapshot for Control Commands
// ============================================================================

/**
 * Get a snapshot of the current playback state for control command responses.
 * This can be called outside of React components.
 */
export function getPlaybackStateSnapshot(): StagePlaybackChangedData {
	const state = _currentPlaybackState
	const significantIndices = getSignificantEventIndices(state)

	// Calculate current event index
	let currentEventIndex = -1
	if (state.events.length > 0) {
		const startTime = state.events[0].timestamp
		const currentTimestamp = startTime + state.currentTime
		const idx = state.events.findIndex((e) => e.timestamp >= currentTimestamp)
		currentEventIndex = idx === -1 ? state.events.length : idx
	}

	// Find the current significant event index
	let significantEventIndex = -1
	for (let i = 0; i < significantIndices.length; i++) {
		if (significantIndices[i] >= currentEventIndex) {
			significantEventIndex = i
			break
		}
	}
	if (significantEventIndex === -1 && significantIndices.length > 0) {
		significantEventIndex = significantIndices.length
	}

	return {
		mode: state.mode,
		isPlaying: state.isPlaying,
		currentTime: state.currentTime,
		duration: state.duration,
		speed: state.speed,
		eventIndex: currentEventIndex,
		totalEvents: state.events.length,
		significantEventIndex,
		totalSignificantEvents: significantIndices.length,
		timestamp: Date.now()
	}
}

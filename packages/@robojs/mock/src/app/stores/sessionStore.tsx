import { createContext, useContext, useReducer, useRef, useEffect, useCallback, useState, type ReactNode, type Dispatch } from 'react'
import type {
	StageGuild,
	StageChannel,
	StageUser,
	StageMember,
	StageRole,
	StageVoiceState,
	StageMessage,
	StageApplicationCommand,
	StateSyncPayload,
	StageMessageCreateData,
	StageEvent,
	StageCommand,
	StageInteractionResponseData
} from '../types/stage'
import type { ModalData } from '../components/modals/Modal'
import { usePlaybackDispatch, type RecordedEvent } from './playbackStore'
import { buildStageWebSocketUrls } from '../utils'

// Pending interaction for "Bot is thinking..." indicator
export interface PendingInteraction {
	id: string
	channelId: string
	botName: string
	botAvatar?: string | null
	botId?: string
	createdAt: number
}

// Pending message for "sending" / "failed" states (Phase 5O)
export interface PendingMessage {
	id: string
	content: string
	channelId: string
	state: 'sending' | 'failed'
	error?: string
	author: {
		id: string
		username: string
		avatar: string | null
	}
	createdAt: number
}

// Filtered event for intent diagnostics
export interface FilteredEvent {
	eventName: string
	requiredIntent: string | null
	timestamp: number
}

// Loop warning for event loop detection
export interface LoopWarning {
	eventType: string
	count: number
	windowMs: number
	cooldownMs: number
	lastAuthorUsername: string | null
	lastContent: string | null
	timestamp: number
}

// Session state shape
export interface SessionState {
	// Connection
	sessionId: string | null
	isConnected: boolean
	isConnecting: boolean
	error: string | null

	// Data from state_sync
	guilds: StageGuild[]
	channels: StageChannel[]
	members: StageMember[]
	roles: StageRole[] // Phase 5H: Guild roles
	voiceStates: StageVoiceState[] // Phase 5P: Voice channel states
	users: StageUser[]
	messages: Record<string, StageMessage[]>
	commands: StageApplicationCommand[] // Phase 5G: Available slash commands
	botUser: StageUser | null
	currentUser: StageUser | null

	// UI state
	selectedGuildId: string | null
	selectedChannelId: string | null
	showMembers: boolean

	// Typing indicators (Phase 5H)
	typingUsers: Record<string, { userId: string; username: string; expiresAt: number }[]>

	// Modal state (Phase 5M)
	activeModal: { modal: ModalData; sourceInteractionId: string } | null

	// Pending interactions for "Bot is thinking..." (Phase 5O)
	pendingInteractions: PendingInteraction[]

	// Pending messages being sent (Phase 5O)
	pendingMessages: PendingMessage[]

	// Reply state (Phase 5N enhancement)
	replyingTo: StageMessage | null

	// Intent diagnostics - events filtered due to missing intents
	filteredEvents: FilteredEvent[]

	// Loop detection warning
	loopWarning: LoopWarning | null

	// Stats
	eventCount: number
	lastHeartbeat: number | null
}

// Action types
type SessionAction =
	| { type: 'SET_SESSION_ID'; payload: string }
	| { type: 'SET_CONNECTING'; payload: boolean }
	| { type: 'SET_CONNECTED'; payload: boolean }
	| { type: 'SET_ERROR'; payload: string | null }
	| { type: 'HANDLE_STATE_SYNC'; payload: StateSyncPayload }
	| { type: 'HANDLE_MESSAGE_CREATE'; payload: StageMessageCreateData }
	| { type: 'HANDLE_MESSAGE_UPDATE'; payload: { channelId: string; message: StageMessage } }
	| { type: 'HANDLE_MESSAGE_DELETE'; payload: { channelId: string; messageId: string } }
	| { type: 'HANDLE_REACTION_ADD'; payload: { channel_id: string; message_id: string; user_id: string; emoji: { id: string | null; name: string } } }
	| { type: 'HANDLE_REACTION_REMOVE'; payload: { channel_id: string; message_id: string; user_id: string; emoji: { id: string | null; name: string } } }
	| { type: 'HANDLE_TYPING_START'; payload: { channelId: string; userId: string; username: string } }
	| { type: 'SELECT_GUILD'; payload: string | null }
	| { type: 'SELECT_CHANNEL'; payload: string | null }
	| { type: 'TOGGLE_MEMBERS' }
	| { type: 'SET_CURRENT_USER'; payload: StageUser }
	| { type: 'INCREMENT_EVENT_COUNT' }
	| { type: 'SET_HEARTBEAT'; payload: number }
	| { type: 'RESET' }
	| { type: 'INJECT_MESSAGES'; payload: { channelId: string; messages: StageMessage[] } }
	| { type: 'INJECT_MEMBERS'; payload: StageMember[] }
	| { type: 'INJECT_CHANNELS'; payload: StageChannel[] }
	| { type: 'SHOW_MODAL'; payload: { modal: ModalData; sourceInteractionId: string } }
	| { type: 'CLOSE_MODAL' }
	| { type: 'ADD_PENDING_INTERACTION'; payload: PendingInteraction }
	| { type: 'REMOVE_PENDING_INTERACTION'; payload: { id?: string; channelId?: string; botId?: string } }
	| { type: 'ADD_PENDING_MESSAGE'; payload: PendingMessage }
	| { type: 'MARK_MESSAGE_FAILED'; payload: { id: string; error?: string } }
	| { type: 'REMOVE_PENDING_MESSAGE'; payload: string }
	| { type: 'ADD_DM_CHANNEL'; payload: StageChannel }
	| { type: 'SET_REPLYING_TO'; payload: StageMessage }
	| { type: 'CLEAR_REPLYING_TO' }
	| { type: 'HANDLE_VOICE_STATE_UPDATE'; payload: StageVoiceState }
	| { type: 'ADD_FILTERED_EVENT'; payload: FilteredEvent }
	| { type: 'CLEAR_FILTERED_EVENTS' }
	| { type: 'SET_LOOP_WARNING'; payload: LoopWarning }
	| { type: 'CLEAR_LOOP_WARNING' }

// Initial state
const initialState: SessionState = {
	sessionId: null,
	isConnected: false,
	isConnecting: false,
	error: null,
	guilds: [],
	channels: [],
	members: [],
	roles: [],
	voiceStates: [],
	users: [],
	messages: {},
	commands: [],
	botUser: null,
	currentUser: null,
	selectedGuildId: null,
	selectedChannelId: null,
	showMembers: true,
	typingUsers: {},
	activeModal: null,
	pendingInteractions: [],
	pendingMessages: [],
	replyingTo: null,
	filteredEvents: [],
	loopWarning: null,
	eventCount: 0,
	lastHeartbeat: null
}

// Reducer
function sessionReducer(state: SessionState, action: SessionAction): SessionState {
	switch (action.type) {
		case 'SET_SESSION_ID':
			return { ...state, sessionId: action.payload }

		case 'SET_CONNECTING':
			return { ...state, isConnecting: action.payload, error: null }

		case 'SET_CONNECTED':
			return { ...state, isConnected: action.payload, isConnecting: false }

		case 'SET_ERROR':
			return { ...state, error: action.payload, isConnecting: false, isConnected: false }

		case 'HANDLE_STATE_SYNC': {
			const { session, guilds, channels, members, roles, messages, users, commands, voice_states, currentUser } =
				action.payload
			const firstGuild = guilds[0]
			// Find first text channel (type 0) or announcement channel (type 5), not categories (type 4) or voice (type 2)
			const firstChannel = firstGuild
				? channels.find((c) => c.guild_id === firstGuild.id && (c.type === 0 || c.type === 5))
				: null
			const filteredMessages = Object.fromEntries(
				Object.entries(messages).map(([channelId, channelMessages]) => [
					channelId,
					channelMessages.filter((message) => ((message.flags ?? 0) & 64) === 0)
				])
			)

			return {
				...state,
				guilds,
				channels,
				members,
				roles: roles || [],
				voiceStates: voice_states || [],
				users,
				messages: filteredMessages,
				commands: commands || [],
				botUser: session.bot,
				currentUser: currentUser ?? null,
				selectedGuildId: state.selectedGuildId || firstGuild?.id || null,
				selectedChannelId: state.selectedChannelId || firstChannel?.id || null,
				eventCount: state.eventCount + 1
			}
		}

		case 'HANDLE_MESSAGE_CREATE': {
			const { message } = action.payload
			const channelId = message.channel_id
			const existingMessages = state.messages[channelId] || []

			return {
				...state,
				messages: {
					...state.messages,
					[channelId]: [...existingMessages, message].slice(-100) // Keep last 100 messages
				},
				eventCount: state.eventCount + 1
			}
		}

		case 'HANDLE_MESSAGE_UPDATE': {
			const { channelId, message } = action.payload
			const existingMessages = state.messages[channelId] || []

			return {
				...state,
				messages: {
					...state.messages,
					[channelId]: existingMessages.map((m) => (m.id === message.id ? message : m))
				},
				eventCount: state.eventCount + 1
			}
		}

		case 'HANDLE_MESSAGE_DELETE': {
			const { channelId, messageId } = action.payload
			const existingMessages = state.messages[channelId] || []

			return {
				...state,
				messages: {
					...state.messages,
					[channelId]: existingMessages.filter((m) => m.id !== messageId)
				},
				eventCount: state.eventCount + 1
			}
		}

		case 'HANDLE_REACTION_ADD': {
			const { channel_id, message_id, emoji } = action.payload
			const existingMessages = state.messages[channel_id] || []
			const emojiKey = emoji.id || emoji.name

			return {
				...state,
				messages: {
					...state.messages,
					[channel_id]: existingMessages.map((m) => {
						if (m.id !== message_id) return m

						const reactions = m.reactions || []
						const existingReaction = reactions.find(
							(r) => (r.emoji.id || r.emoji.name) === emojiKey
						)

						if (existingReaction) {
							// Increment count on existing reaction
							return {
								...m,
								reactions: reactions.map((r) =>
									(r.emoji.id || r.emoji.name) === emojiKey
										? { ...r, count: r.count + 1, me: true }
										: r
								)
							}
						} else {
							// Add new reaction
							return {
								...m,
								reactions: [
									...reactions,
									{ count: 1, me: true, emoji: { id: emoji.id, name: emoji.name } }
								]
							}
						}
					})
				},
				eventCount: state.eventCount + 1
			}
		}

		case 'HANDLE_REACTION_REMOVE': {
			const { channel_id, message_id, emoji } = action.payload
			const existingMessages = state.messages[channel_id] || []
			const emojiKey = emoji.id || emoji.name

			return {
				...state,
				messages: {
					...state.messages,
					[channel_id]: existingMessages.map((m) => {
						if (m.id !== message_id) return m

						const reactions = m.reactions || []
						const updatedReactions = reactions
							.map((r) => {
								if ((r.emoji.id || r.emoji.name) !== emojiKey) return r
								const newCount = r.count - 1
								if (newCount <= 0) return null // Remove reaction entirely
								return { ...r, count: newCount, me: false }
							})
							.filter((r): r is NonNullable<typeof r> => r !== null)

						return { ...m, reactions: updatedReactions }
					})
				},
				eventCount: state.eventCount + 1
			}
		}

		case 'HANDLE_TYPING_START': {
			const { channelId, userId, username } = action.payload
			const existingTyping = state.typingUsers[channelId] || []
			const expiresAt = Date.now() + 10000 // 10 second timeout

			// Update or add typing user
			const filtered = existingTyping.filter((t) => t.userId !== userId)
			const newTyping = [...filtered, { userId, username, expiresAt }]

			return {
				...state,
				typingUsers: {
					...state.typingUsers,
					[channelId]: newTyping
				},
				eventCount: state.eventCount + 1
			}
		}

		case 'HANDLE_VOICE_STATE_UPDATE': {
			const voiceState = action.payload
			let nextUsers = state.users
			let nextMembers = state.members

			if (voiceState.member) {
				const memberUser = voiceState.member.user
				if (!state.users.some((u) => u.id === memberUser.id)) {
					nextUsers = [...state.users, memberUser]
				}
				if (!state.members.some((m) => m.user.id === memberUser.id && m.guild_id === voiceState.member?.guild_id)) {
					nextMembers = [...state.members, voiceState.member]
				}
			}

			// If channel_id is null, user left voice - remove from list
			if (!voiceState.channel_id) {
				return {
					...state,
					users: nextUsers,
					members: nextMembers,
					voiceStates: state.voiceStates.filter(
						(vs) => !(vs.guild_id === voiceState.guild_id && vs.user_id === voiceState.user_id)
					),
					eventCount: state.eventCount + 1
				}
			}
			// Otherwise, update or add the voice state
			const existingIndex = state.voiceStates.findIndex(
				(vs) => vs.guild_id === voiceState.guild_id && vs.user_id === voiceState.user_id
			)
			if (existingIndex >= 0) {
				// Update existing
				const newVoiceStates = [...state.voiceStates]
				newVoiceStates[existingIndex] = voiceState
				return {
					...state,
					users: nextUsers,
					members: nextMembers,
					voiceStates: newVoiceStates,
					eventCount: state.eventCount + 1
				}
			}
			// Add new
			return {
				...state,
				users: nextUsers,
				members: nextMembers,
				voiceStates: [...state.voiceStates, voiceState],
				eventCount: state.eventCount + 1
			}
		}

		case 'SELECT_GUILD': {
			const guildId = action.payload
			// When selecting a guild, auto-select first text or announcement channel
			const firstChannel = guildId
				? state.channels.find((c) => c.guild_id === guildId && (c.type === 0 || c.type === 5))
				: null

			return {
				...state,
				selectedGuildId: guildId,
				selectedChannelId: firstChannel?.id || null
			}
		}

		case 'SELECT_CHANNEL':
			return { ...state, selectedChannelId: action.payload }

		case 'TOGGLE_MEMBERS':
			return { ...state, showMembers: !state.showMembers }

		case 'SET_CURRENT_USER': {
			const updatedUser = action.payload
			const users = state.users.some((user) => user.id === updatedUser.id)
				? state.users.map((user) => (user.id === updatedUser.id ? updatedUser : user))
				: [...state.users, updatedUser]
			const members = state.members.map((member) =>
				member.user.id === updatedUser.id ? { ...member, user: updatedUser } : member
			)

			return {
				...state,
				currentUser: updatedUser,
				users,
				members
			}
		}

		case 'INCREMENT_EVENT_COUNT':
			return { ...state, eventCount: state.eventCount + 1 }

		case 'SET_HEARTBEAT':
			return { ...state, lastHeartbeat: action.payload }

		case 'RESET':
			return { ...initialState, sessionId: state.sessionId }

		case 'INJECT_MESSAGES': {
			const { channelId, messages } = action.payload
			const existingMessages = state.messages[channelId] || []
			return {
				...state,
				messages: {
					...state.messages,
					[channelId]: [...existingMessages, ...messages].slice(-100)
				}
			}
		}

		case 'INJECT_MEMBERS': {
			// Merge with existing members, avoiding duplicates by user_id
			const existingIds = new Set(state.members.map((m) => m.user.id))
			const newMembers = action.payload.filter((m) => !existingIds.has(m.user.id))
			return {
				...state,
				members: [...state.members, ...newMembers]
			}
		}

		case 'INJECT_CHANNELS': {
			// Merge with existing channels, avoiding duplicates by id
			const existingIds = new Set(state.channels.map((c) => c.id))
			const newChannels = action.payload.filter((c) => !existingIds.has(c.id))
			return {
				...state,
				channels: [...state.channels, ...newChannels]
			}
		}

		case 'SHOW_MODAL':
			return { ...state, activeModal: action.payload }

		case 'CLOSE_MODAL':
			return { ...state, activeModal: null }

		case 'ADD_PENDING_INTERACTION':
			return {
				...state,
				pendingInteractions: [...state.pendingInteractions, action.payload]
			}

		case 'REMOVE_PENDING_INTERACTION': {
			const { id, channelId, botId } = action.payload
			return {
				...state,
				pendingInteractions: state.pendingInteractions.filter((p) => {
					// Remove by ID if provided
					if (id && p.id === id) return false
					// Remove by channelId + botId combination
					if (channelId && botId && p.channelId === channelId && p.botId === botId) return false
					return true
				})
			}
		}

		case 'ADD_PENDING_MESSAGE':
			return {
				...state,
				pendingMessages: [...state.pendingMessages, action.payload]
			}

		case 'MARK_MESSAGE_FAILED': {
			const { id, error } = action.payload
			return {
				...state,
				pendingMessages: state.pendingMessages.map((m) =>
					m.id === id ? { ...m, state: 'failed' as const, error } : m
				)
			}
		}

		case 'REMOVE_PENDING_MESSAGE':
			return {
				...state,
				pendingMessages: state.pendingMessages.filter((m) => m.id !== action.payload)
			}

		case 'ADD_DM_CHANNEL':
			return {
				...state,
				channels: [...state.channels, action.payload]
			}

		case 'SET_REPLYING_TO':
			return {
				...state,
				replyingTo: action.payload
			}

		case 'CLEAR_REPLYING_TO':
			return {
				...state,
				replyingTo: null
			}

		case 'ADD_FILTERED_EVENT': {
			// Only add if we don't already have this event type
			const exists = state.filteredEvents.some((f) => f.eventName === action.payload.eventName)
			if (exists) {
				return state
			}
			return {
				...state,
				filteredEvents: [...state.filteredEvents, action.payload]
			}
		}

		case 'CLEAR_FILTERED_EVENTS':
			return {
				...state,
				filteredEvents: []
			}

		case 'SET_LOOP_WARNING':
			return {
				...state,
				loopWarning: action.payload
			}

		case 'CLEAR_LOOP_WARNING':
			return {
				...state,
				loopWarning: null
			}

		default:
			return state
	}
}

// Context
const SessionContext = createContext<{
	state: SessionState
	dispatch: Dispatch<SessionAction>
} | null>(null)

// Provider
interface SessionProviderProps {
	children: ReactNode
	initialSessionId?: string | null
}

export function SessionProvider({ children, initialSessionId = null }: SessionProviderProps) {
	const [state, dispatch] = useReducer(sessionReducer, {
		...initialState,
		sessionId: initialSessionId
	})

	return <SessionContext.Provider value={{ state, dispatch }}>{children}</SessionContext.Provider>
}

// Hook
export function useSessionStore() {
	const context = useContext(SessionContext)
	if (!context) {
		throw new Error('useSessionStore must be used within a SessionProvider')
	}
	return context
}

// Convenience selectors
export function useSession() {
	const { state } = useSessionStore()
	return state
}

export function useSessionDispatch() {
	const { dispatch } = useSessionStore()
	return dispatch
}

// ============================================================================
// WebSocket Context - Shared WebSocket connection
// ============================================================================

// Maximum number of reconnection attempts before giving up
const MAX_RECONNECT_ATTEMPTS = 5

interface WebSocketContextValue {
	connect: () => void
	disconnect: () => void
	sendCommand: <T = unknown>(type: string, data: unknown) => Promise<T>
	isConnected: boolean
	isConnecting: boolean
	error: string | null
	// Stale token handling
	hasGivenUp: boolean
	isSessionInvalid: boolean
	retryCount: number
	retry: () => void
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null)

interface WebSocketProviderProps {
	children: ReactNode
}

export function WebSocketProvider({ children }: WebSocketProviderProps) {
	const { state, dispatch } = useSessionStore()
	const playbackDispatch = usePlaybackDispatch()
	const wsRef = useRef<WebSocket | null>(null)
	const pendingUrlsRef = useRef<string[]>([])
	const hasOpenedRef = useRef(false)
	const reconnectTimeoutRef = useRef<number | null>(null)
	const reconnectAttempts = useRef(0)
	const eventSeqRef = useRef(0)
	const pendingCommands = useRef<Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>>(
		new Map()
	)

	const [isConnected, setIsConnected] = useState(false)
	const [isConnecting, setIsConnecting] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [hasGivenUp, setHasGivenUp] = useState(false)
	const [isSessionInvalid, setIsSessionInvalid] = useState(false)
	const isReconnectingRef = useRef(false) // Track if we're waiting for a reconnect timeout

	// Handle incoming events
	const handleEvent = useCallback(
		(event: StageEvent) => {
			// Record event for playback (Phase 5J)
			const recordedEvent: RecordedEvent = {
				id: `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`,
				seq: event.seq ?? eventSeqRef.current++,
				type: event.type,
				timestamp: event.timestamp ?? Date.now(),
				data: event.data
			}
			playbackDispatch({ type: 'ADD_EVENT', payload: recordedEvent })

			switch (event.type) {
				case 'connected':
					dispatch({ type: 'SET_CONNECTED', payload: true })
					break

				case 'state_sync':
					dispatch({ type: 'HANDLE_STATE_SYNC', payload: event.data as StateSyncPayload })
					break

				case 'current_user_update': {
					const updateData = event.data as { user?: StageUser }
					if (updateData.user) {
						dispatch({ type: 'SET_CURRENT_USER', payload: updateData.user })
					}
					break
				}

				case 'message_create': {
					const msgData = event.data as StageMessageCreateData
					dispatch({ type: 'HANDLE_MESSAGE_CREATE', payload: msgData })

					// If message is from a bot, clear any pending interaction for that bot in that channel
					if (msgData.source === 'bot' && msgData.message.author.bot) {
						dispatch({
							type: 'REMOVE_PENDING_INTERACTION',
							payload: {
								channelId: msgData.message.channel_id,
								botId: msgData.message.author.id
							}
						})
					}
					break
				}

				case 'message_update': {
					const updateData = event.data as { message: StageMessage }
					dispatch({
						type: 'HANDLE_MESSAGE_UPDATE',
						payload: {
							channelId: updateData.message.channel_id,
							message: updateData.message
						}
					})
					break
				}

				case 'message_delete': {
					const deleteData = event.data as { channel_id: string; message_id: string }
					dispatch({
						type: 'HANDLE_MESSAGE_DELETE',
						payload: { channelId: deleteData.channel_id, messageId: deleteData.message_id }
					})
					break
				}

				case 'message_reaction_add': {
					const reactionData = event.data as {
						channel_id: string
						message_id: string
						user_id: string
						emoji: { id: string | null; name: string }
					}
					dispatch({
						type: 'HANDLE_REACTION_ADD',
						payload: reactionData
					})
					break
				}

				case 'message_reaction_remove': {
					const reactionData = event.data as {
						channel_id: string
						message_id: string
						user_id: string
						emoji: { id: string | null; name: string }
					}
					dispatch({
						type: 'HANDLE_REACTION_REMOVE',
						payload: reactionData
					})
					break
				}

				case 'typing_start': {
					const typingData = event.data as {
						channel_id: string
						user_id: string
						member?: { nick?: string }
						user?: { username: string }
					}
					dispatch({
						type: 'HANDLE_TYPING_START',
						payload: {
							channelId: typingData.channel_id,
							userId: typingData.user_id,
							username: typingData.member?.nick || typingData.user?.username || 'Someone'
						}
					})
					break
				}

				case 'voice_state_update': {
					const voiceData = event.data as StageVoiceState
					dispatch({
						type: 'HANDLE_VOICE_STATE_UPDATE',
						payload: voiceData
					})
					break
				}

				case 'command_response': {
					const responseData = event.data as { command_id: string; success: boolean; result?: unknown; error?: string }
					const pending = pendingCommands.current.get(responseData.command_id)
					if (pending) {
						pendingCommands.current.delete(responseData.command_id)
						if (responseData.success) {
							pending.resolve(responseData.result)
						} else {
							pending.reject(new Error(responseData.error || 'Command failed'))
						}
					}
					break
				}

				case 'interaction_response': {
					// Handle interaction responses
					const responseData = event.data as StageInteractionResponseData & {
						channelId?: string
						bot?: { id?: string; username?: string; avatar?: string | null }
					}
					const response = responseData.response as { type?: number; data?: ModalData }

					// Type 9 = Modal
					if (response?.type === 9 && response.data) {
						// Bot responded with a modal, show it
						dispatch({
							type: 'SHOW_MODAL',
							payload: {
								modal: response.data,
								sourceInteractionId: responseData.interactionId
							}
						})
					}

					// Type 5 = DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE ("Bot is thinking...")
					if (response?.type === 5 && responseData.channelId && responseData.bot) {
						dispatch({
							type: 'ADD_PENDING_INTERACTION',
							payload: {
								id: responseData.interactionId,
								channelId: responseData.channelId,
								botName: responseData.bot.username || 'Bot',
								botAvatar: responseData.bot.avatar,
								botId: responseData.bot.id,
								createdAt: Date.now()
							}
						})
					}

					// Type 4, 6, 7 = immediate responses - remove pending interaction
					if ([4, 6, 7].includes(response?.type ?? 0)) {
						dispatch({
							type: 'REMOVE_PENDING_INTERACTION',
							payload: { id: responseData.interactionId }
						})
					}

					dispatch({ type: 'INCREMENT_EVENT_COUNT' })
					break
				}

				case 'interaction_edit': {
					// Phase 5O: Bot edited an interaction message (e.g., editReply after deferReply)
					// This clears the "Bot is thinking..." indicator
					const editData = event.data as { interactionId: string }
					dispatch({
						type: 'REMOVE_PENDING_INTERACTION',
						payload: { id: editData.interactionId }
					})
					dispatch({ type: 'INCREMENT_EVENT_COUNT' })
					break
				}

				case 'heartbeat':
					dispatch({ type: 'SET_HEARTBEAT', payload: Date.now() })
					break

				case 'error': {
					const errorData = event.data as { message: string }
					setError(errorData.message)
					break
				}

				case 'session_invalid': {
					// Server sent session_invalid - token is stale/expired
					const invalidData = event.data as { reason: string; code: number }
					setIsSessionInvalid(true)
					setError(invalidData.reason || 'Session no longer exists')
					// Don't dispatch anything else - connection will be closed by server
					break
				}

				case 'event_filtered': {
					// Intent diagnostics - event was not delivered to bot due to missing intent
					const filteredData = event.data as {
						connectionId: string
						eventName: string
						requiredIntent: string | null
						message: string
						timestamp: number
					}
					dispatch({
						type: 'ADD_FILTERED_EVENT',
						payload: {
							eventName: filteredData.eventName,
							requiredIntent: filteredData.requiredIntent,
							// Use server timestamp for accurate playback sync
							timestamp: filteredData.timestamp
						}
					})
					break
				}

				case 'loop_detected': {
					// Event loop detected - circuit breaker triggered
					const loopData = event.data as {
						eventType: string
						count: number
						windowMs: number
						cooldownMs: number
						lastAuthorId: string | null
						lastAuthorUsername: string | null
						lastContent: string | null
						timestamp: number
					}
					dispatch({
						type: 'SET_LOOP_WARNING',
						payload: {
							eventType: loopData.eventType,
							count: loopData.count,
							windowMs: loopData.windowMs,
							cooldownMs: loopData.cooldownMs,
							lastAuthorUsername: loopData.lastAuthorUsername,
							lastContent: loopData.lastContent,
							timestamp: loopData.timestamp
						}
					})
					break
				}

				default:
					dispatch({ type: 'INCREMENT_EVENT_COUNT' })
			}
		},
		[dispatch, playbackDispatch]
	)

	// Connect to WebSocket
	const connect = useCallback(() => {
		console.log('[Stage] connect() called, sessionId:', state.sessionId)

		if (!state.sessionId) {
			console.log('[Stage] No session ID, aborting connect')
			setError('No session ID provided')
			return
		}

		if (wsRef.current?.readyState === WebSocket.OPEN) {
			console.log('[Stage] Already connected, skipping')
			return // Already connected
		}

		// Clear any pending reconnect timeout (user may be connecting with a new session ID)
		if (reconnectTimeoutRef.current) {
			clearTimeout(reconnectTimeoutRef.current)
			reconnectTimeoutRef.current = null
		}
		isReconnectingRef.current = false

		setIsConnecting(true)
		setError(null)
		dispatch({ type: 'SET_CONNECTING', payload: true })

		const urls = buildStageWebSocketUrls(state.sessionId)
		pendingUrlsRef.current = urls.slice(1)
		hasOpenedRef.current = false

		const openWebSocket = (url: string) => {
			console.log('[Stage] Connecting to WebSocket:', url)
			const ws = new WebSocket(url)
			wsRef.current = ws

			ws.onopen = () => {
				console.log('[Stage] WebSocket connected!')
				hasOpenedRef.current = true
				setIsConnected(true)
				setIsConnecting(false)
				setError(null)
				setHasGivenUp(false)
				setIsSessionInvalid(false)
				reconnectAttempts.current = 0
				dispatch({ type: 'SET_CONNECTED', payload: true })
			}

			ws.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data) as StageEvent
					handleEvent(data)
				} catch (e) {
					console.error('[Stage] Failed to parse WebSocket message:', e)
				}
			}

			ws.onclose = (event) => {
				console.log('[Stage] WebSocket closed:', { code: event.code, reason: event.reason, sessionId: state.sessionId })
				setIsConnected(false)
				wsRef.current = null
				dispatch({ type: 'SET_CONNECTED', payload: false })

				if (!hasOpenedRef.current && pendingUrlsRef.current.length > 0) {
					const nextUrl = pendingUrlsRef.current.shift()
					if (nextUrl) {
						openWebSocket(nextUrl)
						return
					}
				}

				// Don't reconnect if session is invalid (code 4001)
				if (event.code === 4001) {
					console.log('[Stage] Session invalid, not reconnecting')
					setIsSessionInvalid(true)
					return
				}

				// Don't reconnect if intentionally closed
				if (event.code === 1000) {
					console.log('[Stage] Intentionally closed, not reconnecting')
					return
				}

				// Don't reconnect if no session ID
				if (!state.sessionId) {
					console.log('[Stage] No session ID, not reconnecting')
					return
				}

				// Check if we've exceeded max retry attempts
				if (reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
					console.log('[Stage] Max reconnect attempts reached, giving up')
					setHasGivenUp(true)
					setError('Connection lost after multiple attempts')
					return
				}

				// Reconnect with exponential backoff
				const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000)
				reconnectAttempts.current++
				console.log('[Stage] Scheduling reconnect in', delay, 'ms (attempt', reconnectAttempts.current, '/', MAX_RECONNECT_ATTEMPTS, ')')

				// Mark that we're waiting for a scheduled reconnect (prevents auto-connect effect from bypassing backoff)
				isReconnectingRef.current = true

				reconnectTimeoutRef.current = window.setTimeout(() => {
					console.log('[Stage] Reconnect timeout fired, calling connect()')
					isReconnectingRef.current = false
					connect()
				}, delay)
			}

			ws.onerror = (err) => {
				console.log('[Stage] WebSocket error:', err)
				setError('Connection failed')
				setIsConnecting(false)
				dispatch({ type: 'SET_ERROR', payload: 'Connection failed' })
			}
		}

		const firstUrl = urls[0]
		if (!firstUrl) {
			setError('Invalid Stage WebSocket URL')
			setIsConnecting(false)
			dispatch({ type: 'SET_ERROR', payload: 'Invalid Stage WebSocket URL' })
			return
		}

		openWebSocket(firstUrl)
	}, [state.sessionId, dispatch, handleEvent])

	// Disconnect from WebSocket
	const disconnect = useCallback(() => {
		if (reconnectTimeoutRef.current) {
			clearTimeout(reconnectTimeoutRef.current)
			reconnectTimeoutRef.current = null
		}
		isReconnectingRef.current = false

		if (wsRef.current) {
			wsRef.current.close(1000, 'Client disconnected')
			wsRef.current = null
		}

		setIsConnected(false)
		setIsConnecting(false)
		dispatch({ type: 'SET_CONNECTED', payload: false })
	}, [dispatch])

	// Send command and wait for response
	const sendCommand = useCallback(<T = unknown>(type: string, data: unknown): Promise<T> => {
		return new Promise((resolve, reject) => {
			if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
				reject(new Error('Not connected'))
				return
			}

			const id = `cmd_${Date.now()}_${Math.random().toString(36).slice(2)}`

			const command: StageCommand = { id, type: type as StageCommand['type'], data }

			pendingCommands.current.set(id, {
				resolve: resolve as (value: unknown) => void,
				reject
			})

			wsRef.current.send(JSON.stringify(command))

			// Timeout after 30s
			setTimeout(() => {
				if (pendingCommands.current.has(id)) {
					pendingCommands.current.delete(id)
					reject(new Error('Command timeout'))
				}
			}, 30000)
		})
	}, [])

	// Retry connection after giving up or session invalid
	const retry = useCallback(() => {
		console.log('[Stage] Manual retry requested')
		reconnectAttempts.current = 0
		isReconnectingRef.current = false
		setHasGivenUp(false)
		setIsSessionInvalid(false)
		setError(null)
		connect()
	}, [connect])

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			disconnect()
		}
	}, [disconnect])

	// Auto-connect when session ID is available (e.g., from URL params)
	// But don't auto-connect if:
	// - Already waiting for a scheduled reconnect (exponential backoff)
	// - Session is invalid (stale token)
	// - We've given up after max retries
	useEffect(() => {
		console.log('[Stage] Auto-connect check:', { sessionId: state.sessionId, isConnected, isConnecting, isReconnecting: isReconnectingRef.current, isSessionInvalid, hasGivenUp })
		if (state.sessionId && !isConnected && !isConnecting && !isReconnectingRef.current && !isSessionInvalid && !hasGivenUp) {
			console.log('[Stage] Auto-connecting with session:', state.sessionId)
			connect()
		}
	}, [state.sessionId, isConnected, isConnecting, connect, isSessionInvalid, hasGivenUp])

	const value: WebSocketContextValue = {
		connect,
		disconnect,
		sendCommand,
		isConnected,
		isConnecting,
		error,
		hasGivenUp,
		isSessionInvalid,
		retryCount: reconnectAttempts.current,
		retry
	}

	return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>
}

export function useWebSocket() {
	const context = useContext(WebSocketContext)
	if (!context) {
		throw new Error('useWebSocket must be used within a WebSocketProvider')
	}
	return context
}

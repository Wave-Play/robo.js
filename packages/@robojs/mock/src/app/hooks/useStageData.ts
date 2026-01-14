import { useCallback, useMemo, useEffect, useRef } from 'react'
import { useSession as useSessionState, useSessionDispatch, useWebSocket, type PendingMessage, type PendingInteraction, type FilteredEvent, type LoopWarning } from '../stores/sessionStore'
import { usePlayback, usePlaybackControls, usePlaybackGuilds, usePlaybackChannels, usePlaybackMembers, usePlaybackMessages, usePlaybackTypingUsers } from '../stores/playbackStore'
import { useUnifiedSelection } from '../stores/unifiedSelectionStore'
import { useCurrentUser } from './useCurrentUser'
import { MentionParser } from '../../utils/mention-parser'
import type { ModalActionRow, ModalData } from '../components/modals/Modal'
import type { StageMessage, StageUser, StageGuild, StageChannel, StageMember, StageRole, StageVoiceState, StageApplicationCommand } from '../types/stage'

// ============================================================================
// Types
// ============================================================================

export interface UseStageDataOptions {
	/** Filter channels/members to this guild ID. Falls back to selectedGuildId if not provided. */
	guildId?: string | null
	/** Filter messages/typing users to this channel ID. Falls back to selectedChannelId if not provided. */
	channelId?: string | null
}

export interface PlaybackControls {
	isPlaying: boolean
	currentTime: number
	duration: number
	speed: number
	eventCount: number
	play: () => void
	pause: () => void
	togglePlay: () => void
	seek: (time: number) => void
	setSpeed: (speed: number) => void
	setMode: (mode: 'live' | 'playback') => void
	clearEvents: () => void
}

export interface StageDataResult {
	// === Unified Data (auto-switches between live/playback) ===
	guilds: StageGuild[]
	channels: StageChannel[]
	members: StageMember[]
	messages: StageMessage[]
	users: StageUser[]
	roles: StageRole[]
	voiceStates: StageVoiceState[]
	commands: StageApplicationCommand[]
	typingUsers: { userId: string; username: string; expiresAt: number }[]

	// === Unified Selection (works in both modes) ===
	selectedGuildId: string | null
	selectedChannelId: string | null
	selectedGuild: StageGuild | null
	selectedChannel: StageChannel | null

	// === Mode & Connection ===
	mode: 'live' | 'playback'
	isPlaybackMode: boolean
	sessionId: string | null
	isConnected: boolean
	isConnecting: boolean
	error: string | null
	hasGivenUp: boolean
	isSessionInvalid: boolean
	retryCount: number
	botUser: StageUser | null
	currentUser: StageUser | null

	// === UI State ===
	showMembers: boolean
	activeModal: { modal: ModalData; sourceInteractionId: string } | null
	replyingTo: StageMessage | null
	pendingInteractions: PendingInteraction[]
	pendingMessages: PendingMessage[]

	// === Diagnostics ===
	filteredEvents: FilteredEvent[]
	loopWarning: LoopWarning | null
	eventCount: number
	lastHeartbeat: number | null

	// === Mention Tracking ===
	unreadMentions: Record<string, number>

	// === Selection Actions (work in both modes) ===
	selectGuild: (guildId: string | null) => void
	selectChannel: (channelId: string | null) => void

	// === UI Actions (work in both modes) ===
	toggleMembers: () => void
	closeModal: () => void
	setReplyingTo: (message: StageMessage) => void
	clearReplyingTo: () => void
	clearFilteredEvents: () => void
	clearLoopWarning: () => void

	// === Connection Actions (live only, no-op in playback) ===
	connect: () => void
	disconnect: () => void
	retry: () => void
	setSessionId: (sessionId: string) => void

	// === Message Actions (live only, no-op in playback) ===
	sendMessage: (content: string, channelId?: string, messageReference?: { message_id: string; channel_id?: string; guild_id?: string }) => Promise<unknown>
	retryMessage: (messageId: string) => Promise<unknown>
	cancelMessage: (messageId: string) => void

	// === Interaction Actions (live only, no-op in playback) ===
	invokeCommand: (commandName: string, options?: Record<string, unknown>, channelId?: string) => Promise<unknown>
	invokeContextCommand: (commandName: string, commandType: 2 | 3, targetId: string, targetData: StageMessage | StageUser, channelId?: string) => Promise<unknown>
	clickButton: (messageId: string, customId: string, channelId?: string) => Promise<unknown>
	selectOption: (messageId: string, customId: string, values: string[], channelId?: string) => Promise<unknown>
	submitModal: (customId: string, components: ModalActionRow[]) => Promise<unknown>

	// === Reaction Actions (live only, no-op in playback) ===
	addReaction: (messageId: string, emoji: string, channelId?: string) => Promise<unknown>
	removeReaction: (messageId: string, emoji: string, channelId?: string) => Promise<unknown>

	// === Channel Actions (live only, no-op in playback) ===
	pinMessage: (channelId: string, messageId: string) => Promise<void>
	unpinMessage: (channelId: string, messageId: string) => Promise<void>
	openDM: (userId: string) => Promise<unknown>

	// === Voice Actions (live only, no-op in playback) ===
	joinVoice: (channelId: string, guildId?: string, userId?: string) => Promise<unknown>
	leaveVoice: (guildId?: string, userId?: string) => Promise<unknown>

	// === Low-level ===
	sendCommand: <T = unknown>(type: string, data: unknown) => Promise<T>

	// === Playback Controls (separate namespace) ===
	playback: PlaybackControls
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Unified hook for Stage UI data that handles both live and playback modes.
 *
 * Components use this single hook instead of combining useSession + usePlaybackX hooks.
 * The hook internally switches between data sources based on the current mode.
 *
 * @param options - Optional filters for data (guildId, channelId)
 * @returns Unified data, actions, and playback controls
 */
export function useStageData(options?: UseStageDataOptions): StageDataResult {
	// === Session State ===
	const sessionState = useSessionState()
	const sessionDispatch = useSessionDispatch()
	const { connect, disconnect, sendCommand, isConnected, isConnecting, error, hasGivenUp, isSessionInvalid, retryCount, retry } = useWebSocket()

	// === Per-Browser User (localStorage-based) ===
	const { currentUser: browserCurrentUser } = useCurrentUser()

	// === Playback State ===
	const playbackState = usePlayback()
	const playbackControls = usePlaybackControls()
	const isPlaybackMode = playbackState.mode === 'playback'

	// === Unified Selection ===
	const selection = useUnifiedSelection()

	// Determine effective guild/channel IDs
	const effectiveGuildId = options?.guildId ?? selection.selectedGuildId
	const effectiveChannelId = options?.channelId ?? selection.selectedChannelId

	// === Playback Data Hooks (always called, return null in live mode) ===
	const playbackGuilds = usePlaybackGuilds()
	const playbackChannels = usePlaybackChannels(effectiveGuildId)
	const playbackMembers = usePlaybackMembers(effectiveGuildId)
	const playbackMessages = usePlaybackMessages(effectiveChannelId)
	const playbackTypingUsers = usePlaybackTypingUsers(effectiveChannelId)

	// === Mode Change Effects ===
	const prevModeRef = useRef(playbackState.mode)

	// Auto-select first guild/channel when entering playback mode
	useEffect(() => {
		const wasLive = prevModeRef.current === 'live'
		const nowPlayback = playbackState.mode === 'playback'

		if (wasLive && nowPlayback) {
			// Entering playback mode - save live selection
			selection.saveLiveSelection()

			// Auto-select first playback guild if available
			if (playbackGuilds && playbackGuilds.length > 0) {
				selection.selectGuild(playbackGuilds[0].id)
			}
		} else if (!wasLive && !nowPlayback && prevModeRef.current === 'playback') {
			// Exiting playback mode - restore live selection
			selection.restoreLiveSelection()
		}

		prevModeRef.current = playbackState.mode
	}, [playbackState.mode, playbackGuilds, selection])

	// Auto-select first channel when guild changes in playback mode
	useEffect(() => {
		if (isPlaybackMode && playbackChannels && playbackChannels.length > 0 && !selection.selectedChannelId) {
			// Find first text channel (type 0)
			const textChannel = playbackChannels.find(c => c.type === 0)
			if (textChannel) {
				selection.selectChannel(textChannel.id)
			} else if (playbackChannels.length > 0) {
				selection.selectChannel(playbackChannels[0].id)
			}
		}
	}, [isPlaybackMode, playbackChannels, selection])

	// Auto-select first guild/channel in live mode when data is received
	useEffect(() => {
		// Only in live mode
		if (isPlaybackMode) return

		// Auto-select first guild if none selected and guilds are available
		if (!selection.selectedGuildId && sessionState.guilds.length > 0) {
			selection.selectGuild(sessionState.guilds[0].id)
		}
	}, [isPlaybackMode, sessionState.guilds, selection])

	// Auto-select first channel when guild is selected in live mode
	useEffect(() => {
		// Only in live mode
		if (isPlaybackMode) return

		// If a guild is selected but no channel is selected
		if (selection.selectedGuildId && !selection.selectedChannelId) {
			const guildChannels = sessionState.channels.filter(c => c.guild_id === selection.selectedGuildId)
			// Find first text channel (type 0) or announcement channel (type 5)
			const textChannel = guildChannels.find(c => c.type === 0 || c.type === 5)
			if (textChannel) {
				selection.selectChannel(textChannel.id)
			} else if (guildChannels.length > 0) {
				selection.selectChannel(guildChannels[0].id)
			}
		}
	}, [isPlaybackMode, selection.selectedGuildId, selection.selectedChannelId, sessionState.channels, selection])

	// === Resolve Data Based on Mode ===
	const guilds = isPlaybackMode && playbackGuilds ? playbackGuilds : sessionState.guilds

	// Channels filtered by guild
	const sessionGuildChannels = sessionState.channels.filter(c => c.guild_id === effectiveGuildId)
	const channels = isPlaybackMode && playbackChannels ? playbackChannels : sessionGuildChannels

	// Members filtered by guild
	const sessionGuildMembers = sessionState.members.filter(m => m.guild_id === effectiveGuildId)
	const members = isPlaybackMode && playbackMembers ? playbackMembers : sessionGuildMembers

	// Messages filtered by channel
	const sessionChannelMessages = effectiveChannelId ? sessionState.messages[effectiveChannelId] || [] : []
	const messages = isPlaybackMode && playbackMessages ? playbackMessages : sessionChannelMessages

	// Typing users filtered by channel (and expired)
	const now = Date.now()
	const sessionChannelTypingUsers = effectiveChannelId
		? (sessionState.typingUsers[effectiveChannelId] || []).filter(t => t.expiresAt > now)
		: []
	const typingUsers = isPlaybackMode && playbackTypingUsers ? playbackTypingUsers : sessionChannelTypingUsers

	// Other data (not time-filtered in playback)
	const users = sessionState.users
	const roles = sessionState.roles.filter(r => r.guild_id === effectiveGuildId)
	const voiceStates = sessionState.voiceStates.filter(vs => vs.guild_id === effectiveGuildId)
	const commands = sessionState.commands

	// === Derived Selection ===
	const selectedGuild = useMemo(() => {
		return guilds.find(g => g.id === selection.selectedGuildId) ?? null
	}, [guilds, selection.selectedGuildId])

	const selectedChannel = useMemo(() => {
		return channels.find(c => c.id === selection.selectedChannelId) ?? null
	}, [channels, selection.selectedChannelId])

	// Pending interactions/messages for current channel
	const channelPendingInteractions = effectiveChannelId
		? sessionState.pendingInteractions.filter(p => p.channelId === effectiveChannelId)
		: []
	const channelPendingMessages = effectiveChannelId
		? sessionState.pendingMessages.filter(m => m.channelId === effectiveChannelId)
		: []

	// === Selection Actions (work in both modes) ===
	const selectGuild = useCallback((guildId: string | null) => {
		selection.selectGuild(guildId)
		// Also update session state for backward compatibility
		if (!isPlaybackMode) {
			sessionDispatch({ type: 'SELECT_GUILD', payload: guildId })
		}
	}, [selection, sessionDispatch, isPlaybackMode])

	const selectChannel = useCallback((channelId: string | null) => {
		selection.selectChannel(channelId)
		// Also update session state for backward compatibility
		if (!isPlaybackMode) {
			sessionDispatch({ type: 'SELECT_CHANNEL', payload: channelId })
		}
	}, [selection, sessionDispatch, isPlaybackMode])

	// === UI Actions (work in both modes) ===
	const toggleMembers = useCallback(() => {
		sessionDispatch({ type: 'TOGGLE_MEMBERS' })
	}, [sessionDispatch])

	const closeModal = useCallback(() => {
		sessionDispatch({ type: 'CLOSE_MODAL' })
	}, [sessionDispatch])

	const setReplyingTo = useCallback((message: StageMessage) => {
		sessionDispatch({ type: 'SET_REPLYING_TO', payload: message })
	}, [sessionDispatch])

	const clearReplyingTo = useCallback(() => {
		sessionDispatch({ type: 'CLEAR_REPLYING_TO' })
	}, [sessionDispatch])

	const clearFilteredEvents = useCallback(() => {
		sessionDispatch({ type: 'CLEAR_FILTERED_EVENTS' })
	}, [sessionDispatch])

	const clearLoopWarning = useCallback(() => {
		sessionDispatch({ type: 'CLEAR_LOOP_WARNING' })
	}, [sessionDispatch])

	// === Connection Actions (no-op in playback) ===
	const setSessionId = useCallback((sessionId: string) => {
		if (isPlaybackMode) return
		sessionDispatch({ type: 'SET_SESSION_ID', payload: sessionId })
	}, [sessionDispatch, isPlaybackMode])

	const connectAction = useCallback(() => {
		if (isPlaybackMode) return
		connect()
	}, [connect, isPlaybackMode])

	const disconnectAction = useCallback(() => {
		if (isPlaybackMode) return
		disconnect()
	}, [disconnect, isPlaybackMode])

	const retryAction = useCallback(() => {
		if (isPlaybackMode) return
		retry()
	}, [retry, isPlaybackMode])

	// === Message Actions (no-op in playback) ===
	const sendMessage = useCallback(async (
		content: string,
		channelId?: string,
		messageReference?: { message_id: string; channel_id?: string; guild_id?: string }
	) => {
		if (isPlaybackMode) return

		const targetChannelId = channelId || selection.selectedChannelId
		if (!targetChannelId) {
			throw new Error('No channel selected')
		}

		// Create pending message using per-browser current user
		const pendingId = `pending_${Date.now()}_${Math.random().toString(36).slice(2)}`
		const author = browserCurrentUser
			? { id: browserCurrentUser.id, username: browserCurrentUser.username, avatar: browserCurrentUser.avatar ?? null }
			: { id: 'user_0', username: 'You', avatar: null } // Fallback for backward compat

		sessionDispatch({
			type: 'ADD_PENDING_MESSAGE',
			payload: { id: pendingId, content, channelId: targetChannelId, state: 'sending', author, createdAt: Date.now() }
		})

		try {
			// Parse mentions from content
			const mentions = MentionParser.parse(content)

			const result = await sendCommand('send_message', {
				channel_id: targetChannelId,
				content,
				author: { id: author.id, username: author.username },
				mentions: mentions.users,
				mention_roles: mentions.roles,
				mention_everyone: mentions.everyone,
				...(messageReference && { message_reference: messageReference })
			})
			sessionDispatch({ type: 'REMOVE_PENDING_MESSAGE', payload: pendingId })
			return result
		} catch (err) {
			sessionDispatch({
				type: 'MARK_MESSAGE_FAILED',
				payload: { id: pendingId, error: err instanceof Error ? err.message : 'Failed to send message' }
			})
			throw err
		}
	}, [isPlaybackMode, selection.selectedChannelId, sendCommand, sessionDispatch, browserCurrentUser])

	const retryMessage = useCallback(async (messageId: string) => {
		if (isPlaybackMode) return

		const pendingMessage = sessionState.pendingMessages.find(m => m.id === messageId)
		if (!pendingMessage) return

		sessionDispatch({ type: 'REMOVE_PENDING_MESSAGE', payload: messageId })
		return sendMessage(pendingMessage.content, pendingMessage.channelId)
	}, [isPlaybackMode, sessionState.pendingMessages, sessionDispatch, sendMessage])

	const cancelMessage = useCallback((messageId: string) => {
		if (isPlaybackMode) return
		sessionDispatch({ type: 'REMOVE_PENDING_MESSAGE', payload: messageId })
	}, [isPlaybackMode, sessionDispatch])

	// === Interaction Actions (no-op in playback) ===
	const invokeCommand = useCallback(async (
		commandName: string,
		options?: Record<string, unknown>,
		channelId?: string
	) => {
		if (isPlaybackMode) return

		const targetChannelId = channelId || selection.selectedChannelId
		if (!targetChannelId) throw new Error('No channel selected')

		return sendCommand('invoke_command', { channel_id: targetChannelId, command_name: commandName, options })
	}, [isPlaybackMode, selection.selectedChannelId, sendCommand])

	const invokeContextCommand = useCallback(async (
		commandName: string,
		commandType: 2 | 3,
		targetId: string,
		targetData: StageMessage | StageUser,
		channelId?: string
	) => {
		if (isPlaybackMode) return

		const targetChannelId = channelId || selection.selectedChannelId
		if (!targetChannelId) throw new Error('No channel selected')

		return sendCommand('invoke_context_command', {
			channel_id: targetChannelId,
			command_name: commandName,
			command_type: commandType,
			target_id: targetId,
			...(commandType === 3 && { message: targetData }),
			...(commandType === 2 && { user: targetData })
		})
	}, [isPlaybackMode, selection.selectedChannelId, sendCommand])

	const clickButton = useCallback(async (messageId: string, customId: string, channelId?: string) => {
		if (isPlaybackMode) return

		const targetChannelId = channelId || selection.selectedChannelId
		if (!targetChannelId) throw new Error('No channel selected')

		return sendCommand('click_button', { channel_id: targetChannelId, message_id: messageId, custom_id: customId })
	}, [isPlaybackMode, selection.selectedChannelId, sendCommand])

	const selectOption = useCallback(async (messageId: string, customId: string, values: string[], channelId?: string) => {
		if (isPlaybackMode) return

		const targetChannelId = channelId || selection.selectedChannelId
		if (!targetChannelId) throw new Error('No channel selected')

		return sendCommand('select_option', { channel_id: targetChannelId, message_id: messageId, custom_id: customId, values })
	}, [isPlaybackMode, selection.selectedChannelId, sendCommand])

	const submitModal = useCallback(async (customId: string, components: ModalActionRow[]) => {
		if (isPlaybackMode) return
		return sendCommand('submit_modal', { custom_id: customId, components })
	}, [isPlaybackMode, sendCommand])

	// === Reaction Actions (no-op in playback) ===
	const addReaction = useCallback(async (messageId: string, emoji: string, channelId?: string) => {
		if (isPlaybackMode) return

		const targetChannelId = channelId || selection.selectedChannelId
		if (!targetChannelId) throw new Error('No channel selected')

		return sendCommand('add_reaction', { channel_id: targetChannelId, message_id: messageId, emoji })
	}, [isPlaybackMode, selection.selectedChannelId, sendCommand])

	const removeReaction = useCallback(async (messageId: string, emoji: string, channelId?: string) => {
		if (isPlaybackMode) return

		const targetChannelId = channelId || selection.selectedChannelId
		if (!targetChannelId) throw new Error('No channel selected')

		return sendCommand('remove_reaction', { channel_id: targetChannelId, message_id: messageId, emoji })
	}, [isPlaybackMode, selection.selectedChannelId, sendCommand])

	// === Channel Actions (no-op in playback) ===
	const pinMessage = useCallback(async (channelId: string, messageId: string) => {
		if (isPlaybackMode) return

		const response = await fetch(`/api/v10/channels/${channelId}/pins/${messageId}`, { method: 'PUT' })
		if (!response.ok) throw new Error('Failed to pin message')
	}, [isPlaybackMode])

	const unpinMessage = useCallback(async (channelId: string, messageId: string) => {
		if (isPlaybackMode) return

		const response = await fetch(`/api/v10/channels/${channelId}/pins/${messageId}`, { method: 'DELETE' })
		if (!response.ok) throw new Error('Failed to unpin message')
	}, [isPlaybackMode])

	const openDM = useCallback(async (userId: string) => {
		if (isPlaybackMode) return

		// First check if a DM channel already exists for this user in session state
		const existingDM = sessionState.channels.find((ch) => {
			// DM channels have type 1 and recipient_ids array
			if (ch.type !== 1) return false
			const recipientIds = (ch as { recipient_ids?: string[] }).recipient_ids
			return recipientIds?.includes(userId)
		})

		if (existingDM) {
			// DM channel already exists - just select it
			sessionDispatch({ type: 'SELECT_CHANNEL', payload: existingDM.id })
			return existingDM
		}

		// No existing DM channel - create one via API
		const response = await fetch('/api/v10/users/@me/channels', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ recipient_id: userId })
		})
		if (!response.ok) throw new Error('Failed to open DM')

		const dmChannel = await response.json()
		sessionDispatch({ type: 'ADD_DM_CHANNEL', payload: dmChannel })
		sessionDispatch({ type: 'SELECT_CHANNEL', payload: dmChannel.id })
		return dmChannel
	}, [isPlaybackMode, sessionDispatch, sessionState.channels])

	// === Voice Actions (no-op in playback) ===
	const joinVoice = useCallback(async (channelId: string, guildId?: string, userId?: string) => {
		if (isPlaybackMode) return

		const targetGuildId = guildId || selection.selectedGuildId
		if (!targetGuildId) throw new Error('No guild selected')

		const targetUserId = userId || sessionState.botUser?.id

		return sendCommand('join_voice', {
			channel_id: channelId,
			guild_id: targetGuildId,
			user: targetUserId ? { id: targetUserId } : undefined
		})
	}, [isPlaybackMode, selection.selectedGuildId, sessionState.botUser?.id, sendCommand])

	const leaveVoice = useCallback(async (guildId?: string, userId?: string) => {
		if (isPlaybackMode) return

		const targetGuildId = guildId || selection.selectedGuildId
		if (!targetGuildId) throw new Error('No guild selected')

		const targetUserId = userId || sessionState.botUser?.id

		return sendCommand('leave_voice', {
			guild_id: targetGuildId,
			user: targetUserId ? { id: targetUserId } : undefined
		})
	}, [isPlaybackMode, selection.selectedGuildId, sessionState.botUser?.id, sendCommand])

	// === Playback Controls ===
	const playback: PlaybackControls = useMemo(() => ({
		isPlaying: playbackControls.isPlaying,
		currentTime: playbackControls.currentTime,
		duration: playbackControls.duration,
		speed: playbackControls.speed,
		eventCount: playbackControls.eventCount,
		play: playbackControls.play,
		pause: playbackControls.pause,
		togglePlay: playbackControls.togglePlay,
		seek: playbackControls.seek,
		setSpeed: playbackControls.setSpeed,
		setMode: playbackControls.setMode,
		clearEvents: playbackControls.clearEvents
	}), [playbackControls])

	// === Return Value ===
	return {
		// Unified Data
		guilds,
		channels,
		members,
		messages,
		users,
		roles,
		voiceStates,
		commands,
		typingUsers,

		// Unified Selection
		selectedGuildId: selection.selectedGuildId,
		selectedChannelId: selection.selectedChannelId,
		selectedGuild,
		selectedChannel,

		// Mode & Connection
		mode: playbackState.mode,
		isPlaybackMode,
		sessionId: sessionState.sessionId,
		isConnected: isConnected || sessionState.isConnected,
		isConnecting: isConnecting || sessionState.isConnecting,
		error: error || sessionState.error,
		hasGivenUp,
		isSessionInvalid,
		retryCount,
		botUser: sessionState.botUser,
		currentUser: browserCurrentUser,

		// UI State
		showMembers: sessionState.showMembers,
		activeModal: sessionState.activeModal,
		replyingTo: sessionState.replyingTo,
		pendingInteractions: channelPendingInteractions,
		pendingMessages: channelPendingMessages,

		// Diagnostics
		filteredEvents: sessionState.filteredEvents,
		loopWarning: sessionState.loopWarning,
		eventCount: sessionState.eventCount,
		lastHeartbeat: sessionState.lastHeartbeat,

		// Mention Tracking
		unreadMentions: sessionState.unreadMentions,

		// Selection Actions
		selectGuild,
		selectChannel,

		// UI Actions
		toggleMembers,
		closeModal,
		setReplyingTo,
		clearReplyingTo,
		clearFilteredEvents,
		clearLoopWarning,

		// Connection Actions
		connect: connectAction,
		disconnect: disconnectAction,
		retry: retryAction,
		setSessionId,

		// Message Actions
		sendMessage,
		retryMessage,
		cancelMessage,

		// Interaction Actions
		invokeCommand,
		invokeContextCommand,
		clickButton,
		selectOption,
		submitModal,

		// Reaction Actions
		addReaction,
		removeReaction,

		// Channel Actions
		pinMessage,
		unpinMessage,
		openDM,

		// Voice Actions
		joinVoice,
		leaveVoice,

		// Low-level
		sendCommand,

		// Playback Controls
		playback
	}
}

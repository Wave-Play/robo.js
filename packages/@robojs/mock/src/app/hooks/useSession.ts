import { useSession as useSessionState, useSessionDispatch, useWebSocket, type PendingMessage } from '../stores/sessionStore'
import { CHANNEL_TYPE, buildThreadMetadata, createLocalId, normalizeChannelName, normalizeStageSessionId } from '../utils'
import type { ModalActionRow } from '../components/modals/Modal'
import type { StageChannel, StageMessage, StageUser } from '../types/stage'

/**
 * Combined hook for session state and WebSocket connection.
 * Provides easy access to session data and actions.
 */
export function useSession() {
	const state = useSessionState()
	const dispatch = useSessionDispatch()
	const { connect, disconnect, sendCommand, isConnected, isConnecting, error, hasGivenUp, isSessionInvalid, retryCount, retry } = useWebSocket()

	// Derived state
	const selectedGuild = state.guilds.find((g) => g.id === state.selectedGuildId) || null
	const selectedChannel = state.channels.find((c) => c.id === state.selectedChannelId) || null
	const guildChannels = state.channels.filter((c) => c.guild_id === state.selectedGuildId)
	const guildMembers = state.members.filter((m) => m.guild_id === state.selectedGuildId)
	const guildRoles = state.roles.filter((r) => r.guild_id === state.selectedGuildId)
	const channelMessages = state.selectedChannelId ? state.messages[state.selectedChannelId] || [] : []
	// Filter to only slash commands (type 1 = ChatInput) for autocomplete
	// Default to type 1 if not specified for backwards compatibility
	const slashCommands = state.commands.filter((c) => (c.type ?? 1) === 1)
	// Filter to context menu commands (type 2 = USER, type 3 = MESSAGE)
	const userCommands = state.commands.filter((c) => c.type === 2)
	const messageCommands = state.commands.filter((c) => c.type === 3)
	// Get typing users for current channel (filter out expired)
	const now = Date.now()
	const channelTypingUsers = state.selectedChannelId
		? (state.typingUsers[state.selectedChannelId] || []).filter((t) => t.expiresAt > now)
		: []
	// Get pending interactions for current channel ("Bot is thinking...")
	const channelPendingInteractions = state.selectedChannelId
		? state.pendingInteractions.filter((p) => p.channelId === state.selectedChannelId)
		: []
	// Get pending messages for current channel (sending/failed)
	const channelPendingMessages = state.selectedChannelId
		? state.pendingMessages.filter((m) => m.channelId === state.selectedChannelId)
		: []
	// Get voice states for current guild (Phase 5P)
	const guildVoiceStates = state.voiceStates.filter((vs) => vs.guild_id === state.selectedGuildId)

	// Actions
	const setSessionId = (sessionId: string) => {
		dispatch({ type: 'SET_SESSION_ID', payload: normalizeStageSessionId(sessionId) })
	}

	const selectGuild = (guildId: string | null) => {
		dispatch({ type: 'SELECT_GUILD', payload: guildId })
	}

	const selectChannel = (channelId: string | null) => {
		dispatch({ type: 'SELECT_CHANNEL', payload: channelId })
	}

	const toggleMembers = () => {
		dispatch({ type: 'TOGGLE_MEMBERS' })
	}

	const openVoicePanel = (channelId: string, mode: 'split' | 'full' = 'split') => {
		dispatch({ type: 'SELECT_CHANNEL', payload: channelId })
		dispatch({ type: 'SET_VOICE_PANEL', payload: { channelId, mode } })
	}

	const setVoicePanelMode = (mode: 'closed' | 'split' | 'full') => {
		const channelId = state.selectedChannelId
		if (!channelId) return
		dispatch({ type: 'SET_VOICE_PANEL', payload: { channelId, mode } })
	}

	const closeVoicePanel = () => {
		const channelId = state.selectedChannelId
		dispatch({ type: 'SET_VOICE_PANEL', payload: { channelId, mode: 'closed' } })
	}

	const deleteThread = (threadId: string) => {
		const threadChannel = state.channels.find((channel) => channel.id === threadId)
		dispatch({ type: 'DELETE_THREAD', payload: { threadId } })
		if (threadChannel?.parent_id) {
			dispatch({ type: 'SELECT_CHANNEL', payload: threadChannel.parent_id })
		}
	}

	// Create a new mock channel locally for the current guild
	const createChannel = (options: {
		name: string
		type?: number
		parentId?: string | null
		isPrivate?: boolean
		topic?: string | null
	}): StageChannel => {
		const guildId = state.selectedGuildId
		if (!guildId) {
			throw new Error('No guild selected')
		}

		const parentId = options.parentId ?? null
		const channelId = createLocalId('channel')
		const channelName = normalizeChannelName(options.name)
		const siblingCount = state.channels.filter(
			(channel) => channel.guild_id === guildId && (channel.parent_id ?? null) === parentId
		).length

		const newChannel: StageChannel = {
			id: channelId,
			name: channelName,
			type: options.type ?? CHANNEL_TYPE.TEXT,
			guild_id: guildId,
			parent_id: parentId,
			position: siblingCount,
			topic: options.topic ?? null,
			is_private: options.isPrivate
		}

		dispatch({ type: 'INJECT_CHANNELS', payload: [newChannel] })
		if (newChannel.type !== CHANNEL_TYPE.VOICE) {
			dispatch({ type: 'SELECT_CHANNEL', payload: channelId })
		}

		return newChannel
	}

	const createForumPost = (forumChannelId: string, title: string, content: string): StageChannel => {
		const guildId = state.selectedGuildId
		if (!guildId) {
			throw new Error('No guild selected')
		}

		const author = state.currentUser ?? state.botUser ?? { id: 'user_0', username: 'You', avatar: null }
		const threadId = createLocalId('thread')
		const createdAt = new Date().toISOString()

		const threadChannel: StageChannel = {
			id: threadId,
			name: title.trim() || 'New Post',
			type: CHANNEL_TYPE.THREAD_PUBLIC,
			guild_id: guildId,
			parent_id: forumChannelId,
			owner_id: author.id,
			thread_metadata: buildThreadMetadata(),
			message_count: 0
		}

		dispatch({ type: 'INJECT_CHANNELS', payload: [threadChannel] })

		if (content) {
			const firstMessage: StageMessage = {
				id: createLocalId('msg'),
				channel_id: threadId,
				guild_id: guildId,
				author,
				content,
				timestamp: createdAt,
				embeds: [],
				components: [],
				attachments: [],
				reactions: []
			}

			dispatch({
				type: 'INJECT_MESSAGES',
				payload: {
					channelId: threadId,
					messages: [firstMessage]
				}
			})
		}

		return threadChannel
	}

	const createThread = (options: {
		parentChannelId: string
		name: string
		content: string
		isPrivate?: boolean
	}): StageChannel => {
		const guildId = state.selectedGuildId
		if (!guildId) {
			throw new Error('No guild selected')
		}

		const author = state.currentUser ?? state.botUser ?? { id: 'user_0', username: 'You', avatar: null }
		const threadId = createLocalId('thread')
		const createdAt = new Date().toISOString()
		const threadName = options.name.trim() || 'New Thread'
		const isPrivate = Boolean(options.isPrivate)

		const threadChannel: StageChannel = {
			id: threadId,
			name: threadName,
			type: isPrivate ? CHANNEL_TYPE.THREAD_PRIVATE : CHANNEL_TYPE.THREAD_PUBLIC,
			guild_id: guildId,
			parent_id: options.parentChannelId,
			owner_id: author.id,
			thread_metadata: buildThreadMetadata(),
			message_count: 0
		}

		dispatch({ type: 'INJECT_CHANNELS', payload: [threadChannel] })

		if (options.content.trim()) {
			const firstMessage: StageMessage = {
				id: createLocalId('msg'),
				channel_id: threadId,
				guild_id: guildId,
				author,
				content: options.content.trim(),
				timestamp: createdAt,
				embeds: [],
				components: [],
				attachments: [],
				reactions: []
			}

			dispatch({
				type: 'INJECT_MESSAGES',
				payload: {
					channelId: threadId,
					messages: [firstMessage]
				}
			})
		}

		const threadCreatedMessage: StageMessage = {
			id: createLocalId('msg'),
			channel_id: options.parentChannelId,
			guild_id: guildId,
			author,
			content: '',
			timestamp: createdAt,
			embeds: [],
			components: [],
			attachments: [],
			reactions: [],
			type: 18,
			thread_id: threadId,
			thread_name: threadName,
			thread_owner: author,
			thread_message_count: options.content.trim() ? 1 : 0,
			thread_last_message_at: createdAt
		}

		dispatch({
			type: 'INJECT_MESSAGES',
			payload: {
				channelId: options.parentChannelId,
				messages: [threadCreatedMessage]
			}
		})

		return threadChannel
	}

	// Send message command with pending state tracking
	const sendMessage = async (content: string, channelId?: string, messageReference?: { message_id: string; channel_id?: string; guild_id?: string }) => {
		const targetChannelId = channelId || state.selectedChannelId
		if (!targetChannelId) {
			throw new Error('No channel selected')
		}

		// Create pending message ID
		const pendingId = `pending_${Date.now()}_${Math.random().toString(36).slice(2)}`

		// Get current user info (use a default if not available)
		const author = {
			id: 'user_0',
			username: 'You',
			avatar: null
		}

		// Add to pending messages
		const pendingMessage: PendingMessage = {
			id: pendingId,
			content,
			channelId: targetChannelId,
			state: 'sending',
			author,
			createdAt: Date.now()
		}
		dispatch({ type: 'ADD_PENDING_MESSAGE', payload: pendingMessage })

		const targetChannel = state.channels.find((channel) => channel.id === targetChannelId)
		const isThreadChannel = targetChannel ? [10, 11, 12].includes(targetChannel.type) : false
		const isLocalThread = isThreadChannel || targetChannelId.startsWith('thread_')

		try {
			if (isLocalThread) {
				const author: StageUser = state.currentUser || state.botUser || {
					id: 'user_0',
					username: 'You',
					avatar: null
				}

				const message: StageMessage = {
					id: createLocalId('msg'),
					channel_id: targetChannelId,
					guild_id: state.selectedGuildId ?? undefined,
					author,
					content,
					timestamp: new Date().toISOString(),
					embeds: [],
					components: [],
					attachments: [],
					reactions: [],
					message_reference: messageReference
				}

				dispatch({ type: 'REMOVE_PENDING_MESSAGE', payload: pendingId })
				dispatch({ type: 'INJECT_MESSAGES', payload: { channelId: targetChannelId, messages: [message] } })
				return { message_id: message.id }
			}

			const result = await sendCommand('send_message', {
				channel_id: targetChannelId,
				content,
				...(messageReference && { message_reference: messageReference })
			})
			// Remove pending message on success (the real message will be added via message_create event)
			dispatch({ type: 'REMOVE_PENDING_MESSAGE', payload: pendingId })
			return result
		} catch (err) {
			// Mark as failed
			dispatch({
				type: 'MARK_MESSAGE_FAILED',
				payload: {
					id: pendingId,
					error: err instanceof Error ? err.message : 'Failed to send message'
				}
			})
			throw err
		}
	}

	// Retry a failed pending message
	const retryMessage = async (messageId: string) => {
		const pendingMessage = state.pendingMessages.find((m) => m.id === messageId)
		if (!pendingMessage) return

		// Remove the failed message and resend
		dispatch({ type: 'REMOVE_PENDING_MESSAGE', payload: messageId })
		return sendMessage(pendingMessage.content, pendingMessage.channelId)
	}

	// Cancel/remove a pending message
	const cancelMessage = (messageId: string) => {
		dispatch({ type: 'REMOVE_PENDING_MESSAGE', payload: messageId })
	}

	// Invoke slash command
	const invokeCommand = async (commandName: string, options?: Record<string, unknown>, channelId?: string) => {
		const targetChannelId = channelId || state.selectedChannelId
		if (!targetChannelId) {
			throw new Error('No channel selected')
		}

		const normalizedCommandName = commandName.startsWith('/') ? commandName.slice(1) : commandName
		const interactionUser: StageUser = state.users.find((user) => user.id === 'user_0') || {
			id: 'user_0',
			username: 'You',
			avatar: null
		}
		const responseAuthor: StageUser = state.botUser
			? { ...state.botUser, bot: true }
			: {
					id: 'bot_0',
					username: 'Mock Bot',
					avatar: null,
					bot: true
				}
		const interactionId = `interaction_${Date.now()}_${Math.random().toString(36).slice(2)}`
		const responseMessage: StageMessage = {
			id: `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
			channel_id: targetChannelId,
			guild_id: state.selectedGuildId ?? undefined,
			author: responseAuthor,
			content: normalizedCommandName === 'ping' ? 'Pong!' : `Received /${normalizedCommandName}.`,
			timestamp: new Date().toISOString(),
			embeds: [],
			components: [],
			attachments: [],
			reactions: [],
			interaction_metadata: {
				id: interactionId,
				type: 2,
				user: interactionUser
			},
			interaction: {
				id: interactionId,
				type: 2,
				name: normalizedCommandName,
				user: interactionUser
			}
		}

		const result = await sendCommand('invoke_command', {
			channel_id: targetChannelId,
			command_name: normalizedCommandName,
			options
		})

		dispatch({
			type: 'INJECT_MESSAGES',
			payload: {
				channelId: targetChannelId,
				messages: [responseMessage]
			}
		})

		return result
	}

	// Click a button component
	const clickButton = async (messageId: string, customId: string, channelId?: string) => {
		const targetChannelId = channelId || state.selectedChannelId
		if (!targetChannelId) {
			throw new Error('No channel selected')
		}

		return sendCommand('click_button', {
			channel_id: targetChannelId,
			message_id: messageId,
			custom_id: customId
		})
	}

	// Select option(s) from a select menu
	const selectOption = async (messageId: string, customId: string, values: string[], channelId?: string) => {
		const targetChannelId = channelId || state.selectedChannelId
		if (!targetChannelId) {
			throw new Error('No channel selected')
		}

		return sendCommand('select_option', {
			channel_id: targetChannelId,
			message_id: messageId,
			custom_id: customId,
			values
		})
	}

	// Add a reaction to a message
	const addReaction = async (messageId: string, emoji: string, channelId?: string) => {
		const targetChannelId = channelId || state.selectedChannelId
		if (!targetChannelId) {
			throw new Error('No channel selected')
		}

		return sendCommand('add_reaction', {
			channel_id: targetChannelId,
			message_id: messageId,
			emoji
		})
	}

	// Remove a reaction from a message
	const removeReaction = async (messageId: string, emoji: string, channelId?: string) => {
		const targetChannelId = channelId || state.selectedChannelId
		if (!targetChannelId) {
			throw new Error('No channel selected')
		}

		return sendCommand('remove_reaction', {
			channel_id: targetChannelId,
			message_id: messageId,
			emoji
		})
	}

	// Submit a modal form (Phase 5M)
	const submitModal = async (customId: string, components: ModalActionRow[]) => {
		return sendCommand('submit_modal', {
			custom_id: customId,
			components
		})
	}

	// Close the active modal (Phase 5M)
	const closeModal = () => {
		dispatch({ type: 'CLOSE_MODAL' })
	}

	// Invoke context menu command (Phase 5N)
	const invokeContextCommand = async (
		commandName: string,
		commandType: 2 | 3,
		targetId: string,
		targetData: StageMessage | StageUser,
		channelId?: string
	) => {
		const targetChannelId = channelId || state.selectedChannelId
		if (!targetChannelId) {
			throw new Error('No channel selected')
		}

		return sendCommand('invoke_context_command', {
			channel_id: targetChannelId,
			command_name: commandName,
			command_type: commandType,
			target_id: targetId,
			...(commandType === 3 && { message: targetData }),
			...(commandType === 2 && { user: targetData })
		})
	}

	// Pin a message (Phase 5N enhancement)
	const pinMessage = async (channelId: string, messageId: string) => {
		const response = await fetch(`/api/v10/channels/${channelId}/pins/${messageId}`, {
			method: 'PUT'
		})
		if (!response.ok) {
			throw new Error('Failed to pin message')
		}
		// Update local state - the gateway event will handle this via MESSAGE_UPDATE
	}

	// Unpin a message (Phase 5N enhancement)
	const unpinMessage = async (channelId: string, messageId: string) => {
		const response = await fetch(`/api/v10/channels/${channelId}/pins/${messageId}`, {
			method: 'DELETE'
		})
		if (!response.ok) {
			throw new Error('Failed to unpin message')
		}
		// Update local state - the gateway event will handle this via MESSAGE_UPDATE
	}

	// Open a DM channel with a user (Phase 5N enhancement)
	const openDM = async (userId: string) => {
		const response = await fetch('/api/v10/users/@me/channels', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ recipient_id: userId })
		})
		if (!response.ok) {
			throw new Error('Failed to open DM')
		}
		const dmChannel = await response.json()
		// Add the DM channel to state and select it
		dispatch({ type: 'ADD_DM_CHANNEL', payload: dmChannel })
		dispatch({ type: 'SELECT_CHANNEL', payload: dmChannel.id })
		return dmChannel
	}

	// Set the message being replied to (Phase 5N enhancement)
	const setReplyingTo = (message: StageMessage) => {
		dispatch({ type: 'SET_REPLYING_TO', payload: message })
	}

	// Clear the reply state (Phase 5N enhancement)
	const clearReplyingTo = () => {
		dispatch({ type: 'CLEAR_REPLYING_TO' })
	}

	// Clear filtered events warnings (Intent diagnostics)
	const clearFilteredEvents = () => {
		dispatch({ type: 'CLEAR_FILTERED_EVENTS' })
	}

	// Clear loop warning
	const clearLoopWarning = () => {
		dispatch({ type: 'CLEAR_LOOP_WARNING' })
	}

	// Join a voice channel (Phase 5P)
	const joinVoice = async (channelId: string, guildId?: string, userId?: string) => {
		const targetGuildId = guildId || state.selectedGuildId
		if (!targetGuildId) {
			throw new Error('No guild selected')
		}

		// Use provided userId, or fall back to current user, then bot user
		const targetUserId = userId || state.currentUser?.id || state.botUser?.id

		return sendCommand('join_voice', {
			channel_id: channelId,
			guild_id: targetGuildId,
			user: targetUserId ? { id: targetUserId } : undefined
		})
	}

	// Leave voice channel (Phase 5P)
	const leaveVoice = async (guildId?: string, userId?: string) => {
		const targetGuildId = guildId || state.selectedGuildId
		if (!targetGuildId) {
			throw new Error('No guild selected')
		}

		// Use provided userId, or fall back to current user, then bot user
		const targetUserId = userId || state.currentUser?.id || state.botUser?.id

		return sendCommand('leave_voice', {
			guild_id: targetGuildId,
			user: targetUserId ? { id: targetUserId } : undefined
		})
	}

	// Update voice state (mute/deafen) (Phase 5P)
	const updateVoiceState = async (
		guildId?: string,
		updates?: { selfMute?: boolean; selfDeaf?: boolean; userId?: string }
	) => {
		const targetGuildId = guildId || state.selectedGuildId
		if (!targetGuildId) {
			throw new Error('No guild selected')
		}

		const targetUserId = updates?.userId || state.currentUser?.id || state.botUser?.id

		return sendCommand('update_voice_state', {
			guild_id: targetGuildId,
			self_mute: updates?.selfMute,
			self_deaf: updates?.selfDeaf,
			user: targetUserId ? { id: targetUserId } : undefined
		})
	}

	return {
		// State
		...state,
		isConnected: isConnected || state.isConnected,
		isConnecting: isConnecting || state.isConnecting,
		error: error || state.error,

		// Stale token handling
		hasGivenUp,
		isSessionInvalid,
		retryCount,
		retry,

		// Derived state
		selectedGuild,
		selectedChannel,
		guildChannels,
		guildMembers,
		guildRoles,
		channelMessages,
		channelTypingUsers,
		channelPendingInteractions,
		channelPendingMessages,
		slashCommands,
		userCommands,
		messageCommands,
		guildVoiceStates,
		filteredEvents: state.filteredEvents,
		loopWarning: state.loopWarning,
		voicePanel: state.voicePanel,
		voicePanelMode:
			state.voicePanel.channelId && state.voicePanel.channelId === state.selectedChannelId
				? state.voicePanel.mode
				: 'closed',

		// Connection
		connect,
		disconnect,

		// Actions
		setSessionId,
		selectGuild,
		selectChannel,
		toggleMembers,
		openVoicePanel,
		setVoicePanelMode,
		closeVoicePanel,
		deleteThread,
		createChannel,
		createForumPost,
		createThread,

		// Commands
		sendCommand,
		sendMessage,
		retryMessage,
		cancelMessage,
		invokeCommand,
		clickButton,
		selectOption,
		addReaction,
		removeReaction,
		submitModal,
		closeModal,
		invokeContextCommand,
		pinMessage,
		unpinMessage,
		openDM,
		setReplyingTo,
		clearReplyingTo,
		clearFilteredEvents,
		clearLoopWarning,
		joinVoice,
		leaveVoice,
		updateVoiceState
	}
}

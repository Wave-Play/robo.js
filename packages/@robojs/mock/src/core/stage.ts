import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import WebSocket, { WebSocketServer } from 'ws'
import { sessionManager } from './manager.js'
import { mockLogger } from './logger.js'
import type {
	StageEvent,
	StageCommand,
	StageConnectionState,
	StateSyncPayload,
	StageServerConfig,
	BufferedStageEvent,
	StageGuild,
	StageChannel,
	StageUser,
	StageMember,
	StageRole,
	StageVoiceState,
	StageMessage,
	StageApplicationCommand,
	StageApplicationCommandOption,
	StageCommandResponseData,
	StageSendMessageData,
	StageInvokeCommandData,
	StageInvokeContextCommandData,
	StageClickButtonData,
	StageSelectOptionData,
	StageSubscribeChannelData,
	StageSubmitModalData,
	StageStartTypingData,
	StageAddReactionData,
	StageRemoveReactionData,
	StageJoinVoiceData,
	StageLeaveVoiceData,
	StageUpdateVoiceStateData,
	StageSetCurrentUserData,
	StageSwitchUserData
} from '../types/stage.js'
import type { MockApplicationCommand, MockApplicationCommandOption } from '../types/index.js'
import type { Session } from '../types/index.js'
import { safeStringify } from '../utils/json.js'

// Default configuration values
const DEFAULT_MAX_BUFFER_SIZE = 1000
const DEFAULT_HEARTBEAT_INTERVAL = 30000  // 30 seconds
const DEFAULT_MAX_MESSAGES_PER_CHANNEL = 50

/**
 * Stage WebSocket server for real-time event streaming to test clients
 * This is separate from the Discord Gateway - it's for monitoring and controlling
 * the mock server during testing.
 */
export class StageServer {
	private wss: WebSocketServer
	private connections: Map<WebSocket, StageConnectionState> = new Map()
	private eventBuffers: Map<string, BufferedStageEvent[]> = new Map()  // sessionId -> events
	private sessionSequences: Map<string, number> = new Map()  // sessionId -> last seq (for replay)
	private heartbeatIntervals: Map<WebSocket, NodeJS.Timeout> = new Map()

	private readonly maxBufferSize: number
	private readonly heartbeatInterval: number
	private readonly maxMessagesPerChannel: number

	constructor(config?: StageServerConfig) {
		this.maxBufferSize = config?.maxBufferSize ?? DEFAULT_MAX_BUFFER_SIZE
		this.heartbeatInterval = config?.heartbeatInterval ?? DEFAULT_HEARTBEAT_INTERVAL
		this.maxMessagesPerChannel = config?.maxMessagesPerChannel ?? DEFAULT_MAX_MESSAGES_PER_CHANNEL

		this.wss = new WebSocketServer({ noServer: true })
		this.wss.on('connection', this.handleConnection.bind(this))
	}

	/**
	 * Handle HTTP upgrade request
	 * Called by @robojs/server when a WebSocket upgrade is requested at /stage/ws
	 *
	 * Supports two authentication methods:
	 * - `?token=mock:session_xxx` - Full session token
	 * - `?session=sess_xxx` - Just session ID (for convenience)
	 *
	 * Note: We accept connections even for invalid tokens, then send a session_invalid
	 * event before closing. This allows clients to receive a proper message instead of
	 * just seeing a connection failure.
	 */
	handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
		mockLogger.debug('Stage handleUpgrade called with URL:', req.url)
		mockLogger.debug('Socket writable:', socket.writable, 'destroyed:', socket.destroyed)

		const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

		// Try to find session by token first, then by session ID
		const token = url.searchParams.get('token')
		const sessionId = url.searchParams.get('session')
		mockLogger.debug('Parsed token:', token?.substring(0, 30) + '...', 'sessionId:', sessionId)

		// Reject if no token/session provided at all (this is a client bug)
		if (!token && !sessionId) {
			mockLogger.warn('Stage connection rejected: missing token or session parameter')
			socket.write('HTTP/1.1 401 Unauthorized\r\nContent-Type: text/plain\r\n\r\nMissing token or session parameter\r\n')
			socket.destroy()
			return
		}

		// Try to resolve session (may be undefined for invalid tokens)
		let session: Session | undefined
		let resolvedSessionId: string | null = null

		if (token) {
			session = sessionManager.getByToken(token)
			// Extract session ID from token for logging even if session doesn't exist
			// Token format: "mock:sess_xxx" or just "sess_xxx"
			resolvedSessionId = token.startsWith('mock:') ? token.slice(5) : token
		} else if (sessionId) {
			session = sessionManager.get(sessionId)
			resolvedSessionId = sessionId
		}

		// Extract last_seq for reconnection replay
		const lastSeqParam = url.searchParams.get('last_seq')
		const lastSeq = lastSeqParam ? parseInt(lastSeqParam, 10) : 0

		// Complete the WebSocket upgrade - we'll validate session in handleConnection
		// This allows us to send a proper session_invalid event to the client
		mockLogger.debug('Calling wss.handleUpgrade...')
		this.wss.handleUpgrade(req, socket, head, (ws) => {
			mockLogger.debug('wss.handleUpgrade callback fired, ws readyState:', ws.readyState)
			// Store session ID (or attempted ID) and lastSeq in socket for later use
			;(ws as WebSocket & { _stageSessionId: string; _lastSeq: number; _sessionValid: boolean })._stageSessionId = session?.id ?? resolvedSessionId ?? ''
			;(ws as WebSocket & { _stageSessionId: string; _lastSeq: number; _sessionValid: boolean })._lastSeq = lastSeq
			;(ws as WebSocket & { _stageSessionId: string; _lastSeq: number; _sessionValid: boolean })._sessionValid = !!session
			mockLogger.debug('Emitting connection event for session:', session?.id ?? resolvedSessionId)
			this.wss.emit('connection', ws, req)
		})
	}

	/**
	 * Handle new WebSocket connection
	 */
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	private handleConnection(ws: WebSocket, _req: IncomingMessage): void {
		mockLogger.debug('handleConnection called, ws.readyState:', ws.readyState, 'OPEN=', WebSocket.OPEN)

		const sessionId = (ws as WebSocket & { _stageSessionId: string })._stageSessionId
		const lastSeq = (ws as WebSocket & { _lastSeq: number })._lastSeq || 0
		const sessionValid = (ws as WebSocket & { _sessionValid: boolean })._sessionValid

		mockLogger.debug('Session lookup - id:', sessionId, 'valid:', sessionValid)

		// If session is invalid, send session_invalid event and close
		// This allows the client to receive a proper message instead of just seeing connection failure
		if (!sessionValid) {
			mockLogger.debug(`Stage connection rejected: invalid session "${sessionId}"`)
			ws.send(JSON.stringify({
				seq: 0,
				timestamp: Date.now(),
				type: 'session_invalid',
				data: {
					reason: 'Session not found or expired',
					code: 4001
				}
			}))
			ws.close(4001, 'Invalid session')
			return
		}

		mockLogger.debug(`Stage connection established for session ${sessionId}`)

		// Create connection state
		const connState: StageConnectionState = {
			id: `stage_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
			sessionId,
			authenticated: true,  // Already authenticated via token
			lastSeq: 0,
			subscribedChannels: new Set(),
			connectedAt: Date.now()
		}
		this.connections.set(ws, connState)

		// Send connected event
		this.pushEvent(ws, connState, {
			type: 'connected',
			data: {
				sessionId,
				connectionId: connState.id
			}
		})

		// Send state sync
		const session = sessionManager.get(sessionId)
		if (session) {
			this.sendStateSync(ws, connState, session)
		}

		// Replay buffered events if reconnecting
		if (lastSeq > 0) {
			this.replayEvents(ws, connState, sessionId, lastSeq)
		}

		// Start heartbeat
		const heartbeat = setInterval(() => {
			if (ws.readyState === WebSocket.OPEN) {
				this.pushEvent(ws, connState, { type: 'heartbeat', data: {} })
			} else {
				clearInterval(heartbeat)
			}
		}, this.heartbeatInterval)
		this.heartbeatIntervals.set(ws, heartbeat)

		// Handle incoming messages (commands)
		ws.on('message', (data, isBinary) => {
			this.handleMessage(ws, connState, data, isBinary)
		})

		// Handle connection close
		ws.on('close', (code, reason) => {
			this.handleClose(ws, connState, code, reason.toString())
		})

		// Handle errors
		ws.on('error', (err) => {
			mockLogger.error('Stage WebSocket error:', err)
		})
	}

	/**
	 * Send state sync payload to a newly connected client
	 */
	private sendStateSync(ws: WebSocket, connState: StageConnectionState, session: Session): void {
		const state = session.state

		// Get last 1,000 logs for history (balance between completeness and payload size)
		const allLogs = session.getLogs()
		const recentLogs = allLogs.slice(-1000)

		// Build simplified state for stage client
		const payload: StateSyncPayload = {
			session: {
				id: session.id,
				createdAt: session.createdAt,
				bot: state.botUser ? this.toStageUser(state.botUser) : null
			},
			guilds: Array.from(state.guilds.values()).map((g) => this.toStageGuild(g)),
			channels: Array.from(state.channels.values()).map((c) => this.toStageChannel(c)),
			members: this.getStageMembers(state),
			roles: this.getStageRoles(state),
			messages: this.getRecentMessagesByChannel(state),
			users: Array.from(state.users.values()).map((u) => this.toStageUser(u)),
			commands: Array.from(state.commands.values()).map((c) => this.toStageCommand(c)),
			voice_states: this.getStageVoiceStates(state),
			currentUser: this.toStageUser(state.currentUser),
			logs: recentLogs.length > 0 ? recentLogs : undefined
		}

		this.pushEvent(ws, connState, {
			type: 'state_sync',
			data: payload
		})
	}

	/**
	 * Convert MockGuild to StageGuild
	 */
	private toStageGuild(guild: { id: string; name: string; icon?: string | null; ownerId?: string; memberCount?: number }): StageGuild {
		return {
			id: guild.id,
			name: guild.name,
			icon: guild.icon ?? null,
			owner_id: guild.ownerId,
			member_count: guild.memberCount
		}
	}

	/**
	 * Convert MockChannel to StageChannel
	 */
	private toStageChannel(channel: { id: string; name: string; type: number; guildId?: string; parentId?: string | null; position?: number; topic?: string | null; recipientIds?: string[] }): StageChannel {
		return {
			id: channel.id,
			name: channel.name,
			type: channel.type,
			guild_id: channel.guildId,
			parent_id: channel.parentId,
			position: channel.position,
			topic: channel.topic,
			recipient_ids: channel.recipientIds
		}
	}

	/**
	 * Convert MockUser to StageUser
	 */
	private toStageUser(user: { id: string; username: string; discriminator?: string; avatar?: string | null; bot?: boolean; status?: 'online' | 'offline' | 'idle' | 'dnd'; activities?: Array<{ name: string; type: number; state?: string; url?: string }> }): StageUser {
		return {
			id: user.id,
			username: user.username,
			global_name: user.globalName ?? undefined,
			discriminator: user.discriminator,
			avatar: user.avatar ?? null,
			bot: user.bot,
			status: user.status,
			activities: user.activities
		}
	}

	private toStageMemberForGuild(state: Session['state'], guildId: string, userId: string): StageMember | null {
		const user = state.users.get(userId)
		if (!user) {
			return null
		}
		const member = state.getGuildMember(guildId, userId)
		return {
			user: this.toStageUser(user),
			nick: member?.nick ?? null,
			roles: member?.roles ?? [],
			joined_at: member?.joinedAt,
			guild_id: guildId
		}
	}

	/**
	 * Convert MockMessage to StageMessage
	 */
	private toStageMessage(message: {
		id: string
		channelId: string
		guildId?: string
		author?: { id: string; username: string; discriminator?: string; avatar?: string | null; bot?: boolean; globalName?: string | null }
		content: string
		timestamp: string
		editedTimestamp?: string | null
		embeds?: unknown[]
		components?: unknown[]
		attachments?: unknown[]
		reactions?: Array<{ count: number; me: boolean; emoji: { id: string | null; name: string } }>
		interaction_metadata?: {
			id: string
			type: number
			user: { id: string; username: string; discriminator?: string; avatar?: string | null; bot?: boolean; globalName?: string | null }
			authorizing_integration_owners?: Record<number, string>
			original_response_message_id?: string
			target_user?: { id: string; username: string; discriminator?: string; avatar?: string | null; bot?: boolean; globalName?: string | null }
			target_message_id?: string
		}
		interaction?: {
			id: string
			type: number
			name?: string
			user: { id: string; username: string; discriminator?: string; avatar?: string | null; bot?: boolean; globalName?: string | null }
		}
	}): StageMessage {
		return {
			id: message.id,
			channel_id: message.channelId,
			guild_id: message.guildId,
			author: message.author ? this.toStageUser(message.author) : { id: '0', username: 'Unknown', avatar: null },
			content: message.content,
			timestamp: message.timestamp,
			edited_timestamp: message.editedTimestamp,
			embeds: message.embeds ?? [],
			components: message.components ?? [],
			attachments: message.attachments ?? [],
			reactions: message.reactions?.map((r) => ({
				count: r.count,
				me: r.me,
				emoji: {
					id: r.emoji.id,
					name: r.emoji.name
				}
			})),
			interaction_metadata: message.interaction_metadata
				? {
						id: message.interaction_metadata.id,
						type: message.interaction_metadata.type,
						user: this.toStageUser(message.interaction_metadata.user),
						authorizing_integration_owners: message.interaction_metadata.authorizing_integration_owners,
						original_response_message_id: message.interaction_metadata.original_response_message_id,
						target_user: message.interaction_metadata.target_user
							? this.toStageUser(message.interaction_metadata.target_user)
							: undefined,
						target_message_id: message.interaction_metadata.target_message_id
					}
				: undefined,
			interaction: message.interaction
				? {
						id: message.interaction.id,
						type: message.interaction.type,
						name: message.interaction.name,
						user: this.toStageUser(message.interaction.user)
					}
				: undefined
		}
	}

	/**
	 * Convert MockApplicationCommand to StageApplicationCommand
	 */
	private toStageCommand(cmd: MockApplicationCommand): StageApplicationCommand {
		return {
			id: cmd.id,
			name: cmd.name,
			description: cmd.description,
			type: cmd.type ?? 1, // Default to ChatInput if not specified
			options: cmd.options?.map(opt => this.toStageCommandOption(opt))
		}
	}

	/**
	 * Convert MockApplicationCommandOption to StageApplicationCommandOption
	 */
	private toStageCommandOption(opt: MockApplicationCommandOption): StageApplicationCommandOption {
		return {
			type: opt.type,
			name: opt.name,
			description: opt.description,
			required: opt.required,
			choices: opt.choices?.map(c => ({ name: c.name, value: c.value })),
			options: opt.options?.map(o => this.toStageCommandOption(o)),
			channel_types: opt.channel_types,
			min_value: opt.min_value,
			max_value: opt.max_value,
			min_length: opt.min_length,
			max_length: opt.max_length,
			autocomplete: opt.autocomplete
		}
	}

	/**
	 * Get all guild members as StageMember array
	 */
	private getStageMembers(state: Session['state']): StageMember[] {
		const members: StageMember[] = []
		for (const [key, member] of state.guildMembers) {
			const [guildId] = key.split(':')
			const user = state.users.get(member.userId)
			if (user) {
				members.push({
					user: this.toStageUser(user),
					nick: member.nick,
					roles: member.roles,
					joined_at: member.joinedAt,
					guild_id: guildId
				})
			}
		}
		return members
	}

	/**
	 * Get all guild roles as StageRole array (Phase 5H)
	 */
	private getStageRoles(state: Session['state']): StageRole[] {
		const roles: StageRole[] = []
		for (const role of state.roles.values()) {
			roles.push({
				id: role.id,
				name: role.name,
				color: role.color,
				position: role.position,
				guild_id: role.guildId,
				hoist: role.hoist
			})
		}
		// Sort by position descending (highest first)
		return roles.sort((a, b) => b.position - a.position)
	}

	/**
	 * Get all voice states as StageVoiceState array (Phase 5P)
	 */
	private getStageVoiceStates(state: Session['state']): StageVoiceState[] {
		const voiceStates: StageVoiceState[] = []
		for (const vs of state.voiceStates.values()) {
			// Only include voice states with a channel (i.e., user is in voice)
			if (vs.channel_id) {
				voiceStates.push({
					guild_id: vs.guild_id,
					channel_id: vs.channel_id,
					user_id: vs.user_id,
					self_mute: vs.self_mute ?? false,
					self_deaf: vs.self_deaf ?? false,
					mute: vs.mute ?? false,
					deaf: vs.deaf ?? false,
					self_stream: vs.self_stream,
					self_video: vs.self_video,
					speaking: (vs as { speaking?: boolean }).speaking
				})
			}
		}
		return voiceStates
	}

	/**
	 * Get recent messages grouped by channel
	 */
	private getRecentMessagesByChannel(state: Session['state']): Record<string, StageMessage[]> {
		const result: Record<string, StageMessage[]> = {}

		// Group messages by channel
		const byChannel = new Map<string, Array<Session['state']['messages'] extends Map<string, infer M> ? M : never>>()
		for (const message of state.messages.values()) {
			const channelId = message.channelId
			if (!byChannel.has(channelId)) {
				byChannel.set(channelId, [])
			}
			byChannel.get(channelId)!.push(message)
		}

		// Sort by timestamp and take most recent per channel
		for (const [channelId, messages] of byChannel) {
			const sorted = messages
				.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
				.slice(0, this.maxMessagesPerChannel)
				.reverse()  // Oldest first

			result[channelId] = sorted.map(m => {
				const author = state.users.get(m.authorId)
				return this.toStageMessage({
					...m,
					author: author ? { id: author.id, username: author.username, avatar: author.avatar, bot: author.bot } : undefined
				})
			})
		}

		return result
	}

	/**
	 * Replay buffered events for reconnection
	 */
	private replayEvents(ws: WebSocket, connState: StageConnectionState, sessionId: string, fromSeq: number): void {
		const buffer = this.eventBuffers.get(sessionId)
		if (!buffer) return

		const eventsToReplay = buffer.filter(b => b.event.seq > fromSeq)
		mockLogger.debug(`Replaying ${eventsToReplay.length} events from seq ${fromSeq} for session ${sessionId}`)

		for (const buffered of eventsToReplay) {
			if (ws.readyState === WebSocket.OPEN) {
				// Re-send the event with updated connection sequence
				connState.lastSeq = buffered.event.seq
				ws.send(JSON.stringify(buffered.event))
			}
		}
	}

	/**
	 * Handle incoming WebSocket message (command from stage client)
	 */
	private handleMessage(ws: WebSocket, connState: StageConnectionState, data: WebSocket.RawData, isBinary: boolean): void {
		// Reject binary frames
		if (isBinary) {
			this.sendError(ws, connState, 'Binary frames not supported')
			return
		}

		// Parse JSON command
		let command: StageCommand
		try {
			command = JSON.parse(data.toString())
		} catch {
			this.sendError(ws, connState, 'Invalid JSON')
			return
		}

		// Validate command structure
		if (!command.id || !command.type) {
			this.sendError(ws, connState, 'Invalid command format: missing id or type')
			return
		}

		mockLogger.debug(`Stage command received: ${command.type} (${command.id})`)

		// Handle the command
		this.handleCommand(ws, connState, command)
	}

	/**
	 * Handle a stage command
	 */
	private async handleCommand(ws: WebSocket, connState: StageConnectionState, command: StageCommand): Promise<void> {
		const session = sessionManager.get(connState.sessionId)
		if (!session) {
			this.sendCommandResponse(ws, connState, command.id, false, undefined, 'Session not found')
			return
		}

		try {
			switch (command.type) {
				case 'send_message': {
					const data = command.data as StageSendMessageData
					const message = await session.dispatchMessage({
						channelId: data.channel_id,
						content: data.content,
						author: data.author ? { id: data.author.id, username: data.author.username } : undefined,
						embeds: data.embeds as unknown[],
						messageReference: data.message_reference
					})
					this.sendCommandResponse(ws, connState, command.id, true, { message_id: message.id })
					break
				}

				case 'invoke_command': {
					const data = command.data as StageInvokeCommandData
					const interaction = await session.dispatchSlashCommand({
						channelId: data.channel_id,
						commandName: data.command_name,
						options: data.options as Record<string, string | number | boolean> | undefined,
						user: data.user ? { id: data.user.id, username: data.user.username } : undefined
					})
					this.sendCommandResponse(ws, connState, command.id, true, { interaction_id: interaction.id })
					break
				}

				case 'invoke_context_command': {
					const data = command.data as StageInvokeContextCommandData
					const interaction = await session.dispatchContextMenu({
						commandName: data.command_name,
						targetId: data.target_id,
						contextMenuType: data.command_type,
						channelId: data.channel_id,
						user: data.user ? { id: data.user.id, username: data.user.username } : undefined
					})
					this.sendCommandResponse(ws, connState, command.id, true, { interaction_id: interaction.id })
					break
				}

				case 'click_button': {
					const data = command.data as StageClickButtonData
					const interaction = await session.dispatchButtonClick({
						channelId: data.channel_id,
						messageId: data.message_id,
						customId: data.custom_id,
						user: data.user ? { id: data.user.id, username: data.user.username } : undefined
					})
					this.sendCommandResponse(ws, connState, command.id, true, { interaction_id: interaction.id })

					// Test mode: If custom_id starts with "test_modal", simulate a modal response
					if (data.custom_id.startsWith('test_modal')) {
						setTimeout(() => {
							this.broadcastToSession(connState.sessionId, {
								type: 'interaction_response',
								data: {
									interactionId: interaction.id,
									response: {
										type: 9, // Modal
										data: {
											custom_id: 'test_modal_form',
											title: 'Test Modal',
											components: [
												{
													type: 1, // ActionRow
													components: [
														{
															type: 4, // TextInput
															custom_id: 'username',
															style: 1, // Short
															label: 'Username',
															placeholder: 'Enter your username',
															required: true,
															min_length: 3,
															max_length: 32
														}
													]
												},
												{
													type: 1, // ActionRow
													components: [
														{
															type: 4, // TextInput
															custom_id: 'feedback',
															style: 2, // Paragraph
															label: 'Feedback',
															placeholder: 'Tell us what you think...',
															required: false,
															max_length: 1000
														}
													]
												}
											]
										}
									}
								}
							})
						}, 100) // Small delay to simulate network
					}
					break
				}

				case 'select_option': {
					const data = command.data as StageSelectOptionData
					const interaction = await session.dispatchSelectMenu({
						channelId: data.channel_id,
						messageId: data.message_id,
						customId: data.custom_id,
						values: data.values,
						user: data.user ? { id: data.user.id, username: data.user.username } : undefined
					})
					this.sendCommandResponse(ws, connState, command.id, true, { interaction_id: interaction.id })
					break
				}

				case 'submit_modal': {
					const data = command.data as StageSubmitModalData
					// Convert components array to fields record
					// Components format: [{ type: 1, components: [{ type: 4, custom_id: 'field1', value: 'value1' }] }]
					// Fields format: { 'field1': 'value1' }
					const fields: Record<string, string> = {}
					if (Array.isArray(data.components)) {
						for (const row of data.components) {
							const rowData = row as { type: number; components?: Array<{ custom_id?: string; value?: string }> }
							if (rowData.components && Array.isArray(rowData.components)) {
								for (const component of rowData.components) {
									if (component.custom_id && component.value !== undefined) {
										fields[component.custom_id] = String(component.value)
									}
								}
							}
						}
					}
					const interaction = await session.dispatchModalSubmit({
						customId: data.custom_id,
						fields,
						user: data.user ? { id: data.user.id, username: data.user.username } : undefined
					})
					this.sendCommandResponse(ws, connState, command.id, true, { interaction_id: interaction.id })
					break
				}

				case 'start_typing': {
					const data = command.data as StageStartTypingData
					// Dispatch TYPING_START event via Session.dispatch()
					const user = data.user?.id ? session.state.getUser(data.user.id) : session.state.currentUser
					if (!user) {
						this.sendCommandResponse(ws, connState, command.id, false, undefined, 'User not found')
						break
					}
					await session.dispatch('TYPING_START', {
						channel_id: data.channel_id,
						user_id: user.id,
						timestamp: Math.floor(Date.now() / 1000)
					})
					this.sendCommandResponse(ws, connState, command.id, true)
					break
				}

				case 'request_state': {
					// Re-send state sync
					this.sendStateSync(ws, connState, session)
					this.sendCommandResponse(ws, connState, command.id, true)
					break
				}

				case 'subscribe_channel': {
					const data = command.data as StageSubscribeChannelData
					if (data.subscribe) {
						connState.subscribedChannels.add(data.channel_id)
					} else {
						connState.subscribedChannels.delete(data.channel_id)
					}
					this.sendCommandResponse(ws, connState, command.id, true, {
						subscribed: Array.from(connState.subscribedChannels)
					})
					break
				}

				case 'add_reaction': {
					const data = command.data as StageAddReactionData
					const user = data.user?.id ? session.state.getUser(data.user.id) : session.state.currentUser
					if (!user) {
						this.sendCommandResponse(ws, connState, command.id, false, undefined, 'User not found')
						break
					}
					const channel = session.state.channels.get(data.channel_id)
					const success = await session.dispatchReaction({
						action: 'add',
						messageId: data.message_id,
						channelId: data.channel_id,
						userId: user.id,
						emoji: { id: null, name: data.emoji },
						guildId: channel?.guildId
					})
					this.sendCommandResponse(ws, connState, command.id, success, undefined, success ? undefined : 'Message not found')
					break
				}

				case 'remove_reaction': {
					const data = command.data as StageRemoveReactionData
					const user = data.user?.id ? session.state.getUser(data.user.id) : session.state.currentUser
					if (!user) {
						this.sendCommandResponse(ws, connState, command.id, false, undefined, 'User not found')
						break
					}
					const channel = session.state.channels.get(data.channel_id)
					const success = await session.dispatchReaction({
						action: 'remove',
						messageId: data.message_id,
						channelId: data.channel_id,
						userId: user.id,
						emoji: { id: null, name: data.emoji },
						guildId: channel?.guildId
					})
					this.sendCommandResponse(ws, connState, command.id, success, undefined, success ? undefined : 'Message or reaction not found')
					break
				}

				case 'set_playback': {
					// Playback controls will be implemented in Phase 5J
					this.sendCommandResponse(ws, connState, command.id, false, undefined, 'Playback controls not yet implemented')
					break
				}

				case 'join_voice': {
					const data = command.data as StageJoinVoiceData
					const user = data.user?.id ? session.state.getUser(data.user.id) : session.state.currentUser
					if (!user) {
						this.sendCommandResponse(ws, connState, command.id, false, undefined, 'User not found')
						break
					}
					// Update voice state in session
					const voiceStateKey = `${data.guild_id}:${user.id}`
					session.state.voiceStates.set(voiceStateKey, {
						guild_id: data.guild_id,
						channel_id: data.channel_id,
						user_id: user.id,
						self_mute: data.self_mute ?? false,
						self_deaf: data.self_deaf ?? false,
						mute: false,
						deaf: false
					})
					const stageMember = this.toStageMemberForGuild(session.state, data.guild_id, user.id)
					// Broadcast voice state update to all stage clients
					this.broadcastToSession(connState.sessionId, {
						type: 'voice_state_update',
						data: {
							guild_id: data.guild_id,
							channel_id: data.channel_id,
							user_id: user.id,
							self_mute: data.self_mute ?? false,
							self_deaf: data.self_deaf ?? false,
							mute: false,
							deaf: false,
							member: stageMember ?? undefined
						}
					})
					this.sendCommandResponse(ws, connState, command.id, true, { user_id: user.id })
					break
				}

				case 'leave_voice': {
					const data = command.data as StageLeaveVoiceData
					const user = data.user?.id ? session.state.getUser(data.user.id) : session.state.currentUser
					if (!user) {
						this.sendCommandResponse(ws, connState, command.id, false, undefined, 'User not found')
						break
					}
					const stageMember = this.toStageMemberForGuild(session.state, data.guild_id, user.id)
					// Remove voice state from session
					const voiceStateKey = `${data.guild_id}:${user.id}`
					session.state.voiceStates.delete(voiceStateKey)
					// Broadcast voice state update (null channel = left voice)
					this.broadcastToSession(connState.sessionId, {
						type: 'voice_state_update',
						data: {
							guild_id: data.guild_id,
							channel_id: null,
							user_id: user.id,
							self_mute: false,
							self_deaf: false,
							mute: false,
							deaf: false,
							member: stageMember ?? undefined
						}
					})
					this.sendCommandResponse(ws, connState, command.id, true)
					break
				}

				case 'update_voice_state': {
					const data = command.data as StageUpdateVoiceStateData
					const user = data.user?.id ? session.state.getUser(data.user.id) : session.state.currentUser
					if (!user) {
						this.sendCommandResponse(ws, connState, command.id, false, undefined, 'User not found')
						break
					}
					// Get existing voice state
					const voiceStateKey = `${data.guild_id}:${user.id}`
					const existingState = session.state.voiceStates.get(voiceStateKey)
					if (!existingState) {
						this.sendCommandResponse(ws, connState, command.id, false, undefined, 'User not in voice channel')
						break
					}
					// Update voice state
					const updatedState = {
						...existingState,
						self_mute: data.self_mute ?? existingState.self_mute,
						self_deaf: data.self_deaf ?? existingState.self_deaf
					}
					session.state.voiceStates.set(voiceStateKey, updatedState)
					const stageMember = this.toStageMemberForGuild(session.state, data.guild_id, user.id)
					// Broadcast update
					this.broadcastToSession(connState.sessionId, {
						type: 'voice_state_update',
						data: {
							guild_id: updatedState.guild_id,
							channel_id: updatedState.channel_id,
							user_id: updatedState.user_id,
							self_mute: updatedState.self_mute ?? false,
							self_deaf: updatedState.self_deaf ?? false,
							mute: updatedState.mute ?? false,
							deaf: updatedState.deaf ?? false,
							member: stageMember ?? undefined
						}
					})
					this.sendCommandResponse(ws, connState, command.id, true)
					break
				}

				case 'set_current_user': {
					const data = command.data as StageSetCurrentUserData
					// Update current user properties
					const updatedUser = session.state.updateCurrentUser({
						username: data.username,
						avatar: data.avatar,
						status: data.status,
						activities: data.activities
					})
					// Broadcast current_user_update to all stage clients in this session
					this.broadcastToSession(connState.sessionId, {
						type: 'current_user_update',
						data: { user: this.toStageUser(updatedUser) }
					})
					this.sendCommandResponse(ws, connState, command.id, true, { user: this.toStageUser(updatedUser) })
					break
				}

				case 'switch_user': {
					const data = command.data as StageSwitchUserData
					const switchedUser = session.state.switchCurrentUser(data.user_id)
					if (switchedUser) {
						// Broadcast current_user_update to all stage clients in this session
						this.broadcastToSession(connState.sessionId, {
							type: 'current_user_update',
							data: { user: this.toStageUser(switchedUser) }
						})
						this.sendCommandResponse(ws, connState, command.id, true, { user: this.toStageUser(switchedUser) })
					} else {
						this.sendCommandResponse(ws, connState, command.id, false, undefined, 'User not found')
					}
					break
				}

				default:
					this.sendCommandResponse(ws, connState, command.id, false, undefined, `Unknown command type: ${command.type}`)
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err)
			mockLogger.error(`Stage command error: ${message}`)
			this.sendCommandResponse(ws, connState, command.id, false, undefined, message)
		}
	}

	/**
	 * Send command response to client
	 */
	private sendCommandResponse(
		ws: WebSocket,
		connState: StageConnectionState,
		commandId: string,
		success: boolean,
		result?: unknown,
		error?: string
	): void {
		const data: StageCommandResponseData = {
			command_id: commandId,
			success,
			result,
			error
		}
		this.pushEvent(ws, connState, { type: 'command_response', data })
	}

	/**
	 * Send error event to client
	 */
	private sendError(ws: WebSocket, connState: StageConnectionState, message: string): void {
		this.pushEvent(ws, connState, { type: 'error', data: { message } })
	}

	/**
	 * Get next session-level sequence number
	 */
	private getNextSessionSeq(sessionId: string): number {
		const current = this.sessionSequences.get(sessionId) ?? 0
		const next = current + 1
		this.sessionSequences.set(sessionId, next)
		return next
	}

	/**
	 * Push an event to a specific connection
	 */
	private pushEvent(ws: WebSocket, connState: StageConnectionState, event: Partial<StageEvent>): void {
		// Use session-level sequence for consistent replay across connections
		const seq = this.getNextSessionSeq(connState.sessionId)

		const fullEvent: StageEvent = {
			seq,
			timestamp: Date.now(),
			type: event.type!,
			data: event.data
		}

		// Update connection's lastSeq for tracking
		connState.lastSeq = seq

		// Buffer for reconnection replay
		this.bufferEvent(connState.sessionId, fullEvent)

		// Send to client
		if (ws.readyState === WebSocket.OPEN) {
			const data = safeStringify(fullEvent)
			mockLogger.debug(`Sending stage event: ${fullEvent.type} (seq: ${fullEvent.seq}), data length: ${data.length}`)
			ws.send(data, (err) => {
				if (err) {
					mockLogger.error(`Failed to send stage event: ${err.message}`)
				} else {
					mockLogger.debug(`Stage event sent successfully: ${fullEvent.type}`)
				}
			})
		} else {
			mockLogger.warn(`Cannot send event, ws.readyState is ${ws.readyState} (not OPEN=${WebSocket.OPEN})`)
		}
	}

	/**
	 * Buffer an event for reconnection replay
	 */
	private bufferEvent(sessionId: string, event: StageEvent): void {
		if (!this.eventBuffers.has(sessionId)) {
			this.eventBuffers.set(sessionId, [])
		}

		const buffer = this.eventBuffers.get(sessionId)!
		buffer.push({
			sessionId,
			event,
			bufferedAt: Date.now()
		})

		// LRU eviction if buffer is full
		if (buffer.length > this.maxBufferSize) {
			const evictCount = Math.ceil(this.maxBufferSize * 0.1)  // Remove oldest 10%
			buffer.splice(0, evictCount)
		}
	}

	/**
	 * Broadcast an event to all stage connections for a session
	 * Called by StageBridge when session events occur
	 */
	broadcastToSession(sessionId: string, event: Partial<StageEvent>): void {
		// Generate session-level sequence once for all connections
		const seq = this.getNextSessionSeq(sessionId)

		const fullEvent: StageEvent = {
			seq,
			timestamp: Date.now(),
			type: event.type!,
			data: event.data
		}

		// Buffer event once for replay
		this.bufferEvent(sessionId, fullEvent)

		// Send to all connected clients for this session
		let broadcastCount = 0
		for (const [ws, connState] of this.connections) {
			if (connState.sessionId === sessionId && connState.authenticated) {
				connState.lastSeq = seq
				if (ws.readyState === WebSocket.OPEN) {
					ws.send(JSON.stringify(fullEvent))
					broadcastCount++
				}
			}
		}

		// Skip debug log for log_entry to avoid feedback loop spam
		if (broadcastCount > 0 && event.type !== 'log_entry') {
			mockLogger.debug(`Broadcast ${event.type} (seq: ${seq}) to ${broadcastCount} stage client(s) for session ${sessionId}`)
		}
	}

	/**
	 * Handle connection close
	 */
	private handleClose(ws: WebSocket, connState: StageConnectionState, code: number, reason: string): void {
		// Clear heartbeat interval
		const heartbeat = this.heartbeatIntervals.get(ws)
		if (heartbeat) {
			clearInterval(heartbeat)
			this.heartbeatIntervals.delete(ws)
		}

		// Remove connection
		this.connections.delete(ws)
		mockLogger.debug(`Stage connection closed: ${connState.id} (code: ${code}, reason: ${reason})`)
	}

	/**
	 * Get the number of stage connections for a session
	 */
	getSessionConnectionCount(sessionId: string): number {
		let count = 0
		for (const connState of this.connections.values()) {
			if (connState.sessionId === sessionId) {
				count++
			}
		}
		return count
	}

	/**
	 * Get event buffer stats for a session
	 */
	getBufferStats(sessionId: string): { size: number; oldestSeq: number | null; newestSeq: number | null } {
		const buffer = this.eventBuffers.get(sessionId)
		if (!buffer || buffer.length === 0) {
			return { size: 0, oldestSeq: null, newestSeq: null }
		}
		return {
			size: buffer.length,
			oldestSeq: buffer[0].event.seq,
			newestSeq: buffer[buffer.length - 1].event.seq
		}
	}

	/**
	 * Broadcast a state refresh to all connected stage clients for a session.
	 * Called after state changes like GUILD_CREATE to update stage clients.
	 */
	broadcastStateRefresh(sessionId: string): void {
		const session = sessionManager.get(sessionId)
		if (!session) return

		// Send state_sync to all connected clients for this session
		for (const [ws, connState] of this.connections) {
			if (connState.sessionId === sessionId && connState.authenticated && ws.readyState === WebSocket.OPEN) {
				this.sendStateSync(ws, connState, session)
			}
		}
	}

	/**
	 * Clear event buffer for a session (call when session is deleted)
	 */
	clearSessionBuffer(sessionId: string): void {
		this.eventBuffers.delete(sessionId)
	}

	/**
	 * Refresh state for all connections in a session
	 * Sends a new state_sync to all connected stage clients
	 */
	refreshSessionState(sessionId: string): void {
		const session = sessionManager.get(sessionId)
		if (!session) {
			mockLogger.warn(`Cannot refresh state: session ${sessionId} not found`)
			return
		}

		let refreshCount = 0
		for (const [ws, connState] of this.connections) {
			if (connState.sessionId === sessionId && connState.authenticated && ws.readyState === WebSocket.OPEN) {
				this.sendStateSync(ws, connState, session)
				refreshCount++
			}
		}

		if (refreshCount > 0) {
			mockLogger.debug(`Refreshed state for ${refreshCount} stage client(s) in session ${sessionId}`)
		}
	}

	/**
	 * Broadcast commands update to all stage clients in a session.
	 * More efficient than full state_sync when only commands have changed.
	 */
	broadcastCommandsUpdate(sessionId: string): void {
		const session = sessionManager.get(sessionId)
		if (!session) {
			mockLogger.warn(`Cannot broadcast commands: session ${sessionId} not found`)
			return
		}

		const commands = Array.from(session.state.commands.values()).map((c) => this.toStageCommand(c))
		this.broadcastToSession(sessionId, {
			type: 'commands_updated',
			data: { commands }
		})

		mockLogger.debug(`Broadcast commands_updated (${commands.length} commands) to session ${sessionId}`)
	}

	/**
	 * Broadcast a control action event for toast notifications.
	 * Used to notify all stage clients when control panel actions occur.
	 *
	 * @param sessionId - The session to broadcast to
	 * @param action - The action type (e.g., 'channel_reorder', 'emoji_create', 'emoji_delete')
	 * @param message - Human-readable message for the toast
	 * @param toastType - Type of toast: 'info', 'success', 'warning', 'error'
	 * @param actor - Optional actor information (user or bot who triggered the action)
	 */
	broadcastControlAction(
		sessionId: string,
		action: string,
		message: string,
		toastType: 'info' | 'success' | 'warning' | 'error' = 'success',
		actor?: { type: 'user' | 'bot'; name: string }
	): void {
		this.broadcastToSession(sessionId, {
			type: 'control_action',
			data: {
				action,
				message,
				toastType,
				actor
			}
		})
	}

	/**
	 * Close the stage server
	 */
	close(): void {
		// Clear all heartbeat intervals
		for (const heartbeat of this.heartbeatIntervals.values()) {
			clearInterval(heartbeat)
		}
		this.heartbeatIntervals.clear()

		// Close all connections
		for (const [ws] of this.connections) {
			ws.close(1001, 'Server shutting down')
		}
		this.connections.clear()

		// Clear event buffers
		this.eventBuffers.clear()

		// Close WebSocket server
		this.wss.close()

		mockLogger.debug('Stage server closed')
	}

	/**
	 * Get total number of connections
	 */
	get connectionCount(): number {
		return this.connections.size
	}
}

/**
 * Singleton stage server instance
 */
let _stageServer: StageServer | null = null

/**
 * Get or create the stage server singleton
 */
export function getStageServer(config?: StageServerConfig): StageServer {
	if (!_stageServer) {
		_stageServer = new StageServer(config)
	}
	return _stageServer
}

/**
 * Close and reset the stage server singleton
 */
export function closeStageServer(): void {
	if (_stageServer) {
		_stageServer.close()
		_stageServer = null
	}
}

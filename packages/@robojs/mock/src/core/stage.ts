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
	StageSwitchUserData,
	StageControlCommand,
	StageControlCommandKind,
	StagePlaybackControlPayload,
	StageNavigationControlPayload,
	StageControlResponseData,
	StageLaunchActivityData,
	StageActivityRpcData,
	StageActivityLaunchedData,
	StageActivityClosedData,
	StageActivityRpcOutboundData,
	StageActivitySetUrlMappingsData,
	StageActivitySetCspModeData,
	StageActivityAuthorizeRequestData,
	StageActivityAuthorizeResultData,
	StageActivitySetAuthSettingsData,
	StageActivitySetPlatformStateData,
	StageActivitySetIapStateData,
	StageActivitySetRelationshipsData,
	StageActivitySetQuestsData,
	StageActivityPurchaseResultData,
	StageActivityPurchaseRequestData,
	StageActivitySetOriginModeData,
	StageActivitySetSdkShimData,
	StageActivityEmitEventData
} from '../types/stage.js'
import { getActivityHostManager } from '../activity/host/activity-host-manager.js'
import { getEventMap } from '../activity/schema/manifest-loader.js'
import { onVoiceStateChanged, onPlatformStateChanged, onRelationshipStateChanged, onQuestStateChanged, scheduleParticipantsUpdate, cancelCoalesceTimers } from '../activity/host/signal-engine.js'
import type { MockApplicationCommand, MockApplicationCommandOption, MockUser } from '../types/index.js'
import type { Session } from '../types/index.js'
import { safeStringify } from '../utils/json.js'

// Default configuration values
const DEFAULT_MAX_BUFFER_SIZE = 1000
const DEFAULT_HEARTBEAT_INTERVAL = 30000 // 30 seconds
const DEFAULT_MAX_MESSAGES_PER_CHANNEL = 50
const DEFAULT_CONTROL_COMMAND_TIMEOUT = 5000 // 5 seconds

/**
 * Pending control command awaiting response from Stage UI
 */
interface PendingControlCommand {
	commandId: string
	sessionId: string
	kind: StageControlCommandKind
	resolve: (data: StageControlResponseData) => void
	reject: (error: Error) => void
	timeout: NodeJS.Timeout
}

/**
 * Stage WebSocket server for real-time event streaming to test clients
 * This is separate from the Discord Gateway - it's for monitoring and controlling
 * the mock server during testing.
 */
export class StageServer {
	private wss: WebSocketServer
	private connections: Map<WebSocket, StageConnectionState> = new Map()
	private eventBuffers: Map<string, BufferedStageEvent[]> = new Map() // sessionId -> events
	private sessionSequences: Map<string, number> = new Map() // sessionId -> last seq (for replay)
	private heartbeatIntervals: Map<WebSocket, NodeJS.Timeout> = new Map()
	private pendingControlCommands: Map<string, PendingControlCommand> = new Map() // commandId -> pending
	private sessionCommandLocks: Map<string, Promise<void>> = new Map() // sessionId -> lock for command queuing

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
			socket.write(
				'HTTP/1.1 401 Unauthorized\r\nContent-Type: text/plain\r\n\r\nMissing token or session parameter\r\n'
			)
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
			;(ws as WebSocket & { _stageSessionId: string; _lastSeq: number; _sessionValid: boolean })._stageSessionId =
				session?.id ?? resolvedSessionId ?? ''
			;(ws as WebSocket & { _stageSessionId: string; _lastSeq: number; _sessionValid: boolean })._lastSeq = lastSeq
			;(ws as WebSocket & { _stageSessionId: string; _lastSeq: number; _sessionValid: boolean })._sessionValid =
				!!session
			mockLogger.debug('Emitting connection event for session:', session?.id ?? resolvedSessionId)
			this.wss.emit('connection', ws, req)
		})
	}

	/**
	 * Handle new WebSocket connection
	 */
	 
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
			ws.send(
				JSON.stringify({
					seq: 0,
					timestamp: Date.now(),
					type: 'session_invalid',
					data: {
						reason: 'Session not found or expired',
						code: 4001
					}
				})
			)
			ws.close(4001, 'Invalid session')
			return
		}

		mockLogger.debug(`Stage connection established for session ${sessionId}`)

		// Create connection state
		const connState: StageConnectionState = {
			id: `stage_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
			sessionId,
			authenticated: true, // Already authenticated via token
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
	private async sendStateSync(ws: WebSocket, connState: StageConnectionState, session: Session): Promise<void> {
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

		// Include Activity state if active
		try {
			const hostManager = getActivityHostManager()
			const activityRecord = hostManager.getRecord(session.id)
			if (activityRecord) {
				const actQueryParams: Record<string, string> = {
					client_id: activityRecord.application_id,
					instance_id: activityRecord.instance_id,
					frame_id: activityRecord.frame_id,
					platform: activityRecord.platform,
					locale: activityRecord.locale
				}
				if (activityRecord.guild_id) actQueryParams.guild_id = activityRecord.guild_id
				if (activityRecord.channel_id) actQueryParams.channel_id = activityRecord.channel_id

				payload.activity = {
					instance_id: activityRecord.instance_id,
					frame_id: activityRecord.frame_id,
					application_id: activityRecord.application_id,
					guild_id: activityRecord.guild_id,
					channel_id: activityRecord.channel_id,
					launch_url: activityRecord.launch_url,
					query_params: actQueryParams,
					ready_emitted: activityRecord.ready_emitted,
					auth_state: activityRecord.auth.state,
					auth_scopes: activityRecord.auth.scopes,
					devtools_auth_mode: activityRecord.devtools_auth.mode
				}

				// Include proxy origin/iframe_url if proxy is running
				try {
					const { getActivityProxyServer } = await import('./activity-proxy/server.js')
					const { getProxyConfigStore } = await import('./activity-proxy/config-store.js')
					const proxyServer = getActivityProxyServer()
					if (proxyServer.isStarted()) {
						const proxyOrigin = proxyServer.getProxyOrigin(session.id, activityRecord.application_id)
						const queryStr = Object.entries(actQueryParams)
							.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
							.join('&')
						const proxyConfig = getProxyConfigStore().get(session.id)
						const launchPath = proxyConfig?.launch_path ?? '/'
						const iframeUrl = `${proxyOrigin}/.proxy${launchPath}?${queryStr}`
						payload.activity.proxy_origin = proxyOrigin
						payload.activity.iframe_url = iframeUrl
						payload.activity.sdk_shim_enabled = proxyConfig?.sdk_shim_enabled ?? false
					}
				} catch {
					// Proxy may not be initialized
				}
			}
		} catch {
			// Activity host manager may not be initialized -- skip
		}

		// Include proxy server status
		try {
			const { getActivityProxyServer } = await import('./activity-proxy/server.js')
			const proxyServer = getActivityProxyServer()
			if (proxyServer.isStarted()) {
				payload.proxy = {
					running: true,
					port: proxyServer.getPort(),
					origin_template: `http://{session}.{app_id}.discordsays.localhost:${proxyServer.getPort()}`
				}
			}
		} catch {
			// Proxy may not be initialized
		}

		this.pushEvent(ws, connState, {
			type: 'state_sync',
			data: payload
		})

		// Emit proxy status as a dedicated event for DevTools/agents (in addition to state_sync).
		if (payload.proxy) {
			this.pushEvent(ws, connState, {
				type: 'activity.proxy.status',
				data: payload.proxy
			})
		}
	}

	/**
	 * Convert MockGuild to StageGuild
	 */
	private toStageGuild(guild: {
		id: string
		name: string
		icon?: string | null
		ownerId?: string
		memberCount?: number
	}): StageGuild {
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
	private toStageChannel(channel: {
		id: string
		name: string
		type: number
		guildId?: string
		parentId?: string | null
		position?: number
		topic?: string | null
		recipientIds?: string[]
	}): StageChannel {
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
	private toStageUser(user: {
		id: string
		username: string
		discriminator?: string
		avatar?: string | null
		bot?: boolean
		status?: 'online' | 'offline' | 'idle' | 'dnd'
		activities?: Array<{ name: string; type: number; state?: string; url?: string }>
	}): StageUser {
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
		author?: {
			id: string
			username: string
			discriminator?: string
			avatar?: string | null
			bot?: boolean
			globalName?: string | null
		}
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
			user: {
				id: string
				username: string
				discriminator?: string
				avatar?: string | null
				bot?: boolean
				globalName?: string | null
			}
			authorizing_integration_owners?: Record<number, string>
			original_response_message_id?: string
			target_user?: {
				id: string
				username: string
				discriminator?: string
				avatar?: string | null
				bot?: boolean
				globalName?: string | null
			}
			target_message_id?: string
		}
		interaction?: {
			id: string
			type: number
			name?: string
			user: {
				id: string
				username: string
				discriminator?: string
				avatar?: string | null
				bot?: boolean
				globalName?: string | null
			}
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
			options: cmd.options?.map((opt) => this.toStageCommandOption(opt))
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
			choices: opt.choices?.map((c) => ({ name: c.name, value: c.value })),
			options: opt.options?.map((o) => this.toStageCommandOption(o)),
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
	 * Get all guild roles as StageRole array
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
	 * Get all voice states as StageVoiceState array
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
				.reverse() // Oldest first

			result[channelId] = sorted.map((m) => {
				const author = state.users.get(m.authorId)
				return this.toStageMessage({
					...m,
					author: author
						? { id: author.id, username: author.username, avatar: author.avatar, bot: author.bot }
						: undefined
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

		const eventsToReplay = buffer.filter((b) => b.event.seq > fromSeq)
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
	private handleMessage(
		ws: WebSocket,
		connState: StageConnectionState,
		data: WebSocket.RawData,
		isBinary: boolean
	): void {
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
					this.sendCommandResponse(
						ws,
						connState,
						command.id,
						success,
						undefined,
						success ? undefined : 'Message not found'
					)
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
					this.sendCommandResponse(
						ws,
						connState,
						command.id,
						success,
						undefined,
						success ? undefined : 'Message or reaction not found'
					)
					break
				}

				case 'control_response': {
					// Handle response from Stage UI to a control command
					const data = command.data as StageControlResponseData
					const pending = this.pendingControlCommands.get(data.commandId)
					if (pending) {
						clearTimeout(pending.timeout)
						this.pendingControlCommands.delete(data.commandId)
						pending.resolve(data)

						// Broadcast playback state to ALL clients in session for sync
						// This ensures other Stage UI clients and SDK subscribers see the change
						if (pending.kind === 'playback_control' && data.success && data.result) {
							this.broadcastToSession(pending.sessionId, {
								type: 'playback_state_changed',
								data: data.result
							})
						}
					} else {
						mockLogger.debug(`Received control_response for unknown command: ${data.commandId}`)
					}
					this.sendCommandResponse(ws, connState, command.id, true)
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

					// Emit Activity signals for voice join
					const voiceJoinEvents = onVoiceStateChanged(connState.sessionId, user.id, data.channel_id)
					if (voiceJoinEvents.length > 0) {
						this.emitActivityRpcOutbound(connState.sessionId, voiceJoinEvents)
					}
					scheduleParticipantsUpdate(connState.sessionId, (messages) => {
						this.emitActivityRpcOutbound(connState.sessionId, messages)
					})
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

					// Emit Activity signals for voice leave
					const voiceLeaveEvents = onVoiceStateChanged(connState.sessionId, user.id, data.channel_id ?? null)
					if (voiceLeaveEvents.length > 0) {
						this.emitActivityRpcOutbound(connState.sessionId, voiceLeaveEvents)
					}
					scheduleParticipantsUpdate(connState.sessionId, (messages) => {
						this.emitActivityRpcOutbound(connState.sessionId, messages)
					})
					break
				}

				case 'update_voice_state': {
					const data = command.data as StageUpdateVoiceStateData & { speaking?: boolean }
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

					// Capture previous speaking state for delta detection
					const prevSpeaking = (existingState as { speaking?: boolean }).speaking

					// Update voice state (include speaking if provided)
					const updatedState = {
						...existingState,
						self_mute: data.self_mute ?? existingState.self_mute,
						self_deaf: data.self_deaf ?? existingState.self_deaf
					}
					if (data.speaking !== undefined) {
						;(updatedState as { speaking?: boolean }).speaking = data.speaking
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
							speaking: (updatedState as { speaking?: boolean }).speaking,
							member: stageMember ?? undefined
						}
					})

					// Emit Activity signals for speaking changes
					const activityVoiceEvents = onVoiceStateChanged(
						connState.sessionId,
						user.id,
						updatedState.channel_id,
						prevSpeaking,
						data.speaking ?? prevSpeaking
					)
					if (activityVoiceEvents.length > 0) {
						this.emitActivityRpcOutbound(connState.sessionId, activityVoiceEvents)
					}
					// Coalesce participants update for mute/deaf changes
					if (data.self_mute !== undefined || data.self_deaf !== undefined) {
						scheduleParticipantsUpdate(connState.sessionId, (messages) => {
							this.emitActivityRpcOutbound(connState.sessionId, messages)
						})
					}

					this.sendCommandResponse(ws, connState, command.id, true)
					break
				}

				case 'set_current_user': {
					const data = command.data as StageSetCurrentUserData
					// Update current user properties
					const updates: Partial<Omit<MockUser, 'id'>> = {}
					if (data.username !== undefined) {
						updates.username = data.username
					}
					if (data.avatar !== undefined) {
						updates.avatar = data.avatar
					}
					if (data.status !== undefined) {
						updates.status = data.status
					}
					if (data.activities !== undefined) {
						updates.activities = data.activities
					}
					const updatedUser = session.state.updateCurrentUser(updates)
					// Broadcast current_user_update to all stage clients in this session
					this.broadcastToSession(connState.sessionId, {
						type: 'current_user_update',
						data: { user: this.toStageUser(updatedUser) }
					})

					// Emit CURRENT_USER_UPDATE signal to Activity (if running + subscribed)
					try {
						const hostManager = getActivityHostManager()
						const actRecord = hostManager.getRecord(connState.sessionId)
						if (actRecord && actRecord.user_id === updatedUser.id) {
							const payload = hostManager.getSnapshotForEvent('CURRENT_USER_UPDATE', actRecord)
							if (payload !== null) {
								const msg = hostManager.emitEvent(connState.sessionId, 'CURRENT_USER_UPDATE', payload)
								if (msg) {
									this.emitActivityRpcOutbound(connState.sessionId, [msg])
								}
							}
						}
					} catch {
						// Activity host not available
					}
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

						// If an Activity is running in this session, switch its user context
						// and emit the corresponding signals (spec: CURRENT_USER_UPDATE, CURRENT_GUILD_MEMBER_UPDATE).
						try {
							const hostManager = getActivityHostManager()
							const actRecord = hostManager.getRecord(connState.sessionId)
							if (actRecord) {
								actRecord.user_id = switchedUser.id
								// User switch invalidates previous auth context
								actRecord.auth = { state: 'UNAUTHENTICATED' }
								actRecord.pending_authorize = null
								actRecord.pending_purchase = null

								const outbound: unknown[] = []

								const userPayload = hostManager.getSnapshotForEvent('CURRENT_USER_UPDATE', actRecord)
								if (userPayload !== null) {
									const msg = hostManager.emitEvent(connState.sessionId, 'CURRENT_USER_UPDATE', userPayload)
									if (msg) outbound.push(msg)
								}

								const memberPayload = hostManager.getSnapshotForEvent('CURRENT_GUILD_MEMBER_UPDATE', actRecord)
								if (memberPayload !== null) {
									const msg = hostManager.emitEvent(connState.sessionId, 'CURRENT_GUILD_MEMBER_UPDATE', memberPayload)
									if (msg) outbound.push(msg)
								}

								if (outbound.length > 0) {
									this.emitActivityRpcOutbound(connState.sessionId, outbound)
								}
							}
						} catch {
							// Activity host not available
						}
						this.sendCommandResponse(ws, connState, command.id, true, { user: this.toStageUser(switchedUser) })
					} else {
						this.sendCommandResponse(ws, connState, command.id, false, undefined, 'User not found')
					}
					break
				}

				case 'launch_activity': {
					const launchData = command.data as StageLaunchActivityData
					const hostManager = getActivityHostManager()

					const record = hostManager.launchActivity({
						session_id: connState.sessionId,
						application_id: launchData.application_id,
						guild_id: launchData.guild_id ?? null,
						channel_id: launchData.channel_id ?? null,
						launch_url: launchData.launch_url,
						locale: launchData.locale,
						platform: launchData.platform
					})

					// Build query params for iframe URL (spec section 1.1)
					const launchQueryParams: Record<string, string> = {
						client_id: record.application_id,
						instance_id: record.instance_id,
						frame_id: record.frame_id,
						platform: record.platform,
						locale: record.locale
					}
					if (record.guild_id) launchQueryParams.guild_id = record.guild_id
					if (record.channel_id) launchQueryParams.channel_id = record.channel_id

					// Create proxy config for this session
					let proxyOrigin: string | undefined
					let iframeUrl: string | undefined
					try {
						const { getProxyConfigStore } = await import('./activity-proxy/config-store.js')
						const { getActivityProxyServer } = await import('./activity-proxy/server.js')

						const proxyServer = getActivityProxyServer()
						if (proxyServer.isStarted()) {
							const launchPath = launchData.launch_path ?? '/'
							const urlMappings = (launchData.url_mappings ?? []).map((m) => ({
								prefix: m.prefix,
								target: m.target
							}))

							getProxyConfigStore().set(connState.sessionId, {
								launch_url: launchData.launch_url,
								launch_path: launchPath,
								url_mappings: urlMappings,
								csp_mode: launchData.csp_mode ?? 'relaxed',
								application_id: launchData.application_id,
								sdk_shim_enabled: launchData.sdk_shim_enabled ?? true
							})

							proxyOrigin = proxyServer.getProxyOrigin(connState.sessionId, launchData.application_id)
							const queryStr = Object.entries(launchQueryParams)
								.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
								.join('&')
							iframeUrl = `${proxyOrigin}/.proxy${launchPath}?${queryStr}`

							mockLogger.debug(`Proxy config created for session ${connState.sessionId}: ${proxyOrigin}`)
						}
					} catch {
						// Proxy may not be initialized
					}

					// Record activity launch
					const launchSession = sessionManager.get(connState.sessionId)
					if (launchSession) {
						launchSession.recorder.record('activity_launch', {
							instance_id: record.instance_id,
							frame_id: record.frame_id,
							application_id: record.application_id,
							guild_id: record.guild_id,
							channel_id: record.channel_id,
							user_id: record.user_id,
							launch_url: record.launch_url,
							locale: record.locale,
							platform: record.platform
						})
					}

					// Broadcast launched event to all Stage clients
					const launchedData: StageActivityLaunchedData = {
						instance_id: record.instance_id,
						frame_id: record.frame_id,
						application_id: record.application_id,
						guild_id: record.guild_id,
						channel_id: record.channel_id,
						user_id: record.user_id,
						launch_url: record.launch_url,
						query_params: launchQueryParams,
						sdk_shim_enabled: launchData.sdk_shim_enabled ?? true
					}
					if (proxyOrigin) launchedData.proxy_origin = proxyOrigin
					if (iframeUrl) launchedData.iframe_url = iframeUrl

					this.broadcastToSession(connState.sessionId, {
						type: 'activity.launched',
						data: launchedData
					})

					this.sendCommandResponse(ws, connState, command.id, true, {
						instance_id: record.instance_id,
						frame_id: record.frame_id,
						query_params: launchQueryParams,
						proxy_origin: proxyOrigin,
						iframe_url: iframeUrl,
						sdk_shim_enabled: launchData.sdk_shim_enabled ?? true
					})
					break
				}

				case 'close_activity': {
					// Cancel any pending coalesced signal updates
					cancelCoalesceTimers(connState.sessionId)

					const hostManager = getActivityHostManager()
					const activityRecord = hostManager.getRecord(connState.sessionId)
					const closedInstanceId = activityRecord?.instance_id

					const closed = hostManager.closeActivity(connState.sessionId)

					// Clean up proxy config
					try {
						const { getProxyConfigStore } = await import('./activity-proxy/config-store.js')
						getProxyConfigStore().delete(connState.sessionId)
					} catch {
						// Proxy may not be initialized
					}

					if (closed && closedInstanceId) {
						// Record activity close
						const closeSession = sessionManager.get(connState.sessionId)
						if (closeSession) {
							closeSession.recorder.record('activity_close', {
								instance_id: closedInstanceId,
								reason: 'user_closed'
							})
						}

						this.broadcastToSession(connState.sessionId, {
							type: 'activity.closed',
							data: { instance_id: closedInstanceId } satisfies StageActivityClosedData
						})
					}

					this.sendCommandResponse(
						ws,
						connState,
						command.id,
						closed,
						undefined,
						closed ? undefined : 'No active Activity to close'
					)
					break
				}

				case 'activity_rpc': {
					const rpcData = command.data as StageActivityRpcData
					const hostManager = getActivityHostManager()

					// Resolve session via routing (frame_id -> instance_id -> session_id fallback)
					const resolvedRpcSessionId = hostManager.resolveSessionId({
						frame_id: rpcData.frame_id,
						instance_id: rpcData.instance_id,
						session_id: connState.sessionId
					})

					if (!resolvedRpcSessionId) {
						this.sendCommandResponse(
							ws,
							connState,
							command.id,
							false,
							undefined,
							'Cannot route RPC: no active Activity'
						)
						break
					}

					// Record inbound RPC
					const rpcSession = sessionManager.get(resolvedRpcSessionId)
					const rpcActivityRecord = hostManager.getRecord(resolvedRpcSessionId)
					if (rpcSession && rpcActivityRecord) {
						rpcSession.recorder.record('activity_rpc_inbound', {
							instance_id: rpcActivityRecord.instance_id,
							frame_id: rpcData.frame_id,
							message: rpcData.message
						})
					}

					// Handle inbound RPC
					const rpcResult = hostManager.handleInbound(resolvedRpcSessionId, rpcData.message)

					// Record outbound RPC
					if (rpcSession && rpcActivityRecord && rpcResult.outbound.length > 0) {
						rpcSession.recorder.record('activity_rpc_outbound', {
							instance_id: rpcActivityRecord.instance_id,
							messages: rpcResult.outbound
						})
					}

					// Check if AUTHORIZE is pending consent (manual mode)
					if (rpcResult._pending_authorize) {
						const actRecord = hostManager.getRecord(resolvedRpcSessionId)
						if (actRecord?.pending_authorize) {
							// Emit consent UI event to Stage UI
							this.broadcastToSession(connState.sessionId, {
								type: 'activity.ui.authorize_request',
								data: {
									nonce: actRecord.pending_authorize.nonce,
									instance_id: actRecord.instance_id,
									client_id: actRecord.pending_authorize.client_id,
									scopes: actRecord.pending_authorize.scopes,
									state: actRecord.pending_authorize.state,
									response_type: actRecord.pending_authorize.response_type,
									prompt: actRecord.pending_authorize.prompt
								} satisfies StageActivityAuthorizeRequestData
							})
						}
					}

					// Check if START_PURCHASE is pending purchase modal
					if (rpcResult._pending_purchase) {
						const actRecord = hostManager.getRecord(resolvedRpcSessionId)
						if (actRecord?.pending_purchase) {
							// Emit purchase UI event to Stage UI
							this.broadcastToSession(connState.sessionId, {
								type: 'activity.ui.purchase_request',
								data: {
									nonce: actRecord.pending_purchase.nonce,
									instance_id: actRecord.instance_id,
									sku_id: actRecord.pending_purchase.sku_id,
									sku_name: actRecord.pending_purchase.sku_name,
									sku_price: actRecord.pending_purchase.sku_price
								} satisfies StageActivityPurchaseRequestData
							})
						}
					}

					// Send outbound messages back as command response (may be empty for pending authorize/purchase)
					this.sendCommandResponse(ws, connState, command.id, true, {
						outbound: rpcResult.outbound
					})
					break
				}

				case 'activity_set_url_mappings': {
					const mappingsData = command.data as StageActivitySetUrlMappingsData
					try {
						const { getProxyConfigStore } = await import('./activity-proxy/config-store.js')
						const updated = getProxyConfigStore().updateMappings(
							connState.sessionId,
							mappingsData.url_mappings.map((m) => ({ prefix: m.prefix, target: m.target }))
						)
						this.sendCommandResponse(ws, connState, command.id, updated, undefined, updated ? undefined : 'No proxy config for session')
					} catch {
						this.sendCommandResponse(ws, connState, command.id, false, undefined, 'Proxy not available')
					}
					break
				}

				case 'activity_set_csp_mode': {
					const cspData = command.data as StageActivitySetCspModeData
					try {
						const { getProxyConfigStore } = await import('./activity-proxy/config-store.js')
						const updated = getProxyConfigStore().updateCspMode(connState.sessionId, cspData.csp_mode)
						this.sendCommandResponse(ws, connState, command.id, updated, undefined, updated ? undefined : 'No proxy config for session')
					} catch {
						this.sendCommandResponse(ws, connState, command.id, false, undefined, 'Proxy not available')
					}
					break
				}

				case 'activity_authorize_result': {
					const resultData = command.data as StageActivityAuthorizeResultData
					const hostManager = getActivityHostManager()

					const outbound = hostManager.resolveAuthorize(
						connState.sessionId,
						resultData.nonce,
						resultData.approved,
						resultData.approved_scopes
					)

					if (outbound && outbound.length > 0) {
						// Forward the resolved response to the Activity via Stage UI
						this.emitActivityRpcOutbound(connState.sessionId, outbound)
					}

					this.sendCommandResponse(ws, connState, command.id, true)
					break
				}

				case 'activity_set_auth_settings': {
					const settingsData = command.data as StageActivitySetAuthSettingsData
					const hostManager = getActivityHostManager()
					const actRecord = hostManager.getRecord(connState.sessionId)

					if (actRecord) {
						actRecord.devtools_auth.mode = settingsData.mode
						if (settingsData.default_scopes !== undefined) {
							actRecord.devtools_auth.default_scopes = settingsData.default_scopes
						}
						this.sendCommandResponse(ws, connState, command.id, true, {
							mode: actRecord.devtools_auth.mode,
							default_scopes: actRecord.devtools_auth.default_scopes
						})
					} else {
						this.sendCommandResponse(ws, connState, command.id, false, undefined, 'No active Activity')
					}
					break
				}

				case 'activity_reset_auth': {
					const hostManager = getActivityHostManager()
					const actRecord = hostManager.getRecord(connState.sessionId)

					if (actRecord) {
						actRecord.auth = { state: 'UNAUTHENTICATED' }
						actRecord.pending_authorize = null
						this.sendCommandResponse(ws, connState, command.id, true)
					} else {
						this.sendCommandResponse(ws, connState, command.id, false, undefined, 'No active Activity')
					}
					break
				}

				case 'activity_set_platform_state': {
					const platformData = command.data as StageActivitySetPlatformStateData
					const hostManager = getActivityHostManager()
					const actRecord = hostManager.getRecord(connState.sessionId)

					if (!actRecord) {
						this.sendCommandResponse(ws, connState, command.id, false, undefined, 'No active Activity')
						break
					}

					const outbound: object[] = []

					// Update layout_mode
					if (platformData.layout_mode !== undefined && platformData.layout_mode !== actRecord.platform_state.layout_mode) {
						actRecord.platform_state.layout_mode = platformData.layout_mode
						const events = onPlatformStateChanged(connState.sessionId, 'layout_mode', platformData.layout_mode)
						outbound.push(...events)
					}

					// Update orientation
					if (platformData.screen_orientation !== undefined || platformData.orientation !== undefined) {
						const newScreenOrientation = platformData.screen_orientation ?? actRecord.platform_state.screen_orientation
						const newOrientation = platformData.orientation ?? actRecord.platform_state.orientation
						if (newScreenOrientation !== actRecord.platform_state.screen_orientation ||
							newOrientation !== actRecord.platform_state.orientation) {
							actRecord.platform_state.screen_orientation = newScreenOrientation
							actRecord.platform_state.orientation = newOrientation
							const events = onPlatformStateChanged(connState.sessionId, 'orientation', {
								screen_orientation: newScreenOrientation,
								orientation: newOrientation
							})
							outbound.push(...events)
						}
					}

					// Update thermal_state
					if (platformData.thermal_state !== undefined && platformData.thermal_state !== actRecord.platform_state.thermal_state) {
						actRecord.platform_state.thermal_state = platformData.thermal_state
						const events = onPlatformStateChanged(connState.sessionId, 'thermal_state', platformData.thermal_state)
						outbound.push(...events)
					}

					// Forward events to Activity iframe
					if (outbound.length > 0) {
						this.emitActivityRpcOutbound(connState.sessionId, outbound)
					}

					this.sendCommandResponse(ws, connState, command.id, true, {
						platform_state: actRecord.platform_state
					})
					break
				}

				case 'activity_set_iap_state': {
					const iapData = command.data as StageActivitySetIapStateData
					const hostManager = getActivityHostManager()
					const actRecord = hostManager.getRecord(connState.sessionId)

					if (!actRecord) {
						this.sendCommandResponse(ws, connState, command.id, false, undefined, 'No active Activity')
						break
					}

					// Save previous entitlements for delta computation (ENTITLEMENT_CREATE)
					const previousEntitlements = actRecord.iap_state.entitlements

					// Update IAP state
					actRecord.iap_state = {
						skus: iapData.skus,
						entitlements: iapData.entitlements
					}

					// Emit ENTITLEMENT_CREATE for newly added entitlements when subscribed.
					// This mirrors Discord's async entitlement grant behavior (SDK event).
					try {
						const prevIds = new Set(previousEntitlements.map((e) => e.id))
						const created = iapData.entitlements.filter((e) => !prevIds.has(e.id))
						if (created.length > 0) {
							const outbound: unknown[] = []
							for (const ent of created) {
								const msg = hostManager.emitEvent(connState.sessionId, 'ENTITLEMENT_CREATE', { entitlement: ent })
								if (msg) outbound.push(msg)
							}
							if (outbound.length > 0) {
								this.emitActivityRpcOutbound(connState.sessionId, outbound)
							}
						}
					} catch {
						// Best-effort: ignore entitlement event failures
					}

					this.sendCommandResponse(ws, connState, command.id, true, {
						skus_count: iapData.skus.length,
						entitlements_count: iapData.entitlements.length
					})
					break
				}

				case 'activity_set_relationships': {
					const relData = command.data as StageActivitySetRelationshipsData
					const hostManager = getActivityHostManager()
					const actRecord = hostManager.getRecord(connState.sessionId)

					if (!actRecord) {
						this.sendCommandResponse(ws, connState, command.id, false, undefined, 'No active Activity')
						break
					}

					// Save previous relationships for delta computation
					const previousRelationships = actRecord.relationship_state.relationships

					// Update relationship state
					actRecord.relationship_state = {
						relationships: relData.relationships
					}

					// Compute delta: changed or new relationships
					const prevMap = new Map(previousRelationships.map((r) => [r.id, r]))
					const changedRelationships = relData.relationships.filter((newRel) => {
						const prev = prevMap.get(newRel.id)
						if (!prev) return true // new relationship
						// Check if type or user data changed
						return prev.type !== newRel.type ||
							prev.user.id !== newRel.user.id ||
							prev.user.username !== newRel.user.username
					})

					// Emit RELATIONSHIP_UPDATE events for changed entries
					if (changedRelationships.length > 0) {
						const outbound = onRelationshipStateChanged(connState.sessionId, changedRelationships)
						if (outbound.length > 0) {
							this.emitActivityRpcOutbound(connState.sessionId, outbound)
						}
					}

					this.sendCommandResponse(ws, connState, command.id, true, {
						relationships_count: relData.relationships.length,
						changed_count: changedRelationships.length
					})
					break
				}

				case 'activity_set_quests': {
					const questData = command.data as StageActivitySetQuestsData
					const hostManager = getActivityHostManager()
					const actRecord = hostManager.getRecord(connState.sessionId)

					if (!actRecord) {
						this.sendCommandResponse(ws, connState, command.id, false, undefined, 'No active Activity')
						break
					}

					// Save previous quests for delta computation
					const previousQuests = actRecord.quest_state.quests

					// Update quest state
					actRecord.quest_state = {
						quests: questData.quests
					}

					// Compute delta on enrollment_status changes
					const prevQuestMap = new Map(previousQuests.map((q) => [q.id, q]))
					const outbound: object[] = []
					for (const newQuest of questData.quests) {
						const prev = prevQuestMap.get(newQuest.id)
						const prevStatus = prev?.enrollment_status
						const newStatus = newQuest.enrollment_status

						// Emit if enrollment_status changed
						if (newStatus && (!prevStatus ||
							prevStatus.progress !== newStatus.progress ||
							prevStatus.completed_at !== newStatus.completed_at ||
							prevStatus.timer_started_at !== newStatus.timer_started_at)) {
							const events = onQuestStateChanged(connState.sessionId, newQuest.id, newStatus)
							outbound.push(...events)
						}
					}

					if (outbound.length > 0) {
						this.emitActivityRpcOutbound(connState.sessionId, outbound)
					}

					this.sendCommandResponse(ws, connState, command.id, true, {
						quests_count: questData.quests.length
					})
					break
				}

				case 'activity_purchase_result': {
					const purchaseData = command.data as StageActivityPurchaseResultData
					const hostManager = getActivityHostManager()

					const outbound = hostManager.resolvePurchase(
						connState.sessionId,
						purchaseData.nonce,
						purchaseData.approved
					)

					if (outbound && outbound.length > 0) {
						this.emitActivityRpcOutbound(connState.sessionId, outbound)
					}

					this.sendCommandResponse(ws, connState, command.id, true)
					break
				}

				case 'activity_set_origin_mode': {
					const modeData = command.data as StageActivitySetOriginModeData
					// Origin mode is a frontend-only setting (controls bridge behavior).
					// We acknowledge it and include it in state_sync for reconnect persistence.
					this.sendCommandResponse(ws, connState, command.id, true, {
						mode: modeData.mode
					})
					break
				}

				case 'activity_set_sdk_shim': {
					const shimData = command.data as StageActivitySetSdkShimData
					try {
						const { getProxyConfigStore } = await import('./activity-proxy/config-store.js')
						const updated = getProxyConfigStore().updateSdkShim(connState.sessionId, shimData.enabled)
						this.sendCommandResponse(ws, connState, command.id, updated, undefined,
							updated ? undefined : 'No proxy config for session')
					} catch {
						this.sendCommandResponse(ws, connState, command.id, false, undefined, 'Proxy not available')
					}
					break
				}

				case 'activity_emit_event': {
					const emitData = command.data as StageActivityEmitEventData
					const eventName = emitData.event_name
					if (!eventName) {
						this.sendCommandResponse(ws, connState, command.id, false, undefined, 'Missing event_name')
						break
					}

					const hostManager = getActivityHostManager()
					const actRecord = hostManager.getRecord(connState.sessionId)
					if (!actRecord) {
						this.sendCommandResponse(ws, connState, command.id, false, undefined, 'No active Activity')
						break
					}

					// Best-effort: validate against loaded manifest when available.
					// Do NOT hard-fail unknown events to allow legacy/experimental testing.
					let manifestKnown = false
					try {
						const def = getEventMap().get(eventName)
						if (def) {
							manifestKnown = true
							if (!def.subscribable) {
								this.sendCommandResponse(ws, connState, command.id, false, undefined, `Event "${eventName}" is not subscribable`)
								break
							}
						}
					} catch {
						// Manifest not available
					}

					const msg = hostManager.emitEvent(connState.sessionId, eventName, emitData.data ?? null)
					if (msg) {
						this.emitActivityRpcOutbound(connState.sessionId, [msg])
					}

					this.sendCommandResponse(ws, connState, command.id, true, {
						delivered: Boolean(msg),
						manifest_known: manifestKnown
					})
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
			const evictCount = Math.ceil(this.maxBufferSize * 0.1) // Remove oldest 10%
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
			mockLogger.debug(
				`Broadcast ${event.type} (seq: ${seq}) to ${broadcastCount} stage client(s) for session ${sessionId}`
			)
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
	 * Emit async Activity RPC outbound messages to Stage UI clients.
	 * Called when the backend host has events to push to the Activity iframe
	 * (e.g., subscription events triggered by state changes).
	 *
	 * @param sessionId - Session ID
	 * @param messages - Outbound RPC messages to forward to the Activity iframe
	 */
	emitActivityRpcOutbound(sessionId: string, messages: unknown[]): void {
		// Record async outbound RPC messages
		const asyncSession = sessionManager.get(sessionId)
		if (asyncSession) {
			const hostManager = getActivityHostManager()
			const asyncRecord = hostManager.getRecord(sessionId)
			if (asyncRecord) {
				asyncSession.recorder.record('activity_rpc_outbound', {
					instance_id: asyncRecord.instance_id,
					messages
				})
			}
		}

		this.broadcastToSession(sessionId, {
			type: 'activity.rpc.outbound',
			data: { messages } satisfies StageActivityRpcOutboundData
		})
	}

	/**
	 * Send a control command to Stage UI clients and wait for response.
	 * Used by HTTP endpoints to control Stage UI playback and navigation.
	 *
	 * Commands are queued per-session to prevent race conditions from concurrent requests.
	 *
	 * @param sessionId - Session ID
	 * @param kind - Command kind (playback_control, navigation_control, state_request)
	 * @param payload - Command-specific payload
	 * @param timeoutMs - Timeout in ms (default: 5000)
	 * @returns Promise resolving to control response data
	 * @throws Error if no Stage UI connected or timeout
	 */
	async sendControlCommand(
		sessionId: string,
		kind: StageControlCommandKind,
		payload: StagePlaybackControlPayload | StageNavigationControlPayload | Record<string, never>,
		timeoutMs: number = DEFAULT_CONTROL_COMMAND_TIMEOUT,
		maxRetries: number = 1
	): Promise<StageControlResponseData> {
		// Get or create per-session lock to prevent concurrent command race conditions
		const currentLock = this.sessionCommandLocks.get(sessionId) ?? Promise.resolve()

		// Chain this command after the current lock for this session
		const commandPromise = currentLock.then(async () => {
			// Retry loop for transient timeout failures
			for (let attempt = 0; attempt <= maxRetries; attempt++) {
				try {
					return await this.sendControlCommandOnce(sessionId, kind, payload, timeoutMs)
				} catch (error) {
					const isTimeout = error instanceof Error && error.message === 'TIMEOUT'
					const isLastAttempt = attempt === maxRetries

					// Only retry on timeout errors, not validation errors
					if (!isTimeout || isLastAttempt) {
						throw error
					}

					// Wait before retry (exponential backoff: 1s, 2s, etc.)
					mockLogger.debug(`Control command timeout, retrying (attempt ${attempt + 1}/${maxRetries})`)
					await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)))
				}
			}
			// Should never reach here, but TypeScript needs a return
			throw new Error('TIMEOUT')
		})

		// Store the new lock (catch to prevent unhandled rejection from blocking future commands)
		this.sessionCommandLocks.set(
			sessionId,
			commandPromise.catch(() => {})
		)

		return commandPromise
	}

	/**
	 * Internal: Execute a single control command without queuing.
	 */
	private async sendControlCommandOnce(
		sessionId: string,
		kind: StageControlCommandKind,
		payload: StagePlaybackControlPayload | StageNavigationControlPayload | Record<string, never>,
		timeoutMs: number
	): Promise<StageControlResponseData> {
		// Check if any Stage UI clients are connected
		const connectionCount = this.getSessionConnectionCount(sessionId)
		if (connectionCount === 0) {
			throw new Error('NO_STAGE_CLIENT')
		}

		// Generate unique command ID
		const commandId = `ctrl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

		// Create promise that will be resolved when response is received
		return new Promise((resolve, reject) => {
			// Set up timeout
			const timeout = setTimeout(() => {
				this.pendingControlCommands.delete(commandId)
				reject(new Error('TIMEOUT'))
			}, timeoutMs)

			// Store pending command
			this.pendingControlCommands.set(commandId, {
				commandId,
				sessionId,
				kind,
				resolve,
				reject,
				timeout
			})

			// Build and broadcast control command
			const controlCommand: StageControlCommand = {
				commandId,
				kind,
				payload
			}

			mockLogger.debug(`Sending control command: ${kind} (${commandId}) to session ${sessionId}`)

			this.broadcastToSession(sessionId, {
				type: 'control_command',
				data: controlCommand
			})
		})
	}

	/**
	 * Check if a session has any Stage UI clients connected.
	 * Useful for HTTP endpoints to return early with error if no client.
	 */
	hasStageClients(sessionId: string): boolean {
		return this.getSessionConnectionCount(sessionId) > 0
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

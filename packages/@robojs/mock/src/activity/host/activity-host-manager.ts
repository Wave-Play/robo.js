import { mockLogger } from '../../core/logger.js'
import { sessionManager } from '../../core/manager.js'
import { getCommandMap, getEventMap, isManifestLoaded, loadManifest } from '../schema/manifest-loader.js'
import type { ActivitySessionRecord } from './activity-session-record.js'
import { createActivitySessionRecord } from './activity-session-record.js'
import { SubscriptionRegistry } from './subscription-registry.js'
import {
	parseInboundEnvelope,
	buildCommandResponse,
	buildErrorResponse,
	buildEventDispatch,
	validateCommand,
	ActivityRpcOpcode,
	RpcValidationError
} from './rpc-envelope.js'
import type { InboundRpcMessage } from './rpc-envelope.js'
import { RpcErrorCode } from './error-codes.js'
import type { RpcCommandDefinition } from '../schema/manifest-types.js'
import { dispatchCommand } from './command-handlers/index.js'
import { generateSnowflake } from '../../utils/snowflake.js'

/**
 * Options for launching an Activity within a mock session.
 */
export interface LaunchActivityOptions {
	session_id: string
	application_id: string
	guild_id?: string | null
	channel_id?: string | null
	user_id?: string
	launch_url: string
	locale?: string
	platform?: string
}

/**
 * Result of handling an inbound RPC message.
 */
export interface HandleInboundResult {
	/** Messages to send back to the Activity iframe (may be >1 for deferred events) */
	outbound: unknown[]
	/** If true, an AUTHORIZE request is pending and the caller should emit a consent UI event */
	_pending_authorize?: boolean
	/** If true, a START_PURCHASE request is pending and the caller should emit a purchase UI event */
	_pending_purchase?: boolean
}

/**
 * ActivityHostManager: manages one Activity instance per mock session.
 *
 * Keyed by mock session_id. Each session can have at most one active Activity.
 * Data structures are designed so multi-activity can be added later.
 */
export class ActivityHostManager {
	/** session_id -> ActivitySessionRecord */
	private sessions: Map<string, ActivitySessionRecord> = new Map()

	/** instance_id -> SubscriptionRegistry */
	private subscriptions: Map<string, SubscriptionRegistry> = new Map()

	/** frame_id -> instance_id (primary routing) */
	private frameToInstance: Map<string, string> = new Map()

	/** instance_id -> session_id */
	private instanceToSession: Map<string, string> = new Map()

	constructor() {
		// Ensure manifest is loaded
		if (!isManifestLoaded()) {
			loadManifest()
		}
	}

	// =========================================================================
	// Lifecycle
	// =========================================================================

	/**
	 * Launch a new Activity for a mock session.
	 * Creates the session record, subscription registry, and routing mappings.
	 */
	launchActivity(options: LaunchActivityOptions): ActivitySessionRecord {
		const { session_id } = options

		// Check for existing Activity in this session
		if (this.sessions.has(session_id)) {
			// Close existing one first (one Activity per session)
			this.closeActivity(session_id)
		}

		// Generate IDs
		const instance_id = generateSnowflake()
		const frame_id = generateSnowflake()

		// Resolve user_id: use provided, or fall back to session's current user
		let user_id = options.user_id
		if (!user_id) {
			const mockSession = sessionManager.get(session_id)
			user_id = mockSession?.state.currentUser.id ?? generateSnowflake()
		}

		// Create session record
		const record = createActivitySessionRecord({
			session_id,
			instance_id,
			frame_id,
			application_id: options.application_id,
			guild_id: options.guild_id ?? null,
			channel_id: options.channel_id ?? null,
			user_id,
			locale: options.locale,
			platform: options.platform,
			launch_url: options.launch_url
		})

		// Store
		this.sessions.set(session_id, record)
		this.subscriptions.set(instance_id, new SubscriptionRegistry(instance_id))
		this.frameToInstance.set(frame_id, instance_id)
		this.instanceToSession.set(instance_id, session_id)

		mockLogger.info(`Activity launched: instance=${instance_id} frame=${frame_id} session=${session_id}`)

		return record
	}

	/**
	 * Close an Activity for a mock session.
	 * Clears subscriptions, routing bindings, pending requests.
	 */
	closeActivity(session_id: string): boolean {
		const record = this.sessions.get(session_id)
		if (!record) {
			return false
		}

		// Clean up subscriptions
		const subs = this.subscriptions.get(record.instance_id)
		if (subs) {
			subs.clear()
			this.subscriptions.delete(record.instance_id)
		}

		// Clean up rate limiter
		record.rate_limiter.reset()

		// Clean up routing
		this.frameToInstance.delete(record.frame_id)
		this.instanceToSession.delete(record.instance_id)

		// Remove session record
		this.sessions.delete(session_id)

		mockLogger.info(`Activity closed: instance=${record.instance_id} session=${session_id}`)

		return true
	}

	/**
	 * Get the Activity session record for a mock session.
	 */
	getRecord(session_id: string): ActivitySessionRecord | undefined {
		return this.sessions.get(session_id)
	}

	/**
	 * Get the SubscriptionRegistry for an instance.
	 */
	getSubscriptions(instance_id: string): SubscriptionRegistry | undefined {
		return this.subscriptions.get(instance_id)
	}

	/**
	 * Check if a session has an active Activity.
	 */
	hasActivity(session_id: string): boolean {
		return this.sessions.has(session_id)
	}

	// =========================================================================
	// Routing (spec section 2.3)
	// =========================================================================

	/**
	 * Resolve a session_id from routing identifiers.
	 *
	 * Routing priority (spec section 2.3):
	 * 1. frame_id (primary)
	 * 2. instance_id (secondary)
	 * 3. Direct session_id (fallback from Stage WS, which already knows session)
	 *
	 * Returns null if routing is nondeterministic.
	 */
	resolveSessionId(params: {
		frame_id?: string
		instance_id?: string
		session_id?: string
	}): string | null {
		// Primary: frame_id
		if (params.frame_id) {
			const instanceId = this.frameToInstance.get(params.frame_id)
			if (instanceId) {
				const sessionId = this.instanceToSession.get(instanceId)
				if (sessionId) return sessionId
			}
		}

		// Secondary: instance_id
		if (params.instance_id) {
			const sessionId = this.instanceToSession.get(params.instance_id)
			if (sessionId) return sessionId
		}

		// Fallback: direct session_id (from Stage WS connection, which already knows)
		if (params.session_id && this.sessions.has(params.session_id)) {
			return params.session_id
		}

		return null
	}

	// =========================================================================
	// Inbound RPC Handling (main entry point)
	// =========================================================================

	/**
	 * Handle an inbound RPC message from the Activity.
	 *
	 * This is the main entry point called by the Stage WS server when it
	 * receives an `activity_rpc` command.
	 *
	 * @param session_id - The mock session ID (resolved by Stage WS or routing)
	 * @param rawMessage - The raw RPC message from the Activity iframe
	 * @returns Result containing outbound messages to send back
	 */
	handleInbound(session_id: string, rawMessage: unknown): HandleInboundResult {
		const record = this.sessions.get(session_id)
		if (!record) {
			// Best-effort: if this looks like a FRAME payload, respond with an error using its cmd/nonce.
			try {
				if (Array.isArray(rawMessage) && rawMessage.length >= 2 && rawMessage[0] === ActivityRpcOpcode.FRAME) {
					const parsed = parseInboundEnvelope(rawMessage[1])
					return {
						outbound: [buildErrorResponse(parsed.cmd, parsed.nonce, RpcErrorCode.NOT_FOUND, 'No active Activity for this session')]
					}
				}
				if (typeof rawMessage === 'object' && rawMessage !== null) {
					const parsed = parseInboundEnvelope(rawMessage)
					return {
						outbound: [buildErrorResponse(parsed.cmd, parsed.nonce, RpcErrorCode.NOT_FOUND, 'No active Activity for this session')]
					}
				}
			} catch {
				// Ignore parsing failures; nothing to correlate
			}
			return { outbound: [] }
		}

		// Embedded SDK transport: rawMessage may be [opcode, payload]
		if (Array.isArray(rawMessage) && rawMessage.length >= 2 && typeof rawMessage[0] === 'number') {
			const opcode = rawMessage[0]
			const payload = rawMessage[1]

			// HANDSHAKE is not a FRAME payload; it triggers READY emission
			if (opcode === ActivityRpcOpcode.HANDSHAKE) {
				return this.handleHandshake(record, payload)
			}

			// CLOSE/HELLO are lifecycle/compat opcodes; Host does not respond with FRAME
			if (opcode === ActivityRpcOpcode.CLOSE || opcode === ActivityRpcOpcode.HELLO) {
				return { outbound: [] }
			}

			// FRAME payloads are the RPC commands we process below
			if (opcode === ActivityRpcOpcode.FRAME) {
				rawMessage = payload
			} else {
				return { outbound: [] }
			}
		}

		// Parse FRAME payload
		let parsed: InboundRpcMessage
		try {
			parsed = parseInboundEnvelope(rawMessage)
		} catch (error) {
			// If we can't parse cmd+nonce, we can't correlate a response; ignore.
			if (error instanceof RpcValidationError) {
				mockLogger.debug(`RPC parse error: ${error.message}`)
				return { outbound: [] }
			}
			mockLogger.debug('RPC parse error: failed to parse message')
			return { outbound: [] }
		}

		// Rate limiting (code 4290)
		if (!record.rate_limiter.check()) {
			const retryAfter = record.rate_limiter.retryAfterMs()
			return {
				outbound: [
					buildErrorResponse(
						parsed.cmd,
						parsed.nonce,
						RpcErrorCode.RATE_LIMITED,
						'Too many requests. Slow down.',
						{ retry_after_ms: retryAfter }
					)
				]
			}
		}

		// Handle SDK-only commands not in the manifest (e.g., GET_INSTANCE_ID)
		if (parsed.cmd === 'GET_INSTANCE_ID') {
			return {
				outbound: [
					buildCommandResponse(parsed.cmd, parsed.nonce, { instance_id: record.instance_id })
				]
			}
		}

		// Validate command exists in manifest
		const commandMap = getCommandMap()
		const commandDef = validateCommand(parsed.cmd, commandMap)
		if (!commandDef) {
			return {
				outbound: [
					buildErrorResponse(parsed.cmd, parsed.nonce, RpcErrorCode.NOT_IMPLEMENTED, `Unknown command: ${parsed.cmd}`)
				]
			}
		}

		// Auth gating (spec section 5 + 3.4 error code 4001)
		if (this.isAuthRequired(parsed.cmd, commandDef) && record.auth.state !== 'AUTHENTICATED') {
			return {
				outbound: [
					buildErrorResponse(
						parsed.cmd,
						parsed.nonce,
						RpcErrorCode.UNAUTHORIZED,
						`Command "${parsed.cmd}" requires authentication. Call authorize() and authenticate() first.`
					)
				]
			}
		}

		// Dispatch to command handler
		try {
			const result = dispatchCommand(parsed, record, this, commandDef)
			return result
		} catch (error) {
			if (error instanceof RpcValidationError) {
				return {
					outbound: [buildErrorResponse(parsed.cmd, parsed.nonce, error.code, error.message)]
				}
			}
			const msg = error instanceof Error ? error.message : String(error)
			mockLogger.error(`RPC command error: ${msg}`)
			return {
				outbound: [buildErrorResponse(parsed.cmd, parsed.nonce, RpcErrorCode.INTERNAL, msg)]
			}
		}
	}

	// =========================================================================
	// Handshake + READY (spec section 4)
	// =========================================================================

	/**
	 * Handle Embedded SDK HANDSHAKE opcode.
	 *
	 * Activity posts: [Opcodes.HANDSHAKE, { v:1, encoding:"json", client_id, frame_id, sdk_version? }]
	 * Host responds by emitting READY as a DISPATCH frame:
	 *   [Opcodes.FRAME, { cmd:"DISPATCH", evt:"READY", nonce:null, data:{...} }]
	 */
	private handleHandshake(record: ActivitySessionRecord, _handshakePayload: unknown): HandleInboundResult {
		const outbound: unknown[] = []

		// Mark handshake received
		record.handshake_received = true

		// Re-handshake: iframe reloads, SDK must re-initialize.
		// Clear subscriptions so the Activity can resubscribe cleanly.
		if (record.ready_emitted) {
			mockLogger.info(`Re-handshake for instance=${record.instance_id} -- clearing subscriptions and re-emitting READY`)

			const subs = this.subscriptions.get(record.instance_id)
			if (subs) subs.clear()

			record.deferred_subscriptions = []
			record.pending_authorize = null
			record.pending_purchase = null
		}

		// Resolve user data from mock session
		const mockSession = sessionManager.get(record.session_id)
		const user = mockSession?.state.users.get(record.user_id) ?? mockSession?.state.currentUser

		// READY user schema in @discord/embedded-app-sdk is strict:
		// - avatar is optional string (NOT nullable)
		// - extra keys are ignored/stripped by the SDK
		// When avatar is null, Discord omits the field (do the same) to avoid parse failures.
		const readyUser: Record<string, unknown> = user
			? {
					id: user.id,
					username: user.username,
					discriminator: user.discriminator ?? '0'
				}
			: {
					id: record.user_id,
					username: 'MockUser',
					discriminator: '0'
				}
		if (user?.avatar) {
			readyUser.avatar = user.avatar
		}

		const readyPayload = {
			v: 1,
			config: {
				cdn_host: 'cdn.discordapp.com',
				api_endpoint: '//discord.com/api',
				environment: 'production'
			},
			user: readyUser
		}

		// READY is a DISPATCH event frame
		outbound.push(buildEventDispatch('READY', readyPayload))
		record.ready_emitted = true

		// Flush any deferred subscriptions (subscriptions received before READY)
		// No events other than READY before READY is emitted.
		for (const deferred of record.deferred_subscriptions) {
			const subs = this.subscriptions.get(record.instance_id)
			if (!subs) continue

			const isNew = subs.subscribe(deferred.event_name, deferred.args)
			if (isNew) {
				const snapshot = this.getSnapshotForEvent(deferred.event_name, record)
				if (snapshot !== null) {
					if (Array.isArray(snapshot)) {
						for (const item of snapshot) {
							outbound.push(buildEventDispatch(deferred.event_name, item))
						}
					} else {
						outbound.push(buildEventDispatch(deferred.event_name, snapshot))
					}
				}
			}
		}
		record.deferred_subscriptions = []

		mockLogger.debug(`READY emitted for instance=${record.instance_id}`)

		return { outbound }
	}

	// =========================================================================
	// Event emission helpers
	// =========================================================================

	/**
	 * Emit an event to an Activity instance (if subscribed).
	 * Respects event gating: no events before READY (spec section 14.1).
	 *
	 * Returns the event dispatch object if emitted, null if not subscribed or gated.
	 */
	emitEvent(session_id: string, event_name: string, data: unknown): unknown | null {
		const record = this.sessions.get(session_id)
		if (!record) return null

		// Event gating: no events before READY
		if (!record.ready_emitted) return null

		// Check subscription
		const subs = this.subscriptions.get(record.instance_id)
		if (!subs || !subs.isSubscribed(event_name)) return null

		return buildEventDispatch(event_name, data)
	}

	/**
	 * Get a snapshot payload for a stateful event (for snapshot-on-subscribe).
	 * Returns null if no snapshot is available or event is not snapshot-capable.
	 */
	getSnapshotForEvent(event_name: string, record: ActivitySessionRecord): unknown | null {
		const eventMap = getEventMap()
		const eventDef = eventMap.get(event_name)
		if (!eventDef?.snapshot_on_subscribe) return null

		const mockSession = sessionManager.get(record.session_id)
		if (!mockSession) return null

		switch (event_name) {
			case 'ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE': {
				return {
					participants: this.getConnectedParticipants(record)
				}
			}

			case 'ACTIVITY_LAYOUT_MODE_UPDATE': {
				return { layout_mode: record.platform_state.layout_mode }
			}

			case 'ORIENTATION_UPDATE': {
				return {
					screen_orientation: record.platform_state.screen_orientation,
					orientation: record.platform_state.orientation
				}
			}

			case 'THERMAL_STATE_UPDATE': {
				return { thermal_state: record.platform_state.thermal_state }
			}

			case 'CURRENT_USER_UPDATE': {
				const user = mockSession.state.users.get(record.user_id) ?? mockSession.state.currentUser
				return this.toSdkUser(user)
			}

			case 'CURRENT_GUILD_MEMBER_UPDATE': {
				if (!record.guild_id) return null
				const member = mockSession.state.getGuildMember(record.guild_id, record.user_id)
				return {
					user_id: record.user_id,
					guild_id: record.guild_id,
					nick: member?.nick ?? null,
					avatar: null,
					avatar_decoration_data: null,
					color_string: null
				}
			}

			case 'VOICE_STATE_UPDATE': {
				// Snapshot: emit current voice states for the Activity's channel (one event per user)
				return this.getVoiceStateSnapshots(record)
			}

			case 'RELATIONSHIP_UPDATE': {
				return { relationships: record.relationship_state.relationships }
			}

			default:
				return null
		}
	}

	/**
	 * Get connected participants for an Activity instance.
	 * Shape matches @discord/embedded-app-sdk GET_ACTIVITY_INSTANCE_CONNECTED_PARTICIPANTS
	 * and ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE payload schemas.
	 */
	getConnectedParticipants(
		record: ActivitySessionRecord
	): Array<{
		id: string
		username: string
		global_name?: string | null
		discriminator: string
		avatar?: string | null
		flags: number
		bot: boolean
		avatar_decoration_data?: null
		premium_type?: number | null
		nickname?: string
	}> {
		const mockSession = sessionManager.get(record.session_id)
		if (!mockSession) return []

		const participants: Array<{
			id: string
			username: string
			global_name?: string | null
			discriminator: string
			avatar?: string | null
			flags: number
			bot: boolean
			avatar_decoration_data?: null
			premium_type?: number | null
			nickname?: string
		}> = []

		for (const vs of mockSession.state.voiceStates.values()) {
			if (vs.channel_id === record.channel_id) {
				const user = mockSession.state.users.get(vs.user_id)
				if (user) {
					const member = record.guild_id ? mockSession.state.getGuildMember(record.guild_id, user.id) : null
					participants.push({
						id: user.id,
						username: user.username,
						global_name: user.globalName ?? null,
						discriminator: user.discriminator ?? '0',
						avatar: user.avatar ?? null,
						flags: (user as { flags?: number }).flags ?? 0,
						bot: Boolean((user as { bot?: boolean }).bot),
						avatar_decoration_data: null,
						premium_type: (user as { premiumType?: number | null }).premiumType ?? null,
						nickname: member?.nick ?? undefined
					})
				}
			}
		}

		return participants
	}

	private getVoiceStateSnapshots(record: ActivitySessionRecord): Array<{
		mute: boolean
		nick: string
		user: Record<string, unknown>
		voice_state: { mute: boolean; deaf: boolean; self_mute: boolean; self_deaf: boolean; suppress: boolean }
		volume: number
	}> {
		const mockSession = sessionManager.get(record.session_id)
		if (!mockSession || !record.channel_id) return []

		const snapshots: Array<{
			mute: boolean
			nick: string
			user: Record<string, unknown>
			voice_state: { mute: boolean; deaf: boolean; self_mute: boolean; self_deaf: boolean; suppress: boolean }
			volume: number
		}> = []

		for (const vs of mockSession.state.voiceStates.values()) {
			if (vs.channel_id !== record.channel_id) continue
			const user = mockSession.state.users.get(vs.user_id)
			if (!user) continue
			const member = record.guild_id ? mockSession.state.getGuildMember(record.guild_id, user.id) : null

			snapshots.push({
				mute: vs.mute ?? false,
				nick: member?.nick ?? user.username,
				user: this.toSdkUser(user),
				voice_state: {
					mute: vs.mute ?? false,
					deaf: vs.deaf ?? false,
					self_mute: vs.self_mute ?? false,
					self_deaf: vs.self_deaf ?? false,
					suppress: false
				},
				volume: 100
			})
		}

		return snapshots
	}

	private toSdkUser(user: {
		id: string
		username: string
		discriminator?: string
		avatar?: string | null
		globalName?: string | null
		bot?: boolean
		flags?: number | null
		premiumType?: number | null
	}): Record<string, unknown> {
		return {
			id: user.id,
			username: user.username,
			discriminator: user.discriminator ?? '0',
			global_name: user.globalName ?? null,
			avatar: user.avatar ?? null,
			avatar_decoration_data: null,
			bot: Boolean(user.bot),
			flags: user.flags ?? null,
			premium_type: user.premiumType ?? null
		}
	}

	// =========================================================================
	// Auth helpers
	// =========================================================================

	/**
	 * Determine if a command requires authentication.
	 *
	 * Rules:
	 * 1. If manifest says auth_required=true, require auth.
	 * 2. If manifest says auth_required=false, skip auth.
	 * 3. If manifest says auth_required=null (unknown), use heuristic:
	 *    - Always allow without auth: AUTHORIZE, AUTHENTICATE, SUBSCRIBE, UNSUBSCRIBE,
	 *      DISPATCH, GET_INSTANCE_ID, GET_PLATFORM_BEHAVIORS, ENCOURAGE_HARDWARE_ACCELERATION
	 *    - Everything else: require auth when auth_required is null
	 */
	private isAuthRequired(cmd: string, commandDef: RpcCommandDefinition): boolean {
		// Explicit manifest annotation
		if (commandDef.auth_required === true) return true
		if (commandDef.auth_required === false) return false

		// auth_required is null -- use heuristic
		const ALWAYS_ALLOWED = new Set([
			'AUTHORIZE',
			'AUTHENTICATE',
			'SUBSCRIBE',
			'UNSUBSCRIBE',
			'DISPATCH',
			'GET_INSTANCE_ID',
			'GET_PLATFORM_BEHAVIORS',
			'ENCOURAGE_HW_ACCELERATION',
			// Legacy spelling (keep for compatibility with older manifests/spec drafts)
			'ENCOURAGE_HARDWARE_ACCELERATION'
		])

		return !ALWAYS_ALLOWED.has(cmd)
	}

	/**
	 * Resolve a pending AUTHORIZE request with the consent result.
	 * Called by the Stage WS handler when it receives `activity_authorize_result`.
	 *
	 * @returns Outbound messages to send to the Activity, or null if no pending request.
	 */
	resolveAuthorize(
		session_id: string,
		nonce: string,
		approved: boolean,
		approvedScopes?: string[]
	): unknown[] | null {
		const record = this.sessions.get(session_id)
		if (!record || !record.pending_authorize) return null
		if (record.pending_authorize.nonce !== nonce) return null

		const pending = record.pending_authorize
		record.pending_authorize = null

		if (!approved) {
			return [buildErrorResponse('AUTHORIZE', nonce, RpcErrorCode.FORBIDDEN, 'Authorization denied by user')]
		}

		const scopes = approvedScopes ?? pending.scopes
		const code = `mock_auth_code_${record.instance_id}_${Date.now().toString(36)}`

		// Store authorized scopes for later use in AUTHENTICATE
		record.auth.authorized_scopes = scopes

		return [
			buildCommandResponse('AUTHORIZE', nonce, {
				code,
				state: pending.state
			})
		]
	}

	/**
	 * Resolve a pending START_PURCHASE request with the purchase modal result.
	 * Called by the Stage WS handler when it receives `activity_purchase_result`.
	 *
	 * @returns Outbound messages to send to the Activity, or null if no pending request.
	 */
	resolvePurchase(
		session_id: string,
		nonce: string,
		approved: boolean
	): unknown[] | null {
		const record = this.sessions.get(session_id)
		if (!record || !record.pending_purchase) return null
		if (record.pending_purchase.nonce !== nonce) return null

		const pending = record.pending_purchase
		record.pending_purchase = null

		if (!approved) {
			return [buildErrorResponse('START_PURCHASE', nonce, RpcErrorCode.FORBIDDEN, 'Purchase cancelled by user')]
		}

		// Create new entitlement
		const entitlement = {
			id: generateSnowflake(),
			sku_id: pending.sku_id,
			user_id: record.user_id,
			application_id: record.application_id,
			gift_code_flags: 0,
			type: 7, // PREMIUM_PURCHASE
			consumed: false
		}

		// Add to store
		record.iap_state.entitlements.push(entitlement)

		const outbound: unknown[] = []

		// Send START_PURCHASE command response (success = entitlements array)
		outbound.push(buildCommandResponse('START_PURCHASE', nonce, [entitlement]))

		// Emit ENTITLEMENT_CREATE event if subscribed
		const eventMsg = this.emitEvent(session_id, 'ENTITLEMENT_CREATE', { entitlement })
		if (eventMsg) {
			outbound.push(eventMsg)
		}

		return outbound
	}

	// =========================================================================
	// Cleanup
	// =========================================================================

	/**
	 * Close all Activity sessions (e.g., on server shutdown).
	 */
	closeAll(): void {
		const sessionIds = Array.from(this.sessions.keys())
		for (const sessionId of sessionIds) {
			this.closeActivity(sessionId)
		}
	}
}

// =========================================================================
// Singleton
// =========================================================================

let _activityHostManager: ActivityHostManager | null = null

export function getActivityHostManager(): ActivityHostManager {
	if (!_activityHostManager) {
		_activityHostManager = new ActivityHostManager()
	}
	return _activityHostManager
}

export function resetActivityHostManager(): void {
	if (_activityHostManager) {
		_activityHostManager.closeAll()
		_activityHostManager = null
	}
}

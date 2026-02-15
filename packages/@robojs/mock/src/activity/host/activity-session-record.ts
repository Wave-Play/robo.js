import type { IapState, RelationshipState, QuestState, PendingPurchaseRequest } from './iap-types.js'
import { createDefaultIapState, createDefaultRelationshipState, createDefaultQuestState } from './iap-types.js'
import { RpcRateLimiter } from './rate-limiter.js'

/**
 * Per-Activity runtime record, as required by RPC Host Spec section 1.3.
 * One record per launched Activity instance within a mock session.
 */
export interface ActivitySessionRecord {
	/** The mock session this Activity belongs to */
	session_id: string

	/** Unique per launched Activity instance (stable for lifetime) */
	instance_id: string

	/** Identifies the iframe window for postMessage routing */
	frame_id: string

	/** OAuth2 client ID / Application ID */
	application_id: string

	/** Guild context (null in DMs) */
	guild_id: string | null

	/** Channel context (voice or text) */
	channel_id: string | null

	/** The current user viewing the Activity */
	user_id: string

	/** BCP-47 locale (e.g., 'en-US') */
	locale: string

	/** Platform hint (desktop, web, mobile) */
	platform: string

	/** Creation time */
	created_at: number

	/** Auth state */
	auth: ActivityAuthState

	/** Whether READY has been emitted for this session */
	ready_emitted: boolean

	/** Whether handshake has been received */
	handshake_received: boolean

	/** Activity launch URL (original, before proxy) */
	launch_url: string

	/** Pending RPC responses that haven't been sent yet (deferred before READY) */
	deferred_subscriptions: DeferredSubscription[]

	/** Rich Presence / Activity status set by SET_ACTIVITY */
	activity_status: ActivityPresence | null

	/** DevTools auth simulator settings */
	devtools_auth: DevToolsAuthSettings

	/** Platform state (layout, orientation, thermal) controlled by DevTools */
	platform_state: ActivityPlatformState

	/**
	 * Pending AUTHORIZE request waiting for UI consent result.
	 * Only one pending authorize at a time per Activity.
	 */
	pending_authorize: PendingAuthorizeRequest | null

	/** IAP state: SKUs and entitlements for this Activity session */
	iap_state: IapState

	/** Relationship state: user's social graph for this Activity session */
	relationship_state: RelationshipState

	/** Quest state for this Activity session */
	quest_state: QuestState

	/**
	 * Pending START_PURCHASE request waiting for UI purchase result.
	 * Only one pending purchase at a time per Activity.
	 */
	pending_purchase: PendingPurchaseRequest | null

	/** Per-instance rate limiter for RPC commands */
	rate_limiter: RpcRateLimiter
}

export interface ActivityAuthState {
	state: 'UNAUTHENTICATED' | 'AUTHENTICATED'
	access_token?: string
	scopes?: string[]
	expires?: string
	/** Scopes granted in the most recent successful AUTHORIZE (carried forward to AUTHENTICATE) */
	authorized_scopes?: string[]
}

/**
 * DevTools auth simulator settings.
 * Configured from the Stage UI DevTools panel.
 */
export interface DevToolsAuthSettings {
	/**
	 * Auth mode:
	 * - 'auto_approve': Automatically approve AUTHORIZE requests (default, matches Phase 2 behavior)
	 * - 'auto_deny': Automatically deny AUTHORIZE requests
	 * - 'manual': Show consent modal and wait for user interaction
	 */
	mode: 'auto_approve' | 'auto_deny' | 'manual'

	/** Default scopes to grant when auto-approving (empty = grant all requested) */
	default_scopes: string[]
}

/**
 * A pending AUTHORIZE request waiting for consent UI result.
 */
export interface PendingAuthorizeRequest {
	nonce: string
	client_id: string
	scopes: string[]
	state: string | null
	response_type: string
	prompt: string | null
	created_at: number
}

export interface DeferredSubscription {
	event_name: string
	args: Record<string, unknown>
	nonce: string
}

export interface ActivityPresence {
	details?: string
	state?: string
	timestamps?: { start?: number; end?: number }
	assets?: {
		large_image?: string
		large_text?: string
		small_image?: string
		small_text?: string
	}
	buttons?: Array<{ label: string; url: string }>
}

/**
 * Platform state managed by DevTools controls.
 * These values are emitted as snapshots on subscribe and as updates on change.
 */
export interface ActivityPlatformState {
	/** Layout mode enum: 0=focused, 1=pip, 2=grid */
	layout_mode: number

	/** Screen orientation: 0=portrait, 1=landscape */
	screen_orientation: number

	/** Orientation string */
	orientation: 'portrait' | 'landscape'

	/** Thermal state enum: 0=nominal, 1=fair, 2=serious, 3=critical */
	thermal_state: number
}

/** Factory function */
export function createActivitySessionRecord(params: {
	session_id: string
	instance_id: string
	frame_id: string
	application_id: string
	guild_id: string | null
	channel_id: string | null
	user_id: string
	locale?: string
	platform?: string
	launch_url: string
}): ActivitySessionRecord {
	return {
		...params,
		locale: params.locale ?? 'en-US',
		platform: params.platform ?? 'desktop',
		created_at: Date.now(),
		auth: { state: 'UNAUTHENTICATED' },
		ready_emitted: false,
		handshake_received: false,
		deferred_subscriptions: [],
		activity_status: null,
		devtools_auth: { mode: 'auto_approve', default_scopes: [] },
		platform_state: {
			layout_mode: 0,
			screen_orientation: 1,
			orientation: 'landscape',
			thermal_state: 0
		},
		pending_authorize: null,
		iap_state: createDefaultIapState(),
		relationship_state: createDefaultRelationshipState(),
		quest_state: createDefaultQuestState(),
		pending_purchase: null,
		rate_limiter: new RpcRateLimiter()
	}
}

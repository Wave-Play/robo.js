/**
 * Shared IAP/Social/Quest mock data types.
 * Used by activity-session-record.ts, command handlers, and stage types.
 */

/** Discord SKU object (simplified for mock) */
export interface MockSku {
	id: string
	name: string
	type: number // 2=DURABLE, 3=CONSUMABLE, 5=SUBSCRIPTION, 6=SUBSCRIPTION_GROUP
	slug: string
	application_id: string
	price: {
		amount: number
		currency: string
	}
	flags: number
}

/** Discord Entitlement object (simplified for mock) */
export interface MockEntitlement {
	id: string
	sku_id: string
	user_id: string
	application_id: string
	type: number // 4=APPLICATION_SUBSCRIPTION, 7=PURCHASE, 8=PREMIUM_PURCHASE
	consumed: boolean
	starts_at?: string | null
	ends_at?: string | null
	guild_id?: string | null
}

/** Pending purchase request waiting for Stage UI modal result */
export interface PendingPurchaseRequest {
	nonce: string
	sku_id: string
	sku_name: string
	sku_price: { amount: number; currency: string }
	created_at: number
}

/** IAP state store for mock SKUs and entitlements */
export interface IapState {
	/** Available SKUs (products) configured in DevTools */
	skus: MockSku[]
	/** Entitlements (purchased items) */
	entitlements: MockEntitlement[]
}

/** Discord Relationship object (simplified for mock) */
export interface MockRelationship {
	id: string
	type: number // 1=FRIEND, 2=BLOCKED, 3=PENDING_INCOMING, 4=PENDING_OUTGOING
	user: {
		id: string
		username: string
		discriminator: string
		avatar: string | null
		global_name?: string | null
	}
	presence?: {
		status: 'online' | 'offline' | 'idle' | 'dnd'
		activities?: Array<{ name: string; type: number }>
	}
}

/** Social/Relationship state store */
export interface RelationshipState {
	relationships: MockRelationship[]
}

/** Discord Quest enrollment status (simplified for mock) */
export interface MockQuestEnrollmentStatus {
	quest_id: string
	enrolled_at: string
	completed_at: string | null
	progress: number // 0-100
	timer_started_at: string | null
	timer_duration_seconds: number
}

/** Discord Quest definition (for DevTools display) */
export interface MockQuest {
	id: string
	name: string
	description: string
	reward_code_sku_id?: string
	enrollment_status: MockQuestEnrollmentStatus | null
}

/** Quest state store for mock quests */
export interface QuestState {
	quests: MockQuest[]
}

// ============================================================================
// Factory functions
// ============================================================================

export function createDefaultIapState(): IapState {
	return { skus: [], entitlements: [] }
}

export function createDefaultRelationshipState(): RelationshipState {
	return { relationships: [] }
}

export function createDefaultQuestState(): QuestState {
	return { quests: [] }
}

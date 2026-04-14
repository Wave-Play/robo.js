import type { Client } from '../core/types.js'

// ============================================================================
// Handler Context Types
// ============================================================================

/**
 * Client info available in handler contexts.
 */
export interface HandlerClient<ClientData = unknown> {
	/** Unique client identifier */
	id: string
	/** Client metadata (from useSyncState options) */
	data?: ClientData
}

/**
 * Context passed to validation and transform handlers.
 */
export interface SyncUpdateContext<T = unknown, ClientData = unknown> {
	/** The new state being set */
	newState: T
	/** The previous state (may be undefined for first update) */
	oldState: T | undefined
	/** The client making the update */
	client: HandlerClient<ClientData>
	/** Dynamic route parameters extracted from key (e.g., { roomId: '123' }) */
	params: Record<string, string>
	/** The full key array */
	key: string[]
	/** The normalized key string */
	cleanKey: string
}

/**
 * Context passed to middleware handlers.
 */
export interface SyncMiddlewareContext<T = unknown, ClientData = unknown> {
	/** The state data (newState for 'before', final state for 'after') */
	state: T
	/** The client making the request */
	client: HandlerClient<ClientData>
	/** Dynamic route parameters */
	params: Record<string, string>
	/** The full key array */
	key: string[]
	/** The normalized key string */
	cleanKey: string
	/** Message type ('update', 'call', etc.) */
	messageType: string
}

/**
 * Result from middleware 'before' handler.
 */
export type MiddlewareResult =
	| { continue: true }
	| { reject: true; reason?: string }

/**
 * Context passed to RPC call handlers.
 */
export interface SyncCallContext<T = unknown, ClientData = unknown> {
	/** The client making the call */
	client: HandlerClient<ClientData>
	/** Dynamic route parameters */
	params: Record<string, string>
	/** The full key array */
	key: string[]
	/** The normalized key string */
	cleanKey: string
	/** Get current state for this key */
	getState: () => T | undefined
	/** Set state (broadcasts automatically) */
	setState: (data: T) => void
	/** Get current host client ID */
	getHost: () => string | undefined
	/** Get all clients subscribed to this key */
	getClients: () => Client<ClientData>[]
	/** Broadcast ephemeral message to all clients */
	broadcast: (payload: unknown) => void
	/** Send ephemeral message to specific client */
	send: (clientId: string, payload: unknown) => void
}

// ============================================================================
// Handler Function Types
// ============================================================================

/**
 * Validation function - return true to accept, false or string to reject.
 */
export type ValidateHandler<T = unknown, ClientData = unknown> = (
	context: SyncUpdateContext<T, ClientData>
) => boolean | string | Promise<boolean | string>

/**
 * Transform function - modify state before broadcasting.
 */
export type TransformHandler<T = unknown, ClientData = unknown> = (
	context: SyncUpdateContext<T, ClientData>
) => T | Promise<T>

/**
 * Post-update callback.
 */
export type OnUpdateHandler<T = unknown, ClientData = unknown> = (
	context: SyncUpdateContext<T, ClientData>
) => void | Promise<void>

/**
 * Middleware 'before' handler.
 */
export type MiddlewareBeforeHandler<T = unknown, ClientData = unknown> = (
	context: SyncMiddlewareContext<T, ClientData>
) => MiddlewareResult | Promise<MiddlewareResult>

/**
 * Middleware 'after' handler.
 */
export type MiddlewareAfterHandler<T = unknown, ClientData = unknown> = (
	context: SyncMiddlewareContext<T, ClientData>
) => void | Promise<void>

/**
 * RPC call handler function.
 */
export type CallHandler<Payload = unknown, Result = unknown, State = unknown, ClientData = unknown> = (
	payload: Payload,
	context: SyncCallContext<State, ClientData>
) => Result | Promise<Result>

// ============================================================================
// Handler Module Types
// ============================================================================

/**
 * A sync handler module can export any combination of these.
 */
export interface SyncHandlerModule<T = unknown, ClientData = unknown> {
	/** Schema for validation (Zod or built-in format) */
	schema?: unknown
	/** Validate incoming updates */
	validate?: ValidateHandler<T, ClientData>
	/** Transform state before broadcasting */
	transform?: TransformHandler<T, ClientData>
	/** Called after successful update */
	onUpdate?: OnUpdateHandler<T, ClientData>
	/** RPC call handlers (any other named export) */
	[key: string]: unknown
}

/**
 * A middleware module exports before and/or after hooks.
 */
export interface SyncMiddlewareModule<T = unknown, ClientData = unknown> {
	before?: MiddlewareBeforeHandler<T, ClientData>
	after?: MiddlewareAfterHandler<T, ClientData>
}

// ============================================================================
// Handler Registry Types
// ============================================================================

/**
 * Resolved handler record from manifest.
 */
export interface SyncHandlerRecord {
	/** The key pattern (e.g., 'game/[roomId]/position') */
	key: string
	/** Path to the handler module */
	path: string
	/** Portal key for lazy runtime loading */
	portalKey?: string
	/** Named exports available */
	exports: {
		schema?: boolean
		validate?: boolean
		transform?: boolean
		onUpdate?: boolean
		named: string[] // RPC function names
	}
	/** Dynamic parameters (e.g., ['roomId']) */
	params?: string[]
	/** Loaded handler module (lazy loaded) */
	handler?: SyncHandlerModule
}

/**
 * Middleware record from manifest.
 */
export interface SyncMiddlewareRecord {
	/** Directory path this middleware applies to */
	path: string
	/** Original portal key used for lazy runtime loading */
	portalKey?: string
	/** Named exports available */
	exports: {
		before?: boolean
		after?: boolean
	}
	/** Loaded middleware module (lazy loaded) */
	handler?: SyncMiddlewareModule
}

// ============================================================================
// Schema Types
// ============================================================================

/**
 * Built-in schema field definition.
 */
export interface SchemaField {
	type: 'string' | 'number' | 'boolean' | 'object' | 'array'
	nullable?: boolean
	optional?: boolean
	min?: number
	max?: number
	minLength?: number
	maxLength?: number
	pattern?: string
	enum?: (string | number)[]
	items?: SchemaField
	properties?: Record<string, SchemaField>
}

/**
 * Built-in schema definition (alternative to Zod).
 */
export type BuiltInSchema = Record<string, SchemaField>

/**
 * Schema validation result.
 */
export interface SchemaValidationResult {
	success: boolean
	errors?: Array<{ path: string; message: string }>
}

// ============================================================================
// Message Types
// ============================================================================

/**
 * Extended message types for sync handlers.
 */
export type SyncMessageType = 'update' | 'call' | 'call_result' | 'validation_error'

/**
 * Call message from client.
 */
export interface CallMessage {
	type: 'call'
	key: string[]
	callId: string
	method: string
	payload: unknown
}

/**
 * Call result message to client.
 */
export interface CallResultMessage {
	type: 'call_result'
	callId: string
	result?: unknown
	error?: string
}

/**
 * Validation error message to client.
 */
export interface ValidationErrorMessage {
	type: 'validation_error'
	key: string[]
	reason: string
	details?: unknown
}

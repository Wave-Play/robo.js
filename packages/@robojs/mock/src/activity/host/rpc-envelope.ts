import type { RpcCommandDefinition, RpcEventDefinition } from '../schema/manifest-types.js'
import { RpcErrorCode } from './error-codes.js'
import type { RpcErrorCodeValue } from './error-codes.js'

/**
 * Parsed inbound RPC message from Activity.
 * Spec section 3.1.1: { cmd, nonce, args }
 */
export interface InboundRpcMessage {
	cmd: string
	nonce: string
	args?: Record<string, unknown>
	/** Raw message for logging/debugging */
	_raw: unknown
}

/**
 * Parse and validate an inbound RPC envelope.
 * Returns InboundRpcMessage or throws with a descriptive error.
 */
export function parseInboundEnvelope(raw: unknown): InboundRpcMessage {
	if (typeof raw !== 'object' || raw === null) {
		throw new RpcValidationError('Message must be a JSON object', RpcErrorCode.BAD_REQUEST)
	}

	const msg = raw as Record<string, unknown>

	// cmd is required
	if (typeof msg.cmd !== 'string' || !msg.cmd) {
		throw new RpcValidationError('Missing or invalid "cmd" field', RpcErrorCode.BAD_REQUEST)
	}

	// nonce is required for command requests
	if (typeof msg.nonce !== 'string' || !msg.nonce) {
		throw new RpcValidationError('Missing or invalid "nonce" field', RpcErrorCode.BAD_REQUEST)
	}

	// args is optional, must be object if present
	if (msg.args !== undefined && (typeof msg.args !== 'object' || msg.args === null)) {
		throw new RpcValidationError('"args" must be an object', RpcErrorCode.BAD_REQUEST)
	}

	return {
		cmd: msg.cmd,
		nonce: msg.nonce,
		args: (msg.args as Record<string, unknown>) ?? {},
		_raw: raw
	}
}

/**
 * Build a command response (Host -> Activity).
 * Spec section 3.1.2: { cmd, nonce, data }
 */
export function buildCommandResponse(cmd: string, nonce: string, data: unknown): object {
	return { cmd, nonce, data: data ?? null }
}

/**
 * Build an error response (Host -> Activity).
 * Spec section 3.1.3: { evt: "ERROR", nonce, data: { code, message, details? } }
 */
export function buildErrorResponse(
	nonce: string,
	code: RpcErrorCodeValue,
	message: string,
	details?: Record<string, unknown>
): object {
	const errorData: Record<string, unknown> = { code, message }
	if (details) {
		errorData.details = details
	}
	return {
		evt: 'ERROR',
		nonce,
		data: errorData
	}
}

/**
 * Build an event dispatch (Host -> Activity).
 * Spec section 3.1.4: { evt, data }
 * Note: events have NO nonce (they are async, not correlated to requests).
 */
export function buildEventDispatch(evt: string, data: unknown): object {
	return { evt, data: data ?? null }
}

export class RpcValidationError extends Error {
	readonly code: RpcErrorCodeValue
	constructor(message: string, code: RpcErrorCodeValue) {
		super(message)
		this.name = 'RpcValidationError'
		this.code = code
	}
}

/**
 * Validate an inbound command exists in the manifest.
 * Returns the command definition if valid, or null if unknown.
 */
export function validateCommand(cmd: string, commandMap: Map<string, RpcCommandDefinition>): RpcCommandDefinition | null {
	return commandMap.get(cmd) ?? null
}

/**
 * Validate outbound response data against response_schema (future).
 * For now, this is a no-op pass-through since schemas are null in pinned manifest.
 */
export function validateResponseData(
	_cmd: string,
	_data: unknown,
	commandDef: RpcCommandDefinition
): boolean {
	if (commandDef.response_schema === null) {
		return true // No schema to validate against
	}
	return true // Placeholder
}

/**
 * Validate outbound event payload against event schema (future).
 */
export function validateEventPayload(
	_evt: string,
	_data: unknown,
	eventDef: RpcEventDefinition
): boolean {
	if (eventDef.payload_schema === null) {
		return true
	}
	return true // Placeholder
}

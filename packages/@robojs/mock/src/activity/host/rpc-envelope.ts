import type { RpcCommandDefinition, RpcEventDefinition } from '../schema/manifest-types.js'
import { RpcErrorCode } from './error-codes.js'
import type { RpcErrorCodeValue } from './error-codes.js'

/**
 * Embedded App SDK postMessage opcodes (DiscordSDK.Opcodes).
 * Values are stable and used by @discord/embedded-app-sdk.
 */
export const ActivityRpcOpcode = {
	HANDSHAKE: 0,
	FRAME: 1,
	CLOSE: 2,
	HELLO: 3
} as const

export type ActivityRpcOpcodeValue = (typeof ActivityRpcOpcode)[keyof typeof ActivityRpcOpcode]

/**
 * postMessage tuple form used by the Embedded App SDK: [opcode, payload]
 */
export type ActivityRpcTuple<T = unknown> = [ActivityRpcOpcodeValue, T]

/**
 * Parsed inbound RPC message from Activity.
 * FRAME payload (Activity -> Host): { cmd, nonce, args?, evt? }
 */
export interface InboundRpcMessage {
	cmd: string
	nonce: string
	args?: Record<string, unknown>
	/** Subscription event name (SUBSCRIBE/UNSUBSCRIBE) */
	evt?: string | null
	/** Raw message for logging/debugging */
	_raw: unknown
}

/**
 * Parse and validate an inbound FRAME payload.
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

	// evt is optional (SUBSCRIBE/UNSUBSCRIBE)
	const evt = (typeof msg.evt === 'string' ? msg.evt : (msg.evt === null ? null : undefined))

	// args is optional; treat null/undefined as empty object, otherwise must be object
	let args: Record<string, unknown> = {}
	if (msg.args !== undefined && msg.args !== null) {
		if (typeof msg.args !== 'object') {
			throw new RpcValidationError('"args" must be an object', RpcErrorCode.BAD_REQUEST)
		}
		args = msg.args as Record<string, unknown>
	}

	return {
		cmd: msg.cmd,
		nonce: msg.nonce,
		args,
		evt,
		_raw: raw
	}
}

/**
 * Build a FRAME payload for a command response (Host -> Activity).
 * Embedded App SDK expects: { cmd, evt: null, nonce, data }
 */
export function buildCommandResponse(cmd: string, nonce: string, data: unknown): ActivityRpcTuple<object> {
	return [
		ActivityRpcOpcode.FRAME,
		{ cmd, evt: null, nonce, data: data ?? null }
	]
}

/**
 * Build an ERROR event frame (Host -> Activity).
 * Embedded App SDK expects: { cmd, evt: "ERROR", nonce, data: { code, message?, ... } }
 */
export function buildErrorResponse(
	cmd: string,
	nonce: string,
	code: RpcErrorCodeValue,
	message: string,
	details?: Record<string, unknown>
): ActivityRpcTuple<object> {
	const errorData: Record<string, unknown> = { code, message }
	if (details) {
		errorData.details = details
	}
	return [
		ActivityRpcOpcode.FRAME,
		{
			cmd,
			evt: 'ERROR',
			nonce,
			data: errorData
		}
	]
}

/**
 * Build a DISPATCH event frame (Host -> Activity).
 * Embedded App SDK expects: { cmd: "DISPATCH", evt, nonce: null, data }
 */
export function buildEventDispatch(evt: string, data: unknown, nonce: string | null = null): ActivityRpcTuple<object> {
	return [
		ActivityRpcOpcode.FRAME,
		{
			cmd: 'DISPATCH',
			evt,
			nonce,
			data: data ?? null
		}
	]
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

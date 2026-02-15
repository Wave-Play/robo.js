/**
 * Stable error codes for Activity RPC responses.
 * Matches spec section 3.4 recommendations.
 */
export const RpcErrorCode = {
	BAD_REQUEST: 4000,
	UNAUTHORIZED: 4001,
	FORBIDDEN: 4003,
	NOT_FOUND: 4040,
	CONFLICT: 4090,
	RATE_LIMITED: 4290,
	INTERNAL: 5000,
	NOT_IMPLEMENTED: 5001
} as const

export type RpcErrorCodeValue = (typeof RpcErrorCode)[keyof typeof RpcErrorCode]

/**
 * Human-readable labels for error codes.
 */
export const RpcErrorMessage: Record<RpcErrorCodeValue, string> = {
	[RpcErrorCode.BAD_REQUEST]: 'Bad Request',
	[RpcErrorCode.UNAUTHORIZED]: 'Unauthorized',
	[RpcErrorCode.FORBIDDEN]: 'Forbidden',
	[RpcErrorCode.NOT_FOUND]: 'Not Found',
	[RpcErrorCode.CONFLICT]: 'Conflict',
	[RpcErrorCode.RATE_LIMITED]: 'Rate Limited',
	[RpcErrorCode.INTERNAL]: 'Internal Error',
	[RpcErrorCode.NOT_IMPLEMENTED]: 'Not Implemented'
}

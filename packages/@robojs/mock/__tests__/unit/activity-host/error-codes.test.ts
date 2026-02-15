/**
 * Tests for RPC error codes stability and completeness.
 */

import { RpcErrorCode, RpcErrorMessage } from '../../../src/activity/host/error-codes.js'
import { ActivityRpcOpcode, buildErrorResponse } from '../../../src/activity/host/rpc-envelope.js'

describe('RPC Error Codes', () => {
	test('all codes are numbers', () => {
		for (const value of Object.values(RpcErrorCode)) {
			expect(typeof value).toBe('number')
			expect(Number.isFinite(value)).toBe(true)
		}
	})

	test('all codes have messages', () => {
		for (const code of Object.values(RpcErrorCode)) {
			expect(RpcErrorMessage[code]).toBeDefined()
			expect(typeof RpcErrorMessage[code]).toBe('string')
			expect(RpcErrorMessage[code].length).toBeGreaterThan(0)
		}
	})

	test('error response shape is correct', () => {
		const response = buildErrorResponse('SOME_CMD', 'test-nonce', RpcErrorCode.NOT_IMPLEMENTED, 'Not Implemented')

		expect(response).toEqual([
			ActivityRpcOpcode.FRAME,
			{
				cmd: 'SOME_CMD',
				evt: 'ERROR',
				nonce: 'test-nonce',
				data: {
					code: 5001,
					message: 'Not Implemented'
				}
			}
		])
	})

	test('error response with details includes details', () => {
		const response = buildErrorResponse('SOME_CMD', 'test-nonce', RpcErrorCode.BAD_REQUEST, 'Bad Request', {
			field: 'cmd',
			reason: 'missing'
		})

		expect(response).toEqual([
			ActivityRpcOpcode.FRAME,
			{
				cmd: 'SOME_CMD',
				evt: 'ERROR',
				nonce: 'test-nonce',
				data: {
					code: 4000,
					message: 'Bad Request',
					details: { field: 'cmd', reason: 'missing' }
				}
			}
		])
	})

	test('expected error codes exist', () => {
		expect(RpcErrorCode.BAD_REQUEST).toBe(4000)
		expect(RpcErrorCode.UNAUTHORIZED).toBe(4001)
		expect(RpcErrorCode.FORBIDDEN).toBe(4003)
		expect(RpcErrorCode.NOT_FOUND).toBe(4040)
		expect(RpcErrorCode.CONFLICT).toBe(4090)
		expect(RpcErrorCode.RATE_LIMITED).toBe(4290)
		expect(RpcErrorCode.INTERNAL).toBe(5000)
		expect(RpcErrorCode.NOT_IMPLEMENTED).toBe(5001)
	})
})

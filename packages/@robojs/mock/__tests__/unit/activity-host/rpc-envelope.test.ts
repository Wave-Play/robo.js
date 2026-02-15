/**
 * Tests for RPC envelope parsing, validation, and response building.
 */

import {
	parseInboundEnvelope,
	buildCommandResponse,
	buildErrorResponse,
	buildEventDispatch,
	validateCommand,
	RpcValidationError
} from '../../../src/activity/host/rpc-envelope.js'
import { RpcErrorCode } from '../../../src/activity/host/error-codes.js'
import type { RpcCommandDefinition } from '../../../src/activity/schema/manifest-types.js'

describe('RPC Envelope', () => {
	describe('parseInboundEnvelope', () => {
		test('parses valid envelope', () => {
			const result = parseInboundEnvelope({
				cmd: 'GET_USER',
				nonce: 'abc-123',
				args: { id: '12345' }
			})

			expect(result.cmd).toBe('GET_USER')
			expect(result.nonce).toBe('abc-123')
			expect(result.args).toEqual({ id: '12345' })
			expect(result._raw).toBeDefined()
		})

		test('defaults args to empty object when omitted', () => {
			const result = parseInboundEnvelope({
				cmd: 'GET_INSTANCE_ID',
				nonce: 'abc-123'
			})

			expect(result.args).toEqual({})
		})

		test('throws on missing cmd', () => {
			expect(() => parseInboundEnvelope({ nonce: 'abc' })).toThrow(RpcValidationError)
			try {
				parseInboundEnvelope({ nonce: 'abc' })
			} catch (e) {
				expect((e as RpcValidationError).code).toBe(RpcErrorCode.BAD_REQUEST)
			}
		})

		test('throws on empty cmd', () => {
			expect(() => parseInboundEnvelope({ cmd: '', nonce: 'abc' })).toThrow(RpcValidationError)
		})

		test('throws on missing nonce', () => {
			expect(() => parseInboundEnvelope({ cmd: 'GET_USER' })).toThrow(RpcValidationError)
			try {
				parseInboundEnvelope({ cmd: 'GET_USER' })
			} catch (e) {
				expect((e as RpcValidationError).code).toBe(RpcErrorCode.BAD_REQUEST)
			}
		})

		test('throws on non-object message', () => {
			expect(() => parseInboundEnvelope('hello')).toThrow(RpcValidationError)
			expect(() => parseInboundEnvelope(null)).toThrow(RpcValidationError)
			expect(() => parseInboundEnvelope(42)).toThrow(RpcValidationError)
		})

		test('throws on non-object args', () => {
			expect(() =>
				parseInboundEnvelope({ cmd: 'GET_USER', nonce: 'abc', args: 'not-object' })
			).toThrow(RpcValidationError)
		})
	})

	describe('buildCommandResponse', () => {
		test('builds correct shape', () => {
			const response = buildCommandResponse('GET_USER', 'nonce-1', { id: '123' })

			expect(response).toEqual({
				cmd: 'GET_USER',
				nonce: 'nonce-1',
				data: { id: '123' }
			})
		})

		test('null-ifies undefined data', () => {
			const response = buildCommandResponse('SOME_CMD', 'nonce-1', undefined)

			expect(response).toEqual({
				cmd: 'SOME_CMD',
				nonce: 'nonce-1',
				data: null
			})
		})
	})

	describe('buildErrorResponse', () => {
		test('builds correct shape', () => {
			const response = buildErrorResponse('nonce-1', RpcErrorCode.NOT_IMPLEMENTED, 'Not Implemented')

			expect(response).toEqual({
				evt: 'ERROR',
				nonce: 'nonce-1',
				data: { code: 5001, message: 'Not Implemented' }
			})
		})
	})

	describe('buildEventDispatch', () => {
		test('builds correct shape with no nonce', () => {
			const response = buildEventDispatch('READY', { v: 1 })

			expect(response).toEqual({
				evt: 'READY',
				data: { v: 1 }
			})
			expect((response as Record<string, unknown>).nonce).toBeUndefined()
		})

		test('null-ifies undefined data', () => {
			const response = buildEventDispatch('SOME_EVENT', undefined)

			expect(response).toEqual({
				evt: 'SOME_EVENT',
				data: null
			})
		})
	})

	describe('validateCommand', () => {
		const commandMap = new Map<string, RpcCommandDefinition>()
		commandMap.set('GET_USER', {
			name: 'GET_USER',
			args_schema: null,
			response_schema: null,
			auth_required: true,
			category: 'context'
		})

		test('returns definition for known commands', () => {
			const result = validateCommand('GET_USER', commandMap)
			expect(result).toBeDefined()
			expect(result?.name).toBe('GET_USER')
		})

		test('returns null for unknown commands', () => {
			const result = validateCommand('UNKNOWN_COMMAND', commandMap)
			expect(result).toBeNull()
		})
	})
})

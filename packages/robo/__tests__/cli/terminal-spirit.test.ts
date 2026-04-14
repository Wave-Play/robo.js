/**
 * Spirit terminal-exec handler contract tests.
 *
 * spirit.ts cannot be imported directly in tests because it guards against
 * isMainThread and calls process.exit(1). These tests validate the IPC
 * contract: message shapes, payload interfaces, and the behavior expected
 * from the spirit-side handler as documented in the implementation.
 *
 * The actual spirit handler is exercised via the integration path tested
 * in terminal-exec.test.ts (CLI → spirit IPC → response).
 */

import { describe, expect, it } from '@jest/globals'
import type { SpiritMessage, TerminalExecPayload, TerminalExecResult } from '../../src/types/common.js'

describe('Spirit terminal-exec IPC contract', () => {
	// ===================================================================
	// Payload shape validation
	// ===================================================================

	it('TerminalExecPayload has required fields', () => {
		const payload: TerminalExecPayload = {
			handlerPath: '/path/to/handler.js',
			args: ['arg1', 'arg2'],
			options: { verbose: true },
			drawerAvailable: true
		}

		expect(payload.handlerPath).toBe('/path/to/handler.js')
		expect(payload.args).toEqual(['arg1', 'arg2'])
		expect(payload.options).toEqual({ verbose: true })
		expect(payload.drawerAvailable).toBe(true)
	})

	it('TerminalExecResult success shape', () => {
		const result: TerminalExecResult = {
			success: true,
			returnValue: 'output'
		}

		expect(result.success).toBe(true)
		expect(result.returnValue).toBe('output')
	})

	it('TerminalExecResult failure shape', () => {
		const result: TerminalExecResult = {
			success: false,
			error: 'Robo is not running'
		}

		expect(result.success).toBe(false)
		expect(result.error).toBe('Robo is not running')
	})

	// ===================================================================
	// IPC message shape validation
	// ===================================================================

	it('terminal-exec request message has correct shape', () => {
		const message: SpiritMessage = {
			event: 'terminal-exec',
			payload: {
				handlerPath: '/tmp/handler.js',
				args: [],
				options: {},
				drawerAvailable: false
			} satisfies TerminalExecPayload
		}

		expect(message.event).toBe('terminal-exec')
		const payload = message.payload as TerminalExecPayload
		expect(payload.handlerPath).toBeDefined()
		expect(Array.isArray(payload.args)).toBe(true)
	})

	it('terminal-write unsolicited message has correct shape', () => {
		const message: SpiritMessage = {
			event: 'terminal-write',
			payload: { text: 'hello from spirit' }
		}

		expect(message.event).toBe('terminal-write')
		const payload = message.payload as { text: string }
		expect(typeof payload.text).toBe('string')
	})

	it('terminal-drawer show message has correct shape', () => {
		const message: SpiritMessage = {
			event: 'terminal-drawer',
			payload: { action: 'show', lines: ['line 1', 'line 2'] }
		}

		expect(message.event).toBe('terminal-drawer')
		const payload = message.payload as { action: string; lines: string[] }
		expect(payload.action).toBe('show')
		expect(Array.isArray(payload.lines)).toBe(true)
	})

	it('terminal-drawer hide message has correct shape', () => {
		const message: SpiritMessage = {
			event: 'terminal-drawer',
			payload: { action: 'hide' }
		}

		expect(message.event).toBe('terminal-drawer')
		const payload = message.payload as { action: string }
		expect(payload.action).toBe('hide')
	})

	// ===================================================================
	// Event type includes terminal events
	// ===================================================================

	it('SpiritMessage event union includes terminal events', () => {
		const events: Array<SpiritMessage['event']> = [
			'terminal-exec',
			'terminal-write',
			'terminal-drawer'
		]

		// Type assertion — if these aren't valid event values, TypeScript will error
		expect(events).toHaveLength(3)
	})

	// ===================================================================
	// Response wrapping contract
	// ===================================================================

	it('spirit wraps terminal-exec result with matching event name', () => {
		// The spirit message handler wraps run() return as: { event: message.event, payload: result }
		// For terminal-exec, this means the response has event: 'terminal-exec' and payload is TerminalExecResult
		const request: SpiritMessage = { event: 'terminal-exec' }
		const result: TerminalExecResult = { success: true, returnValue: 'output' }

		// Simulates spirit.ts line 319: result = { event: message.event, payload }
		const response: SpiritMessage = { event: request.event, payload: result }

		expect(response.event).toBe('terminal-exec')
		const payload = response.payload as TerminalExecResult
		expect(payload.success).toBe(true)
		expect(payload.returnValue).toBe('output')
	})

	it('terminal-exec result payload is NOT "exit" (does not terminate spirit)', () => {
		// The spirit terminates when result.payload === 'exit' (string).
		// terminal-exec returns an object { success, returnValue?, error? }, not a string.
		// This ensures the spirit stays alive after handling terminal commands.
		const result: TerminalExecResult = { success: true, returnValue: 'exit' }

		// Even when returnValue is 'exit', the payload object is NOT the string 'exit'
		expect(result).not.toBe('exit')
		expect(typeof result).toBe('object')
	})
})

/**
 * Tests for READY emission: exactly-once invariant, event gating, deferred subscriptions.
 */

import { ActivityHostManager } from '../../../src/activity/host/activity-host-manager.js'
import { loadManifest, resetManifest } from '../../../src/activity/schema/manifest-loader.js'

// Mock the session manager
jest.mock('../../../src/core/manager.js', () => {
	const mockState = {
		users: new Map([
			[
				'user-1',
				{
					id: 'user-1',
					username: 'TestUser',
					discriminator: '0',
					avatar: 'abc123',
					globalName: 'Test User'
				}
			]
		]),
		guilds: new Map(),
		channels: new Map(),
		voiceStates: new Map(),
		currentUser: {
			id: 'user-1',
			username: 'TestUser',
			discriminator: '0',
			avatar: 'abc123',
			globalName: 'Test User'
		},
		getGuildMember: jest.fn(() => null),
		roles: new Map()
	}

	return {
		sessionManager: {
			get: jest.fn((id: string) => {
				if (id.startsWith('sess-')) {
					return { id, state: mockState }
				}
				return undefined
			})
		}
	}
})

describe('READY Emission', () => {
	let manager: ActivityHostManager

	beforeAll(() => {
		resetManifest()
		loadManifest()
	})

	beforeEach(() => {
		manager = new ActivityHostManager()
	})

	afterEach(() => {
		manager.closeAll()
	})

	test('READY emitted exactly once on first DISPATCH', () => {
		manager.launchActivity({
			session_id: 'sess-ready-1',
			application_id: 'app-123',
			user_id: 'user-1',
			launch_url: 'https://example.com/activity'
		})

		// First DISPATCH -> should get READY
		const result1 = manager.handleInbound('sess-ready-1', {
			cmd: 'DISPATCH',
			nonce: 'nonce-1',
			args: { v: 1, encoding: 'json' }
		})

		// Should have READY event + DISPATCH command response
		expect(result1.outbound.length).toBeGreaterThanOrEqual(2)

		// First message should be READY event (no nonce)
		const readyEvent = result1.outbound[0] as Record<string, unknown>
		expect(readyEvent.evt).toBe('READY')
		expect(readyEvent.nonce).toBeUndefined()

		// Second message should be DISPATCH command response (with nonce)
		const dispatchResponse = result1.outbound[1] as Record<string, unknown>
		expect(dispatchResponse.cmd).toBe('DISPATCH')
		expect(dispatchResponse.nonce).toBe('nonce-1')

		// Second DISPATCH -> should NOT re-emit READY
		const result2 = manager.handleInbound('sess-ready-1', {
			cmd: 'DISPATCH',
			nonce: 'nonce-2',
			args: { v: 1 }
		})

		// Should only have DISPATCH response, no READY event
		expect(result2.outbound).toHaveLength(1)
		const reDispatch = result2.outbound[0] as Record<string, unknown>
		expect(reDispatch.cmd).toBe('DISPATCH')
		expect(reDispatch.nonce).toBe('nonce-2')
		// No READY event in outbound
		const readyEvents = result2.outbound.filter(
			(msg) => (msg as Record<string, unknown>).evt === 'READY'
		)
		expect(readyEvents).toHaveLength(0)
	})

	test('READY payload contains v, config, and user fields', () => {
		manager.launchActivity({
			session_id: 'sess-ready-2',
			application_id: 'app-123',
			user_id: 'user-1',
			launch_url: 'https://example.com/activity'
		})

		const result = manager.handleInbound('sess-ready-2', {
			cmd: 'DISPATCH',
			nonce: 'nonce-1',
			args: { v: 1 }
		})

		const readyEvent = result.outbound[0] as Record<string, unknown>
		const data = readyEvent.data as Record<string, unknown>

		expect(data.v).toBe(1)
		expect(data.config).toBeDefined()
		expect((data.config as Record<string, unknown>).cdn_host).toBe('cdn.discordapp.com')
		expect((data.config as Record<string, unknown>).api_endpoint).toBe('//discord.com/api')
		expect(data.user).toBeDefined()
		expect((data.user as Record<string, unknown>).id).toBe('user-1')
		expect((data.user as Record<string, unknown>).username).toBe('TestUser')
	})

	test('event gating: emitEvent returns null before READY', () => {
		manager.launchActivity({
			session_id: 'sess-ready-3',
			application_id: 'app-123',
			user_id: 'user-1',
			launch_url: 'https://example.com/activity'
		})

		// No DISPATCH yet, so READY hasn't been emitted
		const result = manager.emitEvent('sess-ready-3', 'VOICE_STATE_UPDATE', { some: 'data' })
		expect(result).toBeNull()
	})

	test('event gating: emitEvent works after READY when subscribed', () => {
		manager.launchActivity({
			session_id: 'sess-ready-4',
			application_id: 'app-123',
			user_id: 'user-1',
			launch_url: 'https://example.com/activity'
		})

		// Emit READY
		manager.handleInbound('sess-ready-4', {
			cmd: 'DISPATCH',
			nonce: 'nonce-1',
			args: { v: 1 }
		})

		// Subscribe to VOICE_STATE_UPDATE
		manager.handleInbound('sess-ready-4', {
			cmd: 'SUBSCRIBE',
			nonce: 'nonce-2',
			args: { evt: 'VOICE_STATE_UPDATE' }
		})

		// Now emitEvent should work
		const result = manager.emitEvent('sess-ready-4', 'VOICE_STATE_UPDATE', { user_id: 'user-1' })
		expect(result).toBeDefined()
		expect((result as Record<string, unknown>).evt).toBe('VOICE_STATE_UPDATE')
	})

	test('deferred subscriptions: SUBSCRIBE before DISPATCH is deferred', () => {
		const record = manager.launchActivity({
			session_id: 'sess-ready-5',
			application_id: 'app-123',
			user_id: 'user-1',
			launch_url: 'https://example.com/activity'
		})

		// SUBSCRIBE before DISPATCH
		const subResult = manager.handleInbound('sess-ready-5', {
			cmd: 'SUBSCRIBE',
			nonce: 'sub-nonce-1',
			args: { evt: 'ACTIVITY_LAYOUT_MODE_UPDATE' }
		})

		// Should still get confirmation
		expect(subResult.outbound).toHaveLength(1)
		const subResponse = subResult.outbound[0] as Record<string, unknown>
		expect(subResponse.cmd).toBe('SUBSCRIBE')

		// Should be deferred
		expect(record.deferred_subscriptions).toHaveLength(1)

		// Now DISPATCH -> READY emitted + deferred subs flushed
		const readyResult = manager.handleInbound('sess-ready-5', {
			cmd: 'DISPATCH',
			nonce: 'nonce-1',
			args: { v: 1 }
		})

		// Should include:
		// 1. READY event
		// 2. DISPATCH response
		// 3. Deferred SUBSCRIBE confirmation
		// 4. Possibly a snapshot for ACTIVITY_LAYOUT_MODE_UPDATE
		expect(readyResult.outbound.length).toBeGreaterThanOrEqual(3)

		// Deferred subscriptions should be cleared
		expect(record.deferred_subscriptions).toHaveLength(0)
	})

	test('re-handshake does not re-emit READY', () => {
		manager.launchActivity({
			session_id: 'sess-ready-6',
			application_id: 'app-123',
			user_id: 'user-1',
			launch_url: 'https://example.com/activity'
		})

		// First DISPATCH
		manager.handleInbound('sess-ready-6', {
			cmd: 'DISPATCH',
			nonce: 'nonce-1',
			args: { v: 1 }
		})

		// Re-handshake
		const result = manager.handleInbound('sess-ready-6', {
			cmd: 'DISPATCH',
			nonce: 'nonce-2',
			args: { v: 1 }
		})

		// Should only have DISPATCH response
		expect(result.outbound).toHaveLength(1)
		const response = result.outbound[0] as Record<string, unknown>
		expect(response.cmd).toBe('DISPATCH')
		expect(response.nonce).toBe('nonce-2')
	})
})

/**
 * Tests for READY emission: exactly-once invariant, event gating, deferred subscriptions.
 */

import { ActivityHostManager } from '../../../src/activity/host/activity-host-manager.js'
import { loadManifest, resetManifest } from '../../../src/activity/schema/manifest-loader.js'
import { ActivityRpcOpcode } from '../../../src/activity/host/rpc-envelope.js'

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
			],
			[
				'user-2',
				{
					id: 'user-2',
					username: 'NoAvatarUser',
					discriminator: '0',
					avatar: null,
					globalName: 'No Avatar'
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

	test('READY emitted on HANDSHAKE and re-handshake', () => {
		manager.launchActivity({
			session_id: 'sess-ready-1',
			application_id: 'app-123',
			user_id: 'user-1',
			launch_url: 'https://example.com/activity'
		})

		const record = manager.getRecord('sess-ready-1')!

		// First HANDSHAKE -> should get READY
		const result1 = manager.handleInbound('sess-ready-1', [
			ActivityRpcOpcode.HANDSHAKE,
			{ v: 1, encoding: 'json', client_id: 'app-123', frame_id: record.frame_id }
		])

		expect(result1.outbound).toHaveLength(1)

		const [opcode1, readyFrame] = result1.outbound[0] as [number, Record<string, unknown>]
		expect(opcode1).toBe(ActivityRpcOpcode.FRAME)
		expect(readyFrame.cmd).toBe('DISPATCH')
		expect(readyFrame.evt).toBe('READY')
		expect(readyFrame.nonce).toBeNull()

		// Second HANDSHAKE -> should re-emit READY (iframe reload case)
		const result2 = manager.handleInbound('sess-ready-1', [
			ActivityRpcOpcode.HANDSHAKE,
			{ v: 1, encoding: 'json', client_id: 'app-123', frame_id: record.frame_id }
		])

		expect(result2.outbound).toHaveLength(1)
		const [, readyFrame2] = result2.outbound[0] as [number, Record<string, unknown>]
		expect(readyFrame2.evt).toBe('READY')
	})

	test('READY payload contains v, config, and user fields', () => {
		manager.launchActivity({
			session_id: 'sess-ready-2',
			application_id: 'app-123',
			user_id: 'user-1',
			launch_url: 'https://example.com/activity'
		})

		const record = manager.getRecord('sess-ready-2')!
		const result = manager.handleInbound('sess-ready-2', [
			ActivityRpcOpcode.HANDSHAKE,
			{ v: 1, encoding: 'json', client_id: 'app-123', frame_id: record.frame_id }
		])

		const [, readyEvent] = result.outbound[0] as [number, Record<string, unknown>]
		const data = readyEvent.data as Record<string, unknown>

		expect(data.v).toBe(1)
		expect(data.config).toBeDefined()
		expect((data.config as Record<string, unknown>).cdn_host).toBe('cdn.discordapp.com')
		expect((data.config as Record<string, unknown>).api_endpoint).toBe('//discord.com/api')
		expect(data.user).toBeDefined()
		expect((data.user as Record<string, unknown>).id).toBe('user-1')
		expect((data.user as Record<string, unknown>).username).toBe('TestUser')
	})

	test('READY payload omits avatar when null', () => {
		manager.launchActivity({
			session_id: 'sess-ready-2b',
			application_id: 'app-123',
			user_id: 'user-2',
			launch_url: 'https://example.com/activity'
		})

		const record = manager.getRecord('sess-ready-2b')!
		const result = manager.handleInbound('sess-ready-2b', [
			ActivityRpcOpcode.HANDSHAKE,
			{ v: 1, encoding: 'json', client_id: 'app-123', frame_id: record.frame_id }
		])

		const [, readyEvent] = result.outbound[0] as [number, Record<string, unknown>]
		const data = readyEvent.data as Record<string, unknown>
		const user = data.user as Record<string, unknown>

		expect(user.id).toBe('user-2')
		expect(user.username).toBe('NoAvatarUser')
		expect(user.discriminator).toBe('0')
		expect(user.avatar).toBeUndefined()
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

		const record = manager.getRecord('sess-ready-4')!

		// Emit READY via HANDSHAKE
		manager.handleInbound('sess-ready-4', [
			ActivityRpcOpcode.HANDSHAKE,
			{ v: 1, encoding: 'json', client_id: 'app-123', frame_id: record.frame_id }
		])

		// Subscribe to VOICE_STATE_UPDATE
		manager.handleInbound('sess-ready-4', [
			ActivityRpcOpcode.FRAME,
			{ cmd: 'SUBSCRIBE', evt: 'VOICE_STATE_UPDATE', nonce: 'nonce-2', args: {} }
		])

		// Now emitEvent should work
		const result = manager.emitEvent('sess-ready-4', 'VOICE_STATE_UPDATE', { user_id: 'user-1' })
		expect(result).toBeDefined()
		const [, eventFrame] = result as [number, Record<string, unknown>]
		expect(eventFrame.evt).toBe('VOICE_STATE_UPDATE')
	})

	test('deferred subscriptions: SUBSCRIBE before READY is deferred', () => {
		const record = manager.launchActivity({
			session_id: 'sess-ready-5',
			application_id: 'app-123',
			user_id: 'user-1',
			launch_url: 'https://example.com/activity'
		})

		// SUBSCRIBE before READY/handshake (will be deferred)
		const subResult = manager.handleInbound('sess-ready-5', [
			ActivityRpcOpcode.FRAME,
			{ cmd: 'SUBSCRIBE', evt: 'ACTIVITY_LAYOUT_MODE_UPDATE', nonce: 'sub-nonce-1', args: {} }
		])

		// Should still get confirmation
		expect(subResult.outbound).toHaveLength(1)
		const [, subResponse] = subResult.outbound[0] as [number, Record<string, unknown>]
		expect(subResponse.cmd).toBe('SUBSCRIBE')

		// Should be deferred
		expect(record.deferred_subscriptions).toHaveLength(1)

		// Now HANDSHAKE -> READY emitted + deferred subs flushed (no duplicate SUBSCRIBE response)
		const readyResult = manager.handleInbound('sess-ready-5', [
			ActivityRpcOpcode.HANDSHAKE,
			{ v: 1, encoding: 'json', client_id: 'app-123', frame_id: record.frame_id }
		])

		// Should include:
		// 1. READY event
		// 2. Snapshot for ACTIVITY_LAYOUT_MODE_UPDATE (snapshot_on_subscribe)
		expect(readyResult.outbound.length).toBeGreaterThanOrEqual(1)

		// Deferred subscriptions should be cleared
		expect(record.deferred_subscriptions).toHaveLength(0)
	})

	test('re-handshake clears subscriptions and re-emits READY', () => {
		manager.launchActivity({
			session_id: 'sess-ready-6',
			application_id: 'app-123',
			user_id: 'user-1',
			launch_url: 'https://example.com/activity'
		})

		const record = manager.getRecord('sess-ready-6')!

		// First HANDSHAKE
		manager.handleInbound('sess-ready-6', [
			ActivityRpcOpcode.HANDSHAKE,
			{ v: 1, encoding: 'json', client_id: 'app-123', frame_id: record.frame_id }
		])

		// Subscribe so we can verify it gets cleared
		manager.handleInbound('sess-ready-6', [
			ActivityRpcOpcode.FRAME,
			{ cmd: 'SUBSCRIBE', evt: 'ACTIVITY_LAYOUT_MODE_UPDATE', nonce: 'sub-1', args: {} }
		])

		// Re-handshake
		const result = manager.handleInbound('sess-ready-6', [
			ActivityRpcOpcode.HANDSHAKE,
			{ v: 1, encoding: 'json', client_id: 'app-123', frame_id: record.frame_id }
		])

		expect(result.outbound).toHaveLength(1)

		// Subscriptions should be cleared on re-handshake (Activity must resubscribe)
		const subs = manager.getSubscriptions(record.instance_id)!
		expect(subs.isSubscribed('ACTIVITY_LAYOUT_MODE_UPDATE')).toBe(false)
	})
})

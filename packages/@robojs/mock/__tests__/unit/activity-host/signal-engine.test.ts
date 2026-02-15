/**
 * Tests for the signal engine module.
 * Covers voice signals (SPEAKING_START/STOP), platform signals,
 * subscription scoping, coalescing, and timer cleanup.
 */

import {
	onVoiceStateChanged,
	onPlatformStateChanged,
	scheduleParticipantsUpdate,
	cancelCoalesceTimers
} from '../../../src/activity/host/signal-engine.js'
import { ActivityHostManager, getActivityHostManager, resetActivityHostManager } from '../../../src/activity/host/activity-host-manager.js'
import { loadManifest, resetManifest } from '../../../src/activity/schema/manifest-loader.js'

// Mock the session manager
jest.mock('../../../src/core/manager.js', () => {
	const mockUsers = new Map([
		[
			'user-1',
			{
				id: 'user-1',
				username: 'TestUser',
				discriminator: '0',
				avatar: null,
				globalName: 'Test User'
			}
		]
	])

	const mockVoiceStates = new Map()

	const mockState = {
		users: mockUsers,
		guilds: new Map(),
		channels: new Map(),
		voiceStates: mockVoiceStates,
		currentUser: {
			id: 'user-1',
			username: 'TestUser',
			discriminator: '0',
			avatar: null,
			globalName: 'Test User'
		},
		getGuildMember: jest.fn(() => null),
		roles: new Map()
	}

	return {
		sessionManager: {
			get: jest.fn((id: string) => {
				if (id === 'sess-1') {
					return { id, state: mockState }
				}
				return undefined
			})
		}
	}
})

describe('SignalEngine', () => {
	let manager: ActivityHostManager

	beforeAll(() => {
		resetManifest()
		loadManifest()
	})

	beforeEach(() => {
		resetActivityHostManager()
		manager = getActivityHostManager()
	})

	afterEach(() => {
		resetActivityHostManager()
	})

	// Helper: launch activity with READY emitted
	function setupReadyActivity() {
		const record = manager.launchActivity({
			session_id: 'sess-1',
			application_id: 'app-1',
			guild_id: 'guild-1',
			channel_id: 'channel-1',
			launch_url: 'https://example.com'
		})
		// Emit READY via handshake
		manager.handleInbound('sess-1', { cmd: 'DISPATCH', nonce: 'n1', args: {} })
		return record
	}

	describe('onVoiceStateChanged', () => {
		test('does NOT emit when Activity is not ready', () => {
			manager.launchActivity({
				session_id: 'sess-1',
				application_id: 'app-1',
				launch_url: 'https://example.com'
			})
			// Not calling DISPATCH -> ready_emitted is false

			const result = onVoiceStateChanged('sess-1', 'user-1', 'channel-1', false, true)
			expect(result).toEqual([])
		})

		test('does NOT emit speaking when not subscribed', () => {
			setupReadyActivity()
			// No subscriptions

			const result = onVoiceStateChanged('sess-1', 'user-1', 'channel-1', false, true)
			expect(result).toEqual([])
		})

		test('emits SPEAKING_START when speaking becomes true and subscribed', () => {
			const record = setupReadyActivity()
			const subs = manager.getSubscriptions(record.instance_id)!
			subs.subscribe('SPEAKING_START', {})

			const result = onVoiceStateChanged('sess-1', 'user-1', 'channel-1', false, true)
			expect(result).toHaveLength(1)
			expect(result[0]).toEqual({
				evt: 'SPEAKING_START',
				data: { user_id: 'user-1', channel_id: 'channel-1' }
			})
		})

		test('emits SPEAKING_STOP when speaking becomes false and subscribed', () => {
			const record = setupReadyActivity()
			const subs = manager.getSubscriptions(record.instance_id)!
			subs.subscribe('SPEAKING_STOP', {})

			const result = onVoiceStateChanged('sess-1', 'user-1', 'channel-1', true, false)
			expect(result).toHaveLength(1)
			expect(result[0]).toEqual({
				evt: 'SPEAKING_STOP',
				data: { user_id: 'user-1', channel_id: 'channel-1' }
			})
		})

		test('does NOT emit speaking when speaking state unchanged', () => {
			const record = setupReadyActivity()
			const subs = manager.getSubscriptions(record.instance_id)!
			subs.subscribe('SPEAKING_START', {})
			subs.subscribe('SPEAKING_STOP', {})

			const result = onVoiceStateChanged('sess-1', 'user-1', 'channel-1', false, false)
			expect(result).toEqual([])
		})

		test('SPEAKING_START respects channel_id scoping -- matching channel', () => {
			const record = setupReadyActivity()
			const subs = manager.getSubscriptions(record.instance_id)!
			subs.subscribe('SPEAKING_START', { channel_id: 'channel-1' })

			const result = onVoiceStateChanged('sess-1', 'user-1', 'channel-1', false, true)
			expect(result).toHaveLength(1)
			expect((result[0] as { evt: string }).evt).toBe('SPEAKING_START')
		})

		test('SPEAKING_START respects channel_id scoping -- non-matching channel', () => {
			const record = setupReadyActivity()
			const subs = manager.getSubscriptions(record.instance_id)!
			subs.subscribe('SPEAKING_START', { channel_id: 'channel-1' })

			const result = onVoiceStateChanged('sess-1', 'user-1', 'channel-other', false, true)
			expect(result).toEqual([])
		})

		test('does NOT emit when channelId is null', () => {
			const record = setupReadyActivity()
			const subs = manager.getSubscriptions(record.instance_id)!
			subs.subscribe('SPEAKING_START', {})

			const result = onVoiceStateChanged('sess-1', 'user-1', null, false, true)
			expect(result).toEqual([])
		})

		test('returns empty for unknown session', () => {
			const result = onVoiceStateChanged('unknown', 'user-1', 'channel-1', false, true)
			expect(result).toEqual([])
		})
	})

	describe('onPlatformStateChanged', () => {
		test('emits ACTIVITY_LAYOUT_MODE_UPDATE when subscribed', () => {
			const record = setupReadyActivity()
			const subs = manager.getSubscriptions(record.instance_id)!
			subs.subscribe('ACTIVITY_LAYOUT_MODE_UPDATE', {})

			const result = onPlatformStateChanged('sess-1', 'layout_mode', 1)
			expect(result).toHaveLength(1)
			expect(result[0]).toEqual({
				evt: 'ACTIVITY_LAYOUT_MODE_UPDATE',
				data: { layout_mode: 1 }
			})
		})

		test('emits ORIENTATION_UPDATE when subscribed', () => {
			const record = setupReadyActivity()
			const subs = manager.getSubscriptions(record.instance_id)!
			subs.subscribe('ORIENTATION_UPDATE', {})

			const orientationValue = { screen_orientation: 0, orientation: 'portrait' }
			const result = onPlatformStateChanged('sess-1', 'orientation', orientationValue)
			expect(result).toHaveLength(1)
			expect(result[0]).toEqual({
				evt: 'ORIENTATION_UPDATE',
				data: orientationValue
			})
		})

		test('emits THERMAL_STATE_UPDATE when subscribed', () => {
			const record = setupReadyActivity()
			const subs = manager.getSubscriptions(record.instance_id)!
			subs.subscribe('THERMAL_STATE_UPDATE', {})

			const result = onPlatformStateChanged('sess-1', 'thermal_state', 2)
			expect(result).toHaveLength(1)
			expect(result[0]).toEqual({
				evt: 'THERMAL_STATE_UPDATE',
				data: { thermal_state: 2 }
			})
		})

		test('does NOT emit when not subscribed', () => {
			setupReadyActivity()

			const result = onPlatformStateChanged('sess-1', 'layout_mode', 1)
			expect(result).toEqual([])
		})

		test('does NOT emit when Activity not ready', () => {
			manager.launchActivity({
				session_id: 'sess-1',
				application_id: 'app-1',
				launch_url: 'https://example.com'
			})

			const result = onPlatformStateChanged('sess-1', 'layout_mode', 1)
			expect(result).toEqual([])
		})
	})

	describe('scheduleParticipantsUpdate', () => {
		test('coalesces within 50ms window', (done) => {
			setupReadyActivity()
			let callCount = 0

			const callback = () => {
				callCount++
			}

			// Schedule twice rapidly
			scheduleParticipantsUpdate('sess-1', callback)
			scheduleParticipantsUpdate('sess-1', callback)
			scheduleParticipantsUpdate('sess-1', callback)

			// After 100ms, should have been called at most once
			setTimeout(() => {
				expect(callCount).toBeLessThanOrEqual(1)
				done()
			}, 100)
		})

		test('cancelCoalesceTimers prevents emission', (done) => {
			setupReadyActivity()
			let called = false

			scheduleParticipantsUpdate('sess-1', () => {
				called = true
			})

			cancelCoalesceTimers('sess-1')

			setTimeout(() => {
				expect(called).toBe(false)
				done()
			}, 100)
		})

		test('cancelCoalesceTimers is safe on unknown session', () => {
			// Should not throw
			cancelCoalesceTimers('unknown-session')
		})
	})
})

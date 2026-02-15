/**
 * Tests for snapshot-on-subscribe behavior.
 * Verifies that getSnapshotForEvent reads from record.platform_state
 * instead of hardcoded defaults.
 */

import { ActivityHostManager, resetActivityHostManager } from '../../../src/activity/host/activity-host-manager.js'
import { loadManifest, resetManifest } from '../../../src/activity/schema/manifest-loader.js'
import { ActivityRpcOpcode } from '../../../src/activity/host/rpc-envelope.js'

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

describe('Snapshot-on-Subscribe', () => {
	let manager: ActivityHostManager

	beforeAll(() => {
		resetManifest()
		loadManifest()
	})

	beforeEach(() => {
		resetActivityHostManager()
		manager = new ActivityHostManager()
	})

	afterEach(() => {
		manager.closeAll()
	})

	function launchAndReady() {
		const record = manager.launchActivity({
			session_id: 'sess-1',
			application_id: 'app-1',
			guild_id: 'guild-1',
			channel_id: 'channel-1',
			launch_url: 'https://example.com'
		})
		// Emit READY via HANDSHAKE
		manager.handleInbound('sess-1', [
			ActivityRpcOpcode.HANDSHAKE,
			{ v: 1, encoding: 'json', client_id: 'app-1', frame_id: record.frame_id }
		])
		return record
	}

	test('ACTIVITY_LAYOUT_MODE_UPDATE returns current layout_mode from platform_state', () => {
		const record = launchAndReady()
		// Default is 0
		let snapshot = manager.getSnapshotForEvent('ACTIVITY_LAYOUT_MODE_UPDATE', record)
		expect(snapshot).toEqual({ layout_mode: 0 })

		// Modify platform_state
		record.platform_state.layout_mode = 1
		snapshot = manager.getSnapshotForEvent('ACTIVITY_LAYOUT_MODE_UPDATE', record)
		expect(snapshot).toEqual({ layout_mode: 1 })

		record.platform_state.layout_mode = 2
		snapshot = manager.getSnapshotForEvent('ACTIVITY_LAYOUT_MODE_UPDATE', record)
		expect(snapshot).toEqual({ layout_mode: 2 })
	})

	test('ORIENTATION_UPDATE returns current orientation from platform_state', () => {
		const record = launchAndReady()
		// Default is landscape
		let snapshot = manager.getSnapshotForEvent('ORIENTATION_UPDATE', record)
		expect(snapshot).toEqual({ screen_orientation: 1, orientation: 'landscape' })

		// Change to portrait
		record.platform_state.screen_orientation = 0
		record.platform_state.orientation = 'portrait'
		snapshot = manager.getSnapshotForEvent('ORIENTATION_UPDATE', record)
		expect(snapshot).toEqual({ screen_orientation: 0, orientation: 'portrait' })
	})

	test('THERMAL_STATE_UPDATE returns current thermal_state from platform_state', () => {
		const record = launchAndReady()
		// Default is 0 (nominal)
		let snapshot = manager.getSnapshotForEvent('THERMAL_STATE_UPDATE', record)
		expect(snapshot).toEqual({ thermal_state: 0 })

		// Set to critical
		record.platform_state.thermal_state = 3
		snapshot = manager.getSnapshotForEvent('THERMAL_STATE_UPDATE', record)
		expect(snapshot).toEqual({ thermal_state: 3 })
	})

	test('SPEAKING_START has no snapshot (snapshot_on_subscribe = false)', () => {
		const record = launchAndReady()
		const snapshot = manager.getSnapshotForEvent('SPEAKING_START', record)
		expect(snapshot).toBeNull()
	})

	test('SPEAKING_STOP has no snapshot', () => {
		const record = launchAndReady()
		const snapshot = manager.getSnapshotForEvent('SPEAKING_STOP', record)
		expect(snapshot).toBeNull()
	})

	test('ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE returns participants snapshot', () => {
		const record = launchAndReady()
		const snapshot = manager.getSnapshotForEvent('ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE', record) as {
			participants: unknown[]
		}
		expect(snapshot).toBeDefined()
		expect(Array.isArray(snapshot.participants)).toBe(true)
	})

	test('platform_state is initialized with correct defaults', () => {
		const record = launchAndReady()
		expect(record.platform_state).toEqual({
			layout_mode: 0,
			screen_orientation: 1,
			orientation: 'landscape',
			thermal_state: 0
		})
	})
})

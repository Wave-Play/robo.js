/**
 * Tests for ActivityHostManager lifecycle, routing, and RPC handling.
 */

import { ActivityHostManager } from '../../../src/activity/host/activity-host-manager.js'
import { loadManifest, resetManifest } from '../../../src/activity/schema/manifest-loader.js'

// Mock the session manager so we don't need a real session
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

	const mockGuilds = new Map([
		[
			'guild-1',
			{
				id: 'guild-1',
				name: 'Test Guild',
				icon: null,
				ownerId: 'user-1'
			}
		]
	])

	const mockChannels = new Map([
		[
			'channel-1',
			{
				id: 'channel-1',
				name: 'test-channel',
				type: 2,
				guildId: 'guild-1'
			}
		]
	])

	const mockVoiceStates = new Map()

	const mockState = {
		users: mockUsers,
		guilds: mockGuilds,
		channels: mockChannels,
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
				if (id === 'sess-test-1' || id === 'sess-test-2') {
					return { id, state: mockState }
				}
				return undefined
			})
		}
	}
})

describe('ActivityHostManager', () => {
	let manager: ActivityHostManager

	beforeAll(() => {
		// Load pinned manifest
		resetManifest()
		loadManifest()
	})

	beforeEach(() => {
		manager = new ActivityHostManager()
	})

	afterEach(() => {
		manager.closeAll()
	})

	describe('Lifecycle', () => {
		test('launchActivity creates record with correct IDs', () => {
			const record = manager.launchActivity({
				session_id: 'sess-test-1',
				application_id: 'app-123',
				guild_id: 'guild-1',
				channel_id: 'channel-1',
				launch_url: 'https://example.com/activity'
			})

			expect(record.session_id).toBe('sess-test-1')
			expect(record.application_id).toBe('app-123')
			expect(record.guild_id).toBe('guild-1')
			expect(record.channel_id).toBe('channel-1')
			expect(record.instance_id).toBeTruthy()
			expect(record.frame_id).toBeTruthy()
			expect(record.user_id).toBeTruthy()
			expect(record.ready_emitted).toBe(false)
			expect(record.handshake_received).toBe(false)
			expect(record.auth.state).toBe('UNAUTHENTICATED')
		})

		test('closeActivity clears everything and returns true', () => {
			manager.launchActivity({
				session_id: 'sess-test-1',
				application_id: 'app-123',
				launch_url: 'https://example.com/activity'
			})

			const result = manager.closeActivity('sess-test-1')
			expect(result).toBe(true)
			expect(manager.hasActivity('sess-test-1')).toBe(false)
			expect(manager.getRecord('sess-test-1')).toBeUndefined()
		})

		test('closeActivity returns false for non-existent session', () => {
			const result = manager.closeActivity('non-existent')
			expect(result).toBe(false)
		})

		test('launching second Activity auto-closes first', () => {
			const first = manager.launchActivity({
				session_id: 'sess-test-1',
				application_id: 'app-123',
				launch_url: 'https://example.com/activity-1'
			})

			const second = manager.launchActivity({
				session_id: 'sess-test-1',
				application_id: 'app-456',
				launch_url: 'https://example.com/activity-2'
			})

			// Second should be active, first should be gone
			expect(manager.getRecord('sess-test-1')).toBe(second)
			expect(second.instance_id).not.toBe(first.instance_id)
		})

		test('getRecord returns correct record or undefined', () => {
			manager.launchActivity({
				session_id: 'sess-test-1',
				application_id: 'app-123',
				launch_url: 'https://example.com/activity'
			})

			expect(manager.getRecord('sess-test-1')).toBeDefined()
			expect(manager.getRecord('non-existent')).toBeUndefined()
		})

		test('hasActivity returns correct boolean', () => {
			expect(manager.hasActivity('sess-test-1')).toBe(false)

			manager.launchActivity({
				session_id: 'sess-test-1',
				application_id: 'app-123',
				launch_url: 'https://example.com/activity'
			})

			expect(manager.hasActivity('sess-test-1')).toBe(true)
		})
	})

	describe('Routing', () => {
		test('resolves via frame_id', () => {
			const record = manager.launchActivity({
				session_id: 'sess-test-1',
				application_id: 'app-123',
				launch_url: 'https://example.com/activity'
			})

			const resolved = manager.resolveSessionId({ frame_id: record.frame_id })
			expect(resolved).toBe('sess-test-1')
		})

		test('resolves via instance_id', () => {
			const record = manager.launchActivity({
				session_id: 'sess-test-1',
				application_id: 'app-123',
				launch_url: 'https://example.com/activity'
			})

			const resolved = manager.resolveSessionId({ instance_id: record.instance_id })
			expect(resolved).toBe('sess-test-1')
		})

		test('resolves via session_id fallback', () => {
			manager.launchActivity({
				session_id: 'sess-test-1',
				application_id: 'app-123',
				launch_url: 'https://example.com/activity'
			})

			const resolved = manager.resolveSessionId({ session_id: 'sess-test-1' })
			expect(resolved).toBe('sess-test-1')
		})

		test('returns null for unknown IDs', () => {
			expect(manager.resolveSessionId({ frame_id: 'unknown' })).toBeNull()
			expect(manager.resolveSessionId({ instance_id: 'unknown' })).toBeNull()
			expect(manager.resolveSessionId({ session_id: 'unknown' })).toBeNull()
			expect(manager.resolveSessionId({})).toBeNull()
		})
	})

	describe('closeAll', () => {
		test('closes all sessions', () => {
			manager.launchActivity({
				session_id: 'sess-test-1',
				application_id: 'app-123',
				launch_url: 'https://example.com/1'
			})
			manager.launchActivity({
				session_id: 'sess-test-2',
				application_id: 'app-456',
				launch_url: 'https://example.com/2'
			})

			expect(manager.hasActivity('sess-test-1')).toBe(true)
			expect(manager.hasActivity('sess-test-2')).toBe(true)

			manager.closeAll()

			expect(manager.hasActivity('sess-test-1')).toBe(false)
			expect(manager.hasActivity('sess-test-2')).toBe(false)
		})
	})
})

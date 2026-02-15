/**
 * Tests for individual command handler responses.
 */

import { ActivityHostManager } from '../../../src/activity/host/activity-host-manager.js'
import { loadManifest, resetManifest } from '../../../src/activity/schema/manifest-loader.js'
import { RpcErrorCode } from '../../../src/activity/host/error-codes.js'

// Mock the session manager
jest.mock('../../../src/core/manager.js', () => {
	const mockUsers = new Map([
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
				username: 'OtherUser',
				discriminator: '0',
				avatar: null,
				globalName: 'Other User'
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
				name: 'test-voice',
				type: 2,
				guildId: 'guild-1',
				topic: 'A test channel'
			}
		],
		[
			'channel-2',
			{
				id: 'channel-2',
				name: 'test-text',
				type: 0,
				guildId: 'guild-1',
				topic: null
			}
		]
	])

	const mockVoiceStates = new Map([
		[
			'guild-1:user-1',
			{
				guild_id: 'guild-1',
				channel_id: 'channel-1',
				user_id: 'user-1',
				self_mute: false,
				self_deaf: false
			}
		]
	])

	const mockRoles = new Map([
		[
			'guild-1',
			{
				id: 'guild-1',
				name: '@everyone',
				color: 0,
				position: 0,
				guildId: 'guild-1',
				hoist: false,
				permissions: '1071698660929'
			}
		]
	])

	const mockState = {
		users: mockUsers,
		guilds: mockGuilds,
		channels: mockChannels,
		voiceStates: mockVoiceStates,
		currentUser: {
			id: 'user-1',
			username: 'TestUser',
			discriminator: '0',
			avatar: 'abc123',
			globalName: 'Test User'
		},
		getGuildMember: jest.fn((guildId: string, userId: string) => {
			if (guildId === 'guild-1' && userId === 'user-1') {
				return { userId: 'user-1', guildId: 'guild-1', roles: [], nick: null }
			}
			return null
		}),
		roles: mockRoles
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

describe('Command Handlers', () => {
	let manager: ActivityHostManager

	beforeAll(() => {
		resetManifest()
		loadManifest()
	})

	beforeEach(() => {
		manager = new ActivityHostManager()

		// Launch activity and complete handshake for all tests
		manager.launchActivity({
			session_id: 'sess-cmd-1',
			application_id: 'app-123',
			guild_id: 'guild-1',
			channel_id: 'channel-1',
			user_id: 'user-1',
			launch_url: 'https://example.com/activity'
		})

		// Complete handshake
		manager.handleInbound('sess-cmd-1', {
			cmd: 'DISPATCH',
			nonce: 'handshake-nonce',
			args: { v: 1 }
		})
	})

	afterEach(() => {
		manager.closeAll()
	})

	function sendCommand(cmd: string, args?: Record<string, unknown>) {
		const result = manager.handleInbound('sess-cmd-1', {
			cmd,
			nonce: `nonce-${cmd}-${Date.now()}`,
			args: args ?? {}
		})
		return result.outbound[0] as Record<string, unknown>
	}

	test('GET_INSTANCE_ID returns correct instance_id', () => {
		const record = manager.getRecord('sess-cmd-1')!
		const response = sendCommand('GET_INSTANCE_ID')

		expect(response.cmd).toBe('GET_INSTANCE_ID')
		const data = response.data as Record<string, unknown>
		expect(data.instance_id).toBe(record.instance_id)
	})

	test('GET_PLATFORM_BEHAVIORS returns expected defaults', () => {
		const response = sendCommand('GET_PLATFORM_BEHAVIORS')
		const data = response.data as Record<string, unknown>

		expect(data.iosKeyboardResizesView).toBe(true)
		expect(data.requiresHardwareAcceleration).toBe(false)
		expect(data.supportsPopouts).toBe(true)
		expect(data.supportsOrientationLock).toBe(true)
	})

	test('ENCOURAGE_HW_ACCELERATION returns enabled: true', () => {
		const response = sendCommand('ENCOURAGE_HW_ACCELERATION')
		const data = response.data as Record<string, unknown>
		expect(data.enabled).toBe(true)
	})

	test('GET_USER returns user from mock state', () => {
		const response = sendCommand('GET_USER', { id: 'user-1' })
		const data = response.data as Record<string, unknown>

		expect(data.id).toBe('user-1')
		expect(data.username).toBe('TestUser')
		expect(data.discriminator).toBe('0')
	})

	test('GET_USER with different id returns that user', () => {
		const response = sendCommand('GET_USER', { id: 'user-2' })
		const data = response.data as Record<string, unknown>

		expect(data.id).toBe('user-2')
		expect(data.username).toBe('OtherUser')
	})

	test('GET_GUILD returns guild from mock state', () => {
		const response = sendCommand('GET_GUILD')
		const data = response.data as Record<string, unknown>

		expect(data.id).toBe('guild-1')
		expect(data.name).toBe('Test Guild')
	})

	test('GET_GUILDS returns all guilds', () => {
		const response = sendCommand('GET_GUILDS')
		const data = response.data as Record<string, unknown>
		const guilds = data.guilds as Array<Record<string, unknown>>

		expect(guilds).toHaveLength(1)
		expect(guilds[0].id).toBe('guild-1')
	})

	test('GET_CHANNEL returns channel from mock state', () => {
		const response = sendCommand('GET_CHANNEL', { channel_id: 'channel-1' })
		const data = response.data as Record<string, unknown>

		expect(data.id).toBe('channel-1')
		expect(data.name).toBe('test-voice')
		expect(data.type).toBe(2)
	})

	test('GET_CHANNELS returns channels for guild', () => {
		const response = sendCommand('GET_CHANNELS', { guild_id: 'guild-1' })
		const data = response.data as Record<string, unknown>
		const channels = data.channels as Array<Record<string, unknown>>

		expect(channels).toHaveLength(2)
	})

	test('GET_CHANNEL_PERMISSIONS returns computed permissions string', () => {
		const response = sendCommand('GET_CHANNEL_PERMISSIONS', { channel_id: 'channel-1' })
		const data = response.data as Record<string, unknown>

		expect(typeof data.permissions).toBe('string')
	})

	test('GET_ACTIVITY_INSTANCE_CONNECTED_PARTICIPANTS returns participants', () => {
		const response = sendCommand('GET_ACTIVITY_INSTANCE_CONNECTED_PARTICIPANTS')
		const data = response.data as Record<string, unknown>

		// Should have at least the participants field
		expect(data.participants).toBeDefined()
		expect(Array.isArray(data.participants)).toBe(true)
	})

	test('AUTHORIZE returns deterministic code', () => {
		const record = manager.getRecord('sess-cmd-1')!
		const response = sendCommand('AUTHORIZE', { state: 'my-state' })
		const data = response.data as Record<string, unknown>

		expect(data.code).toBe(`mock_auth_code_${record.instance_id}`)
		expect(data.state).toBe('my-state')
	})

	test('AUTHENTICATE marks auth state and returns token/scopes/user', () => {
		const response = sendCommand('AUTHENTICATE', { access_token: 'my-token' })
		const data = response.data as Record<string, unknown>

		expect(data.access_token).toBe('my-token')
		expect(data.scopes).toEqual(['identify', 'guilds'])
		expect(data.expires).toBeTruthy()
		expect(data.user).toBeDefined()

		// Verify auth state updated
		const record = manager.getRecord('sess-cmd-1')!
		expect(record.auth.state).toBe('AUTHENTICATED')
	})

	test('SET_ACTIVITY stores activity presence', () => {
		const response = sendCommand('SET_ACTIVITY', {
			activity: {
				details: 'Playing a game',
				state: 'In lobby'
			}
		})

		expect(response.cmd).toBe('SET_ACTIVITY')

		const record = manager.getRecord('sess-cmd-1')!
		expect(record.activity_status?.details).toBe('Playing a game')
		expect(record.activity_status?.state).toBe('In lobby')
	})

	test('OPEN_EXTERNAL_LINK returns void response', () => {
		const response = sendCommand('OPEN_EXTERNAL_LINK', { url: 'https://example.com' })
		expect(response.cmd).toBe('OPEN_EXTERNAL_LINK')
	})

	test('SEND_ANALYTICS_EVENT returns void (no-op)', () => {
		const response = sendCommand('SEND_ANALYTICS_EVENT', {
			event_name: 'test_event',
			event_data: { key: 'value' }
		})
		expect(response.cmd).toBe('SEND_ANALYTICS_EVENT')
	})

	test('USER_SETTINGS_GET_LOCALE returns locale', () => {
		const response = sendCommand('USER_SETTINGS_GET_LOCALE')
		const data = response.data as Record<string, unknown>
		expect(data.locale).toBe('en-US')
	})

	test('GET_SKUS returns empty skus', () => {
		const response = sendCommand('GET_SKUS')
		const data = response.data as Record<string, unknown>
		expect(data.skus).toEqual([])
	})

	test('GET_ENTITLEMENTS returns empty entitlements', () => {
		const response = sendCommand('GET_ENTITLEMENTS')
		const data = response.data as Record<string, unknown>
		expect(data.entitlements).toEqual([])
	})

	test('GET_RELATIONSHIPS returns empty relationships', () => {
		const response = sendCommand('GET_RELATIONSHIPS')
		const data = response.data as Record<string, unknown>
		expect(data.relationships).toEqual([])
	})

	test('GET_QUEST_ENROLLMENT_STATUS returns null status', () => {
		const response = sendCommand('GET_QUEST_ENROLLMENT_STATUS')
		const data = response.data as Record<string, unknown>
		expect(data.quest_enrollment_status).toBeNull()
	})

	test('unknown command returns ERROR 5001', () => {
		const result = manager.handleInbound('sess-cmd-1', {
			cmd: 'TOTALLY_FAKE_COMMAND',
			nonce: 'nonce-unknown',
			args: {}
		})

		const response = result.outbound[0] as Record<string, unknown>
		expect(response.evt).toBe('ERROR')
		expect(response.nonce).toBe('nonce-unknown')
		const data = response.data as Record<string, unknown>
		expect(data.code).toBe(RpcErrorCode.NOT_IMPLEMENTED)
	})

	test('invalid envelope (missing cmd) returns ERROR 4000', () => {
		const result = manager.handleInbound('sess-cmd-1', {
			nonce: 'nonce-bad'
		})

		const response = result.outbound[0] as Record<string, unknown>
		expect(response.evt).toBe('ERROR')
		const data = response.data as Record<string, unknown>
		expect(data.code).toBe(RpcErrorCode.BAD_REQUEST)
	})

	test('no active activity returns ERROR 4040', () => {
		const result = manager.handleInbound('non-existent-session', {
			cmd: 'GET_USER',
			nonce: 'nonce-1'
		})

		const response = result.outbound[0] as Record<string, unknown>
		expect(response.evt).toBe('ERROR')
		const data = response.data as Record<string, unknown>
		expect(data.code).toBe(RpcErrorCode.NOT_FOUND)
	})
})

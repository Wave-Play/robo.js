/**
 * Tests for auth gating behavior in ActivityHostManager.
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
		]
	])

	const mockState = {
		users: mockUsers,
		guilds: mockGuilds,
		channels: mockChannels,
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

describe('Auth Gating', () => {
	let manager: ActivityHostManager

	beforeAll(() => {
		resetManifest()
		loadManifest()
	})

	beforeEach(() => {
		manager = new ActivityHostManager()

		manager.launchActivity({
			session_id: 'sess-gate-1',
			application_id: 'app-123',
			guild_id: 'guild-1',
			channel_id: 'channel-1',
			user_id: 'user-1',
			launch_url: 'https://example.com/activity'
		})

		// Complete handshake
		manager.handleInbound('sess-gate-1', {
			cmd: 'DISPATCH',
			nonce: 'handshake-nonce',
			args: { v: 1 }
		})
	})

	afterEach(() => {
		manager.closeAll()
	})

	function sendCommand(cmd: string, args?: Record<string, unknown>) {
		return manager.handleInbound('sess-gate-1', {
			cmd,
			nonce: `nonce-${cmd}-${Date.now()}`,
			args: args ?? {}
		})
	}

	describe('unauthenticated gated commands return 4001', () => {
		const gatedCommands = [
			'GET_SKUS',
			'GET_ENTITLEMENTS',
			'GET_GUILD',
			'GET_CHANNEL',
			'SET_ACTIVITY',
			'START_PURCHASE'
		]

		test.each(gatedCommands)('%s returns UNAUTHORIZED error when unauthenticated', (cmd) => {
			const record = manager.getRecord('sess-gate-1')!
			expect(record.auth.state).toBe('UNAUTHENTICATED')

			const result = sendCommand(cmd)
			expect(result.outbound).toHaveLength(1)

			const response = result.outbound[0] as Record<string, unknown>
			expect(response.evt).toBe('ERROR')

			const data = response.data as Record<string, unknown>
			expect(data.code).toBe(RpcErrorCode.UNAUTHORIZED)
		})
	})

	describe('always-allowed commands work without auth', () => {
		const alwaysAllowed = [
			'AUTHORIZE',
			'AUTHENTICATE',
			'SUBSCRIBE',
			'GET_INSTANCE_ID',
			'GET_PLATFORM_BEHAVIORS',
			'ENCOURAGE_HARDWARE_ACCELERATION'
		]

		test.each(alwaysAllowed)('%s succeeds when unauthenticated', (cmd) => {
			const record = manager.getRecord('sess-gate-1')!
			expect(record.auth.state).toBe('UNAUTHENTICATED')

			const result = sendCommand(cmd, cmd === 'SUBSCRIBE' ? { evt: 'ACTIVITY_LAYOUT_MODE_UPDATE' } : {})
			expect(result.outbound).toHaveLength(1)

			const response = result.outbound[0] as Record<string, unknown>
			// Should NOT be an ERROR event (it should be a command response or subscription confirmation)
			expect(response.evt).not.toBe('ERROR')
		})
	})

	describe('gated commands succeed after authentication', () => {
		beforeEach(() => {
			// Authenticate the session
			sendCommand('AUTHORIZE', {
				client_id: 'app-123',
				scope: ['identify', 'guilds']
			})
			sendCommand('AUTHENTICATE', {
				access_token: 'test-token'
			})
		})

		test('GET_GUILD succeeds after authentication', () => {
			const record = manager.getRecord('sess-gate-1')!
			expect(record.auth.state).toBe('AUTHENTICATED')

			const result = sendCommand('GET_GUILD')
			expect(result.outbound).toHaveLength(1)

			const response = result.outbound[0] as Record<string, unknown>
			expect(response.cmd).toBe('GET_GUILD')
			expect(response.evt).not.toBe('ERROR')
		})

		test('GET_CHANNEL succeeds after authentication', () => {
			const result = sendCommand('GET_CHANNEL', { channel_id: 'channel-1' })
			expect(result.outbound).toHaveLength(1)

			const response = result.outbound[0] as Record<string, unknown>
			expect(response.cmd).toBe('GET_CHANNEL')
			expect(response.evt).not.toBe('ERROR')
		})
	})
})

/**
 * Integration-style tests for full auth flows using ActivityHostManager directly.
 */

import { ActivityHostManager } from '../../../src/activity/host/activity-host-manager.js'
import { loadManifest, resetManifest } from '../../../src/activity/schema/manifest-loader.js'
import { RpcErrorCode } from '../../../src/activity/host/error-codes.js'
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

describe('Auth Flow Integration', () => {
	let manager: ActivityHostManager

	beforeAll(() => {
		resetManifest()
		loadManifest()
	})

	beforeEach(() => {
		manager = new ActivityHostManager()

		manager.launchActivity({
			session_id: 'sess-flow-1',
			application_id: 'app-123',
			guild_id: 'guild-1',
			channel_id: 'channel-1',
			user_id: 'user-1',
			launch_url: 'https://example.com/activity'
		})

		// Complete handshake
		const record = manager.getRecord('sess-flow-1')!
		manager.handleInbound('sess-flow-1', [
			ActivityRpcOpcode.HANDSHAKE,
			{ v: 1, encoding: 'json', client_id: 'app-123', frame_id: record.frame_id }
		])
	})

	afterEach(() => {
		manager.closeAll()
	})

	function sendCommand(cmd: string, args?: Record<string, unknown>) {
		return manager.handleInbound('sess-flow-1', [
			ActivityRpcOpcode.FRAME,
			{
				cmd,
				nonce: `nonce-${cmd}-${Date.now()}-${Math.random()}`,
				args: args ?? {}
			}
		])
	}

	test('full auto-approve flow: AUTHORIZE -> AUTHENTICATE -> gated command succeeds', () => {
		const record = manager.getRecord('sess-flow-1')!
		expect(record.auth.state).toBe('UNAUTHENTICATED')

		// Step 1: AUTHORIZE (auto-approve mode)
		const authzResult = sendCommand('AUTHORIZE', {
			client_id: 'app-123',
			response_type: 'code',
			scope: ['identify', 'guilds'],
			state: 'test-state'
		})
		expect(authzResult.outbound).toHaveLength(1)
		const [, authzResponse] = authzResult.outbound[0] as [number, Record<string, unknown>]
		expect(authzResponse.cmd).toBe('AUTHORIZE')
		const authzData = authzResponse.data as Record<string, unknown>
		expect(authzData.code).toBeDefined()
		expect(authzData.state).toBe('test-state')

		// Step 2: AUTHENTICATE
		const authResult = sendCommand('AUTHENTICATE', {
			access_token: 'my-test-token'
		})
		expect(authResult.outbound).toHaveLength(1)
		const [, authResponse] = authResult.outbound[0] as [number, Record<string, unknown>]
		expect(authResponse.cmd).toBe('AUTHENTICATE')
		const authData = authResponse.data as Record<string, unknown>
		expect(authData.access_token).toBe('my-test-token')
		expect(authData.scopes).toEqual(['identify', 'guilds'])

		// Verify state
		expect(record.auth.state).toBe('AUTHENTICATED')

		// Step 3: Gated command should now succeed
		const guildResult = sendCommand('GET_GUILD')
		expect(guildResult.outbound).toHaveLength(1)
		const [, guildResponse] = guildResult.outbound[0] as [number, Record<string, unknown>]
		expect(guildResponse.cmd).toBe('GET_GUILD')
		expect(guildResponse.evt).not.toBe('ERROR')
	})

	test('full manual flow: AUTHORIZE -> resolveAuthorize -> AUTHENTICATE', () => {
		const record = manager.getRecord('sess-flow-1')!
		record.devtools_auth.mode = 'manual'

		// Step 1: AUTHORIZE (manual mode -- returns pending)
		const authzResult = manager.handleInbound('sess-flow-1', [
			ActivityRpcOpcode.FRAME,
			{
				cmd: 'AUTHORIZE',
				nonce: 'manual-nonce',
				args: {
					client_id: 'app-123',
					response_type: 'code',
					scope: ['identify', 'guilds', 'rpc'],
					state: 'manual-state'
				}
			}
		])
		expect(authzResult.outbound).toHaveLength(0)
		expect(authzResult._pending_authorize).toBe(true)
		expect(record.pending_authorize).not.toBeNull()

		// Step 2: Resolve with approval
		const outbound = manager.resolveAuthorize('sess-flow-1', 'manual-nonce', true, ['identify', 'guilds', 'rpc'])
		expect(outbound).not.toBeNull()
		expect(outbound).toHaveLength(1)

		const [, response] = outbound![0] as [number, Record<string, unknown>]
		expect(response.cmd).toBe('AUTHORIZE')
		const data = response.data as Record<string, unknown>
		expect(data.code).toBeDefined()
		expect(data.state).toBe('manual-state')

		expect(record.pending_authorize).toBeNull()
		expect(record.auth.authorized_scopes).toEqual(['identify', 'guilds', 'rpc'])

		// Step 3: AUTHENTICATE
		const authResult = sendCommand('AUTHENTICATE', {
			access_token: 'manual-token'
		})
		const [, authResponse] = authResult.outbound[0] as [number, Record<string, unknown>]
		const authData = authResponse.data as Record<string, unknown>
		expect(authData.scopes).toEqual(['identify', 'guilds', 'rpc'])
		expect(record.auth.state).toBe('AUTHENTICATED')
	})

	test('auth state persists across multiple gated commands', () => {
		// Authenticate first
		sendCommand('AUTHORIZE', { client_id: 'app-123', scope: ['identify'] })
		sendCommand('AUTHENTICATE', { access_token: 'persistent-token' })

		const record = manager.getRecord('sess-flow-1')!
		expect(record.auth.state).toBe('AUTHENTICATED')

		// Send multiple gated commands
		const cmds = ['GET_GUILD', 'GET_CHANNEL']
		for (const cmd of cmds) {
			const result = sendCommand(cmd, cmd === 'GET_CHANNEL' ? { channel_id: 'channel-1' } : {})
			const [, response] = result.outbound[0] as [number, Record<string, unknown>]
			expect(response.evt).not.toBe('ERROR')
		}
	})

	test('reset auth state causes gated commands to fail again', () => {
		// Authenticate
		sendCommand('AUTHORIZE', { client_id: 'app-123', scope: ['identify'] })
		sendCommand('AUTHENTICATE', { access_token: 'reset-token' })

		const record = manager.getRecord('sess-flow-1')!
		expect(record.auth.state).toBe('AUTHENTICATED')

		// Gated command succeeds
		let result = sendCommand('GET_GUILD')
		let [, response] = result.outbound[0] as [number, Record<string, unknown>]
		expect(response.evt).not.toBe('ERROR')

		// Reset auth
		record.auth = { state: 'UNAUTHENTICATED' }
		record.pending_authorize = null

		// Gated command fails again
		result = sendCommand('GET_GUILD')
		;[, response] = result.outbound[0] as [number, Record<string, unknown>]
		expect(response.evt).toBe('ERROR')
		const data = response.data as Record<string, unknown>
		expect(data.code).toBe(RpcErrorCode.UNAUTHORIZED)
	})

	test('manual mode denied: AUTHORIZE -> resolveAuthorize denied -> error', () => {
		const record = manager.getRecord('sess-flow-1')!
		record.devtools_auth.mode = 'manual'

		// AUTHORIZE
		manager.handleInbound('sess-flow-1', [
			ActivityRpcOpcode.FRAME,
			{
				cmd: 'AUTHORIZE',
				nonce: 'deny-nonce',
				args: {
					client_id: 'app-123',
					scope: ['identify'],
					state: 'deny-state'
				}
			}
		])

		// Deny
		const outbound = manager.resolveAuthorize('sess-flow-1', 'deny-nonce', false)
		expect(outbound).not.toBeNull()

		const [, response] = outbound![0] as [number, Record<string, unknown>]
		expect(response.evt).toBe('ERROR')
		const data = response.data as Record<string, unknown>
		expect(data.code).toBe(RpcErrorCode.FORBIDDEN)

		// Session should still be unauthenticated
		expect(record.auth.state).toBe('UNAUTHENTICATED')
	})
})

/**
 * Tests for AUTHORIZE and AUTHENTICATE command handlers.
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

	const mockState = {
		users: mockUsers,
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

describe('Auth Command Handlers', () => {
	let manager: ActivityHostManager

	beforeAll(() => {
		resetManifest()
		loadManifest()
	})

	beforeEach(() => {
		manager = new ActivityHostManager()

		manager.launchActivity({
			session_id: 'sess-auth-1',
			application_id: 'app-123',
			guild_id: 'guild-1',
			channel_id: 'channel-1',
			user_id: 'user-1',
			launch_url: 'https://example.com/activity'
		})

		// Complete handshake
		manager.handleInbound('sess-auth-1', {
			cmd: 'DISPATCH',
			nonce: 'handshake-nonce',
			args: { v: 1 }
		})
	})

	afterEach(() => {
		manager.closeAll()
	})

	describe('AUTHORIZE', () => {
		test('auto-approve mode returns code and state', () => {
			const record = manager.getRecord('sess-auth-1')!
			expect(record.devtools_auth.mode).toBe('auto_approve')

			const result = manager.handleInbound('sess-auth-1', {
				cmd: 'AUTHORIZE',
				nonce: 'auth-nonce-1',
				args: {
					client_id: 'app-123',
					response_type: 'code',
					scope: ['identify', 'guilds'],
					state: 'my-state'
				}
			})

			expect(result.outbound).toHaveLength(1)
			const response = result.outbound[0] as Record<string, unknown>
			expect(response.cmd).toBe('AUTHORIZE')
			expect(response.nonce).toBe('auth-nonce-1')

			const data = response.data as Record<string, unknown>
			expect(data.code).toBeDefined()
			expect(typeof data.code).toBe('string')
			expect((data.code as string).startsWith('mock_auth_code_')).toBe(true)
			expect(data.state).toBe('my-state')
			expect(result._pending_authorize).toBeUndefined()
		})

		test('auto-approve uses devtools default scopes when set', () => {
			const record = manager.getRecord('sess-auth-1')!
			record.devtools_auth.default_scopes = ['identify', 'guilds', 'rpc']

			manager.handleInbound('sess-auth-1', {
				cmd: 'AUTHORIZE',
				nonce: 'auth-nonce-2',
				args: {
					client_id: 'app-123',
					scope: ['identify']
				}
			})

			// After AUTHORIZE, authorized_scopes should be the default_scopes, not the requested
			expect(record.auth.authorized_scopes).toEqual(['identify', 'guilds', 'rpc'])
		})

		test('auto-deny mode returns error 4003', () => {
			const record = manager.getRecord('sess-auth-1')!
			record.devtools_auth.mode = 'auto_deny'

			const result = manager.handleInbound('sess-auth-1', {
				cmd: 'AUTHORIZE',
				nonce: 'auth-nonce-3',
				args: {
					client_id: 'app-123',
					scope: ['identify']
				}
			})

			expect(result.outbound).toHaveLength(1)
			const response = result.outbound[0] as Record<string, unknown>
			expect(response.evt).toBe('ERROR')

			const data = response.data as Record<string, unknown>
			expect(data.code).toBe(RpcErrorCode.FORBIDDEN)
		})

		test('manual mode sets pending_authorize and returns empty outbound', () => {
			const record = manager.getRecord('sess-auth-1')!
			record.devtools_auth.mode = 'manual'

			const result = manager.handleInbound('sess-auth-1', {
				cmd: 'AUTHORIZE',
				nonce: 'auth-nonce-4',
				args: {
					client_id: 'app-123',
					response_type: 'code',
					scope: ['identify', 'guilds'],
					state: 'my-state',
					prompt: 'consent'
				}
			})

			expect(result.outbound).toHaveLength(0)
			expect(result._pending_authorize).toBe(true)

			expect(record.pending_authorize).not.toBeNull()
			expect(record.pending_authorize!.nonce).toBe('auth-nonce-4')
			expect(record.pending_authorize!.client_id).toBe('app-123')
			expect(record.pending_authorize!.scopes).toEqual(['identify', 'guilds'])
			expect(record.pending_authorize!.state).toBe('my-state')
			expect(record.pending_authorize!.response_type).toBe('code')
			expect(record.pending_authorize!.prompt).toBe('consent')
		})
	})

	describe('resolveAuthorize', () => {
		beforeEach(() => {
			const record = manager.getRecord('sess-auth-1')!
			record.devtools_auth.mode = 'manual'

			// Send AUTHORIZE to create pending request
			manager.handleInbound('sess-auth-1', {
				cmd: 'AUTHORIZE',
				nonce: 'resolve-nonce',
				args: {
					client_id: 'app-123',
					scope: ['identify', 'guilds'],
					state: 'resolve-state'
				}
			})
		})

		test('approved returns AUTHORIZE response with code', () => {
			const outbound = manager.resolveAuthorize('sess-auth-1', 'resolve-nonce', true, ['identify', 'guilds'])

			expect(outbound).not.toBeNull()
			expect(outbound).toHaveLength(1)

			const response = outbound![0] as Record<string, unknown>
			expect(response.cmd).toBe('AUTHORIZE')
			expect(response.nonce).toBe('resolve-nonce')

			const data = response.data as Record<string, unknown>
			expect(data.code).toBeDefined()
			expect(data.state).toBe('resolve-state')

			const record = manager.getRecord('sess-auth-1')!
			expect(record.pending_authorize).toBeNull()
			expect(record.auth.authorized_scopes).toEqual(['identify', 'guilds'])
		})

		test('denied returns error 4003', () => {
			const outbound = manager.resolveAuthorize('sess-auth-1', 'resolve-nonce', false)

			expect(outbound).not.toBeNull()
			expect(outbound).toHaveLength(1)

			const response = outbound![0] as Record<string, unknown>
			expect(response.evt).toBe('ERROR')

			const data = response.data as Record<string, unknown>
			expect(data.code).toBe(RpcErrorCode.FORBIDDEN)

			const record = manager.getRecord('sess-auth-1')!
			expect(record.pending_authorize).toBeNull()
		})

		test('wrong nonce returns null', () => {
			const outbound = manager.resolveAuthorize('sess-auth-1', 'wrong-nonce', true)
			expect(outbound).toBeNull()

			// Pending should still be set
			const record = manager.getRecord('sess-auth-1')!
			expect(record.pending_authorize).not.toBeNull()
		})

		test('no pending authorize returns null', () => {
			// First resolve it
			manager.resolveAuthorize('sess-auth-1', 'resolve-nonce', true)
			// Then try again
			const outbound = manager.resolveAuthorize('sess-auth-1', 'resolve-nonce', true)
			expect(outbound).toBeNull()
		})
	})

	describe('AUTHENTICATE', () => {
		test('marks session as authenticated', () => {
			const result = manager.handleInbound('sess-auth-1', {
				cmd: 'AUTHENTICATE',
				nonce: 'auth-token-nonce',
				args: { access_token: 'my-token' }
			})

			expect(result.outbound).toHaveLength(1)
			const response = result.outbound[0] as Record<string, unknown>
			expect(response.cmd).toBe('AUTHENTICATE')

			const data = response.data as Record<string, unknown>
			expect(data.access_token).toBe('my-token')
			expect(data.scopes).toBeDefined()
			expect(data.expires).toBeDefined()
			expect(data.user).toBeDefined()

			const record = manager.getRecord('sess-auth-1')!
			expect(record.auth.state).toBe('AUTHENTICATED')
			expect(record.auth.access_token).toBe('my-token')
		})

		test('uses authorized_scopes from AUTHORIZE', () => {
			// First AUTHORIZE with specific scopes
			manager.handleInbound('sess-auth-1', {
				cmd: 'AUTHORIZE',
				nonce: 'pre-auth-nonce',
				args: {
					client_id: 'app-123',
					scope: ['identify', 'guilds', 'rpc']
				}
			})

			// Then AUTHENTICATE
			const result = manager.handleInbound('sess-auth-1', {
				cmd: 'AUTHENTICATE',
				nonce: 'auth-token-nonce',
				args: { access_token: 'my-token' }
			})

			const response = result.outbound[0] as Record<string, unknown>
			const data = response.data as Record<string, unknown>
			expect(data.scopes).toEqual(['identify', 'guilds', 'rpc'])
		})

		test('returns user data from mock session', () => {
			const result = manager.handleInbound('sess-auth-1', {
				cmd: 'AUTHENTICATE',
				nonce: 'auth-user-nonce',
				args: { access_token: 'test-token' }
			})

			const response = result.outbound[0] as Record<string, unknown>
			const data = response.data as Record<string, unknown>
			const user = data.user as Record<string, unknown>

			expect(user.id).toBe('user-1')
			expect(user.username).toBe('TestUser')
		})

		test('defaults token when not provided', () => {
			const result = manager.handleInbound('sess-auth-1', {
				cmd: 'AUTHENTICATE',
				nonce: 'auth-default-nonce',
				args: {}
			})

			const response = result.outbound[0] as Record<string, unknown>
			const data = response.data as Record<string, unknown>
			expect(data.access_token).toBeDefined()
			expect(typeof data.access_token).toBe('string')
		})
	})
})

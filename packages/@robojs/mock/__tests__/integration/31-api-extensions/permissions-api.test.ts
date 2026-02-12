/**
 * Permissions System API Tests
 *
 * Tests the control API endpoints for permission management:
 * - Enforcement level (none/basic/strict)
 * - Permission overrides (CRUD)
 * - Permission denied events history
 */
import { createSession, deleteSession, controlAPI } from '../setup/control-api.js'

interface EnforcementResponse {
	level: 'none' | 'basic' | 'strict'
	is_runtime: boolean
}

interface EnforcementSetResponse {
	success: boolean
	level: 'none' | 'basic' | 'strict'
	is_runtime: boolean
}

interface PermissionOverride {
	id: string
	user_id: string
	channel_id: string | null
	guild_id: string | null
	permissions: Record<string, 'grant' | 'deny' | 'inherit'>
	expires_at: number | null
	created_at: number
	reason: string | null
}

interface OverridesListResponse {
	overrides: PermissionOverride[]
	count: number
}

interface OverrideCreateResponse {
	success: boolean
	override: PermissionOverride
}

interface OverrideClearResponse {
	success: boolean
	cleared: number
}

interface OverrideDeleteResponse {
	success: boolean
	deleted_id: string
}

interface DeniedEvent {
	timestamp: number
	method: string
	path: string
	missing_permissions: string[]
	code: number
	message: string
	channel_id: string | null
	guild_id: string | null
}

interface DeniedEventsResponse {
	events: DeniedEvent[]
	count: number
}

interface DeniedClearResponse {
	success: boolean
	cleared: number
}

describe('Permissions System API', () => {
	let session: { id: string; token: string }

	beforeAll(async () => {
		session = await createSession({ name: 'permissions-api-tests' })
	})

	afterAll(async () => {
		await deleteSession(session.id)
	})

	describe('Enforcement Level API', () => {
		describe('GET /api/control/sessions/:id/permissions/enforcement', () => {
			it('should return default level for new session', async () => {
				const result = await controlAPI<EnforcementResponse>(`/sessions/${session.id}/permissions/enforcement`)

				expect(result.level).toBeDefined()
				expect(['none', 'basic', 'strict']).toContain(result.level)
			})

			it('should indicate is_runtime: false for default', async () => {
				// Reset to default first
				await controlAPI(`/sessions/${session.id}/permissions/enforcement`, {
					method: 'POST',
					body: { level: null }
				})

				const result = await controlAPI<EnforcementResponse>(`/sessions/${session.id}/permissions/enforcement`)
				expect(result.is_runtime).toBe(false)
			})

			it('should return 404 for non-existent session', async () => {
				await expect(controlAPI('/sessions/nonexistent_session_id/permissions/enforcement')).rejects.toThrow('404')
			})
		})

		describe('POST /api/control/sessions/:id/permissions/enforcement', () => {
			afterEach(async () => {
				// Reset to default after each test
				await controlAPI(`/sessions/${session.id}/permissions/enforcement`, {
					method: 'POST',
					body: { level: null }
				})
			})

			it('should set level to none', async () => {
				const result = await controlAPI<EnforcementSetResponse>(`/sessions/${session.id}/permissions/enforcement`, {
					method: 'POST',
					body: { level: 'none' }
				})

				expect(result.success).toBe(true)
				expect(result.level).toBe('none')
			})

			it('should set level to basic', async () => {
				const result = await controlAPI<EnforcementSetResponse>(`/sessions/${session.id}/permissions/enforcement`, {
					method: 'POST',
					body: { level: 'basic' }
				})

				expect(result.success).toBe(true)
				expect(result.level).toBe('basic')
			})

			it('should set level to strict', async () => {
				const result = await controlAPI<EnforcementSetResponse>(`/sessions/${session.id}/permissions/enforcement`, {
					method: 'POST',
					body: { level: 'strict' }
				})

				expect(result.success).toBe(true)
				expect(result.level).toBe('strict')
			})

			it('should indicate is_runtime: true after setting', async () => {
				const result = await controlAPI<EnforcementSetResponse>(`/sessions/${session.id}/permissions/enforcement`, {
					method: 'POST',
					body: { level: 'basic' }
				})

				expect(result.is_runtime).toBe(true)
			})

			it('should reset to default when level is null', async () => {
				// First set a runtime level
				await controlAPI(`/sessions/${session.id}/permissions/enforcement`, {
					method: 'POST',
					body: { level: 'strict' }
				})

				// Then reset
				const result = await controlAPI<EnforcementSetResponse>(`/sessions/${session.id}/permissions/enforcement`, {
					method: 'POST',
					body: { level: null }
				})

				expect(result.success).toBe(true)
				expect(result.is_runtime).toBe(false)
			})

			it('should return 400 for invalid level value', async () => {
				await expect(
					controlAPI(`/sessions/${session.id}/permissions/enforcement`, {
						method: 'POST',
						body: { level: 'invalid_level' }
					})
				).rejects.toThrow('400')
			})

			it('should return 404 for non-existent session', async () => {
				await expect(
					controlAPI('/sessions/nonexistent_session_id/permissions/enforcement', {
						method: 'POST',
						body: { level: 'none' }
					})
				).rejects.toThrow('404')
			})
		})
	})

	describe('Permission Overrides Collection API', () => {
		beforeEach(async () => {
			// Clear overrides before each test
			await controlAPI(`/sessions/${session.id}/permissions/overrides`, {
				method: 'DELETE'
			})
		})

		describe('GET /api/control/sessions/:id/permissions/overrides', () => {
			it('should return empty array initially', async () => {
				const result = await controlAPI<OverridesListResponse>(`/sessions/${session.id}/permissions/overrides`)

				expect(result.overrides).toEqual([])
			})

			it('should return count: 0 initially', async () => {
				const result = await controlAPI<OverridesListResponse>(`/sessions/${session.id}/permissions/overrides`)

				expect(result.count).toBe(0)
			})

			it('should return all overrides after adding', async () => {
				// Add an override
				await controlAPI(`/sessions/${session.id}/permissions/overrides`, {
					method: 'POST',
					body: {
						user_id: '123456789012345678',
						permissions: { SendMessages: 'grant' }
					}
				})

				const result = await controlAPI<OverridesListResponse>(`/sessions/${session.id}/permissions/overrides`)

				expect(result.overrides.length).toBe(1)
				expect(result.count).toBe(1)
				expect(result.overrides[0].user_id).toBe('123456789012345678')
			})

			it('should return 404 for non-existent session', async () => {
				await expect(controlAPI('/sessions/nonexistent_session_id/permissions/overrides')).rejects.toThrow('404')
			})
		})

		describe('POST /api/control/sessions/:id/permissions/overrides', () => {
			it('should create override with auto-generated ID', async () => {
				const result = await controlAPI<OverrideCreateResponse>(`/sessions/${session.id}/permissions/overrides`, {
					method: 'POST',
					body: {
						user_id: '123456789012345678',
						permissions: { SendMessages: 'grant' }
					}
				})

				expect(result.success).toBe(true)
				expect(result.override.id).toBeDefined()
				expect(typeof result.override.id).toBe('string')
				expect(result.override.id.length).toBeGreaterThan(0)
			})

			it('should include createdAt timestamp', async () => {
				const before = Date.now()

				const result = await controlAPI<OverrideCreateResponse>(`/sessions/${session.id}/permissions/overrides`, {
					method: 'POST',
					body: {
						user_id: '123456789012345678',
						permissions: { SendMessages: 'grant' }
					}
				})

				const after = Date.now()

				expect(result.override.created_at).toBeGreaterThanOrEqual(before)
				expect(result.override.created_at).toBeLessThanOrEqual(after)
			})

			it('should return 400 when missing user_id', async () => {
				await expect(
					controlAPI(`/sessions/${session.id}/permissions/overrides`, {
						method: 'POST',
						body: {
							permissions: { SendMessages: 'grant' }
						}
					})
				).rejects.toThrow('400')
			})

			it('should return 400 when missing permissions object', async () => {
				await expect(
					controlAPI(`/sessions/${session.id}/permissions/overrides`, {
						method: 'POST',
						body: {
							user_id: '123456789012345678'
						}
					})
				).rejects.toThrow('400')
			})

			it('should return 400 for invalid permission value', async () => {
				await expect(
					controlAPI(`/sessions/${session.id}/permissions/overrides`, {
						method: 'POST',
						body: {
							user_id: '123456789012345678',
							permissions: { SendMessages: 'invalid_value' }
						}
					})
				).rejects.toThrow('400')
			})

			it('should set expiresAt when expires_in provided', async () => {
				const before = Date.now()

				const result = await controlAPI<OverrideCreateResponse>(`/sessions/${session.id}/permissions/overrides`, {
					method: 'POST',
					body: {
						user_id: '123456789012345678',
						permissions: { SendMessages: 'grant' },
						expires_in: 3600 // 1 hour
					}
				})

				// expires_at should be approximately now + 3600 seconds
				const expectedExpiry = before + 3600 * 1000
				expect(result.override.expires_at).toBeGreaterThanOrEqual(expectedExpiry - 1000)
				expect(result.override.expires_at).toBeLessThanOrEqual(expectedExpiry + 1000)
			})

			it('should support channel_id scope', async () => {
				const result = await controlAPI<OverrideCreateResponse>(`/sessions/${session.id}/permissions/overrides`, {
					method: 'POST',
					body: {
						user_id: '123456789012345678',
						channel_id: '987654321098765432',
						permissions: { SendMessages: 'grant' }
					}
				})

				expect(result.override.channel_id).toBe('987654321098765432')
			})

			it('should support guild_id scope', async () => {
				const result = await controlAPI<OverrideCreateResponse>(`/sessions/${session.id}/permissions/overrides`, {
					method: 'POST',
					body: {
						user_id: '123456789012345678',
						guild_id: '111111111111111111',
						permissions: { SendMessages: 'grant' }
					}
				})

				expect(result.override.guild_id).toBe('111111111111111111')
			})

			it('should include reason in response', async () => {
				const result = await controlAPI<OverrideCreateResponse>(`/sessions/${session.id}/permissions/overrides`, {
					method: 'POST',
					body: {
						user_id: '123456789012345678',
						permissions: { SendMessages: 'grant' },
						reason: 'Testing permission override'
					}
				})

				expect(result.override.reason).toBe('Testing permission override')
			})

			it('should accept grant, deny, and inherit values', async () => {
				const result = await controlAPI<OverrideCreateResponse>(`/sessions/${session.id}/permissions/overrides`, {
					method: 'POST',
					body: {
						user_id: '123456789012345678',
						permissions: {
							SendMessages: 'grant',
							ManageMessages: 'deny',
							AddReactions: 'inherit'
						}
					}
				})

				expect(result.override.permissions.SendMessages).toBe('grant')
				expect(result.override.permissions.ManageMessages).toBe('deny')
				expect(result.override.permissions.AddReactions).toBe('inherit')
			})

			it('should return 404 for non-existent session', async () => {
				await expect(
					controlAPI('/sessions/nonexistent_session_id/permissions/overrides', {
						method: 'POST',
						body: {
							user_id: '123456789012345678',
							permissions: { SendMessages: 'grant' }
						}
					})
				).rejects.toThrow('404')
			})
		})

		describe('DELETE /api/control/sessions/:id/permissions/overrides', () => {
			it('should clear all overrides', async () => {
				// Add some overrides first
				await controlAPI(`/sessions/${session.id}/permissions/overrides`, {
					method: 'POST',
					body: { user_id: '111111111111111111', permissions: { SendMessages: 'grant' } }
				})
				await controlAPI(`/sessions/${session.id}/permissions/overrides`, {
					method: 'POST',
					body: { user_id: '222222222222222222', permissions: { SendMessages: 'deny' } }
				})

				const result = await controlAPI<OverrideClearResponse>(`/sessions/${session.id}/permissions/overrides`, {
					method: 'DELETE'
				})

				expect(result.success).toBe(true)

				// Verify they're gone
				const list = await controlAPI<OverridesListResponse>(`/sessions/${session.id}/permissions/overrides`)
				expect(list.overrides).toEqual([])
			})

			it('should return cleared count', async () => {
				// Add overrides
				await controlAPI(`/sessions/${session.id}/permissions/overrides`, {
					method: 'POST',
					body: { user_id: '111111111111111111', permissions: { SendMessages: 'grant' } }
				})
				await controlAPI(`/sessions/${session.id}/permissions/overrides`, {
					method: 'POST',
					body: { user_id: '222222222222222222', permissions: { SendMessages: 'deny' } }
				})

				const result = await controlAPI<OverrideClearResponse>(`/sessions/${session.id}/permissions/overrides`, {
					method: 'DELETE'
				})

				expect(result.cleared).toBe(2)
			})

			it('should return 0 when no overrides exist', async () => {
				const result = await controlAPI<OverrideClearResponse>(`/sessions/${session.id}/permissions/overrides`, {
					method: 'DELETE'
				})

				expect(result.cleared).toBe(0)
			})

			it('should return 404 for non-existent session', async () => {
				await expect(
					controlAPI('/sessions/nonexistent_session_id/permissions/overrides', {
						method: 'DELETE'
					})
				).rejects.toThrow('404')
			})
		})
	})

	describe('Single Override API', () => {
		let createdOverrideId: string

		beforeAll(async () => {
			// Create an override to test with
			const result = await controlAPI<OverrideCreateResponse>(`/sessions/${session.id}/permissions/overrides`, {
				method: 'POST',
				body: {
					user_id: '123456789012345678',
					permissions: { SendMessages: 'grant' },
					reason: 'Test override for single API tests'
				}
			})
			createdOverrideId = result.override.id
		})

		afterAll(async () => {
			// Clean up
			await controlAPI(`/sessions/${session.id}/permissions/overrides`, {
				method: 'DELETE'
			})
		})

		describe('GET /api/control/sessions/:id/permissions/overrides/:overrideId', () => {
			it('should return specific override by ID', async () => {
				const result = await controlAPI<{ override: PermissionOverride }>(
					`/sessions/${session.id}/permissions/overrides/${createdOverrideId}`
				)

				expect(result.override.id).toBe(createdOverrideId)
				expect(result.override.user_id).toBe('123456789012345678')
				expect(result.override.permissions.SendMessages).toBe('grant')
			})

			it('should return 404 for non-existent override', async () => {
				await expect(
					controlAPI(`/sessions/${session.id}/permissions/overrides/nonexistent_override_id`)
				).rejects.toThrow('404')
			})

			it('should return 404 for non-existent session', async () => {
				await expect(
					controlAPI(`/sessions/nonexistent_session_id/permissions/overrides/${createdOverrideId}`)
				).rejects.toThrow('404')
			})
		})

		describe('DELETE /api/control/sessions/:id/permissions/overrides/:overrideId', () => {
			it('should remove specific override', async () => {
				// Create a new override to delete
				const createResult = await controlAPI<OverrideCreateResponse>(
					`/sessions/${session.id}/permissions/overrides`,
					{
						method: 'POST',
						body: {
							user_id: '999999999999999999',
							permissions: { ManageMessages: 'deny' }
						}
					}
				)

				const overrideId = createResult.override.id

				// Delete it
				const deleteResult = await controlAPI<OverrideDeleteResponse>(
					`/sessions/${session.id}/permissions/overrides/${overrideId}`,
					{ method: 'DELETE' }
				)

				expect(deleteResult.success).toBe(true)

				// Verify it's gone
				await expect(controlAPI(`/sessions/${session.id}/permissions/overrides/${overrideId}`)).rejects.toThrow('404')
			})

			it('should return deleted_id in response', async () => {
				// Create a new override to delete
				const createResult = await controlAPI<OverrideCreateResponse>(
					`/sessions/${session.id}/permissions/overrides`,
					{
						method: 'POST',
						body: {
							user_id: '888888888888888888',
							permissions: { ManageMessages: 'deny' }
						}
					}
				)

				const overrideId = createResult.override.id

				const deleteResult = await controlAPI<OverrideDeleteResponse>(
					`/sessions/${session.id}/permissions/overrides/${overrideId}`,
					{ method: 'DELETE' }
				)

				expect(deleteResult.deleted_id).toBe(overrideId)
			})

			it('should return 404 for non-existent override', async () => {
				await expect(
					controlAPI(`/sessions/${session.id}/permissions/overrides/nonexistent_override_id`, {
						method: 'DELETE'
					})
				).rejects.toThrow('404')
			})

			it('should return 404 for non-existent session', async () => {
				await expect(
					controlAPI(`/sessions/nonexistent_session_id/permissions/overrides/${createdOverrideId}`, {
						method: 'DELETE'
					})
				).rejects.toThrow('404')
			})
		})
	})

	describe('Permission Denied Events API', () => {
		beforeEach(async () => {
			// Clear denied events before each test
			await controlAPI(`/sessions/${session.id}/permissions/denied`, {
				method: 'DELETE'
			})
		})

		describe('GET /api/control/sessions/:id/permissions/denied', () => {
			it('should return empty events array initially', async () => {
				const result = await controlAPI<DeniedEventsResponse>(`/sessions/${session.id}/permissions/denied`)

				expect(result.events).toEqual([])
			})

			it('should return count: 0 initially', async () => {
				const result = await controlAPI<DeniedEventsResponse>(`/sessions/${session.id}/permissions/denied`)

				expect(result.count).toBe(0)
			})

			it('should return 404 for non-existent session', async () => {
				await expect(controlAPI('/sessions/nonexistent_session_id/permissions/denied')).rejects.toThrow('404')
			})
		})

		describe('DELETE /api/control/sessions/:id/permissions/denied', () => {
			it('should clear denied events', async () => {
				const result = await controlAPI<DeniedClearResponse>(`/sessions/${session.id}/permissions/denied`, {
					method: 'DELETE'
				})

				expect(result.success).toBe(true)
			})

			it('should return cleared count', async () => {
				const result = await controlAPI<DeniedClearResponse>(`/sessions/${session.id}/permissions/denied`, {
					method: 'DELETE'
				})

				expect(typeof result.cleared).toBe('number')
				expect(result.cleared).toBeGreaterThanOrEqual(0)
			})

			it('should return 404 for non-existent session', async () => {
				await expect(
					controlAPI('/sessions/nonexistent_session_id/permissions/denied', {
						method: 'DELETE'
					})
				).rejects.toThrow('404')
			})
		})
	})
})

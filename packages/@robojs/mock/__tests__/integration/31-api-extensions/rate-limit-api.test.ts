/**
 * Rate Limit Simulation API Tests
 *
 * Tests the control API endpoints for rate limit simulation.
 * These endpoints allow tests to trigger 429 responses to verify
 * bot rate limit handling.
 */
import { createSession, deleteSession, controlAPI } from '../setup/control-api.js'

interface RateLimitConfig {
	enabled: boolean
	retry_after: number
	persistent: boolean
	scope: string
	triggered_count: number
}

interface RateLimitSetResponse {
	success: boolean
	enabled: boolean
	retry_after: number
	persistent: boolean
	scope: string
}

describe('Rate Limit Simulation API', () => {
	let session: { id: string; token: string }

	beforeAll(async () => {
		session = await createSession({ name: 'rate-limit-api-tests' })
	})

	afterAll(async () => {
		await deleteSession(session.id)
	})

	describe('GET /api/control/sessions/:id/rate-limit', () => {
		it('should return default config (disabled) for new session', async () => {
			const result = await controlAPI<RateLimitConfig>(`/sessions/${session.id}/rate-limit`)

			expect(result.enabled).toBe(false)
			expect(result.retry_after).toBe(1)
			expect(result.persistent).toBe(false)
			expect(result.scope).toBe('all')
			expect(result.triggered_count).toBe(0)
		})

		it('should return 404 for non-existent session', async () => {
			await expect(controlAPI('/sessions/nonexistent_session_id/rate-limit')).rejects.toThrow('404')
		})
	})

	describe('POST /api/control/sessions/:id/rate-limit', () => {
		afterEach(async () => {
			// Reset rate limit after each test
			await controlAPI(`/sessions/${session.id}/rate-limit`, {
				method: 'POST',
				body: { enabled: false }
			})
		})

		it('should enable rate limit with defaults (enabled=true, retry_after=1)', async () => {
			const result = await controlAPI<RateLimitSetResponse>(`/sessions/${session.id}/rate-limit`, {
				method: 'POST',
				body: { enabled: true }
			})

			expect(result.success).toBe(true)
			expect(result.enabled).toBe(true)
			expect(result.retry_after).toBe(1)
			expect(result.persistent).toBe(false)
			expect(result.scope).toBe('all')
		})

		it('should enable with custom retry_after value', async () => {
			const result = await controlAPI<RateLimitSetResponse>(`/sessions/${session.id}/rate-limit`, {
				method: 'POST',
				body: { enabled: true, retry_after: 5 }
			})

			expect(result.success).toBe(true)
			expect(result.retry_after).toBe(5)
		})

		it('should enable persistent mode', async () => {
			const result = await controlAPI<RateLimitSetResponse>(`/sessions/${session.id}/rate-limit`, {
				method: 'POST',
				body: { enabled: true, persistent: true }
			})

			expect(result.success).toBe(true)
			expect(result.persistent).toBe(true)
		})

		it('should set scope to messages', async () => {
			const result = await controlAPI<RateLimitSetResponse>(`/sessions/${session.id}/rate-limit`, {
				method: 'POST',
				body: { enabled: true, scope: 'messages' }
			})

			expect(result.success).toBe(true)
			expect(result.scope).toBe('messages')
		})

		it('should set scope to interactions', async () => {
			const result = await controlAPI<RateLimitSetResponse>(`/sessions/${session.id}/rate-limit`, {
				method: 'POST',
				body: { enabled: true, scope: 'interactions' }
			})

			expect(result.success).toBe(true)
			expect(result.scope).toBe('interactions')
		})

		it('should set scope to guilds', async () => {
			const result = await controlAPI<RateLimitSetResponse>(`/sessions/${session.id}/rate-limit`, {
				method: 'POST',
				body: { enabled: true, scope: 'guilds' }
			})

			expect(result.success).toBe(true)
			expect(result.scope).toBe('guilds')
		})

		it('should set scope to channels', async () => {
			const result = await controlAPI<RateLimitSetResponse>(`/sessions/${session.id}/rate-limit`, {
				method: 'POST',
				body: { enabled: true, scope: 'channels' }
			})

			expect(result.success).toBe(true)
			expect(result.scope).toBe('channels')
		})

		it('should return 400 for invalid scope value', async () => {
			await expect(
				controlAPI(`/sessions/${session.id}/rate-limit`, {
					method: 'POST',
					body: { enabled: true, scope: 'invalid_scope' }
				})
			).rejects.toThrow('400')
		})

		it('should return 400 for negative retry_after', async () => {
			await expect(
				controlAPI(`/sessions/${session.id}/rate-limit`, {
					method: 'POST',
					body: { enabled: true, retry_after: -1 }
				})
			).rejects.toThrow('400')
		})

		it('should return 404 for non-existent session', async () => {
			await expect(
				controlAPI('/sessions/nonexistent_session_id/rate-limit', {
					method: 'POST',
					body: { enabled: true }
				})
			).rejects.toThrow('404')
		})

		it('should disable rate limit when enabled=false', async () => {
			// First enable it
			await controlAPI(`/sessions/${session.id}/rate-limit`, {
				method: 'POST',
				body: { enabled: true }
			})

			// Then disable it
			const result = await controlAPI<RateLimitSetResponse>(`/sessions/${session.id}/rate-limit`, {
				method: 'POST',
				body: { enabled: false }
			})

			expect(result.success).toBe(true)
			expect(result.enabled).toBe(false)

			// Verify it's disabled
			const status = await controlAPI<RateLimitConfig>(`/sessions/${session.id}/rate-limit`)
			expect(status.enabled).toBe(false)
		})
	})

	describe('Rate Limit Configuration Persistence', () => {
		afterEach(async () => {
			// Reset rate limit after each test
			await controlAPI(`/sessions/${session.id}/rate-limit`, {
				method: 'POST',
				body: { enabled: false }
			})
		})

		it('should persist all configuration options', async () => {
			await controlAPI(`/sessions/${session.id}/rate-limit`, {
				method: 'POST',
				body: {
					enabled: true,
					retry_after: 10,
					persistent: true,
					scope: 'messages'
				}
			})

			const status = await controlAPI<RateLimitConfig>(`/sessions/${session.id}/rate-limit`)

			expect(status.enabled).toBe(true)
			expect(status.retry_after).toBe(10)
			expect(status.persistent).toBe(true)
			expect(status.scope).toBe('messages')
		})

		it('should allow updating individual fields', async () => {
			// Enable with defaults
			await controlAPI(`/sessions/${session.id}/rate-limit`, {
				method: 'POST',
				body: { enabled: true }
			})

			// Update only retry_after
			await controlAPI(`/sessions/${session.id}/rate-limit`, {
				method: 'POST',
				body: { retry_after: 15 }
			})

			const status = await controlAPI<RateLimitConfig>(`/sessions/${session.id}/rate-limit`)
			expect(status.retry_after).toBe(15)
		})
	})
})

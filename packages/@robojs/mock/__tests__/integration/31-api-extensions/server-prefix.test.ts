/**
 * Server Prefix Configuration Tests
 *
 * These tests verify that the @robojs/mock server prefix configuration
 * works correctly, preventing regressions where routes become inaccessible.
 *
 * How plugin prefixes work:
 * 1. Plugin declares `prefix: '/mock'` in server config
 * 2. Manifest stores this as `"prefix": "mock"` (leading slash stripped)
 * 3. At runtime, @robojs/server normalizes back to `/mock`
 * 4. Routes are built as: pluginPrefix + baseKey = `/mock` + `/api/control/sessions`
 * 5. Final routes are at `/mock/api/control/sessions`
 *
 * The plugin prefix is PREPENDED to the base API path (which includes `/api`),
 * so the plugin should declare just `/mock`, not `/mock/api`.
 *
 * @see https://github.com/anthropics/robo.js - Plugin prefix system
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { MOCK_CONFIG } from '../setup/constants.js'

describe('Server Prefix Configuration', () => {
	describe('Control API Accessibility', () => {
		/**
		 * Critical test: The control API must be accessible at /mock/api/control/*
		 * This was broken when plugin prefix was '/mock/api' (causing double /api)
		 */
		it('should access control API at /mock/api/control/sessions', async () => {
			const response = await fetch(`${MOCK_CONFIG.CONTROL_URL}/sessions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: 'prefix-test' })
			})

			expect(response.ok).toBe(true)
			expect(response.status).toBe(200)

			const data = await response.json()
			expect(data.session_id).toBeDefined()
			expect(data.token).toBeDefined()

			// Cleanup
			await fetch(`${MOCK_CONFIG.CONTROL_URL}/sessions/${data.session_id}`, {
				method: 'DELETE'
			})
		})

		it('should access nested control endpoints', async () => {
			// Create a session first
			const createResponse = await fetch(`${MOCK_CONFIG.CONTROL_URL}/sessions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: 'nested-prefix-test' })
			})
			const { session_id } = await createResponse.json()

			try {
				// Test rate-limit endpoint
				const rateLimitResponse = await fetch(
					`${MOCK_CONFIG.CONTROL_URL}/sessions/${session_id}/rate-limit`
				)
				expect(rateLimitResponse.ok).toBe(true)

				// Test permissions enforcement endpoint
				const enforcementResponse = await fetch(
					`${MOCK_CONFIG.CONTROL_URL}/sessions/${session_id}/permissions/enforcement`
				)
				expect(enforcementResponse.ok).toBe(true)

				// Test permissions overrides endpoint
				const overridesResponse = await fetch(
					`${MOCK_CONFIG.CONTROL_URL}/sessions/${session_id}/permissions/overrides`
				)
				expect(overridesResponse.ok).toBe(true)
			} finally {
				// Cleanup
				await fetch(`${MOCK_CONFIG.CONTROL_URL}/sessions/${session_id}`, {
					method: 'DELETE'
				})
			}
		})
	})

	describe('Discord REST API Accessibility', () => {
		/**
		 * The Discord REST API emulation must be at /mock/api/v10/*
		 */
		it('should access Discord API at /mock/api/v10/gateway/bot', async () => {
			// First create a session to get a token
			const createResponse = await fetch(`${MOCK_CONFIG.CONTROL_URL}/sessions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: 'discord-api-test' })
			})
			const { session_id, token } = await createResponse.json()

			try {
				// Access the Discord gateway endpoint with the mock token
				const gatewayResponse = await fetch(`${MOCK_CONFIG.REST_URL}/v10/gateway/bot`, {
					headers: { Authorization: `Bot ${token}` }
				})

				expect(gatewayResponse.ok).toBe(true)
				expect(gatewayResponse.status).toBe(200)

				const data = await gatewayResponse.json()
				expect(data.url).toBeDefined()
			} finally {
				// Cleanup
				await fetch(`${MOCK_CONFIG.CONTROL_URL}/sessions/${session_id}`, {
					method: 'DELETE'
				})
			}
		})

		it('should access Discord API at /mock/api/v10/users/@me', async () => {
			// First create a session to get a token
			const createResponse = await fetch(`${MOCK_CONFIG.CONTROL_URL}/sessions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: 'users-api-test' })
			})
			const { session_id, token } = await createResponse.json()

			try {
				// Access the users/@me endpoint
				const userResponse = await fetch(`${MOCK_CONFIG.REST_URL}/v10/users/@me`, {
					headers: { Authorization: `Bot ${token}` }
				})

				expect(userResponse.ok).toBe(true)
				expect(userResponse.status).toBe(200)

				const data = await userResponse.json()
				expect(data.id).toBeDefined()
				expect(data.username).toBeDefined()
			} finally {
				// Cleanup
				await fetch(`${MOCK_CONFIG.CONTROL_URL}/sessions/${session_id}`, {
					method: 'DELETE'
				})
			}
		})
	})

	describe('Wrong Prefix Paths Return 404', () => {
		/**
		 * Routes at wrong paths should NOT work.
		 * This ensures the prefix is correctly applied.
		 */
		it('should NOT find routes at /api/control/sessions (missing /mock)', async () => {
			const response = await fetch(`http://localhost:${MOCK_CONFIG.SERVER_PORT}/api/control/sessions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: 'wrong-path-test' })
			})

			// Should get 404 because routes are at /mock/api/*, not /api/*
			expect(response.ok).toBe(false)
		})

		it('should NOT find routes at /mock/control/sessions (missing /api)', async () => {
			const response = await fetch(
				`http://localhost:${MOCK_CONFIG.SERVER_PORT}/mock/control/sessions`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ name: 'wrong-path-test' })
				}
			)

			// Should get 404 because routes are at /mock/api/*, not /mock/*
			expect(response.ok).toBe(false)
		})

		it('should NOT find routes at /control/sessions (no prefix)', async () => {
			const response = await fetch(
				`http://localhost:${MOCK_CONFIG.SERVER_PORT}/control/sessions`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ name: 'wrong-path-test' })
				}
			)

			// Should get 404 because routes are at /mock/api/*, not root
			expect(response.ok).toBe(false)
		})
	})

	describe('URL Configuration Verification', () => {
		/**
		 * Verify that the test configuration uses the correct URLs.
		 */
		it('should have CONTROL_URL pointing to /mock/api/control', () => {
			expect(MOCK_CONFIG.CONTROL_URL).toContain('/mock/api/control')
		})

		it('should have REST_URL pointing to /mock/api', () => {
			expect(MOCK_CONFIG.REST_URL).toContain('/mock/api')
			expect(MOCK_CONFIG.REST_URL).not.toContain('/mock/api/control')
		})

		it('should use consistent port across URLs', () => {
			const port = MOCK_CONFIG.SERVER_PORT.toString()
			expect(MOCK_CONFIG.CONTROL_URL).toContain(`:${port}`)
			expect(MOCK_CONFIG.REST_URL).toContain(`:${port}`)
		})
	})
})

describe('Prefix Configuration Contract', () => {
	/**
	 * These tests document the expected prefix behavior.
	 * They serve as a contract for how plugin prefixes should work.
	 */

	it('should document: plugin prefix is prepended to base API path', () => {
		// Plugin declares: prefix: '/mock'
		// Base API path is: /api/control/sessions (from @robojs/server)
		// Result: /mock/api/control/sessions

		const pluginPrefix = '/mock'
		const baseApiPath = '/api'
		const routeKey = 'control/sessions'

		// Route building: pluginPrefix + baseApiPath + '/' + routeKey
		const result = pluginPrefix + baseApiPath + '/' + routeKey
		expect(result).toBe('/mock/api/control/sessions')
	})

	it('should document: manifest strips leading slash from prefix', () => {
		// Plugin config: prefix: '/mock'
		// Manifest stores: "prefix": "mock" (no leading slash)
		// Registry normalizes back to: /mock

		const configPrefix = '/mock'
		const manifestPrefix = configPrefix.replace(/^\//, '') // What manifest generator does
		const normalizedPrefix = '/' + manifestPrefix // What registry does

		expect(manifestPrefix).toBe('mock')
		expect(normalizedPrefix).toBe('/mock')
	})

	it('should document: plugin should NOT include /api in prefix', () => {
		// WRONG: prefix: '/mock/api' would result in /mock/api/api/*
		// CORRECT: prefix: '/mock' results in /mock/api/*

		const wrongPluginPrefix = '/mock/api'
		const correctPluginPrefix = '/mock'
		const baseKey = '/api/control/sessions'

		const wrongResult = wrongPluginPrefix + baseKey
		const correctResult = correctPluginPrefix + baseKey

		expect(wrongResult).toBe('/mock/api/api/control/sessions') // Double /api - BAD
		expect(correctResult).toBe('/mock/api/control/sessions') // Correct path - GOOD
	})

	it('should document: routes are at /mock/api/* (plugin prefix + base path)', () => {
		// With correct prefix configuration:
		// - /mock/api/control/sessions (control API)
		// - /mock/api/v10/gateway/bot (Discord REST API)

		const pluginPrefix = '/mock'
		const baseApiPath = '/api'

		expect(pluginPrefix + baseApiPath + '/control/sessions').toBe('/mock/api/control/sessions')
		expect(pluginPrefix + baseApiPath + '/v10/gateway/bot').toBe('/mock/api/v10/gateway/bot')
	})
})

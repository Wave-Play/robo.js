/**
 * DB API Integration Test
 */
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { startMockRobo } from '@robojs/mock/testing'
import type { MockRoboHandle } from '@robojs/mock/testing'

const __filename = fileURLToPath(import.meta.url)

describe('DB API', () => {
	let bot: MockRoboHandle

	beforeAll(async () => {
		bot = await startMockRobo({
			name: 'db-api-tests',
			testFilePath: __filename
		})
	}, 60000)

	afterAll(async () => {
		await bot.stop()
	})

	it('should return introspection data via GET /api/db/introspect', async () => {
		const response = await fetch(`http://localhost:${bot.serverPort}/api/db/introspect`)
		expect(response.ok).toBe(true)

		const data = await response.json()
		expect(data).toHaveProperty('models')
		expect(Array.isArray(data.models)).toBe(true)
		expect(data).toHaveProperty('storage')
		expect(data).toHaveProperty('walStatus')
	})

	it('should return metrics via GET /api/db/metrics', async () => {
		const response = await fetch(`http://localhost:${bot.serverPort}/api/db/metrics`)
		expect(response.ok).toBe(true)

		const data = await response.json()
		expect(data).toHaveProperty('operations')
		expect(data).toHaveProperty('cacheHits')
		expect(data).toHaveProperty('avgQueryTime')
	})

	it('should reset metrics via POST /api/db/metrics', async () => {
		const response = await fetch(`http://localhost:${bot.serverPort}/api/db/metrics`, {
			method: 'POST'
		})
		expect(response.ok).toBe(true)

		const data = await response.json()
		expect(data).toHaveProperty('reset', true)
	})
})

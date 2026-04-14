/**
 * Labels API Integration Test
 */
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { startMockRobo } from '@robojs/mock/testing'
import type { MockRoboHandle } from '@robojs/mock/testing'

const __filename = fileURLToPath(import.meta.url)

describe('Labels API', () => {
	let bot: MockRoboHandle

	beforeAll(async () => {
		bot = await startMockRobo({
			name: 'labels-api-tests',
			testFilePath: __filename
		})
	}, 60000)

	afterAll(async () => {
		await bot.stop()
	})

	it('should list labels via GET /api/labels', async () => {
		const response = await fetch(`http://localhost:${bot.serverPort}/api/labels`)
		expect(response.ok).toBe(true)

		const data = await response.json()
		expect(data).toHaveProperty('labels')
		expect(Array.isArray(data.labels)).toBe(true)
	})

	it('should create a label via POST /api/labels', async () => {
		const response = await fetch(`http://localhost:${bot.serverPort}/api/labels`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: 'api-test-label', color: '#00ff00' })
		})
		expect(response.ok).toBe(true)

		const data = await response.json()
		expect(data).toHaveProperty('name', 'api-test-label')
		expect(data).toHaveProperty('color', '#00ff00')
	})
})

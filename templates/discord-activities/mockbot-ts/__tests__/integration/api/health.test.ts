/**
 * Health API Integration Test
 *
 * Tests that API routes work correctly under mock mode.
 * Verifies the /api/health endpoint responds with expected data.
 */
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { startMockRobo } from '@robojs/mock/testing'
import type { MockRoboHandle } from '@robojs/mock/testing'

const __filename = fileURLToPath(import.meta.url)

describe('health API', () => {
	let activity: MockRoboHandle

	beforeAll(async () => {
		activity = await startMockRobo({
			name: 'health-api-tests',
			testFilePath: __filename,
			activity: true
		})
	}, 60000)

	afterAll(async () => {
		await activity.stop()
	})

	it('should respond with status ok', async () => {
		const response = await fetch(`http://localhost:${activity.serverPort}/api/health`)
		expect(response.ok).toBe(true)

		const data = await response.json()
		expect(data).toMatchObject({
			status: 'ok',
			message: expect.stringMatching(/Request #\d+/)
		})
	})

	it('should increment request count', async () => {
		const response1 = await fetch(`http://localhost:${activity.serverPort}/api/health`)
		const data1 = await response1.json()

		const response2 = await fetch(`http://localhost:${activity.serverPort}/api/health`)
		const data2 = await response2.json()

		// Extract request numbers
		const match1 = data1.message.match(/Request #(\d+)/)
		const match2 = data2.message.match(/Request #(\d+)/)
		expect(match1).not.toBeNull()
		expect(match2).not.toBeNull()
		const num1 = parseInt(match1![1])
		const num2 = parseInt(match2![1])
		expect(num2).toBeGreaterThan(num1)
	})
})

/**
 * Bulk API Integration Test
 */
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { startMockRobo } from '@robojs/mock/testing'
import type { MockRoboHandle } from '@robojs/mock/testing'

const __filename = fileURLToPath(import.meta.url)

describe('Bulk API', () => {
	let bot: MockRoboHandle

	beforeAll(async () => {
		bot = await startMockRobo({
			name: 'bulk-api-tests',
			testFilePath: __filename
		})
	}, 60000)

	afterAll(async () => {
		await bot.stop()
	})

	it('should bulk create tasks via POST /api/tasks/bulk', async () => {
		const response = await fetch(`http://localhost:${bot.serverPort}/api/tasks/bulk`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				tasks: [
					{ title: 'Bulk Task 1' },
					{ title: 'Bulk Task 2' },
					{ title: 'Bulk Task 3' }
				],
				skipDuplicates: true
			})
		})
		expect(response.ok).toBe(true)

		const data = await response.json()
		expect(data).toHaveProperty('created')
		expect(data.created).toBe(3)
	})
})

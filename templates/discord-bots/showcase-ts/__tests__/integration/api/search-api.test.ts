/**
 * Search API Integration Test
 */
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { startMockRobo } from '@robojs/mock/testing'
import type { MockRoboHandle } from '@robojs/mock/testing'

const __filename = fileURLToPath(import.meta.url)

describe('Search API', () => {
	let bot: MockRoboHandle

	beforeAll(async () => {
		bot = await startMockRobo({
			name: 'search-api-tests',
			testFilePath: __filename
		})
	}, 60000)

	afterAll(async () => {
		await bot.stop()
	})

	it('should search tasks via GET /api/tasks/search', async () => {
		const response = await fetch(`http://localhost:${bot.serverPort}/api/tasks/search?query=test`)
		expect(response.ok).toBe(true)

		const data = await response.json()
		expect(data).toHaveProperty('tasks')
		expect(Array.isArray(data.tasks)).toBe(true)
		expect(data).toHaveProperty('page', 1)
	})

	it('should support pagination', async () => {
		const response = await fetch(`http://localhost:${bot.serverPort}/api/tasks/search?page=2&limit=5`)
		expect(response.ok).toBe(true)

		const data = await response.json()
		expect(data).toHaveProperty('page', 2)
		expect(data).toHaveProperty('pageSize', 5)
	})

	it('should filter by priority', async () => {
		const response = await fetch(`http://localhost:${bot.serverPort}/api/tasks/search?priority=high,medium`)
		expect(response.ok).toBe(true)

		const data = await response.json()
		expect(data).toHaveProperty('tasks')
	})

	it('should filter by hour range', async () => {
		const response = await fetch(`http://localhost:${bot.serverPort}/api/tasks/search?minHours=1&maxHours=10`)
		expect(response.ok).toBe(true)

		const data = await response.json()
		expect(data).toHaveProperty('tasks')
	})
})

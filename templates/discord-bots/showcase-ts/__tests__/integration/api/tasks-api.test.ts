/**
 * API Routes Integration Test
 */
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { startMockRobo } from '@robojs/mock/testing'
import type { MockRoboHandle } from '@robojs/mock/testing'

const __filename = fileURLToPath(import.meta.url)

describe('API routes', () => {
	let bot: MockRoboHandle

	beforeAll(async () => {
		bot = await startMockRobo({
			name: 'api-tests',
			testFilePath: __filename
		})
	}, 60000)

	afterAll(async () => {
		await bot.stop()
	})

	it('should serve GET /api/tasks', async () => {
		const response = await fetch(`http://localhost:${bot.serverPort}/api/tasks`)
		expect(response.ok).toBe(true)

		const data = await response.json()
		expect(data).toHaveProperty('tasks')
		expect(Array.isArray(data.tasks)).toBe(true)
	})

	it('should serve GET /api/health', async () => {
		const response = await fetch(`http://localhost:${bot.serverPort}/api/health`)
		expect(response.ok).toBe(true)

		const data = await response.json()
		expect(data).toHaveProperty('ok', true)
		expect(data).toHaveProperty('statuses')
	})

	it('should serve GET /api/projects', async () => {
		const response = await fetch(`http://localhost:${bot.serverPort}/api/projects`)
		expect(response.ok).toBe(true)

		const data = await response.json()
		expect(data).toHaveProperty('projects')
		expect(Array.isArray(data.projects)).toBe(true)
	})

	it('should filter tasks by status via query param', async () => {
		const response = await fetch(`http://localhost:${bot.serverPort}/api/tasks?status=open`)
		expect(response.ok).toBe(true)

		const data = await response.json()
		expect(data).toHaveProperty('tasks')
	})

	it('should respect limit query param', async () => {
		const response = await fetch(`http://localhost:${bot.serverPort}/api/tasks?limit=1`)
		expect(response.ok).toBe(true)

		const data = await response.json()
		expect(data).toHaveProperty('tasks')
		expect(data.tasks.length).toBeLessThanOrEqual(1)
	})
})

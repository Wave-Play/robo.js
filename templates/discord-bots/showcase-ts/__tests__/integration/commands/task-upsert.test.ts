/**
 * Task Upsert Command Integration Test
 */
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import { startMockRobo, dispatchInteraction, expectAction, clearSessionActions } from '@robojs/mock/testing'
import type { MockRoboHandle } from '@robojs/mock/testing'

const __filename = fileURLToPath(import.meta.url)

describe('task upsert command', () => {
	let bot: MockRoboHandle

	beforeAll(async () => {
		bot = await startMockRobo({
			name: 'task-upsert-tests',
			testFilePath: __filename
		})
	}, 60000)

	afterAll(async () => {
		await bot.stop()
	})

	beforeEach(async () => {
		await clearSessionActions(bot.sessionId)
	})

	it('should create a new task via upsert', async () => {
		const channelId = bot.channels[0].id

		await dispatchInteraction(bot.sessionId, {
			type: 2,
			data: {
				name: 'task',
				type: 1,
				options: [
					{
						name: 'upsert',
						type: 1,
						options: [
							{ name: 'title', type: 3, value: 'Upserted Task' }
						]
					}
				]
			},
			guild_id: bot.guildId,
			channel_id: channelId
		})

		await expectAction(bot.sessionId, {
			description: 'Bot should confirm task creation',
			type: 'interaction_response',
			expected: {
				response_data: { content: expect.stringContaining('Created new task') }
			},
			timeout: 5000
		})
	})

	it('should update existing task via upsert', async () => {
		const channelId = bot.channels[0].id

		// Second upsert with same title should update
		await dispatchInteraction(bot.sessionId, {
			type: 2,
			data: {
				name: 'task',
				type: 1,
				options: [
					{
						name: 'upsert',
						type: 1,
						options: [
							{ name: 'title', type: 3, value: 'Upserted Task' },
							{ name: 'description', type: 3, value: 'Updated description' }
						]
					}
				]
			},
			guild_id: bot.guildId,
			channel_id: channelId
		})

		await expectAction(bot.sessionId, {
			description: 'Bot should confirm task update',
			type: 'interaction_response',
			expected: {
				response_data: { content: expect.stringContaining('Updated existing task') }
			},
			timeout: 5000
		})
	})
})

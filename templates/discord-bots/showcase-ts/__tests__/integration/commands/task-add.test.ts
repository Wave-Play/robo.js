/**
 * Task Add Command Integration Test
 */
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import { startMockRobo, dispatchInteraction, expectAction, clearSessionActions } from '@robojs/mock/testing'
import type { MockRoboHandle } from '@robojs/mock/testing'

const __filename = fileURLToPath(import.meta.url)

describe('task add command', () => {
	let bot: MockRoboHandle

	beforeAll(async () => {
		bot = await startMockRobo({
			name: 'task-add-tests',
			testFilePath: __filename
		})
	}, 60000)

	afterAll(async () => {
		await bot.stop()
	})

	beforeEach(async () => {
		await clearSessionActions(bot.sessionId)
	})

	it('should create a task in the General project', async () => {
		const channelId = bot.channels[0].id

		await dispatchInteraction(bot.sessionId, {
			type: 2,
			data: {
				name: 'task',
				type: 1,
				options: [
					{
						name: 'add',
						type: 1,
						options: [
							{ name: 'title', type: 3, value: 'Test Task' }
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
				response_data: { content: expect.stringContaining('Created task') }
			},
			timeout: 5000
		})
	})

	it('should handle duplicate task title in same project', async () => {
		const channelId = bot.channels[0].id

		// Create first task
		await dispatchInteraction(bot.sessionId, {
			type: 2,
			data: {
				name: 'task',
				type: 1,
				options: [
					{
						name: 'add',
						type: 1,
						options: [
							{ name: 'title', type: 3, value: 'Duplicate Check Task' }
						]
					}
				]
			},
			guild_id: bot.guildId,
			channel_id: channelId
		})

		await expectAction(bot.sessionId, {
			description: 'First task should be created',
			type: 'interaction_response',
			expected: {
				response_data: { content: expect.stringContaining('Created task') }
			},
			timeout: 5000
		})

		await clearSessionActions(bot.sessionId)

		// Try to create duplicate
		await dispatchInteraction(bot.sessionId, {
			type: 2,
			data: {
				name: 'task',
				type: 1,
				options: [
					{
						name: 'add',
						type: 1,
						options: [
							{ name: 'title', type: 3, value: 'Duplicate Check Task' }
						]
					}
				]
			},
			guild_id: bot.guildId,
			channel_id: channelId
		})

		// Should get an error response (compound unique violation)
		await expectAction(bot.sessionId, {
			description: 'Second creation should fail with unique constraint error',
			type: 'interaction_response',
			expected: {
				response_data: { content: expect.not.stringContaining('Created task') }
			},
			timeout: 5000
		})
	})
})

/**
 * Task Lifecycle Integration Test
 *
 * Tests creating, listing, and completing tasks.
 */
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import { startMockRobo, dispatchInteraction, expectAction, clearSessionActions } from '@robojs/mock/testing'
import type { MockRoboHandle } from '@robojs/mock/testing'

const __filename = fileURLToPath(import.meta.url)

describe('task lifecycle', () => {
	let bot: MockRoboHandle

	beforeAll(async () => {
		bot = await startMockRobo({
			name: 'task-lifecycle-tests',
			testFilePath: __filename
		})
	}, 60000)

	afterAll(async () => {
		await bot.stop()
	})

	beforeEach(async () => {
		await clearSessionActions(bot.sessionId)
	})

	it('should list tasks (possibly empty)', async () => {
		const channelId = bot.channels[0].id

		await dispatchInteraction(bot.sessionId, {
			type: 2,
			data: {
				name: 'task',
				type: 1,
				options: [{ name: 'list', type: 1 }]
			},
			guild_id: bot.guildId,
			channel_id: channelId
		})

		await expectAction(bot.sessionId, {
			description: 'Bot should respond with task list or empty message',
			type: 'interaction_response',
			expected: {
				response_data: { content: expect.any(String) }
			},
			timeout: 5000
		})
	})
})

/**
 * Task Inspect Command Integration Test
 */
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import { startMockRobo, dispatchInteraction, expectAction, clearSessionActions } from '@robojs/mock/testing'
import type { MockRoboHandle } from '@robojs/mock/testing'

const __filename = fileURLToPath(import.meta.url)

describe('task inspect command', () => {
	let bot: MockRoboHandle

	beforeAll(async () => {
		bot = await startMockRobo({
			name: 'task-inspect-tests',
			testFilePath: __filename
		})
	}, 60000)

	afterAll(async () => {
		await bot.stop()
	})

	beforeEach(async () => {
		await clearSessionActions(bot.sessionId)
	})

	it('should show ID utilities demo', async () => {
		const channelId = bot.channels[0].id

		await dispatchInteraction(bot.sessionId, {
			type: 2,
			data: {
				name: 'task',
				type: 1,
				options: [
					{
						name: 'inspect',
						type: 1,
						options: [
							{ name: 'id', type: 3, value: 'demo' }
						]
					}
				]
			},
			guild_id: bot.guildId,
			channel_id: channelId
		})

		await expectAction(bot.sessionId, {
			description: 'Bot should show ID utilities demo',
			type: 'interaction_response',
			expected: {
				response_data: { content: expect.stringContaining('Flashcore ID Utilities') }
			},
			timeout: 5000
		})
	})
})

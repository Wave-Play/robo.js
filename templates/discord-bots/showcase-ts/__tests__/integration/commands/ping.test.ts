/**
 * Ping Command Integration Test
 */
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { startMockRobo, dispatchInteraction, expectAction } from '@robojs/mock/testing'
import type { MockRoboHandle } from '@robojs/mock/testing'

const __filename = fileURLToPath(import.meta.url)

describe('ping command', () => {
	let bot: MockRoboHandle

	beforeAll(async () => {
		bot = await startMockRobo({
			name: 'ping-tests',
			testFilePath: __filename
		})
	}, 60000)

	afterAll(async () => {
		await bot.stop()
	})

	it('should respond with Pong!', async () => {
		const channelId = bot.channels[0].id

		await dispatchInteraction(bot.sessionId, {
			type: 2,
			data: { name: 'ping', type: 1 },
			guild_id: bot.guildId,
			channel_id: channelId
		})

		await expectAction(bot.sessionId, {
			description: 'Bot should reply with Pong!',
			type: 'interaction_response',
			expected: {
				response_data: { content: expect.stringContaining('Pong') }
			},
			timeout: 5000
		})
	})
})

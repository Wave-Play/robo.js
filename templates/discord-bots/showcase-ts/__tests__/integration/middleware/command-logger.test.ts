/**
 * Command Logger Middleware Integration Test
 */
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import { startMockRobo, dispatchInteraction, expectAction, clearSessionActions } from '@robojs/mock/testing'
import type { MockRoboHandle } from '@robojs/mock/testing'

const __filename = fileURLToPath(import.meta.url)

describe('command logger middleware', () => {
	let bot: MockRoboHandle

	beforeAll(async () => {
		bot = await startMockRobo({
			name: 'middleware-tests',
			testFilePath: __filename
		})
	}, 60000)

	afterAll(async () => {
		await bot.stop()
	})

	beforeEach(async () => {
		await clearSessionActions(bot.sessionId)
	})

	it('should not block command execution', async () => {
		const channelId = bot.channels[0].id

		await dispatchInteraction(bot.sessionId, {
			type: 2,
			data: { name: 'ping', type: 1 },
			guild_id: bot.guildId,
			channel_id: channelId
		})

		await expectAction(bot.sessionId, {
			description: 'Command should still execute with middleware active',
			type: 'interaction_response',
			expected: {
				response_data: { content: expect.stringContaining('Pong') }
			},
			timeout: 5000
		})
	})
})

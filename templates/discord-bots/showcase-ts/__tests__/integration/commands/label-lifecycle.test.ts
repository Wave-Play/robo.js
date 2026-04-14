/**
 * Label Lifecycle Integration Test
 */
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import { startMockRobo, dispatchInteraction, expectAction, clearSessionActions } from '@robojs/mock/testing'
import type { MockRoboHandle } from '@robojs/mock/testing'

const __filename = fileURLToPath(import.meta.url)

describe('label lifecycle', () => {
	let bot: MockRoboHandle

	beforeAll(async () => {
		bot = await startMockRobo({
			name: 'label-lifecycle-tests',
			testFilePath: __filename
		})
	}, 60000)

	afterAll(async () => {
		await bot.stop()
	})

	beforeEach(async () => {
		await clearSessionActions(bot.sessionId)
	})

	it('should create a label', async () => {
		const channelId = bot.channels[0].id

		await dispatchInteraction(bot.sessionId, {
			type: 2,
			data: {
				name: 'label',
				type: 1,
				options: [
					{
						name: 'create',
						type: 1,
						options: [
							{ name: 'name', type: 3, value: 'bug' },
							{ name: 'color', type: 3, value: '#ff0000' }
						]
					}
				]
			},
			guild_id: bot.guildId,
			channel_id: channelId
		})

		await expectAction(bot.sessionId, {
			description: 'Bot should confirm label creation',
			type: 'interaction_response',
			expected: {
				response_data: { content: expect.stringContaining('Created label') }
			},
			timeout: 5000
		})
	})

	it('should list labels', async () => {
		const channelId = bot.channels[0].id

		await dispatchInteraction(bot.sessionId, {
			type: 2,
			data: {
				name: 'label',
				type: 1,
				options: [
					{
						name: 'list',
						type: 1,
						options: []
					}
				]
			},
			guild_id: bot.guildId,
			channel_id: channelId
		})

		await expectAction(bot.sessionId, {
			description: 'Bot should respond with label list containing the created label',
			type: 'interaction_response',
			expected: {
				response_data: { content: expect.stringContaining('bug') }
			},
			timeout: 5000
		})
	})
})

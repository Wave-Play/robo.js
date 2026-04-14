/**
 * Project Settings Command Integration Test
 */
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import { startMockRobo, dispatchInteraction, expectAction, clearSessionActions } from '@robojs/mock/testing'
import type { MockRoboHandle } from '@robojs/mock/testing'

const __filename = fileURLToPath(import.meta.url)

describe('project settings command', () => {
	let bot: MockRoboHandle

	beforeAll(async () => {
		bot = await startMockRobo({
			name: 'project-settings-tests',
			testFilePath: __filename
		})
	}, 60000)

	afterAll(async () => {
		await bot.stop()
	})

	beforeEach(async () => {
		await clearSessionActions(bot.sessionId)
	})

	it('should view project settings (empty initially)', async () => {
		const channelId = bot.channels[0].id

		await dispatchInteraction(bot.sessionId, {
			type: 2,
			data: {
				name: 'project',
				type: 1,
				options: [
					{
						name: 'settings',
						type: 1,
						options: [
							{ name: 'project', type: 3, value: 'General' }
						]
					}
				]
			},
			guild_id: bot.guildId,
			channel_id: channelId
		})

		await expectAction(bot.sessionId, {
			description: 'Bot should show no custom settings',
			type: 'interaction_response',
			expected: {
				response_data: { content: expect.stringContaining('no custom settings') }
			},
			timeout: 5000
		})
	})

	it('should update project settings', async () => {
		const channelId = bot.channels[0].id

		await dispatchInteraction(bot.sessionId, {
			type: 2,
			data: {
				name: 'project',
				type: 1,
				options: [
					{
						name: 'settings',
						type: 1,
						options: [
							{ name: 'project', type: 3, value: 'General' },
							{ name: 'default-priority', type: 3, value: 'high' }
						]
					}
				]
			},
			guild_id: bot.guildId,
			channel_id: channelId
		})

		await expectAction(bot.sessionId, {
			description: 'Bot should confirm settings update',
			type: 'interaction_response',
			expected: {
				response_data: { content: expect.stringContaining('Updated settings') }
			},
			timeout: 5000
		})
	})
})

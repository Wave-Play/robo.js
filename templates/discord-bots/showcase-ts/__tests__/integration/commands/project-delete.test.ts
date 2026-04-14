/**
 * Project Delete Command Integration Test
 */
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import { startMockRobo, dispatchInteraction, expectAction, clearSessionActions } from '@robojs/mock/testing'
import type { MockRoboHandle } from '@robojs/mock/testing'

const __filename = fileURLToPath(import.meta.url)

describe('project delete command', () => {
	let bot: MockRoboHandle

	beforeAll(async () => {
		bot = await startMockRobo({
			name: 'project-delete-tests',
			testFilePath: __filename
		})
	}, 60000)

	afterAll(async () => {
		await bot.stop()
	})

	beforeEach(async () => {
		await clearSessionActions(bot.sessionId)
	})

	it('should prevent deleting the General project', async () => {
		const channelId = bot.channels[0].id

		await dispatchInteraction(bot.sessionId, {
			type: 2,
			data: {
				name: 'project',
				type: 1,
				options: [
					{
						name: 'delete',
						type: 1,
						options: [
							{ name: 'name', type: 3, value: 'General' }
						]
					}
				]
			},
			guild_id: bot.guildId,
			channel_id: channelId
		})

		await expectAction(bot.sessionId, {
			description: 'Bot should prevent deletion of General project',
			type: 'interaction_response',
			expected: {
				response_data: { content: expect.stringContaining('Cannot delete') }
			},
			timeout: 5000
		})
	})

	it('should delete a project and cascade tasks', async () => {
		const channelId = bot.channels[0].id

		// Create a project first
		await dispatchInteraction(bot.sessionId, {
			type: 2,
			data: {
				name: 'project',
				type: 1,
				options: [
					{
						name: 'create',
						type: 1,
						options: [
							{ name: 'name', type: 3, value: 'Deletable Project' }
						]
					}
				]
			},
			guild_id: bot.guildId,
			channel_id: channelId
		})

		await expectAction(bot.sessionId, {
			description: 'Bot should confirm project creation',
			type: 'interaction_response',
			expected: {
				response_data: { content: expect.stringContaining('Created project') }
			},
			timeout: 5000
		})

		await clearSessionActions(bot.sessionId)

		// Now delete it
		await dispatchInteraction(bot.sessionId, {
			type: 2,
			data: {
				name: 'project',
				type: 1,
				options: [
					{
						name: 'delete',
						type: 1,
						options: [
							{ name: 'name', type: 3, value: 'Deletable Project' }
						]
					}
				]
			},
			guild_id: bot.guildId,
			channel_id: channelId
		})

		await expectAction(bot.sessionId, {
			description: 'Bot should confirm cascade delete',
			type: 'interaction_response',
			expected: {
				response_data: { content: expect.stringContaining('Deleted project') }
			},
			timeout: 5000
		})
	})
})

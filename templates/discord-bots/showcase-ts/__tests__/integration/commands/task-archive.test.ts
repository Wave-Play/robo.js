/**
 * Task Archive Command Integration Test
 */
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import { startMockRobo, dispatchInteraction, expectAction, clearSessionActions } from '@robojs/mock/testing'
import type { MockRoboHandle } from '@robojs/mock/testing'

const __filename = fileURLToPath(import.meta.url)

describe('task archive command', () => {
	let bot: MockRoboHandle

	beforeAll(async () => {
		bot = await startMockRobo({
			name: 'task-archive-tests',
			testFilePath: __filename
		})
	}, 60000)

	afterAll(async () => {
		await bot.stop()
	})

	beforeEach(async () => {
		await clearSessionActions(bot.sessionId)
	})

	it('should archive a task by ID prefix', async () => {
		const channelId = bot.channels[0].id

		// First create a task to archive
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
							{ name: 'title', type: 3, value: 'Archive Me' }
						]
					}
				]
			},
			guild_id: bot.guildId,
			channel_id: channelId
		})

		const createResult = await expectAction(bot.sessionId, {
			description: 'Bot should confirm task creation',
			type: 'interaction_response',
			expected: {
				response_data: { content: expect.stringContaining('Created task') }
			},
			timeout: 5000
		})

		// Extract ID from response
		const content = (createResult as any)?.response_data?.content ?? ''
		const idMatch = content.match(/`([^`]+)`/)
		expect(idMatch).not.toBeNull()

		await clearSessionActions(bot.sessionId)

		// Now archive it
		await dispatchInteraction(bot.sessionId, {
			type: 2,
			data: {
				name: 'task',
				type: 1,
				options: [
					{
						name: 'archive',
						type: 1,
						options: [
							{ name: 'id', type: 3, value: idMatch[1] },
							{ name: 'reason', type: 3, value: 'No longer needed' }
						]
					}
				]
			},
			guild_id: bot.guildId,
			channel_id: channelId
		})

		await expectAction(bot.sessionId, {
			description: 'Bot should confirm archival',
			type: 'interaction_response',
			expected: {
				response_data: { content: expect.stringContaining('Archived') }
			},
			timeout: 5000
		})
	})
})

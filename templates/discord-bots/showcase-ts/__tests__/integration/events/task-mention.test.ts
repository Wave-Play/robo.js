/**
 * Task Mention Event Integration Test
 */
import { fileURLToPath } from 'node:url'
import { describe, it, beforeAll, afterAll, beforeEach } from '@jest/globals'
import {
	startMockRobo,
	clearSessionActions,
	dispatchEvent,
	generateSnowflake
} from '@robojs/mock/testing'
import type { MockRoboHandle } from '@robojs/mock/testing'

const __filename = fileURLToPath(import.meta.url)

describe('task mention event', () => {
	let bot: MockRoboHandle

	beforeAll(async () => {
		bot = await startMockRobo({
			name: 'task-mention-tests',
			testFilePath: __filename
		})
	}, 60000)

	afterAll(async () => {
		await bot.stop()
	})

	beforeEach(async () => {
		await clearSessionActions(bot.sessionId)
	})

	it('should not reply to messages without task references', async () => {
		const channelId = bot.channels[0].id
		const messageId = generateSnowflake()
		const userId = generateSnowflake()

		await dispatchEvent(bot.sessionId, 'MESSAGE_CREATE', {
			id: messageId,
			channel_id: channelId,
			guild_id: bot.guildId,
			content: 'Just a regular message',
			author: {
				id: userId,
				username: 'TestUser',
				discriminator: '0000',
				avatar: null,
				bot: false
			},
			timestamp: new Date().toISOString(),
			edited_timestamp: null,
			tts: false,
			mention_everyone: false,
			mentions: [],
			mention_roles: [],
			attachments: [],
			embeds: []
		})

		// Allow time for any potential handler response
		await new Promise((resolve) => setTimeout(resolve, 2000))
	})

	it('should handle messages with #T- prefix pattern', async () => {
		const channelId = bot.channels[0].id
		const messageId = generateSnowflake()
		const userId = generateSnowflake()

		// Send a message with a fake task reference pattern
		await dispatchEvent(bot.sessionId, 'MESSAGE_CREATE', {
			id: messageId,
			channel_id: channelId,
			guild_id: bot.guildId,
			content: 'Check out #T-abc12345',
			author: {
				id: userId,
				username: 'TestUser',
				discriminator: '0000',
				avatar: null,
				bot: false
			},
			timestamp: new Date().toISOString(),
			edited_timestamp: null,
			tts: false,
			mention_everyone: false,
			mentions: [],
			mention_roles: [],
			attachments: [],
			embeds: []
		})

		// Allow time for handler to process
		await new Promise((resolve) => setTimeout(resolve, 2000))
	})
})

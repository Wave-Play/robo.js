/**
 * Prefix Command: !done Integration Test
 */
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import {
	startMockRobo,
	clearSessionActions,
	dispatchEvent,
	expectAction,
	generateSnowflake
} from '@robojs/mock/testing'
import type { MockRoboHandle } from '@robojs/mock/testing'

const __filename = fileURLToPath(import.meta.url)

describe('prefix command: !done', () => {
	let bot: MockRoboHandle

	beforeAll(async () => {
		bot = await startMockRobo({
			name: 'prefix-done-tests',
			testFilePath: __filename
		})
	}, 60000)

	afterAll(async () => {
		await bot.stop()
	})

	beforeEach(async () => {
		await clearSessionActions(bot.sessionId)
	})

	it('should respond with usage when no ID provided', async () => {
		const channelId = bot.channels[0].id
		const messageId = generateSnowflake()
		const userId = generateSnowflake()

		await dispatchEvent(bot.sessionId, 'MESSAGE_CREATE', {
			id: messageId,
			channel_id: channelId,
			guild_id: bot.guildId,
			content: '!done',
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

		await expectAction(bot.sessionId, {
			description: 'Bot should respond with usage hint',
			type: 'message_sent',
			expected: {
				content: expect.stringContaining('Usage')
			},
			timeout: 5000
		})
	})

	it('should attempt to mark a task done by ID', async () => {
		const channelId = bot.channels[0].id
		const messageId = generateSnowflake()
		const userId = generateSnowflake()

		await dispatchEvent(bot.sessionId, 'MESSAGE_CREATE', {
			id: messageId,
			channel_id: channelId,
			guild_id: bot.guildId,
			content: '!done abc12345',
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

		await expectAction(bot.sessionId, {
			description: 'Bot should respond (found or not found)',
			type: 'message_sent',
			expected: {
				content: expect.any(String)
			},
			timeout: 5000
		})
	})
})

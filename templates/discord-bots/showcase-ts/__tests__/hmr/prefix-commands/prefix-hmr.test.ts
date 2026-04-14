/**
 * Prefix Command HMR Integration Tests
 */
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals'
import {
	startMockRobo,
	dispatchEvent,
	expectAction,
	clearSessionActions,
	generateSnowflake
} from '@robojs/mock/testing'
import type { MockRoboHandle } from '@robojs/mock/testing'
import { TempFileManager } from '../../utils/temp-file-manager.js'

const __filename = fileURLToPath(import.meta.url)

describe('Prefix Command HMR', () => {
	let bot: MockRoboHandle
	let files: TempFileManager

	beforeAll(async () => {
		bot = await startMockRobo({
			name: 'prefix-hmr',
			testFilePath: __filename,
			hmr: true,
			verbose: process.env.VERBOSE === 'true'
		})
		files = new TempFileManager()
	}, 90000)

	afterAll(async () => {
		await files.restoreAll()
		await bot.stop()
	})

	afterEach(async () => {
		if (files.hasPendingChanges()) {
			const hmrCountBefore = bot.getHmrCount!()
			await files.restoreAll()
			try {
				await bot.waitForHmrReload!(10000, hmrCountBefore)
			} catch {
				// HMR might not trigger
			}
		}
		await clearSessionActions(bot.sessionId)
	})

	it('should hot-reload modified prefix command response', async () => {
		const channelId = bot.channels[0].id

		// Verify original help command works
		await dispatchEvent(bot.sessionId, 'MESSAGE_CREATE', {
			id: generateSnowflake(),
			channel_id: channelId,
			guild_id: bot.guildId,
			content: '!help',
			author: {
				id: generateSnowflake(),
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
			description: 'Original help response',
			type: 'message_sent',
			expected: { content: expect.stringContaining('Taskmaster') },
			timeout: 5000
		})

		await clearSessionActions(bot.sessionId)

		// Modify prefix command
		const hmrCountBefore = bot.getHmrCount!()
		await files.modify('src/prefixCommands/help.ts', (content) =>
			content.replace('Taskmaster Commands', 'Updated Commands')
		)
		await bot.waitForHmrReload!(10000, hmrCountBefore)

		// Verify updated response
		await dispatchEvent(bot.sessionId, 'MESSAGE_CREATE', {
			id: generateSnowflake(),
			channel_id: channelId,
			guild_id: bot.guildId,
			content: '!help',
			author: {
				id: generateSnowflake(),
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
			description: 'Updated help response',
			type: 'message_sent',
			expected: { content: expect.stringContaining('Updated Commands') },
			timeout: 5000
		})
	}, 30000)
})

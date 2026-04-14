/**
 * Command HMR Integration Tests
 */
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals'
import { startMockRobo, dispatchInteraction, expectAction, clearSessionActions } from '@robojs/mock/testing'
import type { MockRoboHandle } from '@robojs/mock/testing'
import { TempFileManager } from '../../utils/temp-file-manager.js'

const __filename = fileURLToPath(import.meta.url)

describe('Command HMR', () => {
	let bot: MockRoboHandle
	let files: TempFileManager

	beforeAll(async () => {
		bot = await startMockRobo({
			name: 'cmd-hmr',
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

	it('should hot-reload modified command response', async () => {
		const channelId = bot.channels[0].id

		// Verify original
		await dispatchInteraction(bot.sessionId, {
			type: 2,
			data: { name: 'ping', type: 1 },
			guild_id: bot.guildId,
			channel_id: channelId
		})
		await expectAction(bot.sessionId, {
			description: 'Original ping response',
			type: 'interaction_response',
			expected: { response_data: { content: expect.stringContaining('Pong') } },
			timeout: 5000
		})

		await clearSessionActions(bot.sessionId)

		// Modify command
		const hmrCountBefore = bot.getHmrCount!()
		await files.modify('src/commands/ping.ts', (content) =>
			content.replace("'Pong! 🏓'", "'Hot Pong!'")
		)
		await bot.waitForHmrReload!(10000, hmrCountBefore)

		// Verify new response
		await dispatchInteraction(bot.sessionId, {
			type: 2,
			data: { name: 'ping', type: 1 },
			guild_id: bot.guildId,
			channel_id: channelId
		})
		await expectAction(bot.sessionId, {
			description: 'Modified ping response',
			type: 'interaction_response',
			expected: { response_data: { content: 'Hot Pong!' } },
			timeout: 5000
		})
	}, 30000)
})

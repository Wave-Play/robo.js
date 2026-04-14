/**
 * Ready Event Integration Test
 */
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { startMockRobo, getHistoricalActions } from '@robojs/mock/testing'
import type { MockRoboHandle } from '@robojs/mock/testing'

const __filename = fileURLToPath(import.meta.url)

describe('ready event', () => {
	let bot: MockRoboHandle

	beforeAll(async () => {
		bot = await startMockRobo({
			name: 'ready-tests',
			testFilePath: __filename
		})
	}, 60000)

	afterAll(async () => {
		await bot.stop()
	})

	it('should connect successfully', async () => {
		expect(bot.sessionId).toBeDefined()
		expect(bot.token).toBeDefined()
		expect(bot.botUser).toBeDefined()
		expect(bot.client).toBeDefined()
	})

	it('should have guilds and channels', async () => {
		expect(bot.guilds.length).toBeGreaterThan(0)
		expect(bot.channels.length).toBeGreaterThan(0)
		expect(bot.guildId).toBeDefined()
	})

	it('should set activity on ready', async () => {
		const presenceActions = await getHistoricalActions(bot.sessionId, {
			type: 'gateway_presence_update'
		})

		expect(presenceActions.length).toBeGreaterThan(0)

		const lastPresence = presenceActions[presenceActions.length - 1]
		const data = lastPresence.data as { activities?: Array<{ name?: string; state?: string }> }
		const activity = data.activities?.[0]
		expect(activity).toBeDefined()
		const statusText = activity?.state ?? activity?.name
		expect(statusText).toContain('tasks')
	})
})

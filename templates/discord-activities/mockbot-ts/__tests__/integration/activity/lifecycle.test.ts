/**
 * Activity Lifecycle Integration Test
 *
 * Tests that the Activity server starts successfully under mock mode
 * and that sessions are valid with expected properties.
 */
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { startMockRobo } from '@robojs/mock/testing'
import type { MockRoboHandle } from '@robojs/mock/testing'

const __filename = fileURLToPath(import.meta.url)

describe('activity lifecycle', () => {
	let activity: MockRoboHandle

	beforeAll(async () => {
		activity = await startMockRobo({
			name: 'lifecycle-tests',
			testFilePath: __filename,
			activity: true
		})
	}, 60000)

	afterAll(async () => {
		await activity.stop()
	})

	it('should start successfully and have a valid session', async () => {
		// The activity should be running after startMockRobo() returns
		expect(activity.sessionId).toBeDefined()
		expect(activity.token).toBeDefined()
	})

	it('should have guilds and channels available', async () => {
		// Activity should have access to mock guilds and channels
		expect(activity.guilds).toBeDefined()
		expect(activity.guilds.length).toBeGreaterThan(0)
		expect(activity.channels).toBeDefined()
		expect(activity.channels.length).toBeGreaterThan(0)
		expect(activity.guildId).toBeDefined()
	})
})

/**
 * API Route HMR Integration Tests
 *
 * Tests hot module replacement for API routes.
 * Verifies that changes to API route handlers are picked up without full restart.
 */
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals'
import { startMockRobo, clearSessionActions } from '@robojs/mock/testing'
import type { MockRoboHandle } from '@robojs/mock/testing'
import { TempFileManager } from '../utils/temp-file-manager.js'

const __filename = fileURLToPath(import.meta.url)

describe('API Route HMR', () => {
	let activity: MockRoboHandle
	let files: TempFileManager

	beforeAll(async () => {
		activity = await startMockRobo({
			name: 'api-hmr',
			testFilePath: __filename,
			hmr: true,
			activity: true,
			verbose: process.env.VERBOSE === 'true'
		})
		files = new TempFileManager()
	}, 90000)

	afterAll(async () => {
		await files.restoreAll()
		await activity.stop()
	})

	afterEach(async () => {
		if (files.hasPendingChanges()) {
			const hmrCountBefore = activity.getHmrCount!()
			await files.restoreAll()
			try {
				await activity.waitForHmrReload!(10000, hmrCountBefore)
			} catch {
				// HMR might not trigger if files didn't actually change
			}
		}
		await clearSessionActions(activity.sessionId)
	})

	it('should hot-reload modified API route response', async () => {
		// 1. Verify original response
		const response1 = await fetch(`http://localhost:${activity.serverPort}/api/health`)
		const data1 = await response1.json()
		expect(data1.status).toBe('ok')

		// 2. Capture HMR count BEFORE modifying file
		const hmrCountBefore = activity.getHmrCount!()

		// 3. Modify API route to return different response
		await files.modify('src/api/health.ts', (content) =>
			content.replace("{ status: 'ok', message: formatCount(requestCount) }", "{ status: 'modified', message: 'HMR works!' }")
		)

		// 4. Wait for HMR to complete
		await activity.waitForHmrReload!(10000, hmrCountBefore)

		// 5. Verify new response
		const response2 = await fetch(`http://localhost:${activity.serverPort}/api/health`)
		const data2 = await response2.json()
		expect(data2.status).toBe('modified')
		expect(data2.message).toBe('HMR works!')
	}, 30000)

	it('should handle syntax errors gracefully', async () => {
		// Verify API is working
		const response1 = await fetch(`http://localhost:${activity.serverPort}/api/health`)
		expect(response1.ok).toBe(true)

		// Change to a known stable response
		const hmrCountStable = activity.getHmrCount!()
		await files.modify('src/api/health.ts', (content) =>
			content.replace("{ status: 'ok', message: formatCount(requestCount) }", "{ status: 'stable' }")
		)
		await activity.waitForHmrReload!(15000, hmrCountStable)

		const stableResponse = await fetch(`http://localhost:${activity.serverPort}/api/health`)
		const stableData = await stableResponse.json()
		expect(stableData.status).toBe('stable')

		// Introduce a syntax error
		await files.modify('src/api/health.ts', (content) => content + '\n invalid syntax {')

		// Wait for the watcher to process (compilation will fail)
		await new Promise((resolve) => setTimeout(resolve, 2000))

		// The server should still respond (last-known-good handler)
		const errorResponse = await fetch(`http://localhost:${activity.serverPort}/api/health`)
		expect(errorResponse.ok).toBe(true)

		// Restore and verify recovery
		const hmrCountAfterError = activity.getHmrCount!()
		await files.restoreAll()
		try {
			await activity.waitForHmrReload!(15000, hmrCountAfterError)
		} catch {
			// HMR detection might fail, but the server should survive
		}

		const recoveredResponse = await fetch(`http://localhost:${activity.serverPort}/api/health`)
		expect(recoveredResponse.ok).toBe(true)
	}, 30000)

	it('should hot-reload newly added API route', async () => {
		// Capture HMR count before creating file
		const hmrCountBefore = activity.getHmrCount!()

		// Create a new API route file
		await files.createTemp(
			'src/api/hmr-new.ts',
			`export default () => {
	return { message: 'New Route Works!' }
}
`
		)

		// Wait for HMR to pick up the new file
		await activity.waitForHmrReload!(10000, hmrCountBefore)

		// Verify the new endpoint responds
		const response = await fetch(`http://localhost:${activity.serverPort}/api/hmr-new`)
		expect(response.ok).toBe(true)
		const data = await response.json()
		expect(data.message).toBe('New Route Works!')
	}, 30000)
})

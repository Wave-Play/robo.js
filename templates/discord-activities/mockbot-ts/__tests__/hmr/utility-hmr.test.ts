/**
 * Utility HMR Integration Tests
 *
 * Tests dependency-aware hot module replacement.
 * Verifies that changes to utility files trigger HMR for dependent API routes.
 */
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals'
import { startMockRobo, clearSessionActions, sleep } from '@robojs/mock/testing'
import type { MockRoboHandle } from '@robojs/mock/testing'
import { TempFileManager } from '../utils/temp-file-manager.js'

const __filename = fileURLToPath(import.meta.url)

describe('Utility HMR', () => {
	let activity: MockRoboHandle
	let files: TempFileManager

	beforeAll(async () => {
		activity = await startMockRobo({
			name: 'utility-hmr',
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
				await activity.waitForHmrReload!(20000, hmrCountBefore)
			} catch {
				// HMR might not trigger if files didn't actually change
			}
			// Extra wait for graph to stabilize
			await sleep(1000)
		}
		await clearSessionActions(activity.sessionId)
	})

	it('should hot-reload API route when utility file changes', async () => {
		// Verify initial state — health returns 'Request #N' via the utility chain
		const response1 = await fetch(`http://localhost:${activity.serverPort}/api/health`)
		const data1 = await response1.json()
		expect(data1.status).toBe('ok')
		expect(data1.message).toMatch(/Request #\d+/)

		// Modify ONLY the utility file (not the API route)
		const hmrCountBefore = activity.getHmrCount!()
		await files.modify('src/utils/format-count.ts', (content) =>
			content.replace('`Request #${count}`', '`Modified #${count}`')
		)

		// Wait for dependency-aware HMR to reload the health route
		await activity.waitForHmrReload!(15000, hmrCountBefore)

		// Verify the API route reflects the utility change
		const response2 = await fetch(`http://localhost:${activity.serverPort}/api/health`)
		const data2 = await response2.json()
		expect(data2.message).toMatch(/Modified #\d+/)
	}, 60000)

	it('should propagate deep dependency changes through the chain', async () => {
		// Dependency chain: health.ts -> format-count.ts -> deeper.ts

		// Verify initial state
		const response1 = await fetch(`http://localhost:${activity.serverPort}/api/health`)
		const data1 = await response1.json()
		expect(data1.status).toBe('ok')

		// Modify ONLY deeper.ts (the deep dependency, 2 levels down)
		const hmrCountBefore = activity.getHmrCount!()
		await files.modify('src/utils/deeper.ts', (content) =>
			content.replace('return text', "return '[DEEP] ' + text")
		)

		// Wait for HMR to propagate through the chain
		await activity.waitForHmrReload!(20000, hmrCountBefore)

		// Verify the API route reflects the deep dependency change
		const response2 = await fetch(`http://localhost:${activity.serverPort}/api/health`)
		const data2 = await response2.json()
		expect(data2.message).toMatch(/\[DEEP\] Request #\d+/)
	}, 90000)
})

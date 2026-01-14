/**
 * Unit tests for MemoryRunStore
 */

import { MemoryRunStore, createMemoryRunStore } from '../../src/store/index.js'
import type { RunMeta } from '../../src/types/run.js'

// Helper to create a RunMeta
function createRunMeta(overrides: Partial<RunMeta> = {}): RunMeta {
	const now = new Date()
	return {
		runId: `run_${Date.now()}_${Math.random().toString(36).slice(2)}`,
		threadId: `thread_${Date.now()}`,
		createdAt: now.toISOString(),
		updatedAt: now.toISOString(),
		status: 'running',
		instruction: 'Test instruction',
		mode: 'execute',
		...overrides
	}
}

describe('MemoryRunStore', () => {
	describe('constructor', () => {
		it('should create with default config', () => {
			const store = new MemoryRunStore()
			expect(store.size).toBe(0)
		})

		it('should create with custom maxRuns', () => {
			const store = new MemoryRunStore({ maxRuns: 50 })
			expect(store.size).toBe(0)
		})
	})

	describe('saveRun', () => {
		it('should save a run', async () => {
			const store = new MemoryRunStore()
			const run = createRunMeta({ runId: 'run_1' })

			await store.saveRun(run)

			expect(store.size).toBe(1)
			const retrieved = await store.getRun('run_1')
			expect(retrieved).toEqual(run)
		})

		it('should update an existing run', async () => {
			const store = new MemoryRunStore()
			const run = createRunMeta({ runId: 'run_1', status: 'running' })

			await store.saveRun(run)
			await store.saveRun({ ...run, status: 'completed' })

			expect(store.size).toBe(1)
			const retrieved = await store.getRun('run_1')
			expect(retrieved?.status).toBe('completed')
		})
	})

	describe('getRun', () => {
		it('should return null for non-existent run', async () => {
			const store = new MemoryRunStore()
			const result = await store.getRun('non_existent')
			expect(result).toBeNull()
		})

		it('should return the correct run', async () => {
			const store = new MemoryRunStore()
			const run1 = createRunMeta({ runId: 'run_1' })
			const run2 = createRunMeta({ runId: 'run_2' })

			await store.saveRun(run1)
			await store.saveRun(run2)

			const result = await store.getRun('run_1')
			expect(result).toEqual(run1)
		})
	})

	describe('listRuns', () => {
		it('should return empty array for empty store', async () => {
			const store = new MemoryRunStore()
			const runs = await store.listRuns()
			expect(runs).toEqual([])
		})

		it('should return all runs sorted by creation time (newest first)', async () => {
			const store = new MemoryRunStore()

			const oldRun = createRunMeta({
				runId: 'run_old',
				createdAt: new Date('2024-01-01').toISOString()
			})
			const newRun = createRunMeta({
				runId: 'run_new',
				createdAt: new Date('2024-06-01').toISOString()
			})
			const midRun = createRunMeta({
				runId: 'run_mid',
				createdAt: new Date('2024-03-01').toISOString()
			})

			await store.saveRun(oldRun)
			await store.saveRun(newRun)
			await store.saveRun(midRun)

			const runs = await store.listRuns()
			expect(runs.length).toBe(3)
			expect(runs[0].runId).toBe('run_new')
			expect(runs[1].runId).toBe('run_mid')
			expect(runs[2].runId).toBe('run_old')
		})

		describe('filtering', () => {
			let store: MemoryRunStore

			beforeEach(async () => {
				store = new MemoryRunStore()

				await store.saveRun(
					createRunMeta({
						runId: 'run_1',
						status: 'running',
						mode: 'execute',
						createdAt: new Date('2024-01-01').toISOString()
					})
				)
				await store.saveRun(
					createRunMeta({
						runId: 'run_2',
						status: 'completed',
						mode: 'execute',
						createdAt: new Date('2024-02-01').toISOString()
					})
				)
				await store.saveRun(
					createRunMeta({
						runId: 'run_3',
						status: 'running',
						mode: 'plan',
						createdAt: new Date('2024-03-01').toISOString()
					})
				)
				await store.saveRun(
					createRunMeta({
						runId: 'run_4',
						status: 'aborted',
						mode: 'explain',
						createdAt: new Date('2024-04-01').toISOString()
					})
				)
			})

			it('should filter by status', async () => {
				const runs = await store.listRuns({ status: 'running' })
				expect(runs.length).toBe(2)
				expect(runs.every((r) => r.status === 'running')).toBe(true)
			})

			it('should filter by mode', async () => {
				const runs = await store.listRuns({ mode: 'execute' })
				expect(runs.length).toBe(2)
				expect(runs.every((r) => r.mode === 'execute')).toBe(true)
			})

			it('should filter by since date', async () => {
				const runs = await store.listRuns({ since: '2024-02-15' })
				expect(runs.length).toBe(2) // run_3 and run_4
				expect(runs.some((r) => r.runId === 'run_3')).toBe(true)
				expect(runs.some((r) => r.runId === 'run_4')).toBe(true)
			})

			it('should apply limit', async () => {
				const runs = await store.listRuns({ limit: 2 })
				expect(runs.length).toBe(2)
				// Should be newest first
				expect(runs[0].runId).toBe('run_4')
				expect(runs[1].runId).toBe('run_3')
			})

			it('should combine multiple filters', async () => {
				const runs = await store.listRuns({
					status: 'running',
					since: '2024-02-01',
					limit: 1
				})
				expect(runs.length).toBe(1)
				expect(runs[0].runId).toBe('run_3')
			})
		})
	})

	describe('deleteRun', () => {
		it('should delete a run', async () => {
			const store = new MemoryRunStore()
			const run = createRunMeta({ runId: 'run_1' })

			await store.saveRun(run)
			expect(store.size).toBe(1)

			await store.deleteRun('run_1')
			expect(store.size).toBe(0)

			const result = await store.getRun('run_1')
			expect(result).toBeNull()
		})

		it('should not throw when deleting non-existent run', async () => {
			const store = new MemoryRunStore()
			await expect(store.deleteRun('non_existent')).resolves.not.toThrow()
		})
	})

	describe('LRU eviction', () => {
		it('should evict oldest run when maxRuns is exceeded', async () => {
			const store = new MemoryRunStore({ maxRuns: 3 })

			await store.saveRun(
				createRunMeta({
					runId: 'run_oldest',
					createdAt: new Date('2024-01-01').toISOString()
				})
			)
			await store.saveRun(
				createRunMeta({
					runId: 'run_mid',
					createdAt: new Date('2024-02-01').toISOString()
				})
			)
			await store.saveRun(
				createRunMeta({
					runId: 'run_newer',
					createdAt: new Date('2024-03-01').toISOString()
				})
			)

			expect(store.size).toBe(3)

			// Add a 4th run, should evict the oldest
			await store.saveRun(
				createRunMeta({
					runId: 'run_newest',
					createdAt: new Date('2024-04-01').toISOString()
				})
			)

			expect(store.size).toBe(3)
			expect(await store.getRun('run_oldest')).toBeNull()
			expect(await store.getRun('run_mid')).not.toBeNull()
			expect(await store.getRun('run_newer')).not.toBeNull()
			expect(await store.getRun('run_newest')).not.toBeNull()
		})

		it('should evict correctly with multiple additions', async () => {
			const store = new MemoryRunStore({ maxRuns: 2 })

			await store.saveRun(
				createRunMeta({
					runId: 'run_1',
					createdAt: new Date('2024-01-01').toISOString()
				})
			)
			await store.saveRun(
				createRunMeta({
					runId: 'run_2',
					createdAt: new Date('2024-02-01').toISOString()
				})
			)
			await store.saveRun(
				createRunMeta({
					runId: 'run_3',
					createdAt: new Date('2024-03-01').toISOString()
				})
			)
			await store.saveRun(
				createRunMeta({
					runId: 'run_4',
					createdAt: new Date('2024-04-01').toISOString()
				})
			)

			expect(store.size).toBe(2)
			expect(await store.getRun('run_1')).toBeNull()
			expect(await store.getRun('run_2')).toBeNull()
			expect(await store.getRun('run_3')).not.toBeNull()
			expect(await store.getRun('run_4')).not.toBeNull()
		})

		it('should not evict when updating existing run', async () => {
			const store = new MemoryRunStore({ maxRuns: 2 })

			const run1 = createRunMeta({
				runId: 'run_1',
				createdAt: new Date('2024-01-01').toISOString(),
				status: 'running'
			})
			const run2 = createRunMeta({
				runId: 'run_2',
				createdAt: new Date('2024-02-01').toISOString()
			})

			await store.saveRun(run1)
			await store.saveRun(run2)

			// Update run_1 (should not trigger eviction)
			await store.saveRun({ ...run1, status: 'completed' })

			expect(store.size).toBe(2)
			expect(await store.getRun('run_1')).not.toBeNull()
			expect(await store.getRun('run_2')).not.toBeNull()
		})
	})

	describe('clear', () => {
		it('should remove all runs', async () => {
			const store = new MemoryRunStore()

			await store.saveRun(createRunMeta({ runId: 'run_1' }))
			await store.saveRun(createRunMeta({ runId: 'run_2' }))
			await store.saveRun(createRunMeta({ runId: 'run_3' }))

			expect(store.size).toBe(3)

			store.clear()

			expect(store.size).toBe(0)
			const runs = await store.listRuns()
			expect(runs).toEqual([])
		})
	})

	describe('createMemoryRunStore', () => {
		it('should create a MemoryRunStore instance', () => {
			const store = createMemoryRunStore()
			expect(store).toBeInstanceOf(MemoryRunStore)
		})

		it('should pass config to the constructor', () => {
			const store = createMemoryRunStore({ maxRuns: 50 })
			expect(store).toBeInstanceOf(MemoryRunStore)
		})
	})
})

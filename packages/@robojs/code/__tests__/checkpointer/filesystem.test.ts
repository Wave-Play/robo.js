/**
 * Tests for Filesystem checkpointer
 *
 * Phase A4: Durable checkpointer interface
 * Tests filesystem-based checkpoint persistence for Node.js environments.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createFilesystemCheckpointSaver, FilesystemCheckpointSaver } from '../../src/checkpointer/filesystem.js'
import type { Checkpoint, CheckpointMetadata, PendingWrite } from '@langchain/langgraph'

describe('FilesystemCheckpointSaver', () => {
	const threadId = 'test-thread'
	let baseDir: string
	let checkpointer: FilesystemCheckpointSaver

	beforeEach(async () => {
		// Create a unique temp directory for each test
		baseDir = join(tmpdir(), `checkpointer-test-${Date.now()}`)
		await mkdir(baseDir, { recursive: true })

		checkpointer = createFilesystemCheckpointSaver({
			baseDir,
			threadId
		}) as FilesystemCheckpointSaver
	})

	afterEach(async () => {
		// Clean up test directory
		try {
			await rm(baseDir, { recursive: true, force: true })
		} catch (error) {
			// Ignore cleanup errors
		}
	})

	describe('put and getTuple', () => {
		it('should save and retrieve a checkpoint', async () => {
			const checkpoint: Checkpoint = {
				v: 1,
				id: 'checkpoint-1',
				ts: '2024-01-01T00:00:00Z',
				channel_values: { messages: ['Hello'] },
				channel_versions: {},
				versions_seen: {},
				pending_sends: []
			}

			const metadata: CheckpointMetadata = {
				source: 'input',
				step: 1,
				writes: {},
				parents: {}
			}

			const config = {
				configurable: {
					thread_id: threadId,
					checkpoint_ns: '',
					checkpoint_id: undefined
				}
			}

			// Save checkpoint
			const savedConfig = await checkpointer.put(config, checkpoint, metadata)

			// Verify config returned
			expect(savedConfig.configurable?.thread_id).toBe(threadId)
			expect(savedConfig.configurable?.checkpoint_id).toBe('checkpoint-1')

			// Retrieve checkpoint
			const tuple = await checkpointer.getTuple({
				configurable: {
					thread_id: threadId,
					checkpoint_ns: '',
					checkpoint_id: 'checkpoint-1'
				}
			})

			// Verify checkpoint data
			expect(tuple).toBeDefined()
			expect(tuple?.checkpoint.id).toBe('checkpoint-1')
			expect(tuple?.checkpoint.channel_values).toEqual({ messages: ['Hello'] })
			expect(tuple?.metadata.step).toBe(1)
		})

		it('should retrieve latest checkpoint when no checkpoint_id specified', async () => {
			const checkpoint1: Checkpoint = {
				v: 1,
				id: 'checkpoint-1',
				ts: '2024-01-01T00:00:00Z',
				channel_values: { messages: ['First'] },
				channel_versions: {},
				versions_seen: {},
				pending_sends: []
			}

			const checkpoint2: Checkpoint = {
				v: 1,
				id: 'checkpoint-2',
				ts: '2024-01-01T00:01:00Z',
				channel_values: { messages: ['Second'] },
				channel_versions: {},
				versions_seen: {},
				pending_sends: []
			}

			const metadata: CheckpointMetadata = {
				source: 'input',
				step: 1,
				writes: {},
				parents: {}
			}

			const config = {
				configurable: {
					thread_id: threadId,
					checkpoint_ns: '',
					checkpoint_id: undefined
				}
			}

			// Save two checkpoints
			await checkpointer.put(config, checkpoint1, metadata)
			// Small delay to ensure different timestamps
			await new Promise((resolve) => setTimeout(resolve, 10))
			await checkpointer.put(config, checkpoint2, metadata)

			// Retrieve latest (should be checkpoint-2)
			const tuple = await checkpointer.getTuple(config)

			expect(tuple).toBeDefined()
			expect(tuple?.checkpoint.id).toBe('checkpoint-2')
			expect(tuple?.checkpoint.channel_values).toEqual({ messages: ['Second'] })
		})

		it('should return undefined for non-existent checkpoint', async () => {
			const tuple = await checkpointer.getTuple({
				configurable: {
					thread_id: threadId,
					checkpoint_ns: '',
					checkpoint_id: 'non-existent'
				}
			})

			expect(tuple).toBeUndefined()
		})

		it('should handle directory creation automatically', async () => {
			// Use a non-existent base directory
			const newBaseDir = join(tmpdir(), `checkpointer-auto-create-${Date.now()}`)
			const newCheckpointer = createFilesystemCheckpointSaver({
				baseDir: newBaseDir,
				threadId: 'auto-thread'
			}) as FilesystemCheckpointSaver

			const checkpoint: Checkpoint = {
				v: 1,
				id: 'checkpoint-1',
				ts: '2024-01-01T00:00:00Z',
				channel_values: {},
				channel_versions: {},
				versions_seen: {},
				pending_sends: []
			}

			const metadata: CheckpointMetadata = {
				source: 'input',
				step: 1,
				writes: {},
				parents: {}
			}

			// Should create directory automatically
			await expect(
				newCheckpointer.put({ configurable: { thread_id: 'auto-thread', checkpoint_ns: '' } }, checkpoint, metadata)
			).resolves.toBeDefined()

			// Clean up
			await rm(newBaseDir, { recursive: true, force: true })
		})
	})

	describe('putWrites', () => {
		it('should save and retrieve pending writes', async () => {
			const checkpoint: Checkpoint = {
				v: 1,
				id: 'checkpoint-1',
				ts: '2024-01-01T00:00:00Z',
				channel_values: {},
				channel_versions: {},
				versions_seen: {},
				pending_sends: []
			}

			const metadata: CheckpointMetadata = {
				source: 'input',
				step: 1,
				writes: {},
				parents: {}
			}

			const config = {
				configurable: {
					thread_id: threadId,
					checkpoint_ns: '',
					checkpoint_id: undefined
				}
			}

			// Save checkpoint first
			await checkpointer.put(config, checkpoint, metadata)

			// Save pending writes
			const writes: PendingWrite[] = [
				['task-1', 'messages', { content: 'Hello' }],
				['task-1', 'state', { step: 1 }]
			]

			await checkpointer.putWrites(
				{
					configurable: {
						thread_id: threadId,
						checkpoint_ns: '',
						checkpoint_id: 'checkpoint-1'
					}
				},
				writes,
				'task-1'
			)

			// Retrieve checkpoint with writes
			const tuple = await checkpointer.getTuple({
				configurable: {
					thread_id: threadId,
					checkpoint_ns: '',
					checkpoint_id: 'checkpoint-1'
				}
			})

			expect(tuple?.pendingWrites).toHaveLength(2)
			expect(tuple?.pendingWrites[0]).toEqual(['task-1', 'messages', { content: 'Hello' }])
			expect(tuple?.pendingWrites[1]).toEqual(['task-1', 'state', { step: 1 }])
		})

		it('should throw error when checkpoint_id is missing', async () => {
			const writes: PendingWrite[] = [['task-1', 'messages', { content: 'Hello' }]]

			await expect(
				checkpointer.putWrites(
					{
						configurable: {
							thread_id: threadId,
							checkpoint_ns: ''
						}
					},
					writes,
					'task-1'
				)
			).rejects.toThrow('checkpoint_id is required')
		})
	})

	describe('list', () => {
		it('should list checkpoints in reverse chronological order', async () => {
			const metadata: CheckpointMetadata = {
				source: 'input',
				step: 1,
				writes: {},
				parents: {}
			}

			const config = {
				configurable: {
					thread_id: threadId,
					checkpoint_ns: '',
					checkpoint_id: undefined
				}
			}

			// Create 3 checkpoints
			for (let i = 1; i <= 3; i++) {
				const checkpoint: Checkpoint = {
					v: 1,
					id: `checkpoint-${i}`,
					ts: `2024-01-01T00:0${i}:00Z`,
					channel_values: { messages: [`Message ${i}`] },
					channel_versions: {},
					versions_seen: {},
					pending_sends: []
				}
				await checkpointer.put(config, checkpoint, metadata)
				// Small delay to ensure different timestamps
				await new Promise((resolve) => setTimeout(resolve, 10))
			}

			// List all checkpoints
			const checkpoints: Array<{ checkpoint: Checkpoint }> = []
			for await (const tuple of checkpointer.list(config)) {
				checkpoints.push(tuple)
			}

			// Should be in reverse order (latest first)
			expect(checkpoints).toHaveLength(3)
			expect(checkpoints[0].checkpoint.id).toBe('checkpoint-3')
			expect(checkpoints[1].checkpoint.id).toBe('checkpoint-2')
			expect(checkpoints[2].checkpoint.id).toBe('checkpoint-1')
		})

		it('should respect limit parameter', async () => {
			const metadata: CheckpointMetadata = {
				source: 'input',
				step: 1,
				writes: {},
				parents: {}
			}

			const config = {
				configurable: {
					thread_id: threadId,
					checkpoint_ns: '',
					checkpoint_id: undefined
				}
			}

			// Create 5 checkpoints
			for (let i = 1; i <= 5; i++) {
				const checkpoint: Checkpoint = {
					v: 1,
					id: `checkpoint-${i}`,
					ts: `2024-01-01T00:0${i}:00Z`,
					channel_values: {},
					channel_versions: {},
					versions_seen: {},
					pending_sends: []
				}
				await checkpointer.put(config, checkpoint, metadata)
				await new Promise((resolve) => setTimeout(resolve, 10))
			}

			// List with limit
			const checkpoints: Array<{ checkpoint: Checkpoint }> = []
			for await (const tuple of checkpointer.list(config, { limit: 2 })) {
				checkpoints.push(tuple)
			}

			expect(checkpoints).toHaveLength(2)
		})

		it('should return empty list for non-existent thread', async () => {
			const checkpoints: Array<{ checkpoint: Checkpoint }> = []
			for await (const tuple of checkpointer.list({
				configurable: { thread_id: 'non-existent', checkpoint_ns: '' }
			})) {
				checkpoints.push(tuple)
			}

			expect(checkpoints).toHaveLength(0)
		})
	})

	describe('thread isolation', () => {
		it('should isolate checkpoints by thread ID', async () => {
			const checkpointer2 = createFilesystemCheckpointSaver({
				baseDir,
				threadId: 'thread-2'
			}) as FilesystemCheckpointSaver

			const checkpoint1: Checkpoint = {
				v: 1,
				id: 'checkpoint-1',
				ts: '2024-01-01T00:00:00Z',
				channel_values: { messages: ['Thread 1'] },
				channel_versions: {},
				versions_seen: {},
				pending_sends: []
			}

			const checkpoint2: Checkpoint = {
				v: 1,
				id: 'checkpoint-2',
				ts: '2024-01-01T00:00:00Z',
				channel_values: { messages: ['Thread 2'] },
				channel_versions: {},
				versions_seen: {},
				pending_sends: []
			}

			const metadata: CheckpointMetadata = {
				source: 'input',
				step: 1,
				writes: {},
				parents: {}
			}

			// Save checkpoints to different threads
			await checkpointer.put({ configurable: { thread_id: threadId, checkpoint_ns: '' } }, checkpoint1, metadata)
			await checkpointer2.put({ configurable: { thread_id: 'thread-2', checkpoint_ns: '' } }, checkpoint2, metadata)

			// Retrieve from thread 1
			const tuple1 = await checkpointer.getTuple({
				configurable: { thread_id: threadId, checkpoint_ns: '' }
			})

			// Retrieve from thread 2
			const tuple2 = await checkpointer2.getTuple({
				configurable: { thread_id: 'thread-2', checkpoint_ns: '' }
			})

			// Verify isolation
			expect(tuple1?.checkpoint.channel_values).toEqual({ messages: ['Thread 1'] })
			expect(tuple2?.checkpoint.channel_values).toEqual({ messages: ['Thread 2'] })
		})

		it('should not leak messages across threads', async () => {
			const checkpointer2 = createFilesystemCheckpointSaver({
				baseDir,
				threadId: 'thread-2'
			}) as FilesystemCheckpointSaver

			const checkpoint1: Checkpoint = {
				v: 1,
				id: 'checkpoint-1',
				ts: '2024-01-01T00:00:00Z',
				channel_values: { messages: ['Secret message'] },
				channel_versions: {},
				versions_seen: {},
				pending_sends: []
			}

			const metadata: CheckpointMetadata = {
				source: 'input',
				step: 1,
				writes: {},
				parents: {}
			}

			// Save to thread 1
			await checkpointer.put({ configurable: { thread_id: threadId, checkpoint_ns: '' } }, checkpoint1, metadata)

			// Try to retrieve from thread 2 (should be empty)
			const tuple2 = await checkpointer2.getTuple({
				configurable: { thread_id: 'thread-2', checkpoint_ns: '' }
			})

			expect(tuple2).toBeUndefined()
		})
	})

	describe('clear', () => {
		it('should delete all checkpoints for the thread', async () => {
			const checkpoint: Checkpoint = {
				v: 1,
				id: 'checkpoint-1',
				ts: '2024-01-01T00:00:00Z',
				channel_values: {},
				channel_versions: {},
				versions_seen: {},
				pending_sends: []
			}

			const metadata: CheckpointMetadata = {
				source: 'input',
				step: 1,
				writes: {},
				parents: {}
			}

			// Save checkpoint
			await checkpointer.put({ configurable: { thread_id: threadId, checkpoint_ns: '' } }, checkpoint, metadata)

			// Verify it exists
			let tuple = await checkpointer.getTuple({
				configurable: { thread_id: threadId, checkpoint_ns: '' }
			})
			expect(tuple).toBeDefined()

			// Clear
			await checkpointer.clear()

			// Verify it's gone
			tuple = await checkpointer.getTuple({
				configurable: { thread_id: threadId, checkpoint_ns: '' }
			})
			expect(tuple).toBeUndefined()
		})

		it('should not fail when clearing non-existent directory', async () => {
			const newCheckpointer = createFilesystemCheckpointSaver({
				baseDir: join(tmpdir(), `non-existent-${Date.now()}`),
				threadId: 'new-thread'
			}) as FilesystemCheckpointSaver

			// Should not throw
			await expect(newCheckpointer.clear()).resolves.toBeUndefined()
		})
	})

	describe('concurrent access', () => {
		it('should handle multiple checkpoints saved concurrently', async () => {
			const metadata: CheckpointMetadata = {
				source: 'input',
				step: 1,
				writes: {},
				parents: {}
			}

			const config = {
				configurable: {
					thread_id: threadId,
					checkpoint_ns: '',
					checkpoint_id: undefined
				}
			}

			// Save multiple checkpoints concurrently
			const promises = []
			for (let i = 1; i <= 5; i++) {
				const checkpoint: Checkpoint = {
					v: 1,
					id: `checkpoint-${i}`,
					ts: `2024-01-01T00:0${i}:00Z`,
					channel_values: { messages: [`Message ${i}`] },
					channel_versions: {},
					versions_seen: {},
					pending_sends: []
				}
				promises.push(checkpointer.put(config, checkpoint, metadata))
			}

			await Promise.all(promises)

			// List all checkpoints
			const checkpoints: Array<{ checkpoint: Checkpoint }> = []
			for await (const tuple of checkpointer.list(config)) {
				checkpoints.push(tuple)
			}

			// All 5 should be saved
			expect(checkpoints).toHaveLength(5)
		})
	})
})

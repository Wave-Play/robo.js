/**
 * Filesystem-based checkpoint saver for Node.js environments
 *
 * Provides durable checkpoint persistence using the filesystem.
 * Implements LangGraph's BaseCheckpointSaver interface.
 */

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
	BaseCheckpointSaver,
	Checkpoint,
	CheckpointMetadata,
	CheckpointTuple,
	PendingWrite,
	RunnableConfig
} from '@langchain/langgraph'

/**
 * Configuration for filesystem checkpointer
 */
export interface FilesystemCheckpointerConfig {
	/**
	 * Base directory for checkpoint storage
	 * @example '.robo/checkpoints'
	 */
	baseDir: string

	/**
	 * Thread ID for scoping checkpoints
	 */
	threadId: string
}

interface StoredCheckpoint {
	threadId: string
	checkpointNs: string
	checkpointId: string
	parentCheckpointId?: string
	checkpoint: Checkpoint
	metadata: CheckpointMetadata
	createdAt: number
}

interface StoredWrite {
	threadId: string
	checkpointNs: string
	checkpointId: string
	taskId: string
	idx: number
	channel: string
	value: unknown
	type: string
}

/**
 * Filesystem-based checkpoint saver
 *
 * Usage:
 * ```typescript
 * const checkpointer = createFilesystemCheckpointSaver({
 *   baseDir: '.robo/checkpoints',
 *   threadId: 'my-thread'
 * })
 * const agent = new CodeAgent({ checkpointerFactory: () => checkpointer })
 * ```
 */
export class FilesystemCheckpointSaver implements BaseCheckpointSaver {
	private baseDir: string
	private threadId: string

	constructor(config: FilesystemCheckpointerConfig) {
		this.baseDir = config.baseDir
		this.threadId = config.threadId
	}

	/**
	 * Get checkpoint directory path
	 */
	private getThreadDir(threadId: string, checkpointNs: string): string {
		return join(this.baseDir, threadId, checkpointNs || 'default')
	}

	/**
	 * Get checkpoint file path
	 */
	private getCheckpointPath(threadId: string, checkpointNs: string, checkpointId: string): string {
		return join(this.getThreadDir(threadId, checkpointNs), `${checkpointId}.json`)
	}

	/**
	 * Get writes file path
	 */
	private getWritesPath(threadId: string, checkpointNs: string, checkpointId: string): string {
		return join(this.getThreadDir(threadId, checkpointNs), `${checkpointId}.writes.json`)
	}

	/**
	 * Ensure directory exists
	 */
	private async ensureDir(dir: string): Promise<void> {
		try {
			await mkdir(dir, { recursive: true })
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
				throw error
			}
		}
	}

	/**
	 * Read checkpoint from filesystem
	 */
	private async readCheckpoint(
		threadId: string,
		checkpointNs: string,
		checkpointId: string
	): Promise<StoredCheckpoint | null> {
		try {
			const path = this.getCheckpointPath(threadId, checkpointNs, checkpointId)
			const content = await readFile(path, 'utf-8')
			return JSON.parse(content) as StoredCheckpoint
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				return null
			}
			throw error
		}
	}

	/**
	 * Read writes from filesystem
	 */
	private async readWrites(threadId: string, checkpointNs: string, checkpointId: string): Promise<StoredWrite[]> {
		try {
			const path = this.getWritesPath(threadId, checkpointNs, checkpointId)
			const content = await readFile(path, 'utf-8')
			return JSON.parse(content) as StoredWrite[]
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				return []
			}
			throw error
		}
	}

	/**
	 * List all checkpoint files in a directory
	 */
	private async listCheckpointFiles(threadId: string, checkpointNs: string): Promise<string[]> {
		try {
			const dir = this.getThreadDir(threadId, checkpointNs)
			const files = await readdir(dir)
			return files.filter((f) => f.endsWith('.json') && !f.endsWith('.writes.json')).map((f) => f.replace('.json', ''))
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				return []
			}
			throw error
		}
	}

	/**
	 * Get checkpoint tuple from filesystem
	 */
	async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
		const configurable = config.configurable ?? {}
		const threadId = configurable.thread_id ?? this.threadId
		const checkpointNs = configurable.checkpoint_ns ?? ''
		const checkpointId = configurable.checkpoint_id

		if (checkpointId) {
			// Get specific checkpoint
			const stored = await this.readCheckpoint(threadId, checkpointNs, checkpointId)
			if (!stored) {
				return undefined
			}

			const writes = await this.readWrites(threadId, checkpointNs, checkpointId)
			const pendingWrites = writes.map((w) => [w.taskId, w.channel, w.value] as PendingWrite)

			return {
				config: {
					configurable: {
						thread_id: stored.threadId,
						checkpoint_ns: stored.checkpointNs,
						checkpoint_id: stored.checkpointId
					}
				},
				checkpoint: stored.checkpoint,
				metadata: stored.metadata,
				parentConfig: stored.parentCheckpointId
					? {
							configurable: {
								thread_id: stored.threadId,
								checkpoint_ns: stored.checkpointNs,
								checkpoint_id: stored.parentCheckpointId
							}
					  }
					: undefined,
				pendingWrites
			}
		} else {
			// Get latest checkpoint
			const checkpointFiles = await this.listCheckpointFiles(threadId, checkpointNs)
			if (checkpointFiles.length === 0) {
				return undefined
			}

			// Load all checkpoints and find the latest
			const checkpoints = await Promise.all(
				checkpointFiles.map((id) => this.readCheckpoint(threadId, checkpointNs, id))
			)

			const validCheckpoints = checkpoints.filter((c): c is StoredCheckpoint => c !== null)
			if (validCheckpoints.length === 0) {
				return undefined
			}

			// Sort by createdAt descending
			validCheckpoints.sort((a, b) => b.createdAt - a.createdAt)
			const latest = validCheckpoints[0]

			const writes = await this.readWrites(threadId, checkpointNs, latest.checkpointId)
			const pendingWrites = writes.map((w) => [w.taskId, w.channel, w.value] as PendingWrite)

			return {
				config: {
					configurable: {
						thread_id: latest.threadId,
						checkpoint_ns: latest.checkpointNs,
						checkpoint_id: latest.checkpointId
					}
				},
				checkpoint: latest.checkpoint,
				metadata: latest.metadata,
				parentConfig: latest.parentCheckpointId
					? {
							configurable: {
								thread_id: latest.threadId,
								checkpoint_ns: latest.checkpointNs,
								checkpoint_id: latest.parentCheckpointId
							}
					  }
					: undefined,
				pendingWrites
			}
		}
	}

	/**
	 * List checkpoints for the thread
	 */
	async *list(
		config: RunnableConfig,
		options?: { limit?: number; before?: RunnableConfig }
	): AsyncGenerator<CheckpointTuple> {
		const configurable = config.configurable ?? {}
		const threadId = configurable.thread_id ?? this.threadId
		const checkpointNs = configurable.checkpoint_ns ?? ''
		const limit = options?.limit ?? 10
		const beforeId = options?.before?.configurable?.checkpoint_id

		// List all checkpoint files
		const checkpointFiles = await this.listCheckpointFiles(threadId, checkpointNs)

		// Load all checkpoints
		const checkpoints = await Promise.all(checkpointFiles.map((id) => this.readCheckpoint(threadId, checkpointNs, id)))

		const validCheckpoints = checkpoints.filter((c): c is StoredCheckpoint => c !== null)

		// Sort by createdAt descending
		validCheckpoints.sort((a, b) => b.createdAt - a.createdAt)

		// Filter by before if specified
		let filtered = validCheckpoints
		if (beforeId) {
			const beforeIndex = filtered.findIndex((c) => c.checkpointId === beforeId)
			if (beforeIndex >= 0) {
				filtered = filtered.slice(beforeIndex + 1)
			}
		}

		// Apply limit
		const limited = filtered.slice(0, limit)

		// Yield checkpoints
		for (const stored of limited) {
			const writes = await this.readWrites(threadId, checkpointNs, stored.checkpointId)
			const pendingWrites = writes.map((w) => [w.taskId, w.channel, w.value] as PendingWrite)

			yield {
				config: {
					configurable: {
						thread_id: stored.threadId,
						checkpoint_ns: stored.checkpointNs,
						checkpoint_id: stored.checkpointId
					}
				},
				checkpoint: stored.checkpoint,
				metadata: stored.metadata,
				parentConfig: stored.parentCheckpointId
					? {
							configurable: {
								thread_id: stored.threadId,
								checkpoint_ns: stored.checkpointNs,
								checkpoint_id: stored.parentCheckpointId
							}
					  }
					: undefined,
				pendingWrites
			}
		}
	}

	/**
	 * Save checkpoint to filesystem
	 */
	async put(config: RunnableConfig, checkpoint: Checkpoint, metadata: CheckpointMetadata): Promise<RunnableConfig> {
		const configurable = config.configurable ?? {}
		const threadId = configurable.thread_id ?? this.threadId
		const checkpointNs = configurable.checkpoint_ns ?? ''
		const checkpointId = checkpoint.id

		const stored: StoredCheckpoint = {
			threadId,
			checkpointNs,
			checkpointId,
			parentCheckpointId: configurable.checkpoint_id,
			checkpoint,
			metadata,
			createdAt: Date.now()
		}

		// Ensure directory exists
		await this.ensureDir(this.getThreadDir(threadId, checkpointNs))

		// Write checkpoint
		const path = this.getCheckpointPath(threadId, checkpointNs, checkpointId)
		await writeFile(path, JSON.stringify(stored, null, 2), 'utf-8')

		return {
			configurable: {
				thread_id: threadId,
				checkpoint_ns: checkpointNs,
				checkpoint_id: checkpointId
			}
		}
	}

	/**
	 * Save pending writes to filesystem
	 */
	async putWrites(config: RunnableConfig, writes: PendingWrite[], _taskId: string): Promise<void> {
		const configurable = config.configurable ?? {}
		const threadId = configurable.thread_id ?? this.threadId
		const checkpointNs = configurable.checkpoint_ns ?? ''
		const checkpointId = configurable.checkpoint_id

		if (!checkpointId) {
			throw new Error('checkpoint_id is required for putWrites')
		}

		const storedWrites: StoredWrite[] = writes.map(([writeTaskId, channel, value], idx) => ({
			threadId,
			checkpointNs,
			checkpointId,
			taskId: writeTaskId,
			idx,
			channel,
			value,
			type: 'write'
		}))

		// Ensure directory exists
		await this.ensureDir(this.getThreadDir(threadId, checkpointNs))

		// Write writes file
		const path = this.getWritesPath(threadId, checkpointNs, checkpointId)
		await writeFile(path, JSON.stringify(storedWrites, null, 2), 'utf-8')
	}

	/**
	 * Delete all checkpoints for this thread
	 */
	async clear(): Promise<void> {
		const dir = this.getThreadDir(this.threadId, '')
		try {
			await rm(dir, { recursive: true, force: true })
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
				throw error
			}
		}
	}
}

/**
 * Factory function to create a filesystem checkpointer
 *
 * Usage:
 * ```typescript
 * const checkpointerFactory = (threadId: string) => {
 *   return createFilesystemCheckpointSaver({
 *     baseDir: '.robo/checkpoints',
 *     threadId
 *   })
 * }
 *
 * const agent = new CodeAgent({ checkpointerFactory })
 * ```
 */
export function createFilesystemCheckpointSaver(config: FilesystemCheckpointerConfig): BaseCheckpointSaver {
	return new FilesystemCheckpointSaver(config)
}

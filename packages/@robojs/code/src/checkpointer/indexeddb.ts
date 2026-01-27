/**
 * IndexedDB-based checkpoint saver for browser environments
 *
 * Provides durable checkpoint persistence across browser sessions.
 * Implements LangGraph's BaseCheckpointSaver interface.
 */

import type {
	BaseCheckpointSaver,
	Checkpoint,
	CheckpointMetadata,
	CheckpointTuple,
	PendingWrite,
	RunnableConfig
} from '@langchain/langgraph'

/**
 * Configuration for IndexedDB checkpointer
 */
export interface IndexedDBCheckpointerConfig {
	/**
	 * IndexedDB database name
	 * @default 'robojs-code-checkpoints'
	 */
	dbName?: string

	/**
	 * Database version
	 * @default 1
	 */
	version?: number

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
 * IndexedDB-based checkpoint saver
 *
 * Usage:
 * ```typescript
 * const checkpointer = createIndexedDBCheckpointSaver({ threadId: 'my-thread' })
 * const agent = new CodeAgent({ checkpointerFactory: () => checkpointer })
 * ```
 */
export class IndexedDBCheckpointSaver implements BaseCheckpointSaver {
	private dbName: string
	private version: number
	private threadId: string
	private dbPromise: Promise<IDBDatabase> | null = null

	constructor(config: IndexedDBCheckpointerConfig) {
		this.dbName = config.dbName ?? 'robojs-code-checkpoints'
		this.version = config.version ?? 1
		this.threadId = config.threadId
	}

	/**
	 * Initialize IndexedDB database
	 */
	private async getDb(): Promise<IDBDatabase> {
		if (this.dbPromise) {
			return this.dbPromise
		}

		this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open(this.dbName, this.version)

			request.onerror = () => {
				reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`))
			}

			request.onsuccess = () => {
				resolve(request.result)
			}

			request.onupgradeneeded = (event) => {
				const db = (event.target as IDBOpenDBRequest).result

				// Create checkpoints object store
				if (!db.objectStoreNames.contains('checkpoints')) {
					const checkpointStore = db.createObjectStore('checkpoints', {
						keyPath: ['threadId', 'checkpointNs', 'checkpointId']
					})
					checkpointStore.createIndex('threadId', 'threadId', { unique: false })
					checkpointStore.createIndex('createdAt', 'createdAt', { unique: false })
				}

				// Create writes object store
				if (!db.objectStoreNames.contains('writes')) {
					const writesStore = db.createObjectStore('writes', {
						keyPath: ['threadId', 'checkpointNs', 'checkpointId', 'taskId', 'idx']
					})
					writesStore.createIndex('checkpoint', ['threadId', 'checkpointNs', 'checkpointId'], {
						unique: false
					})
				}
			}
		})

		return this.dbPromise
	}

	/**
	 * Get checkpoint tuple from IndexedDB
	 */
	async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
		const db = await this.getDb()
		const configurable = config.configurable ?? {}
		const threadId = configurable.thread_id ?? this.threadId
		const checkpointNs = configurable.checkpoint_ns ?? ''
		const checkpointId = configurable.checkpoint_id

		return new Promise<CheckpointTuple | undefined>((resolve, reject) => {
			const transaction = db.transaction(['checkpoints', 'writes'], 'readonly')
			const checkpointStore = transaction.objectStore('checkpoints')
			const writesStore = transaction.objectStore('writes')

			// If specific checkpoint ID provided, get that one
			if (checkpointId) {
				const request = checkpointStore.get([threadId, checkpointNs, checkpointId])

				request.onsuccess = () => {
					const stored = request.result as StoredCheckpoint | undefined
					if (!stored) {
						resolve(undefined)
						return
					}

					// Get pending writes for this checkpoint
					const writesIndex = writesStore.index('checkpoint')
					const writesRequest = writesIndex.getAll([threadId, checkpointNs, checkpointId])

					writesRequest.onsuccess = () => {
						const writes = writesRequest.result as StoredWrite[]
						const pendingWrites = writes.map((w) => [w.taskId, w.channel, w.value] as PendingWrite)

						resolve({
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
						})
					}

					writesRequest.onerror = () => {
						reject(new Error(`Failed to load writes: ${writesRequest.error?.message}`))
					}
				}

				request.onerror = () => {
					reject(new Error(`Failed to load checkpoint: ${request.error?.message}`))
				}
			} else {
				// Get latest checkpoint for this thread
				const index = checkpointStore.index('threadId')
				const request = index.openCursor(IDBKeyRange.only(threadId), 'prev')

				request.onsuccess = () => {
					const cursor = request.result
					if (!cursor) {
						resolve(undefined)
						return
					}

					const stored = cursor.value as StoredCheckpoint

					// Filter by namespace if provided
					if (checkpointNs && stored.checkpointNs !== checkpointNs) {
						cursor.continue()
						return
					}

					// Get pending writes
					const writesIndex = writesStore.index('checkpoint')
					const writesRequest = writesIndex.getAll([stored.threadId, stored.checkpointNs, stored.checkpointId])

					writesRequest.onsuccess = () => {
						const writes = writesRequest.result as StoredWrite[]
						const pendingWrites = writes.map((w) => [w.taskId, w.channel, w.value] as PendingWrite)

						resolve({
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
						})
					}

					writesRequest.onerror = () => {
						reject(new Error(`Failed to load writes: ${writesRequest.error?.message}`))
					}
				}

				request.onerror = () => {
					reject(new Error(`Failed to query checkpoints: ${request.error?.message}`))
				}
			}
		})
	}

	/**
	 * List checkpoints for the thread
	 */
	async *list(
		config: RunnableConfig,
		options?: { limit?: number; before?: RunnableConfig }
	): AsyncGenerator<CheckpointTuple> {
		const db = await this.getDb()
		const configurable = config.configurable ?? {}
		const threadId = configurable.thread_id ?? this.threadId
		const checkpointNs = configurable.checkpoint_ns ?? ''
		const limit = options?.limit ?? 10
		const beforeId = options?.before?.configurable?.checkpoint_id

		const checkpoints = await new Promise<StoredCheckpoint[]>((resolve, reject) => {
			const transaction = db.transaction(['checkpoints'], 'readonly')
			const store = transaction.objectStore('checkpoints')
			const index = store.index('createdAt')
			const results: StoredCheckpoint[] = []
			let count = 0

			const request = index.openCursor(null, 'prev')

			request.onsuccess = () => {
				const cursor = request.result
				if (!cursor || count >= limit) {
					resolve(results)
					return
				}

				const stored = cursor.value as StoredCheckpoint

				// Filter by thread ID and namespace
				if (stored.threadId === threadId && stored.checkpointNs === checkpointNs) {
					// If before ID specified, skip until we pass it
					if (beforeId && stored.checkpointId === beforeId) {
						cursor.continue()
						return
					}

					results.push(stored)
					count++
				}

				cursor.continue()
			}

			request.onerror = () => {
				reject(new Error(`Failed to list checkpoints: ${request.error?.message}`))
			}
		})

		// Get writes for all checkpoints
		const writesStore = db.transaction(['writes'], 'readonly').objectStore('writes')
		const writesIndex = writesStore.index('checkpoint')

		for (const stored of checkpoints) {
			const writes = await new Promise<StoredWrite[]>((resolve, reject) => {
				const request = writesIndex.getAll([stored.threadId, stored.checkpointNs, stored.checkpointId])

				request.onsuccess = () => {
					resolve(request.result as StoredWrite[])
				}

				request.onerror = () => {
					reject(new Error(`Failed to load writes: ${request.error?.message}`))
				}
			})

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
	 * Save checkpoint to IndexedDB
	 */
	async put(config: RunnableConfig, checkpoint: Checkpoint, metadata: CheckpointMetadata): Promise<RunnableConfig> {
		const db = await this.getDb()
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

		return new Promise<RunnableConfig>((resolve, reject) => {
			const transaction = db.transaction(['checkpoints'], 'readwrite')
			const store = transaction.objectStore('checkpoints')
			const request = store.put(stored)

			request.onsuccess = () => {
				resolve({
					configurable: {
						thread_id: threadId,
						checkpoint_ns: checkpointNs,
						checkpoint_id: checkpointId
					}
				})
			}

			request.onerror = () => {
				reject(new Error(`Failed to save checkpoint: ${request.error?.message}`))
			}
		})
	}

	/**
	 * Save pending writes to IndexedDB
	 */
	async putWrites(config: RunnableConfig, writes: PendingWrite[], taskId: string): Promise<void> {
		const db = await this.getDb()
		const configurable = config.configurable ?? {}
		const threadId = configurable.thread_id ?? this.threadId
		const checkpointNs = configurable.checkpoint_ns ?? ''
		const checkpointId = configurable.checkpoint_id

		if (!checkpointId) {
			throw new Error('checkpoint_id is required for putWrites')
		}

		return new Promise<void>((resolve, reject) => {
			const transaction = db.transaction(['writes'], 'readwrite')
			const store = transaction.objectStore('writes')

			for (let idx = 0; idx < writes.length; idx++) {
				const [writeTaskId, channel, value] = writes[idx]
				const stored: StoredWrite = {
					threadId,
					checkpointNs,
					checkpointId,
					taskId: writeTaskId,
					idx,
					channel,
					value,
					type: 'write'
				}

				store.put(stored)
			}

			transaction.oncomplete = () => {
				resolve()
			}

			transaction.onerror = () => {
				reject(new Error(`Failed to save writes: ${transaction.error?.message}`))
			}
		})
	}

	/**
	 * Delete all checkpoints for this thread
	 */
	async clear(): Promise<void> {
		const db = await this.getDb()

		return new Promise<void>((resolve, reject) => {
			const transaction = db.transaction(['checkpoints', 'writes'], 'readwrite')
			const checkpointStore = transaction.objectStore('checkpoints')
			const writesStore = transaction.objectStore('writes')

			// Delete checkpoints
			const checkpointIndex = checkpointStore.index('threadId')
			const checkpointRequest = checkpointIndex.openCursor(IDBKeyRange.only(this.threadId))

			checkpointRequest.onsuccess = () => {
				const cursor = checkpointRequest.result
				if (cursor) {
					cursor.delete()
					cursor.continue()
				}
			}

			// Delete writes
			const writesIndex = writesStore.index('checkpoint')
			const writesRequest = writesIndex.openCursor()

			writesRequest.onsuccess = () => {
				const cursor = writesRequest.result
				if (cursor) {
					const stored = cursor.value as StoredWrite
					if (stored.threadId === this.threadId) {
						cursor.delete()
					}
					cursor.continue()
				}
			}

			transaction.oncomplete = () => {
				resolve()
			}

			transaction.onerror = () => {
				reject(new Error(`Failed to clear checkpoints: ${transaction.error?.message}`))
			}
		})
	}
}

/**
 * Factory function to create an IndexedDB checkpointer
 *
 * Usage:
 * ```typescript
 * const checkpointerCache = new Map()
 * const checkpointerFactory = (threadId: string) => {
 *   if (!checkpointerCache.has(threadId)) {
 *     checkpointerCache.set(threadId, createIndexedDBCheckpointSaver({ threadId }))
 *   }
 *   return checkpointerCache.get(threadId)
 * }
 *
 * const agent = new CodeAgent({ checkpointerFactory })
 * ```
 */
export function createIndexedDBCheckpointSaver(config: IndexedDBCheckpointerConfig): BaseCheckpointSaver {
	return new IndexedDBCheckpointSaver(config)
}

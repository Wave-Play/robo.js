/**
 * Phase 4E: Attachment Storage Abstraction
 *
 * This module provides a pluggable interface for attachment storage backends.
 * The default implementation stores attachments in-memory, but alternative
 * implementations can use file system, S3, Redis, or other storage backends.
 *
 * @example
 * ```typescript
 * // Using the default in-memory storage
 * const storage = new MemoryAttachmentStorage()
 *
 * // Using a custom storage backend (future)
 * const storage = new S3AttachmentStorage({ bucket: 'my-bucket' })
 * ```
 */
import type { Snowflake, StoredAttachment } from '../types/index.js'

/**
 * Abstract interface for attachment storage backends.
 *
 * All storage implementations must implement this interface to ensure
 * compatibility with the mock server's attachment handling.
 */
export interface AttachmentStorage {
	/**
	 * Store an attachment.
	 * @param attachment - The attachment data to store
	 * @returns Promise that resolves when storage is complete
	 */
	store(attachment: StoredAttachment): Promise<void>

	/**
	 * Retrieve an attachment by ID.
	 * @param id - The attachment's snowflake ID
	 * @returns The stored attachment or undefined if not found
	 */
	get(id: Snowflake): Promise<StoredAttachment | undefined>

	/**
	 * Delete an attachment by ID.
	 * @param id - The attachment's snowflake ID
	 * @returns true if deleted, false if not found
	 */
	delete(id: Snowflake): Promise<boolean>

	/**
	 * Get all attachments for a specific message.
	 * @param messageId - The message's snowflake ID
	 * @returns Array of stored attachments belonging to the message
	 */
	getForMessage(messageId: Snowflake): Promise<StoredAttachment[]>

	/**
	 * Delete all attachments for a specific message.
	 * @param messageId - The message's snowflake ID
	 * @returns Number of attachments deleted
	 */
	deleteForMessage(messageId: Snowflake): Promise<number>

	/**
	 * Get storage statistics.
	 * @returns Current storage metrics
	 */
	getStats(): Promise<StorageStats>

	/**
	 * Clear all stored attachments.
	 * Use with caution - this deletes all data.
	 * @returns Number of attachments deleted
	 */
	clear(): Promise<number>
}

/**
 * Storage statistics for monitoring and debugging.
 */
export interface StorageStats {
	/** Total number of stored attachments */
	count: number
	/** Total size of all stored attachments in bytes */
	totalBytes: number
	/** Storage backend type identifier */
	type: string
}

/**
 * In-memory attachment storage implementation.
 *
 * This is the default storage backend. It stores all attachments
 * in a Map with O(1) access by ID. Suitable for development,
 * testing, and small-scale deployments.
 *
 * Limitations:
 * - Data is lost when the process restarts
 * - Memory usage scales linearly with stored data
 * - Not suitable for horizontal scaling (no shared state)
 */
export class MemoryAttachmentStorage implements AttachmentStorage {
	private attachments = new Map<Snowflake, StoredAttachment>()

	async store(attachment: StoredAttachment): Promise<void> {
		this.attachments.set(attachment.id, attachment)
	}

	async get(id: Snowflake): Promise<StoredAttachment | undefined> {
		return this.attachments.get(id)
	}

	async delete(id: Snowflake): Promise<boolean> {
		return this.attachments.delete(id)
	}

	async getForMessage(messageId: Snowflake): Promise<StoredAttachment[]> {
		const result: StoredAttachment[] = []
		for (const attachment of this.attachments.values()) {
			if (attachment.messageId === messageId) {
				result.push(attachment)
			}
		}
		return result
	}

	async deleteForMessage(messageId: Snowflake): Promise<number> {
		let count = 0
		for (const [id, attachment] of this.attachments) {
			if (attachment.messageId === messageId) {
				this.attachments.delete(id)
				count++
			}
		}
		return count
	}

	async getStats(): Promise<StorageStats> {
		let totalBytes = 0
		for (const attachment of this.attachments.values()) {
			totalBytes += attachment.size
		}
		return {
			count: this.attachments.size,
			totalBytes,
			type: 'memory'
		}
	}

	async clear(): Promise<number> {
		const count = this.attachments.size
		this.attachments.clear()
		return count
	}

	// Synchronous methods for backward compatibility with existing state.ts code
	// These allow the current implementation to work without async/await changes

	storeSync(attachment: StoredAttachment): void {
		this.attachments.set(attachment.id, attachment)
	}

	getSync(id: Snowflake): StoredAttachment | undefined {
		return this.attachments.get(id)
	}

	deleteSync(id: Snowflake): boolean {
		return this.attachments.delete(id)
	}

	getForMessageSync(messageId: Snowflake): StoredAttachment[] {
		const result: StoredAttachment[] = []
		for (const attachment of this.attachments.values()) {
			if (attachment.messageId === messageId) {
				result.push(attachment)
			}
		}
		return result
	}

	getAllSync(): StoredAttachment[] {
		return Array.from(this.attachments.values())
	}
}

/**
 * Configuration for creating storage backends.
 */
export interface StorageConfig {
	type: 'memory' | 'filesystem' | 's3' | 'redis'
	options?: Record<string, unknown>
}

/**
 * Factory function to create a storage backend from configuration.
 *
 * @param config - Storage configuration
 * @returns A storage backend instance
 *
 * @example
 * ```typescript
 * // Create in-memory storage (default)
 * const storage = createStorage({ type: 'memory' })
 *
 * // Future: Create S3 storage
 * const storage = createStorage({
 *   type: 's3',
 *   options: { bucket: 'my-bucket', region: 'us-east-1' }
 * })
 * ```
 */
export function createStorage(config: StorageConfig = { type: 'memory' }): AttachmentStorage {
	switch (config.type) {
		case 'memory':
			return new MemoryAttachmentStorage()
		case 'filesystem':
			// TODO: Implement FileSystemAttachmentStorage
			throw new Error('Filesystem storage not yet implemented')
		case 's3':
			// TODO: Implement S3AttachmentStorage
			throw new Error('S3 storage not yet implemented')
		case 'redis':
			// TODO: Implement RedisAttachmentStorage
			throw new Error('Redis storage not yet implemented')
		default:
			throw new Error(`Unknown storage type: ${config.type}`)
	}
}

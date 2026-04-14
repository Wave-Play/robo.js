import type {
	FlashcoreAdapter,
	BatchOperation,
	AdapterCapabilitiesReport
} from '../../../src/flashcore/index.js'

export class MemoryAdapter<K extends string = string, V = unknown> implements FlashcoreAdapter<K, V> {
	readonly name = 'MemoryAdapter'

	private storage = new Map<K, V>()

	get(key: K): V | undefined {
		return this.storage.get(key)
	}

	set(key: K, value: V): boolean {
		this.storage.set(key, value)
		return true
	}

	delete(key: K): boolean {
		return this.storage.delete(key)
	}

	has(key: K): boolean {
		return this.storage.has(key)
	}

	clear(): void {
		this.storage.clear()
	}

	init(): void {}

	shutdown(): void {
		this.storage.clear()
	}

	scan(prefix: K): K[] {
		return Array.from(this.storage.keys()).filter((key) => String(key).startsWith(String(prefix)))
	}

	setIfNotExists(key: K, value: V): boolean {
		if (this.storage.has(key)) {
			return false
		}

		this.storage.set(key, value)
		return true
	}

	compareAndSwap(key: K, expected: V, next: V): boolean {
		if (JSON.stringify(this.storage.get(key)) !== JSON.stringify(expected)) {
			return false
		}

		this.storage.set(key, next)
		return true
	}

	atomicBatch(ops: BatchOperation<K, V>[]): void {
		for (const op of ops) {
			if (op.type !== 'check') {
				continue
			}

			const current = this.storage.get(op.key)
			const currentVersion = (current as { _version?: number } | undefined)?._version
			if (currentVersion !== op.expectedVersion) {
				throw new Error(
					`Batch operation failed: version check failed for key "${op.key}". ` +
					`Expected version ${op.expectedVersion}, got ${currentVersion}`
				)
			}
		}

		for (const op of ops) {
			switch (op.type) {
				case 'set':
					this.storage.set(op.key, op.value)
					break
				case 'delete':
					this.storage.delete(op.key)
					break
			}
		}
	}

	capabilities(): AdapterCapabilitiesReport {
		return {
			isolation: 'serializable'
		}
	}

	size(): number {
		return this.storage.size
	}

	keys(): K[] {
		return Array.from(this.storage.keys())
	}

	entries(): [K, V][] {
		return Array.from(this.storage.entries())
	}

	snapshot(): Map<K, V> {
		return new Map(this.storage)
	}

	restore(snapshot: Map<K, V>): void {
		this.storage = new Map(snapshot)
	}
}

export function createMemoryAdapter<K extends string = string, V = unknown>(): MemoryAdapter<K, V> {
	return new MemoryAdapter<K, V>()
}

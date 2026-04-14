/**
 * Shared Test Adapter Utilities
 *
 * Provides specialized MemoryAdapter subclasses for testing WAL-protected
 * CRUD operations, crash recovery, and write inspection.
 */

import {
	Flashcore,
	FlashcoreSystem,
	MemoryAdapter
} from 'robo.js/flashcore'
import type { FlashcoreAdapter, InitOptions } from 'robo.js/flashcore'
import { registerAllExtensions } from './register-extensions.js'

// ─────────────────────────────────────────────────────────────
// RecordingAdapter
// ─────────────────────────────────────────────────────────────

/**
 * MemoryAdapter subclass that logs all set() and delete() calls.
 *
 * Useful for inspecting what keys were written during CRUD operations,
 * verifying WAL entry creation and cleanup, and asserting write ordering.
 */
export class RecordingAdapter extends MemoryAdapter {
	/**
	 * Log of all set() calls with structuredClone'd values.
	 */
	writes: Array<{ key: string; value: unknown }> = []

	/**
	 * Log of all delete() calls.
	 */
	deletes: Array<string> = []

	override set(key: string, value: unknown): boolean {
		this.writes.push({ key, value: structuredClone(value) })
		return super.set(key, value)
	}

	override delete(key: string): boolean {
		this.deletes.push(key)
		return super.delete(key)
	}

	/**
	 * Clear write and delete logs without clearing storage.
	 */
	reset(): void {
		this.writes = []
		this.deletes = []
	}
}

// ─────────────────────────────────────────────────────────────
// CrashingAdapter
// ─────────────────────────────────────────────────────────────

/**
 * MemoryAdapter subclass that throws after N set() calls.
 *
 * Simulates a crash at a specific write count to test WAL recovery.
 * The crash error is thrown synchronously from set(), leaving the
 * storage in a partially-written state.
 */
export class CrashingAdapter extends MemoryAdapter {
	/**
	 * Number of successful writes before crash. Default: Infinity (never crash).
	 */
	crashAfterNWrites: number

	private writeCount = 0

	constructor(crashAfterNWrites: number = Infinity) {
		super()
		this.crashAfterNWrites = crashAfterNWrites
	}

	override set(key: string, value: unknown): boolean {
		this.writeCount++
		if (this.writeCount > this.crashAfterNWrites) {
			throw new Error('Simulated crash')
		}
		return super.set(key, value)
	}

	/**
	 * Get the current write count.
	 */
	getWriteCount(): number {
		return this.writeCount
	}

	/**
	 * Reset the write counter (does not reset crashAfterNWrites).
	 */
	resetWriteCount(): void {
		this.writeCount = 0
	}
}

// ─────────────────────────────────────────────────────────────
// initWithExtensions
// ─────────────────────────────────────────────────────────────

/**
 * Initialize Flashcore with all extensions registered.
 *
 * Performs _reset -> registerAllExtensions -> init in the correct order.
 * Returns the adapter for convenience (passthrough).
 *
 * @param adapter - The adapter to initialize with
 * @param options - Additional init options (adapter is set automatically)
 * @returns The same adapter, for convenience
 */
export async function initWithExtensions<T extends FlashcoreAdapter>(
	adapter: T,
	options?: Omit<InitOptions, 'adapter'>
): Promise<T> {
	await FlashcoreSystem._reset()
	registerAllExtensions()
	await Flashcore.$.init({ adapter, ...options })
	return adapter
}

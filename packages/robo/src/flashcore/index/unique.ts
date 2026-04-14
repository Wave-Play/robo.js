/**
 * Flashcore v1 (spec rev 4.3) Unique Index Manager
 *
 * Manages unique constraints via storage keys.
 * Key pattern: _model:{ns}::{model}:ux:{field}:{encodedValue} → { id }
 */

import type { FlashcoreAdapter } from '../adapter/types.js'
import { buildUniqueKey, buildCompoundUniqueKey } from '../core/keys.js'
import { encodeUniqueValue } from '../core/encoding.js'
import { UniqueConstraintError } from '../core/errors.js'

/**
 * Unique index entry stored in the adapter.
 */
export interface UniqueIndexEntry {
	id: string
}

/**
 * Options for unique constraint operations.
 */
export interface UniqueConstraintOptions {
	modelName: string
	namespace?: string
	field: string
}

/**
 * Options for compound unique constraint operations.
 */
export interface CompoundUniqueConstraintOptions {
	modelName: string
	namespace?: string
	fields: string[]
}

/**
 * Manages unique constraints for a model.
 *
 * Uses adapter setIfNotExists for race-free constraints when available,
 * otherwise falls back to check-then-set (embedded mode only).
 */
export class UniqueIndexManager {
	private adapter: FlashcoreAdapter
	private hasSetIfNotExists: boolean

	constructor(adapter: FlashcoreAdapter) {
		this.adapter = adapter
		this.hasSetIfNotExists = typeof adapter.setIfNotExists === 'function'
	}

	/**
	 * Acquire a unique constraint for a record.
	 *
	 * @param options - Model/field options
	 * @param value - The unique field value
	 * @param recordId - The record ID claiming this value
	 * @throws UniqueConstraintError if value is already taken
	 */
	async acquire(
		options: UniqueConstraintOptions,
		value: unknown,
		recordId: string
	): Promise<void> {
		// Null/undefined values don't create constraints
		if (value === null || value === undefined) {
			return
		}

		const key = this.buildKey(options, value)
		const entry: UniqueIndexEntry = { id: recordId }

		if (this.hasSetIfNotExists) {
			// Race-free path
			const success = await this.adapter.setIfNotExists!(key, entry)
			if (!success) {
				// Key already exists - check if it's ours
				const existing = await this.adapter.get(key) as UniqueIndexEntry | undefined
				if (existing && existing.id !== recordId) {
					throw new UniqueConstraintError(
						`Unique constraint violation on field '${options.field}': value already exists`,
						{ model: options.modelName, field: options.field, value }
					)
				}
				// It's our own value, that's fine
			}
		} else {
			// Check-then-set fallback (embedded mode only)
			const existing = await this.adapter.get(key) as UniqueIndexEntry | undefined

			if (existing) {
				if (existing.id !== recordId) {
					throw new UniqueConstraintError(
						`Unique constraint violation on field '${options.field}': value already exists`,
						{ model: options.modelName, field: options.field, value }
					)
				}
				// Already ours
				return
			}

			// Set the key
			await this.adapter.set(key, entry)

			// Verify (in embedded mode, this catches concurrent writers in the same process)
			const verification = await this.adapter.get(key) as UniqueIndexEntry | undefined
			if (!verification || verification.id !== recordId) {
				// Someone else got it first
				throw new UniqueConstraintError(
					`Unique constraint violation on field '${options.field}': value already exists (race)`,
					{ model: options.modelName, field: options.field, value }
				)
			}
		}
	}

	/**
	 * Release a unique constraint.
	 *
	 * @param options - Model/field options
	 * @param value - The unique field value to release
	 */
	async release(
		options: UniqueConstraintOptions,
		value: unknown
	): Promise<void> {
		// Null/undefined values don't have constraints
		if (value === null || value === undefined) {
			return
		}

		const key = this.buildKey(options, value)
		await this.adapter.delete(key)
	}

	/**
	 * Look up the record ID for a unique value.
	 *
	 * @param options - Model/field options
	 * @param value - The unique field value
	 * @returns Record ID or null if not found
	 */
	async lookup(
		options: UniqueConstraintOptions,
		value: unknown
	): Promise<string | null> {
		// Null/undefined values are not indexed
		if (value === null || value === undefined) {
			return null
		}

		const key = this.buildKey(options, value)
		const entry = await this.adapter.get(key) as UniqueIndexEntry | undefined

		return entry?.id ?? null
	}

	/**
	 * Check if a unique value exists.
	 *
	 * @param options - Model/field options
	 * @param value - The unique field value
	 * @returns True if value exists
	 */
	async exists(
		options: UniqueConstraintOptions,
		value: unknown
	): Promise<boolean> {
		// Null/undefined values are never "taken"
		if (value === null || value === undefined) {
			return false
		}

		const key = this.buildKey(options, value)
		return this.adapter.has(key)
	}

	/**
	 * Update a unique constraint (release old, acquire new).
	 *
	 * @param options - Model/field options
	 * @param oldValue - The old unique field value
	 * @param newValue - The new unique field value
	 * @param recordId - The record ID
	 */
	async update(
		options: UniqueConstraintOptions,
		oldValue: unknown,
		newValue: unknown,
		recordId: string
	): Promise<void> {
		// If values are the same, nothing to do
		if (this.valuesEqual(oldValue, newValue)) {
			return
		}

		// Acquire new first (may throw if duplicate)
		await this.acquire(options, newValue, recordId)

		// Release old
		await this.release(options, oldValue)
	}

	/**
	 * Acquire a compound unique constraint for a record.
	 *
	 * @param options - Model/fields options
	 * @param values - Array of field values (same order as options.fields)
	 * @param recordId - The record ID claiming this compound value
	 * @throws UniqueConstraintError if compound value combination is already taken
	 */
	async acquireCompound(
		options: CompoundUniqueConstraintOptions,
		values: unknown[],
		recordId: string
	): Promise<void> {
		// Skip if any value is null/undefined
		if (values.some(v => v === null || v === undefined)) {
			return
		}

		const key = this.buildCompoundKey(options, values)
		const entry: UniqueIndexEntry = { id: recordId }

		if (this.hasSetIfNotExists) {
			const success = await this.adapter.setIfNotExists!(key, entry)
			if (!success) {
				const existing = await this.adapter.get(key) as UniqueIndexEntry | undefined
				if (existing && existing.id !== recordId) {
					throw new UniqueConstraintError(
						`Compound unique constraint violation on fields [${options.fields.join(', ')}]: value combination already exists`,
						{ model: options.modelName, field: options.fields.join('+'), value: values }
					)
				}
			}
		} else {
			const existing = await this.adapter.get(key) as UniqueIndexEntry | undefined
			if (existing) {
				if (existing.id !== recordId) {
					throw new UniqueConstraintError(
						`Compound unique constraint violation on fields [${options.fields.join(', ')}]: value combination already exists`,
						{ model: options.modelName, field: options.fields.join('+'), value: values }
					)
				}
				return
			}

			await this.adapter.set(key, entry)

			const verification = await this.adapter.get(key) as UniqueIndexEntry | undefined
			if (!verification || verification.id !== recordId) {
				throw new UniqueConstraintError(
					`Compound unique constraint violation on fields [${options.fields.join(', ')}]: value combination already exists (race)`,
					{ model: options.modelName, field: options.fields.join('+'), value: values }
				)
			}
		}
	}

	/**
	 * Release a compound unique constraint.
	 *
	 * @param options - Model/fields options
	 * @param values - Array of field values
	 */
	async releaseCompound(
		options: CompoundUniqueConstraintOptions,
		values: unknown[]
	): Promise<void> {
		if (values.some(v => v === null || v === undefined)) {
			return
		}

		const key = this.buildCompoundKey(options, values)
		await this.adapter.delete(key)
	}

	/**
	 * Update a compound unique constraint (release old, acquire new).
	 *
	 * @param options - Model/fields options
	 * @param oldValues - The old field values
	 * @param newValues - The new field values
	 * @param recordId - The record ID
	 */
	async updateCompound(
		options: CompoundUniqueConstraintOptions,
		oldValues: unknown[],
		newValues: unknown[],
		recordId: string
	): Promise<void> {
		// Check if values actually changed
		if (oldValues.length === newValues.length && oldValues.every((v, i) => this.valuesEqual(v, newValues[i]))) {
			return
		}

		// Acquire new first (may throw if duplicate)
		await this.acquireCompound(options, newValues, recordId)

		// Release old
		await this.releaseCompound(options, oldValues)
	}

	/**
	 * Build the storage key for a unique constraint.
	 */
	private buildKey(options: UniqueConstraintOptions, value: unknown): string {
		const encodedValue = encodeUniqueValue(value)
		return buildUniqueKey(options.modelName, options.field, encodedValue, options.namespace)
	}

	/**
	 * Build the storage key for a compound unique constraint.
	 */
	private buildCompoundKey(options: CompoundUniqueConstraintOptions, values: unknown[]): string {
		const encodedValues = values.map(v => encodeUniqueValue(v))
		return buildCompoundUniqueKey(options.modelName, options.fields, encodedValues, options.namespace)
	}

	/**
	 * Check if two values are equal for constraint purposes.
	 */
	private valuesEqual(a: unknown, b: unknown): boolean {
		if (a === b) return true
		if (a === null || a === undefined) return b === null || b === undefined
		if (b === null || b === undefined) return false

		// Handle Date comparison
		if (a instanceof Date && b instanceof Date) {
			return a.getTime() === b.getTime()
		}

		return false
	}
}

/**
 * Acquire multiple unique constraints atomically (best effort).
 *
 * Acquires constraints in order. If any fails, releases already-acquired ones.
 *
 * @param manager - UniqueIndexManager instance
 * @param constraints - Array of { options, value, recordId }
 */
export async function acquireUniqueConstraints(
	manager: UniqueIndexManager,
	constraints: Array<{
		options: UniqueConstraintOptions
		value: unknown
		recordId: string
	}>
): Promise<void> {
	const acquired: Array<{ options: UniqueConstraintOptions; value: unknown }> = []

	try {
		for (const { options, value, recordId } of constraints) {
			await manager.acquire(options, value, recordId)
			acquired.push({ options, value })
		}
	} catch (error) {
		// Release already-acquired constraints
		for (const { options, value } of acquired) {
			try {
				await manager.release(options, value)
			} catch {
				// Ignore release errors during rollback
			}
		}
		throw error
	}
}

/**
 * Release multiple unique constraints.
 *
 * @param manager - UniqueIndexManager instance
 * @param constraints - Array of { options, value }
 */
export async function releaseUniqueConstraints(
	manager: UniqueIndexManager,
	constraints: Array<{
		options: UniqueConstraintOptions
		value: unknown
	}>
): Promise<void> {
	for (const { options, value } of constraints) {
		await manager.release(options, value)
	}
}

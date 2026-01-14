/**
 * Unit tests for FileReadTracker and checkStaleness
 */

import { describe, it, expect, beforeEach } from '@jest/globals'
import { FileReadTracker, checkStaleness, type FileReadSnapshot } from '../../../src/tools/tracking/file-tracker.js'

describe('FileReadTracker', () => {
	let tracker: FileReadTracker

	beforeEach(() => {
		tracker = new FileReadTracker()
	})

	it('should record and retrieve snapshots', () => {
		const snapshot: FileReadSnapshot = {
			path: '/src/app.ts',
			mtimeMs: 1234567890,
			size: 1000,
			readAt: Date.now(),
			exists: true
		}

		tracker.record(snapshot)

		const retrieved = tracker.get('/src/app.ts')
		expect(retrieved).toEqual({ ...snapshot, turnNumber: 0 })
	})

	it('should overwrite snapshot on re-read of same path', () => {
		const snapshot1: FileReadSnapshot = {
			path: '/src/app.ts',
			mtimeMs: 1000,
			size: 500,
			readAt: 1000,
			exists: true
		}

		const snapshot2: FileReadSnapshot = {
			path: '/src/app.ts',
			mtimeMs: 2000,
			size: 600,
			readAt: 2000,
			exists: true
		}

		tracker.record(snapshot1)
		tracker.record(snapshot2)

		const retrieved = tracker.get('/src/app.ts')
		expect(retrieved).toEqual({ ...snapshot2, turnNumber: 0 })
		expect(tracker.size).toBe(1)
	})

	it('should clear individual paths', () => {
		tracker.record({
			path: '/src/a.ts',
			mtimeMs: 1000,
			size: 100,
			readAt: Date.now(),
			exists: true
		})
		tracker.record({
			path: '/src/b.ts',
			mtimeMs: 1000,
			size: 200,
			readAt: Date.now(),
			exists: true
		})

		expect(tracker.size).toBe(2)

		tracker.clear('/src/a.ts')

		expect(tracker.size).toBe(1)
		expect(tracker.hasRead('/src/a.ts')).toBe(false)
		expect(tracker.hasRead('/src/b.ts')).toBe(true)
	})

	it('should clear all tracking', () => {
		tracker.record({
			path: '/src/a.ts',
			mtimeMs: 1000,
			size: 100,
			readAt: Date.now(),
			exists: true
		})
		tracker.record({
			path: '/src/b.ts',
			mtimeMs: 1000,
			size: 200,
			readAt: Date.now(),
			exists: true
		})

		expect(tracker.size).toBe(2)

		tracker.clearAll()

		expect(tracker.size).toBe(0)
		expect(tracker.hasRead('/src/a.ts')).toBe(false)
		expect(tracker.hasRead('/src/b.ts')).toBe(false)
	})

	it('should report hasRead correctly', () => {
		expect(tracker.hasRead('/src/app.ts')).toBe(false)

		tracker.record({
			path: '/src/app.ts',
			mtimeMs: 1000,
			size: 100,
			readAt: Date.now(),
			exists: true
		})

		expect(tracker.hasRead('/src/app.ts')).toBe(true)
		expect(tracker.hasRead('/src/other.ts')).toBe(false)
	})

	it('should return undefined for untracked paths', () => {
		expect(tracker.get('/nonexistent.ts')).toBeUndefined()
	})

	it('should return all tracked paths', () => {
		tracker.record({
			path: '/src/a.ts',
			mtimeMs: 1000,
			size: 100,
			readAt: Date.now(),
			exists: true
		})
		tracker.record({
			path: '/src/b.ts',
			mtimeMs: 1000,
			size: 200,
			readAt: Date.now(),
			exists: true
		})

		const paths = tracker.getPaths()
		expect(paths).toHaveLength(2)
		expect(paths).toContain('/src/a.ts')
		expect(paths).toContain('/src/b.ts')
	})

	it('should track files that did not exist', () => {
		tracker.record({
			path: '/src/new.ts',
			mtimeMs: null,
			size: null,
			readAt: Date.now(),
			exists: false
		})

		expect(tracker.hasRead('/src/new.ts')).toBe(true)
		const snapshot = tracker.get('/src/new.ts')
		expect(snapshot?.exists).toBe(false)
		expect(snapshot?.mtimeMs).toBeNull()
		expect(snapshot?.size).toBeNull()
	})
})

describe('checkStaleness', () => {
	it('should return not stale when unchanged', () => {
		const snapshot: FileReadSnapshot = {
			path: '/src/app.ts',
			mtimeMs: 1000,
			size: 500,
			readAt: Date.now(),
			exists: true
		}

		const result = checkStaleness(snapshot, {
			mtimeMs: 1000,
			size: 500,
			exists: true
		})

		expect(result.isStale).toBe(false)
		expect(result.reason).toBeUndefined()
	})

	it('should detect mtime_changed', () => {
		const snapshot: FileReadSnapshot = {
			path: '/src/app.ts',
			mtimeMs: 1000,
			size: 500,
			readAt: Date.now(),
			exists: true
		}

		const result = checkStaleness(snapshot, {
			mtimeMs: 2000, // Changed
			size: 500,
			exists: true
		})

		expect(result.isStale).toBe(true)
		expect(result.reason).toBe('mtime_changed')
		expect(result.lastRead).toEqual(snapshot)
		expect(result.currentState?.mtimeMs).toBe(2000)
	})

	it('should detect size_changed', () => {
		const snapshot: FileReadSnapshot = {
			path: '/src/app.ts',
			mtimeMs: 1000,
			size: 500,
			readAt: Date.now(),
			exists: true
		}

		const result = checkStaleness(snapshot, {
			mtimeMs: 1000, // Same mtime
			size: 600, // Different size
			exists: true
		})

		expect(result.isStale).toBe(true)
		expect(result.reason).toBe('size_changed')
		expect(result.currentState?.size).toBe(600)
	})

	it('should detect file_created (did not exist, now exists)', () => {
		const snapshot: FileReadSnapshot = {
			path: '/src/new.ts',
			mtimeMs: null,
			size: null,
			readAt: Date.now(),
			exists: false
		}

		const result = checkStaleness(snapshot, {
			mtimeMs: 1000,
			size: 500,
			exists: true
		})

		expect(result.isStale).toBe(true)
		expect(result.reason).toBe('file_created')
	})

	it('should detect file_deleted (existed, now gone)', () => {
		const snapshot: FileReadSnapshot = {
			path: '/src/app.ts',
			mtimeMs: 1000,
			size: 500,
			readAt: Date.now(),
			exists: true
		}

		const result = checkStaleness(snapshot, {
			size: 0,
			exists: false
		})

		expect(result.isStale).toBe(true)
		expect(result.reason).toBe('file_deleted')
		expect(result.currentState?.exists).toBe(false)
	})

	it('should handle null mtime gracefully', () => {
		const snapshot: FileReadSnapshot = {
			path: '/src/app.ts',
			mtimeMs: null, // No mtime available
			size: 500,
			readAt: Date.now(),
			exists: true
		}

		// Same size, no mtime check possible
		const result = checkStaleness(snapshot, {
			mtimeMs: 1000,
			size: 500,
			exists: true
		})

		expect(result.isStale).toBe(false)
	})

	it('should return not stale when both did not exist', () => {
		const snapshot: FileReadSnapshot = {
			path: '/src/new.ts',
			mtimeMs: null,
			size: null,
			readAt: Date.now(),
			exists: false
		}

		const result = checkStaleness(snapshot, {
			size: 0,
			exists: false
		})

		expect(result.isStale).toBe(false)
	})

	it('should prioritize mtime over size for detection', () => {
		const snapshot: FileReadSnapshot = {
			path: '/src/app.ts',
			mtimeMs: 1000,
			size: 500,
			readAt: Date.now(),
			exists: true
		}

		// Both mtime and size changed
		const result = checkStaleness(snapshot, {
			mtimeMs: 2000,
			size: 600,
			exists: true
		})

		// Should detect mtime first
		expect(result.isStale).toBe(true)
		expect(result.reason).toBe('mtime_changed')
	})

	it('should include snapshot in lastRead on stale detection', () => {
		const snapshot: FileReadSnapshot = {
			path: '/src/app.ts',
			mtimeMs: 1000,
			size: 500,
			readAt: 12345,
			exists: true
		}

		const result = checkStaleness(snapshot, {
			mtimeMs: 2000,
			size: 500,
			exists: true
		})

		expect(result.lastRead).toEqual(snapshot)
		expect(result.lastRead?.readAt).toBe(12345)
	})
})

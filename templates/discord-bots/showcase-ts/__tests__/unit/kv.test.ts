/**
 * KV Utilities Unit Tests
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals'

// Mock Flashcore before importing kv module
const mockGet = jest.fn()
const mockSet = jest.fn()
const mockHas = jest.fn()
const mockDelete = jest.fn()

jest.unstable_mockModule('robo.js', () => ({
	Flashcore: {
		get: mockGet,
		set: mockSet,
		has: mockHas,
		delete: mockDelete
	}
}))

const { getTaskStats, incrementStat, decrementStat, resetTaskStats, hasTaskStats } = await import('../../src/utils/kv.js')

describe('getTaskStats', () => {
	beforeEach(() => {
		jest.clearAllMocks()
	})

	it('should return stored stats', async () => {
		mockGet.mockResolvedValue({ total: 10, open: 5, done: 3 })
		const stats = await getTaskStats()
		expect(stats).toEqual({ total: 10, open: 5, done: 3 })
	})

	it('should return defaults when no stats exist', async () => {
		mockGet.mockResolvedValue(undefined)
		const stats = await getTaskStats()
		expect(stats).toEqual({ total: 0, open: 0, done: 0 })
	})
})

describe('incrementStat', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		mockSet.mockResolvedValue(true)
	})

	it('should call Flashcore.set with updater function', async () => {
		await incrementStat('total')
		expect(mockSet).toHaveBeenCalledWith('stats:tasks', expect.any(Function))
	})

	it('should increment the specified field', async () => {
		await incrementStat('open')
		const updater = mockSet.mock.calls[0][1] as (old: unknown) => unknown
		const result = updater({ total: 5, open: 3, done: 1 })
		expect(result).toEqual({ total: 5, open: 4, done: 1 })
	})

	it('should handle null old value', async () => {
		await incrementStat('total')
		const updater = mockSet.mock.calls[0][1] as (old: unknown) => unknown
		const result = updater(undefined)
		expect(result).toEqual({ total: 1, open: 0, done: 0 })
	})
})

describe('decrementStat', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		mockSet.mockResolvedValue(true)
	})

	it('should decrement the specified field', async () => {
		await decrementStat('open')
		const updater = mockSet.mock.calls[0][1] as (old: unknown) => unknown
		const result = updater({ total: 5, open: 3, done: 1 })
		expect(result).toEqual({ total: 5, open: 2, done: 1 })
	})

	it('should not go below zero', async () => {
		await decrementStat('done')
		const updater = mockSet.mock.calls[0][1] as (old: unknown) => unknown
		const result = updater({ total: 0, open: 0, done: 0 })
		expect(result).toEqual({ total: 0, open: 0, done: 0 })
	})
})

describe('resetTaskStats', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		mockDelete.mockResolvedValue(true)
	})

	it('should delete the stats key', async () => {
		await resetTaskStats()
		expect(mockDelete).toHaveBeenCalledWith('stats:tasks')
	})
})

describe('hasTaskStats', () => {
	beforeEach(() => {
		jest.clearAllMocks()
	})

	it('should return true when stats exist', async () => {
		mockHas.mockResolvedValue(true)
		expect(await hasTaskStats()).toBe(true)
	})

	it('should return false when stats do not exist', async () => {
		mockHas.mockResolvedValue(false)
		expect(await hasTaskStats()).toBe(false)
	})
})

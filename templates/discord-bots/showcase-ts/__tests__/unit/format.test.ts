/**
 * Format Utilities Unit Tests
 */
import { describe, it, expect } from '@jest/globals'
import { formatTaskLine, formatTaskCount, formatProjectHeader, formatEstimatedHours, formatArchived, formatLabelList } from '../../src/utils/format.js'
import type { TaskRecord } from '../../src/utils/models.js'

const mockTask: TaskRecord = {
	id: 'abc12345-test',
	title: 'Fix bug',
	status: 'open',
	priority: 'high',
	projectId: 'proj-1',
	createdAt: new Date('2025-01-01')
}

describe('formatTaskLine', () => {
	it('should format a task with status and priority emoji', () => {
		const line = formatTaskLine(mockTask)
		expect(line).toContain('Fix bug')
		expect(line).toContain('open')
	})

	it('should include index when provided', () => {
		const line = formatTaskLine(mockTask, 0)
		expect(line).toMatch(/^1\./)
	})

	it('should not include index when omitted', () => {
		const line = formatTaskLine(mockTask)
		expect(line).not.toMatch(/^\d+\./)
	})
})

describe('formatTaskCount', () => {
	it('should pluralize correctly', () => {
		expect(formatTaskCount(0)).toBe('0 tasks')
		expect(formatTaskCount(1)).toBe('1 task')
		expect(formatTaskCount(5)).toBe('5 tasks')
	})
})

describe('formatProjectHeader', () => {
	it('should format project name with task count', () => {
		const header = formatProjectHeader('General', 3)
		expect(header).toContain('General')
		expect(header).toContain('3 tasks')
	})
})

describe('formatEstimatedHours', () => {
	it('should format hours with clock emoji', () => {
		expect(formatEstimatedHours(5)).toBe('⏱ 5h')
	})

	it('should return empty string for undefined', () => {
		expect(formatEstimatedHours(undefined)).toBe('')
	})

	it('should handle zero hours', () => {
		expect(formatEstimatedHours(0)).toBe('⏱ 0h')
	})
})

describe('formatArchived', () => {
	it('should show archived badge when true', () => {
		expect(formatArchived(true)).toBe('📦 Archived')
	})

	it('should return empty string when false', () => {
		expect(formatArchived(false)).toBe('')
	})

	it('should return empty string when undefined', () => {
		expect(formatArchived(undefined)).toBe('')
	})
})

describe('formatLabelList', () => {
	it('should format label names in backticks', () => {
		const labels = [
			{ name: 'bug', color: '#ff0000' },
			{ name: 'feature', color: '#00ff00' }
		]
		expect(formatLabelList(labels)).toBe('`bug`, `feature`')
	})

	it('should return "No labels" for empty array', () => {
		expect(formatLabelList([])).toBe('No labels')
	})
})

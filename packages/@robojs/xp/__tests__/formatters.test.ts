import { describe, test, expect } from '@jest/globals'
import { formatXP, getXpLabel } from '../src/core/utils.js'
import type { GuildConfig } from '../src/types.js'

// Helper to build a minimal base config
function createBaseConfig(): GuildConfig {
	return {
		cooldownSeconds: 60,
		xpRate: 1.0,
		noXpRoleIds: [],
		noXpChannelIds: [],
		roleRewards: [],
		rewardsMode: 'stack',
		removeRewardOnXpLoss: false,
		leaderboard: { public: false }
	}
}

describe('formatXP()', () => {
	test("uses default 'XP' when no label provided", () => {
		expect(formatXP(1500)).toBe('1,500 XP')
		expect(formatXP(0)).toBe('0 XP')
		expect(formatXP(1_000_000)).toBe('1,000,000 XP')
	})

	test('uses custom label when provided', () => {
		expect(formatXP(1500, 'Reputation')).toBe('1,500 Reputation')
		expect(formatXP(2000, 'Points')).toBe('2,000 Points')
		expect(formatXP(750, 'Karma')).toBe('750 Karma')
		expect(formatXP(5000, 'Credits')).toBe('5,000 Credits')
	})

	test('handles undefined label (explicit)', () => {
		expect(formatXP(1500, undefined)).toBe('1,500 XP')
	})

	test('preserves number formatting with custom labels', () => {
		expect(formatXP(1_234_567, 'Reputation')).toBe('1,234,567 Reputation')
	})
})

describe('getXpLabel()', () => {
	test("returns default 'XP' when labels undefined", () => {
		const config: GuildConfig = createBaseConfig()
		const label = getXpLabel(config)
		expect(label).toBe('XP')
	})

	test("returns default 'XP' when labels is empty object", () => {
		const config: GuildConfig = { ...createBaseConfig(), labels: {} as any }
		const label = getXpLabel(config)
		expect(label).toBe('XP')
	})

	test('returns custom label from config', () => {
		let config: GuildConfig = { ...createBaseConfig(), labels: { xpDisplayName: 'Reputation' } }
		expect(getXpLabel(config)).toBe('Reputation')

		config = { ...createBaseConfig(), labels: { xpDisplayName: 'Points' } }
		expect(getXpLabel(config)).toBe('Points')

		config = { ...createBaseConfig(), labels: { xpDisplayName: 'Karma' } }
		expect(getXpLabel(config)).toBe('Karma')

		config = { ...createBaseConfig(), labels: { xpDisplayName: 'Credits' } }
		expect(getXpLabel(config)).toBe('Credits')
	})

	test('handles various label values', () => {
		expect(getXpLabel({ ...createBaseConfig(), labels: { xpDisplayName: 'P' } })).toBe('P')
		expect(getXpLabel({ ...createBaseConfig(), labels: { xpDisplayName: 'Rep Points' } })).toBe('Rep Points')
		expect(getXpLabel({ ...createBaseConfig(), labels: { xpDisplayName: '⭐ Stars' } })).toBe('⭐ Stars')
		expect(getXpLabel({ ...createBaseConfig(), labels: { xpDisplayName: 'Reputation Points!' } })).toBe(
			'Reputation Points!'
		)
	})
})

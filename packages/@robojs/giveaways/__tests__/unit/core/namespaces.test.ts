import {
	GIVEAWAY_DATA_NAMESPACE,
	MESSAGES_NAMESPACE,
	guildActiveNamespace,
	guildRecentNamespace,
	guildSettingsNamespace
} from 'core/namespaces.js'

describe('Namespace Generators', () => {
	describe('GIVEAWAY_DATA_NAMESPACE constant', () => {
		it('should return correct namespace array', () => {
			expect(GIVEAWAY_DATA_NAMESPACE).toEqual(['giveaways', 'data'])
		})

		it('should have correct length and values', () => {
			expect(GIVEAWAY_DATA_NAMESPACE).toHaveLength(2)
			expect(GIVEAWAY_DATA_NAMESPACE[0]).toBe('giveaways')
			expect(GIVEAWAY_DATA_NAMESPACE[1]).toBe('data')
		})
	})

	describe('MESSAGES_NAMESPACE constant', () => {
		it('should return correct namespace array', () => {
			expect(MESSAGES_NAMESPACE).toEqual(['giveaways', 'messages'])
		})

		it('should have correct array structure', () => {
			expect(MESSAGES_NAMESPACE).toHaveLength(2)
			expect(MESSAGES_NAMESPACE[0]).toBe('giveaways')
			expect(MESSAGES_NAMESPACE[1]).toBe('messages')
		})
	})

	describe('guildActiveNamespace(guildId)', () => {
		it('should return correct namespace with valid guild ID', () => {
			const result = guildActiveNamespace('guild-123')
			expect(result).toEqual(['giveaways', 'guilds', 'guild-123', 'active'])
		})

		it('should produce different namespaces for different guild IDs', () => {
			const result1 = guildActiveNamespace('guild-001')
			const result2 = guildActiveNamespace('guild-002')
			expect(result1).not.toEqual(result2)
			expect(result1[2]).toBe('guild-001')
			expect(result2[2]).toBe('guild-002')
		})

		it('should correctly interpolate guild ID at index 2', () => {
			const guildId = 'test-guild-456'
			const result = guildActiveNamespace(guildId)
			expect(result[2]).toBe(guildId)
			expect(result).toHaveLength(4)
		})

		it('should handle numeric-looking string guild ID', () => {
			const result = guildActiveNamespace('1234567890')
			expect(result).toEqual(['giveaways', 'guilds', '1234567890', 'active'])
		})

		it('should handle special characters in guild ID (Discord snowflakes)', () => {
			const snowflake = '123456789012345678'
			const result = guildActiveNamespace(snowflake)
			expect(result).toEqual(['giveaways', 'guilds', snowflake, 'active'])
		})
	})

	describe('guildRecentNamespace(guildId)', () => {
		it('should return correct namespace with valid guild ID', () => {
			const result = guildRecentNamespace('guild-123')
			expect(result).toEqual(['giveaways', 'guilds', 'guild-123', 'recent'])
		})

		it('should produce different namespaces for different guild IDs', () => {
			const result1 = guildRecentNamespace('guild-001')
			const result2 = guildRecentNamespace('guild-002')
			expect(result1).not.toEqual(result2)
			expect(result1[2]).toBe('guild-001')
			expect(result2[2]).toBe('guild-002')
		})

		it('should correctly interpolate guild ID', () => {
			const guildId = 'my-test-guild'
			const result = guildRecentNamespace(guildId)
			expect(result[2]).toBe(guildId)
		})

		it('should have "recent" as last element not "active"', () => {
			const result = guildRecentNamespace('guild-123')
			expect(result[3]).toBe('recent')
			expect(result[3]).not.toBe('active')
		})
	})

	describe('guildSettingsNamespace(guildId)', () => {
		it('should return correct namespace with valid guild ID', () => {
			const result = guildSettingsNamespace('guild-123')
			expect(result).toEqual(['giveaways', 'guilds', 'guild-123', 'settings'])
		})

		it('should produce different namespaces for different guild IDs', () => {
			const result1 = guildSettingsNamespace('guild-001')
			const result2 = guildSettingsNamespace('guild-002')
			expect(result1).not.toEqual(result2)
			expect(result1[2]).toBe('guild-001')
			expect(result2[2]).toBe('guild-002')
		})

		it('should correctly interpolate guild ID', () => {
			const guildId = 'settings-test-guild'
			const result = guildSettingsNamespace(guildId)
			expect(result[2]).toBe(guildId)
		})

		it('should have "settings" as last element', () => {
			const result = guildSettingsNamespace('guild-123')
			expect(result[3]).toBe('settings')
		})
	})

	describe('Namespace uniqueness', () => {
		it('should produce different results for different namespace generators', () => {
			const guildId = 'test-guild'
			const active = guildActiveNamespace(guildId)
			const recent = guildRecentNamespace(guildId)
			const settings = guildSettingsNamespace(guildId)

			expect(active).not.toEqual(recent)
			expect(active).not.toEqual(settings)
			expect(recent).not.toEqual(settings)
		})

		it('should produce different results with different inputs', () => {
			const result1 = guildActiveNamespace('guild-001')
			const result2 = guildActiveNamespace('guild-002')
			expect(result1).not.toEqual(result2)
		})

		it('should produce identical results with same input', () => {
			const guildId = 'consistent-guild'
			const result1 = guildActiveNamespace(guildId)
			const result2 = guildActiveNamespace(guildId)
			expect(result1).toEqual(result2)
		})
	})
})

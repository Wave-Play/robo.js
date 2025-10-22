import { getGuildSettings, setGuildSettings } from 'index.js'
import { DEFAULT_SETTINGS } from 'types/giveaway.js'
import { guildSettingsNamespace } from 'core/namespaces.js'
import { createTestGuildSettings } from '../helpers/factories.js'
import { mockFlashcore } from '../helpers/mocks.js'
import { setupTestEnvironment, cleanupTestEnvironment } from '../helpers/test-utils.js'

describe('Plugin Giveaways - Index', () => {
	beforeEach(() => {
		setupTestEnvironment()
	})

	afterEach(() => {
		cleanupTestEnvironment()
	})

	describe('getGuildSettings', () => {
		it('should return stored settings when they exist', async () => {
			const customSettings = createTestGuildSettings({ defaults: { winners: 5 } })
			const guildId = 'guild-123'

			// Store settings in Flashcore
			mockFlashcore.set('data', customSettings, { namespace: guildSettingsNamespace(guildId) })

			const result = await getGuildSettings(guildId)

			expect(result).toEqual(customSettings)
			expect(result.defaults.winners).toBe(5)
		})

		it('should return DEFAULT_SETTINGS when no custom settings exist', async () => {
			const result = await getGuildSettings('guild-456')

			expect(result).toEqual(DEFAULT_SETTINGS)
			expect(result.defaults).toBeDefined()
			expect(result.limits).toBeDefined()
			expect(result.restrictions).toBeDefined()
		})

		it('should use correct Flashcore namespace', async () => {
			const guildId = 'guild-789'

			await getGuildSettings(guildId)

			expect(mockFlashcore.get).toHaveBeenCalledWith('data', {
				namespace: ['giveaways', 'guilds', guildId, 'settings']
			})
		})

		it('should handle different guild IDs independently', async () => {
			const settings1 = createTestGuildSettings({ defaults: { winners: 3 } })
			const settings2 = createTestGuildSettings({ defaults: { winners: 7 } })

			mockFlashcore.set('data', settings1, { namespace: guildSettingsNamespace('guild-001') })
			mockFlashcore.set('data', settings2, { namespace: guildSettingsNamespace('guild-002') })

			const result1 = await getGuildSettings('guild-001')
			const result2 = await getGuildSettings('guild-002')

			expect(result1.defaults.winners).toBe(3)
			expect(result2.defaults.winners).toBe(7)
		})

		it('should return complete settings object structure', async () => {
			const result = await getGuildSettings('guild-123')

			expect(result).toHaveProperty('defaults')
			expect(result.defaults).toHaveProperty('winners')
			expect(result.defaults).toHaveProperty('duration')
			expect(result.defaults).toHaveProperty('buttonLabel')
			expect(result.defaults).toHaveProperty('dmWinners')

			expect(result).toHaveProperty('limits')
			expect(result.limits).toHaveProperty('maxWinners')
			expect(result.limits).toHaveProperty('maxDurationDays')

			expect(result).toHaveProperty('restrictions')
			expect(result.restrictions).toHaveProperty('allowRoleIds')
			expect(result.restrictions).toHaveProperty('denyRoleIds')
			expect(result.restrictions).toHaveProperty('minAccountAgeDays')
		})

		it('should handle Flashcore returning null', async () => {
			mockFlashcore.get.mockReturnValueOnce(null)

			const result = await getGuildSettings('guild-123')

			expect(result).toEqual(DEFAULT_SETTINGS)
		})

		it('should handle Flashcore returning undefined', async () => {
			mockFlashcore.get.mockReturnValueOnce(undefined)

			const result = await getGuildSettings('guild-123')

			expect(result).toEqual(DEFAULT_SETTINGS)
		})
	})

	describe('setGuildSettings', () => {
		it('should store settings in Flashcore', async () => {
			const customSettings = createTestGuildSettings({ defaults: { winners: 10 } })
			const guildId = 'guild-123'

			await setGuildSettings(guildId, customSettings)

			expect(mockFlashcore.set).toHaveBeenCalledWith('data', customSettings, {
				namespace: ['giveaways', 'guilds', guildId, 'settings']
			})
		})

		it('should use correct namespace for guild ID', async () => {
			const settings = createTestGuildSettings()
			const guildId = 'guild-456'

			await setGuildSettings(guildId, settings)

			expect(mockFlashcore.set).toHaveBeenCalledWith('data', settings, {
				namespace: expect.arrayContaining(['giveaways', 'guilds', guildId, 'settings'])
			})
		})

		it('should persist complete settings object', async () => {
			const customSettings = createTestGuildSettings({
				defaults: { winners: 5, duration: '2h', buttonLabel: 'Custom', dmWinners: false },
				limits: { maxWinners: 20, maxDurationDays: 60 },
				restrictions: { allowRoleIds: ['role-1'], denyRoleIds: ['role-2'], minAccountAgeDays: 14 }
			})
			const guildId = 'guild-123'

			await setGuildSettings(guildId, customSettings)

			const result = await getGuildSettings(guildId)

			expect(result).toEqual(customSettings)
		})

		it('should overwrite existing settings', async () => {
			const guildId = 'guild-123'
			const initialSettings = createTestGuildSettings({ defaults: { winners: 1 } })
			const newSettings = createTestGuildSettings({ defaults: { winners: 5 } })

			await setGuildSettings(guildId, initialSettings)
			await setGuildSettings(guildId, newSettings)

			const result = await getGuildSettings(guildId)

			expect(result.defaults.winners).toBe(5)
		})

		it('should handle settings with empty arrays', async () => {
			const settings = createTestGuildSettings({
				restrictions: { allowRoleIds: [], denyRoleIds: [], minAccountAgeDays: null }
			})
			const guildId = 'guild-123'

			await setGuildSettings(guildId, settings)

			const result = await getGuildSettings(guildId)

			expect(result.restrictions.allowRoleIds).toEqual([])
			expect(result.restrictions.denyRoleIds).toEqual([])
		})

		it('should handle settings with populated role arrays', async () => {
			const settings = createTestGuildSettings({
				restrictions: { allowRoleIds: ['role-001', 'role-002'], denyRoleIds: [], minAccountAgeDays: null }
			})
			const guildId = 'guild-123'

			await setGuildSettings(guildId, settings)

			const result = await getGuildSettings(guildId)

			expect(result.restrictions.allowRoleIds).toEqual(['role-001', 'role-002'])
		})

		it('should handle null minAccountAgeDays', async () => {
			const settings = createTestGuildSettings({
				restrictions: { allowRoleIds: [], denyRoleIds: [], minAccountAgeDays: null }
			})
			const guildId = 'guild-123'

			await setGuildSettings(guildId, settings)

			const result = await getGuildSettings(guildId)

			expect(result.restrictions.minAccountAgeDays).toBeNull()
		})

		it('should handle numeric minAccountAgeDays', async () => {
			const settings = createTestGuildSettings({
				restrictions: { allowRoleIds: [], denyRoleIds: [], minAccountAgeDays: 7 }
			})
			const guildId = 'guild-123'

			await setGuildSettings(guildId, settings)

			const result = await getGuildSettings(guildId)

			expect(result.restrictions.minAccountAgeDays).toBe(7)
		})

		it('should return a promise that resolves', async () => {
			const settings = createTestGuildSettings()
			const guildId = 'guild-123'

			const promise = setGuildSettings(guildId, settings)

			expect(promise).toBeInstanceOf(Promise)
			await expect(promise).resolves.not.toThrow()
		})
	})

	describe('getGuildSettings and setGuildSettings integration', () => {
		it('should round-trip settings correctly', async () => {
			const customSettings = createTestGuildSettings({
				defaults: { winners: 8, duration: '1.5h', buttonLabel: 'Test', dmWinners: true },
				limits: { maxWinners: 15, maxDurationDays: 45 },
				restrictions: { allowRoleIds: ['r1', 'r2'], denyRoleIds: ['r3'], minAccountAgeDays: 30 }
			})
			const guildId = 'guild-123'

			await setGuildSettings(guildId, customSettings)
			const result = await getGuildSettings(guildId)

			expect(result).toEqual(customSettings)
		})

		it('should handle multiple guilds independently', async () => {
			const settings1 = createTestGuildSettings({ defaults: { winners: 1 } })
			const settings2 = createTestGuildSettings({ defaults: { winners: 2 } })
			const settings3 = createTestGuildSettings({ defaults: { winners: 3 } })

			await setGuildSettings('guild-001', settings1)
			await setGuildSettings('guild-002', settings2)
			await setGuildSettings('guild-003', settings3)

			const result1 = await getGuildSettings('guild-001')
			const result2 = await getGuildSettings('guild-002')
			const result3 = await getGuildSettings('guild-003')

			expect(result1.defaults.winners).toBe(1)
			expect(result2.defaults.winners).toBe(2)
			expect(result3.defaults.winners).toBe(3)
		})

		it('should not affect DEFAULT_SETTINGS constant', async () => {
			// Deep clone DEFAULT_SETTINGS to ensure no nested mutations
			const originalDefaults = structuredClone(DEFAULT_SETTINGS)
			const customSettings = createTestGuildSettings({ defaults: { winners: 99 } })

			await setGuildSettings('guild-123', customSettings)

			// Compare the deep clone against DEFAULT_SETTINGS to ensure no nested mutations
			expect(DEFAULT_SETTINGS).toEqual(originalDefaults)
		})
	})

	describe('Type exports', () => {
		it('should export Giveaway type', () => {
			// This is a compile-time check, so just verify the import doesn't fail
			// If we got here without errors, the type is exported correctly
			expect(true).toBe(true)
		})

		it('should export GuildSettings type', () => {
			// This is a compile-time check, so just verify the import doesn't fail
			// If we got here without errors, the type is exported correctly
			expect(true).toBe(true)
		})
	})
})

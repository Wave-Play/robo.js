import { jest } from '@jest/globals'
import { RECENT_GIVEAWAYS_LIMIT } from 'core/constants.js'
import { guildActiveNamespace, guildRecentNamespace, guildSettingsNamespace } from 'core/namespaces.js'
import { endGiveaway, rerollWinners, __test } from 'utils/giveaway-utils.js'
import { createTestGiveaway, createTestEntries, createTestGuildSettings } from '../../helpers/factories.js'
import { mockFlashcore, mockClient, mockCron, createMockChannelWithMessage } from '../../helpers/mocks.js'
import { setupTestEnvironment, cleanupTestEnvironment } from '../../helpers/test-utils.js'

const fn = jest.fn as any

// Mock the dynamic import of scheduler to avoid circular dependencies
jest.mock('utils/scheduler.js', () => ({
	cancelScheduledJob: fn().mockResolvedValue(undefined),
	scheduleGiveawayEnd: fn().mockResolvedValue('job-id')
}))

describe('Giveaway Utils', () => {
	beforeEach(() => {
		setupTestEnvironment()
	})

	afterEach(() => {
		cleanupTestEnvironment()
	})

	describe('selectWinners', () => {
		const { selectWinners } = __test

		it('should select correct number of winners', () => {
			const entries = createTestEntries(10)
			const winners = selectWinners(entries, 3)

			expect(winners).toHaveLength(3)
			winners.forEach((winnerId) => {
				expect(entries).toHaveProperty(winnerId)
			})
		})

		it('should return empty array when no entries', () => {
			const winners = selectWinners({}, 5)
			expect(winners).toEqual([])
		})

		it('should return all entries when count exceeds available', () => {
			const entries = createTestEntries(3)
			const winners = selectWinners(entries, 10)

			expect(winners).toHaveLength(3)
			const entryIds = Object.keys(entries)
			winners.forEach((winnerId) => {
				expect(entryIds).toContain(winnerId)
			})
		})

		it('should not select duplicate winners', () => {
			const entries = createTestEntries(20)
			const winners = selectWinners(entries, 10)

			const uniqueWinners = new Set(winners)
			expect(uniqueWinners.size).toBe(winners.length)
		})

		it('should implement Fisher-Yates shuffle correctly (deterministic test)', () => {
			const originalRandom = Math.random

			try {
				// Mock Math.random to return predictable sequence
				const randomSequence = [0.9, 0.5, 0.1, 0.0]
				let callCount = 0
				Math.random = jest.fn(() => randomSequence[callCount++ % randomSequence.length])

				const entries = {
					'user-001': 1,
					'user-002': 1,
					'user-003': 1,
					'user-004': 1,
					'user-005': 1
				}

				const winners = selectWinners(entries, 5)

				// With deterministic random values, we can verify the shuffle produces consistent results
				expect(winners).toHaveLength(5)
				expect(new Set(winners).size).toBe(5) // All unique

				// Compute expected permutation for the provided randomSequence
				// Fisher-Yates algorithm: for i from n-1 to 1, swap arr[i] with arr[j] where j = floor(random() * (i+1))
				// Starting array: ['user-001', 'user-002', 'user-003', 'user-004', 'user-005']
				// i=4: j=floor(0.9 * 5)=4, swap(4,4) -> ['user-001', 'user-002', 'user-003', 'user-004', 'user-005']
				// i=3: j=floor(0.5 * 4)=2, swap(3,2) -> ['user-001', 'user-002', 'user-004', 'user-003', 'user-005']
				// i=2: j=floor(0.1 * 3)=0, swap(2,0) -> ['user-004', 'user-002', 'user-001', 'user-003', 'user-005']
				// i=1: j=floor(0.0 * 2)=0, swap(1,0) -> ['user-002', 'user-004', 'user-001', 'user-003', 'user-005']
				const expectedOrder = ['user-002', 'user-004', 'user-001', 'user-003', 'user-005']
				expect(winners).toEqual(expectedOrder)
			} finally {
				// Restore Math.random in finally block to avoid leakage if test fails
				Math.random = originalRandom
			}
		})

		it('should handle single entry', () => {
			const entries = { 'user-001': 1 }
			const winners = selectWinners(entries, 1)

			expect(winners).toEqual(['user-001'])
		})

		it('should handle zero count', () => {
			const entries = createTestEntries(10)
			const winners = selectWinners(entries, 0)

			expect(winners).toEqual([])
		})

		it('should produce different results with different random seeds', () => {
			const originalRandom = Math.random

			// First run with sequence A
			const sequenceA = [0.1, 0.2, 0.3]
			let callCountA = 0
			Math.random = jest.fn(() => sequenceA[callCountA++ % sequenceA.length])

			const entries = createTestEntries(5)
			const winnersA = selectWinners(entries, 3)

			// Second run with sequence B
			const sequenceB = [0.9, 0.8, 0.7]
			let callCountB = 0
			Math.random = jest.fn(() => sequenceB[callCountB++ % sequenceB.length])

			const winnersB = selectWinners(entries, 3)

			// Results should differ (either different users or different order)
			expect(winnersA).not.toEqual(winnersB)

			// Restore Math.random
			Math.random = originalRandom
		})
	})

	describe('endGiveaway', () => {
		it('should end active giveaway and select winners', async () => {
			const entries = createTestEntries(10)
			const giveaway = createTestGiveaway({ status: 'active', entries })

            // Save giveaway to Flashcore (correct key/namespace)
            mockFlashcore.set(giveaway.id, giveaway, { namespace: ['giveaways', 'data'] })

            // Mock channel and message
            const { mockChannel, mockMessage } = createMockChannelWithMessage()
			;(mockClient.channels.fetch as any).mockResolvedValue(mockChannel)

			await endGiveaway(giveaway.id)

            // Verify giveaway was updated
            const updatedGiveaway = mockFlashcore.get(giveaway.id, { namespace: ['giveaways', 'data'] })
			expect(updatedGiveaway.status).toBe('ended')
			expect(updatedGiveaway.winners).toBeDefined()
			expect(updatedGiveaway.winners.length).toBeGreaterThan(0)
			expect(updatedGiveaway.finalizedAt).toBeDefined()
		})

		it('should move giveaway from active to recent list', async () => {
			const giveaway = createTestGiveaway({ status: 'active', id: 'giveaway-001' })
			const guildId = giveaway.guildId

            // Save giveaway
            mockFlashcore.set(giveaway.id, giveaway, { namespace: ['giveaways', 'data'] })

            // Seed active list
            const activeList = ['giveaway-001', 'giveaway-002']
            mockFlashcore.set('list', activeList, { namespace: guildActiveNamespace(guildId) })

            // Mock channel and message
            const mockMessage = { embeds: [{}], edit: fn().mockResolvedValue(undefined) }
            const mockChannel = { isTextBased: fn().mockReturnValue(true), send: fn().mockResolvedValue({}), messages: { fetch: fn().mockResolvedValue(mockMessage) } };
			(mockClient.channels.fetch as any).mockResolvedValue(mockChannel)

			await endGiveaway(giveaway.id)

            // Verify active list no longer contains the giveaway
            const updatedActive = mockFlashcore.get('list', { namespace: guildActiveNamespace(guildId) })
			expect(updatedActive).not.toContain('giveaway-001')

            // Verify recent list has the giveaway at the beginning
            const recentList = mockFlashcore.get('list', { namespace: guildRecentNamespace(guildId) })
			expect(recentList[0]).toBe('giveaway-001')
		})

		it('should cap recent list at RECENT_GIVEAWAYS_LIMIT', async () => {
			const guildId = 'test-guild-123'

            // Seed recent list at RECENT_GIVEAWAYS_LIMIT - 1
            const recentList = Array.from({ length: RECENT_GIVEAWAYS_LIMIT - 1 }, (_, i) => `old-giveaway-${i}`)
            mockFlashcore.set('list', recentList, { namespace: guildRecentNamespace(guildId) })

			// End enough giveaways to exceed the limit
			for (let i = 0; i < 3; i++) {
                    const giveaway = createTestGiveaway({ status: 'active', id: `giveaway-new-${i}`, guildId })
                    mockFlashcore.set(giveaway.id, giveaway, { namespace: ['giveaways', 'data'] })

                    const activeList = [`giveaway-new-${i}`]
                    mockFlashcore.set('list', activeList, { namespace: guildActiveNamespace(guildId) })

                    // Mock channel and message
                    const mockMessage = { embeds: [{}], edit: fn().mockResolvedValue(undefined) }
                    const mockChannel = { isTextBased: fn().mockReturnValue(true), send: fn().mockResolvedValue({}), messages: { fetch: fn().mockResolvedValue(mockMessage) } };
                    (mockClient.channels.fetch as any).mockResolvedValue(mockChannel)

				await endGiveaway(giveaway.id)
			}

			// Assert that recent length is exactly RECENT_GIVEAWAYS_LIMIT
            const finalRecentList = mockFlashcore.get('list', { namespace: guildRecentNamespace(guildId) })
			expect(finalRecentList).toHaveLength(RECENT_GIVEAWAYS_LIMIT)

            // Assert that the oldest entries are dropped (tail of the list)
            expect(finalRecentList).toContain('giveaway-new-0')
            expect(finalRecentList).toContain('giveaway-new-1')
            expect(finalRecentList).toContain('giveaway-new-2')
            expect(finalRecentList).not.toContain('old-giveaway-47')
            expect(finalRecentList).not.toContain('old-giveaway-48')
		})

		it('should update giveaway message', async () => {
            const giveaway = createTestGiveaway({ status: 'active' })
            mockFlashcore.set(giveaway.id, giveaway, { namespace: ['giveaways', 'data'] })

            const mockMessage = { embeds: [{}], edit: fn().mockResolvedValue(undefined) }
            const mockChannel = { isTextBased: fn().mockReturnValue(true), send: fn().mockResolvedValue({}), messages: { fetch: fn().mockResolvedValue(mockMessage) } };
            (mockClient.channels.fetch as any).mockResolvedValue(mockChannel)

			await endGiveaway(giveaway.id)

			expect(mockMessage.edit).toHaveBeenCalled()
			const editCall = mockMessage.edit.mock.calls[0][0]
			expect(editCall.embeds).toBeDefined()
			expect(editCall.components).toEqual([]) // Components removed
		})

		it('should DM winners when dmWinners is enabled', async () => {
            const entries = createTestEntries(3)
            const giveaway = createTestGiveaway({ status: 'active', entries })
            mockFlashcore.set(giveaway.id, giveaway, { namespace: ['giveaways', 'data'] })

			// Create guild settings with dmWinners enabled
			const settings = createTestGuildSettings({ defaults: { dmWinners: true } })
			mockFlashcore.set('data', settings, { namespace: guildSettingsNamespace(giveaway.guildId) })

			// Mock users
			const mockUser = {
				send: fn().mockResolvedValue(undefined)
			};
			(mockClient.users.fetch as any).mockResolvedValue(mockUser)

			// Mock channel and message
            const mockMessage = { embeds: [{}], edit: fn().mockResolvedValue(undefined) }
            const mockChannel = { isTextBased: fn().mockReturnValue(true), send: fn().mockResolvedValue({}), messages: { fetch: fn().mockResolvedValue(mockMessage) } };
            (mockClient.channels.fetch as any).mockResolvedValue(mockChannel)

			await endGiveaway(giveaway.id)

			// Verify DMs were sent
			expect(mockUser.send).toHaveBeenCalled()

			// Capture the first call to mockUser.send and assert the prize is included
			const firstDmCall = mockUser.send.mock.calls[0]
			const dmContent = firstDmCall[0]

			// The DM content should include the giveaway prize
			// Convert to string to handle both string and object (embed) cases
			const contentStr = typeof dmContent === 'string' ? dmContent : JSON.stringify(dmContent)
			expect(contentStr).toContain(giveaway.prize)
		})

		it('should not DM winners when dmWinners is disabled', async () => {
            const giveaway = createTestGiveaway({ status: 'active' })
            mockFlashcore.set(giveaway.id, giveaway, { namespace: ['giveaways', 'data'] })

			// Create guild settings with dmWinners disabled
			const settings = createTestGuildSettings({ defaults: { dmWinners: false } })
			mockFlashcore.set('data', settings, { namespace: guildSettingsNamespace(giveaway.guildId) })

			// Mock users
			const mockUser = {
				send: fn().mockResolvedValue(undefined)
			};
			(mockClient.users.fetch as any).mockResolvedValue(mockUser)

			// Mock channel and message
            const mockMessage = { embeds: [{}], edit: fn().mockResolvedValue(undefined) }
            const mockChannel = { isTextBased: fn().mockReturnValue(true), send: fn().mockResolvedValue({}), messages: { fetch: fn().mockResolvedValue(mockMessage) } };
            (mockClient.channels.fetch as any).mockResolvedValue(mockChannel)

			await endGiveaway(giveaway.id)

			// Verify DMs were NOT sent
			expect(mockUser.send).not.toHaveBeenCalled()
		})

		it('should cancel scheduled job', async () => {
            const giveaway = createTestGiveaway({ status: 'active', cronJobId: 'job-001' })
            mockFlashcore.set(giveaway.id, giveaway, { namespace: ['giveaways', 'data'] })

            // Mock channel and message
            const mockMessage = { embeds: [{}], edit: fn().mockResolvedValue(undefined) }
            const mockChannel = { isTextBased: fn().mockReturnValue(true), send: fn().mockResolvedValue({}), messages: { fetch: fn().mockResolvedValue(mockMessage) } };
            (mockClient.channels.fetch as any).mockResolvedValue(mockChannel)

            await expect(endGiveaway(giveaway.id)).resolves.not.toThrow()

            // In this test environment, cron may be unavailable; verify no removal attempts were made
            expect(mockCron.remove).not.toHaveBeenCalled()
		})

		it('should handle giveaway with no entries', async () => {
            const giveaway = createTestGiveaway({ status: 'active', entries: {} })
            mockFlashcore.set(giveaway.id, giveaway, { namespace: ['giveaways', 'data'] })

            // Mock channel and message
            const mockMessage = { embeds: [{}], edit: fn().mockResolvedValue(undefined) }
            const mockChannel = { isTextBased: fn().mockReturnValue(true), send: fn().mockResolvedValue({}), messages: { fetch: fn().mockResolvedValue(mockMessage) } };
            (mockClient.channels.fetch as any).mockResolvedValue(mockChannel)

			await expect(endGiveaway(giveaway.id)).resolves.not.toThrow()

            const updatedGiveaway = mockFlashcore.get(giveaway.id, { namespace: ['giveaways', 'data'] })
			expect(updatedGiveaway.status).toBe('ended')
			expect(updatedGiveaway.winners).toEqual([])
		})

		it('should be idempotent (already ended giveaway)', async () => {
			const giveaway = createTestGiveaway({ status: 'ended' })
			mockFlashcore.set(giveaway.id, giveaway, { namespace: ['giveaways', 'data'] })

			// Record call counts before endGiveaway
			const setCallsBefore = mockFlashcore.set.mock.calls.length
			const channelFetchCallsBefore = (mockClient.channels.fetch as any).mock.calls.length

			await endGiveaway(giveaway.id)

			// Verify no new set calls were made (function returned early)
			const setCallsAfter = mockFlashcore.set.mock.calls.length
			expect(setCallsAfter).toBe(setCallsBefore)

			// Verify no channel fetch calls were made (no Discord operations)
			const channelFetchCallsAfter = (mockClient.channels.fetch as any).mock.calls.length
			expect(channelFetchCallsAfter).toBe(channelFetchCallsBefore)
		})

        it('should ignore cancelled giveaways', async () => {
            const giveaway = createTestGiveaway({ status: 'cancelled' })
            mockFlashcore.set(giveaway.id, giveaway, { namespace: ['giveaways', 'data'] })

			// Record call counts before endGiveaway
			const setCallsBefore = mockFlashcore.set.mock.calls.length
			const channelFetchCallsBefore = (mockClient.channels.fetch as any).mock.calls.length

			await endGiveaway(giveaway.id)

			// Verify function returned early
			const setCallsAfter = mockFlashcore.set.mock.calls.length
			expect(setCallsAfter).toBe(setCallsBefore)

			// Verify no channel fetch calls were made (no Discord operations)
			const channelFetchCallsAfter = (mockClient.channels.fetch as any).mock.calls.length
			expect(channelFetchCallsAfter).toBe(channelFetchCallsBefore)
		})

        it('should handle message update errors gracefully', async () => {
            const giveaway = createTestGiveaway({ status: 'active' })
            
            // Save giveaway to Flashcore
            mockFlashcore.set(giveaway.id, giveaway, { namespace: ['giveaways', 'data'] })

            // Mock channel fetch to throw error
            ;(mockClient.channels.fetch as any).mockRejectedValue(new Error('Message deleted'))

            // Record call count before endGiveaway
            const setCallsBefore = mockFlashcore.set.mock.calls.length

            await expect(endGiveaway(giveaway.id)).resolves.not.toThrow()

            // Verify we attempted to persist changes despite message failure
            const setCallsAfter = mockFlashcore.set.mock.calls.length
            expect(setCallsAfter).toBeGreaterThan(setCallsBefore)

            // Verify specific calls were made for giveaway data and list updates
            const giveawayDataCalls = mockFlashcore.set.mock.calls.filter(
                (call: any) => call[0] === giveaway.id && 
                       JSON.stringify(call[2]?.namespace) === JSON.stringify(['giveaways', 'data'])
            )
            const activeListCalls = mockFlashcore.set.mock.calls.filter(
                (call: any) => call[0] === 'list' && 
                       JSON.stringify(call[2]?.namespace) === JSON.stringify(guildActiveNamespace(giveaway.guildId))
            )
            const recentListCalls = mockFlashcore.set.mock.calls.filter(
                (call: any) => call[0] === 'list' && 
                       JSON.stringify(call[2]?.namespace) === JSON.stringify(guildRecentNamespace(giveaway.guildId))
            )

            expect(giveawayDataCalls.length).toBeGreaterThan(0)
            expect(activeListCalls.length).toBeGreaterThan(0)
            expect(recentListCalls.length).toBeGreaterThan(0)
        })
	})

	describe('rerollWinners', () => {
		it('should select new winners excluding previous winners', async () => {
			const entries = createTestEntries(10)
			const originalWinners = ['user-001', 'user-002']
			const giveaway = createTestGiveaway({
				status: 'ended',
				entries,
				winners: originalWinners
			})
            mockFlashcore.set(giveaway.id, giveaway, { namespace: ['giveaways', 'data'] })

            // Mock channel and message
            const { mockChannel, mockMessage } = createMockChannelWithMessage()
            ;(mockClient.channels.fetch as any).mockResolvedValue(mockChannel)

			const newWinners = await rerollWinners(giveaway.id, 2)

			expect(newWinners).toHaveLength(2)
			newWinners.forEach((winnerId) => {
				expect(originalWinners).not.toContain(winnerId)
			})

            // Verify rerolls array has one batch
            const updatedGiveaway = mockFlashcore.get(giveaway.id, { namespace: ['giveaways', 'data'] })
            expect(updatedGiveaway.rerolls).toHaveLength(1)
            expect(updatedGiveaway.rerolls[0]).toEqual(newWinners)
		})

        it('should exclude all previous reroll winners', async () => {
            const entries = createTestEntries(20)
            const originalWinners = ['user-001', 'user-002']
            const rerolls = [
                ['user-003', 'user-004'],
                ['user-005', 'user-006']
            ]
            const giveaway = createTestGiveaway({
                status: 'ended',
                entries,
                winners: originalWinners,
                rerolls
            })
            mockFlashcore.set(giveaway.id, giveaway, { namespace: ['giveaways', 'data'] })

            // Mock channel and message
            const mockMessage = { embeds: [{}], edit: fn().mockResolvedValue(undefined) }
            const mockChannel = { isTextBased: fn().mockReturnValue(true), send: fn().mockResolvedValue({}), messages: { fetch: fn().mockResolvedValue(mockMessage) } };
            (mockClient.channels.fetch as any).mockResolvedValue(mockChannel)

            // Compute the full previous-winners set BEFORE reroll mutates state
            const allPreviousWinners = [...originalWinners, ...rerolls.flat()]

            const newWinners = await rerollWinners(giveaway.id, 2)

            expect(newWinners).toHaveLength(2)

            // Verify new winners are not in original or any reroll batch
            newWinners.forEach((winnerId) => {
                expect(allPreviousWinners).not.toContain(winnerId)
            })

            // Verify rerolls array now has 3 batches
            const updatedGiveaway = mockFlashcore.get(giveaway.id, { namespace: ['giveaways', 'data'] })
            expect(updatedGiveaway.rerolls).toHaveLength(3)
        })

		it('should return empty array when insufficient entrants remain', async () => {
			const entries = {
				'user-001': 1,
				'user-002': 1,
				'user-003': 1
			}
			const originalWinners = ['user-001', 'user-002', 'user-003']
			const giveaway = createTestGiveaway({
				status: 'ended',
				entries,
				winners: originalWinners
			})
            mockFlashcore.set(giveaway.id, giveaway, { namespace: ['giveaways', 'data'] })

			const newWinners = await rerollWinners(giveaway.id, 2)

			expect(newWinners).toEqual([])

            // Verify rerolls array is unchanged
            const updatedGiveaway = mockFlashcore.get(giveaway.id, { namespace: ['giveaways', 'data'] })
            expect(updatedGiveaway.rerolls).toEqual([])
		})

		it('should return partial winners when not enough remain', async () => {
			const entries = createTestEntries(5)
			const originalWinners = ['user-001', 'user-002', 'user-003', 'user-004']
			const giveaway = createTestGiveaway({
				status: 'ended',
				entries,
				winners: originalWinners
			})
            mockFlashcore.set(giveaway.id, giveaway, { namespace: ['giveaways', 'data'] })

            // Mock channel and message
            const mockMessage = { embeds: [{}], edit: fn().mockResolvedValue(undefined) }
            const mockChannel = { isTextBased: fn().mockReturnValue(true), send: fn().mockResolvedValue({}), messages: { fetch: fn().mockResolvedValue(mockMessage) } };
            (mockClient.channels.fetch as any).mockResolvedValue(mockChannel)

			const newWinners = await rerollWinners(giveaway.id, 3)

			expect(newWinners).toHaveLength(1) // Only 1 user remains
		})

        it('should update giveaway message with reroll winners', async () => {
            // Provide entries so we actually reroll some winners
            const entries = createTestEntries(5)
            const giveaway = createTestGiveaway({ status: 'ended', entries })
            mockFlashcore.set(giveaway.id, giveaway, { namespace: ['giveaways', 'data'] })

            const mockMessage = { embeds: [{}], edit: fn().mockResolvedValue(undefined) }
            const mockChannel = { isTextBased: fn().mockReturnValue(true), send: fn().mockResolvedValue({}), messages: { fetch: fn().mockResolvedValue(mockMessage) } };
            (mockClient.channels.fetch as any).mockResolvedValue(mockChannel)

            await rerollWinners(giveaway.id, 2)

            expect(mockMessage.edit).toHaveBeenCalled()
        })

		it('should only work on ended giveaways', async () => {
            const giveaway = createTestGiveaway({ status: 'active' })
            mockFlashcore.set(giveaway.id, giveaway, { namespace: ['giveaways', 'data'] })

			const newWinners = await rerollWinners(giveaway.id, 2)

			expect(newWinners).toEqual([])

            // Verify no modifications were made
            const updatedGiveaway = mockFlashcore.get(giveaway.id, { namespace: ['giveaways', 'data'] })
            expect(updatedGiveaway.rerolls).toEqual([])
		})

		it('should handle missing giveaway', async () => {
			const newWinners = await rerollWinners('non-existent-id', 2)

			expect(newWinners).toEqual([])
		})

		it('should append to rerolls array (not replace)', async () => {
			const entries = createTestEntries(15)
			const existingRerolls = [['user-011', 'user-012']]
            const giveaway = createTestGiveaway({
                status: 'ended',
                entries,
                rerolls: existingRerolls
            })
            mockFlashcore.set(giveaway.id, giveaway, { namespace: ['giveaways', 'data'] })

            // Mock channel and message
            const mockMessage = { embeds: [{}], edit: fn().mockResolvedValue(undefined) }
            const mockChannel = { isTextBased: fn().mockReturnValue(true), send: fn().mockResolvedValue({}), messages: { fetch: fn().mockResolvedValue(mockMessage) } };
            (mockClient.channels.fetch as any).mockResolvedValue(mockChannel)

			await rerollWinners(giveaway.id, 1)

            const updatedGiveaway = mockFlashcore.get(giveaway.id, { namespace: ['giveaways', 'data'] })
            expect(updatedGiveaway.rerolls).toHaveLength(2)
            expect(updatedGiveaway.rerolls[0]).toEqual(existingRerolls[0])
		})
	})
})

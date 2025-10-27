/**
 * Factory functions for generating test data objects
 * Provides sensible defaults with easy customization
 */

import type { Giveaway, GuildSettings } from 'types/giveaway.js'
import { DEFAULT_SETTINGS } from 'types/giveaway.js'

/**
 * Deep partial type for nested objects
 */
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

/**
 * ====================
 * COUNTERS
 * ====================
 */

let giveawayCounter = 0
let userCounter = 0

/**
 * Resets all factory counters
 */
export function resetFactoryCounters(): void {
  giveawayCounter = 0
  userCounter = 0
}

/**
 * ====================
 * GIVEAWAY FACTORY
 * ====================
 */

/**
 * Creates a test Giveaway object with sensible defaults
 *
 * @example
 * const giveaway = createTestGiveaway({
 *   prize: 'Nitro',
 *   winnersCount: 3,
 *   entries: { 'user-001': 1, 'user-002': 1 }
 * })
 */
export function createTestGiveaway(overrides: Partial<Giveaway> = {}): Giveaway {
  giveawayCounter++
  const id = overrides.id || `test-giveaway-${String(giveawayCounter).padStart(3, '0')}`

  const defaults: Giveaway = {
    id,
    guildId: 'test-guild-123',
    channelId: 'test-channel-456',
    messageId: 'test-message-789',
    prize: 'Test Prize',
    winnersCount: 1,
    endsAt: Date.now() + 3600000, // 1 hour from now
    startedBy: 'test-user-001',
    status: 'active',
    allowRoleIds: [],
    denyRoleIds: [],
    minAccountAgeDays: null,
    entries: {},
    winners: [],
    rerolls: [],
    createdAt: Date.now(),
    finalizedAt: null,
    cronJobId: null
  }

  // Deep merge for nested properties
  return {
    ...defaults,
    ...overrides,
    entries: {
      ...defaults.entries,
      ...(overrides.entries || {})
    },
    winners: overrides.winners || defaults.winners,
    rerolls: overrides.rerolls || defaults.rerolls,
    allowRoleIds: overrides.allowRoleIds || defaults.allowRoleIds,
    denyRoleIds: overrides.denyRoleIds || defaults.denyRoleIds
  }
}

/**
 * Creates multiple test giveaways at once
 *
 * @example
 * const giveaways = createTestGiveaways(3, { guildId: 'my-guild' })
 */
export function createTestGiveaways(count: number, baseOverrides: Partial<Giveaway> = {}): Giveaway[] {
  return Array.from({ length: count }, (_, index) => {
    return createTestGiveaway({
      ...baseOverrides,
      prize: `Test Prize ${index + 1}`
    })
  })
}

/**
 * ====================
 * GUILD SETTINGS FACTORY
 * ====================
 */

/**
 * Creates test GuildSettings with values from DEFAULT_SETTINGS
 *
 * @example
 * const settings = createTestGuildSettings({
 *   defaults: { winners: 5, duration: '12h' }
 * })
 */
export function createTestGuildSettings(overrides: DeepPartial<GuildSettings> = {}): GuildSettings {
  // Deep clone DEFAULT_SETTINGS to avoid mutation
  const defaults: GuildSettings = {
    defaults: {
      winners: DEFAULT_SETTINGS.defaults.winners,
      duration: DEFAULT_SETTINGS.defaults.duration,
      buttonLabel: DEFAULT_SETTINGS.defaults.buttonLabel,
      dmWinners: DEFAULT_SETTINGS.defaults.dmWinners
    },
    limits: {
      maxWinners: DEFAULT_SETTINGS.limits.maxWinners,
      maxDurationDays: DEFAULT_SETTINGS.limits.maxDurationDays
    },
    restrictions: {
      allowRoleIds: [...DEFAULT_SETTINGS.restrictions.allowRoleIds],
      denyRoleIds: [...DEFAULT_SETTINGS.restrictions.denyRoleIds],
      minAccountAgeDays: DEFAULT_SETTINGS.restrictions.minAccountAgeDays
    }
  }

  // Deep merge nested properties
  return {
    defaults: {
      ...defaults.defaults,
      ...(overrides.defaults || {})
    },
    limits: {
      ...defaults.limits,
      ...(overrides.limits || {})
    },
    restrictions: {
      ...defaults.restrictions,
      ...(overrides.restrictions || {}),
      allowRoleIds: (overrides.restrictions?.allowRoleIds ?? defaults.restrictions.allowRoleIds) as string[],
      denyRoleIds: (overrides.restrictions?.denyRoleIds ?? defaults.restrictions.denyRoleIds) as string[]
    }
  }
}

/**
 * ====================
 * ENTRY COLLECTION FACTORY
 * ====================
 */

/**
 * Creates a collection of giveaway entries
 *
 * @example
 * const entries = createTestEntries(10) // 10 users with 1 entry each
 * const entries = createTestEntries(5, 'special-user') // 5 users with custom prefix
 */
export function createTestEntries(count: number, userIdPrefix: string = 'user'): Record<string, number> {
  const entries: Record<string, number> = {}

  for (let i = 0; i < count; i++) {
    const userId = `${userIdPrefix}-${String(i + 1).padStart(3, '0')}`
    entries[userId] = 1
  }

  return entries
}

/**
 * Creates entries with variable entry counts
 *
 * @example
 * const entries = createTestEntriesWithCounts([
 *   ['user-001', 5],
 *   ['user-002', 3],
 *   ['user-003', 1]
 * ])
 */
export function createTestEntriesWithCounts(userEntries: Array<[string, number]>): Record<string, number> {
  const entries: Record<string, number> = {}

  for (const [userId, count] of userEntries) {
    entries[userId] = count
  }

  return entries
}

/**
 * ====================
 * WINNER ARRAY FACTORY
 * ====================
 */

/**
 * Creates an array of winner user IDs
 *
 * @example
 * const winners = createTestWinners(3) // ['winner-001', 'winner-002', 'winner-003']
 * const winners = createTestWinners(2, 'user') // ['user-001', 'user-002']
 */
export function createTestWinners(count: number, userIdPrefix: string = 'winner'): string[] {
  return Array.from({ length: count }, (_, i) => {
    return `${userIdPrefix}-${String(i + 1).padStart(3, '0')}`
  })
}

/**
 * Creates winners from an existing entries object
 * Randomly selects winners from the entries
 *
 * @example
 * const entries = createTestEntries(10)
 * const winners = createTestWinnersFromEntries(entries, 3)
 */
export function createTestWinnersFromEntries(entries: Record<string, number>, count: number): string[] {
  const userIds = Object.keys(entries)

  if (userIds.length === 0) return []
  if (count >= userIds.length) return [...userIds]

  // Shuffle and take first N
  const shuffled = [...userIds].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count)
}

/**
 * ====================
 * REROLL HISTORY FACTORY
 * ====================
 */

/**
 * Creates reroll history (array of winner arrays)
 *
 * @example
 * const rerolls = createTestRerolls(2, 3) // 2 rerolls, 3 winners each
 * // [
 * //   ['reroll-001', 'reroll-002', 'reroll-003'],
 * //   ['reroll-004', 'reroll-005', 'reroll-006']
 * // ]
 */
export function createTestRerolls(batchCount: number, winnersPerBatch: number, userIdPrefix: string = 'reroll'): string[][] {
  const rerolls: string[][] = []
  let userOffset = 0

  for (let i = 0; i < batchCount; i++) {
    const batch: string[] = []
    for (let j = 0; j < winnersPerBatch; j++) {
      userOffset++
      batch.push(`${userIdPrefix}-${String(userOffset).padStart(3, '0')}`)
    }
    rerolls.push(batch)
  }

  return rerolls
}

/**
 * Creates rerolls from existing entries, excluding previous winners
 *
 * @example
 * const entries = createTestEntries(20)
 * const originalWinners = ['user-001', 'user-002']
 * const rerolls = createTestRerollsFromEntries(entries, originalWinners, 2, 2)
 */
export function createTestRerollsFromEntries(
  entries: Record<string, number>,
  previousWinners: string[],
  batchCount: number,
  winnersPerBatch: number
): string[][] {
  const rerolls: string[][] = []
  const allWinners = new Set(previousWinners)
  const availableUsers = Object.keys(entries).filter(id => !allWinners.has(id))

  let userIndex = 0

  for (let i = 0; i < batchCount; i++) {
    const batch: string[] = []

    for (let j = 0; j < winnersPerBatch && userIndex < availableUsers.length; j++) {
      const winner = availableUsers[userIndex]
      batch.push(winner)
      allWinners.add(winner)
      userIndex++
    }

    if (batch.length > 0) {
      rerolls.push(batch)
    }
  }

  return rerolls
}

/**
 * ====================
 * USER ID FACTORY
 * ====================
 */

/**
 * Generates a test user ID (Discord snowflake format)
 *
 * @example
 * const userId = createTestUserId() // 'test-user-001'
 * const userId = createTestUserId('custom') // 'custom-user-001'
 */
export function createTestUserId(prefix: string = 'test'): string {
  userCounter++
  return `${prefix}-user-${String(userCounter).padStart(3, '0')}`
}

/**
 * Generates multiple test user IDs
 *
 * @example
 * const userIds = createTestUserIds(5) // ['test-user-001', 'test-user-002', ...]
 */
export function createTestUserIds(count: number, prefix: string = 'test'): string[] {
  return Array.from({ length: count }, () => createTestUserId(prefix))
}

/**
 * ====================
 * DISCORD SNOWFLAKE FACTORY
 * ====================
 */

/**
 * Generates a realistic Discord snowflake ID
 *
 * @example
 * const snowflake = createTestSnowflake() // '1234567890123456789'
 */
export function createTestSnowflake(timestamp: number = Date.now()): string {
  // Discord epoch: 2015-01-01
  const DISCORD_EPOCH = 1420070400000
  const timestampPart = timestamp - DISCORD_EPOCH

  // Simple snowflake generation (not cryptographically accurate, just for testing)
  const snowflake = (BigInt(timestampPart) << 22n) | BigInt(Math.floor(Math.random() * 4194304))
  return snowflake.toString()
}

/**
 * Generates multiple test snowflakes
 */
export function createTestSnowflakes(count: number, baseTimestamp: number = Date.now()): string[] {
  return Array.from({ length: count }, (_, i) => {
    // Stagger timestamps by 1 second each
    return createTestSnowflake(baseTimestamp + i * 1000)
  })
}

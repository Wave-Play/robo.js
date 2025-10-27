/**
 * Utility functions for common test operations
 * Provides helpers for time manipulation, Flashcore operations, and assertions
 */

import { jest } from '@jest/globals'
import type { Giveaway } from 'types/giveaway.js'
import type { ButtonInteraction, CommandInteraction } from 'discord.js'
import {
  mockFlashcore,
  mockClient,
  mockCron,
  clearFlashcoreStorage,
  resetUlidCounter,
  clearCronJobs,
  resetAllMocks,
  createMockButtonInteraction,
  createMockInteraction
} from './mocks.js'

/**
 * ====================
 * TIME MANIPULATION
 * ====================
 */

/**
 * Advances Jest fake timers by the specified milliseconds
 *
 * @example
 * jest.useFakeTimers()
 * await advanceTime(3600000) // Advance by 1 hour
 */
export async function advanceTime(ms: number): Promise<void> {
  jest.advanceTimersByTime(ms)
  // Allow pending promises to resolve
  await Promise.resolve()
}

/**
 * Advances timers to a specific timestamp
 *
 * @example
 * await advanceToTime(Date.now() + 7200000) // Advance to 2 hours from now
 */
export async function advanceToTime(timestamp: number): Promise<void> {
  const now = Date.now()
  const diff = timestamp - now

  if (diff > 0) {
    await advanceTime(diff)
  }
}

/**
 * Sets the system time to a specific timestamp
 *
 * @example
 * setSystemTime(new Date('2025-01-01').getTime())
 */
export function setSystemTime(timestamp: number): void {
  jest.setSystemTime(timestamp)
}

/**
 * Resets timers to real time
 *
 * @example
 * resetTime()
 */
export function resetTime(): void {
  jest.useRealTimers()
}

/**
 * ====================
 * FLASHCORE HELPERS
 * ====================
 */

/**
 * Seeds Flashcore with test data
 *
 * @example
 * seedFlashcore({
 *   'giveaways:active:giveaway-001': giveaway,
 *   'giveaways:settings:guild-123': settings
 * })
 */
export function seedFlashcore(data: Record<string, any>): void {
  for (const [key, value] of Object.entries(data)) {
    const parts = key.split(':')
    const dataKey = parts[parts.length - 1]
    const namespace = parts.slice(0, -1)
    mockFlashcore.set(dataKey, value, { namespace })
  }
}

/**
 * Gets a value from Flashcore using namespace
 *
 * @example
 * const giveaway = getFlashcoreValue(['giveaways', 'active', 'giveaway-001'])
 */
export function getFlashcoreValue(namespace: string[], defaultValue?: any): any {
  const key = namespace[namespace.length - 1]
  const ns = namespace.slice(0, -1)
  return mockFlashcore.get(key, { namespace: ns }) ?? defaultValue
}

/**
 * Checks if Flashcore contains a specific value at namespace
 *
 * @example
 * expect(expectFlashcoreToContain(['giveaways', 'active', 'giveaway-001'])).toBe(true)
 */
export function expectFlashcoreToContain(namespace: string[]): boolean {
  const key = namespace[namespace.length - 1]
  const ns = namespace.slice(0, -1)
  const storage = mockFlashcore.get(key, { namespace: ns })
  return storage !== undefined
}

/**
 * Gets all giveaways from Flashcore storage
 *
 * @example
 * const activeGiveaways = getAllGiveaways('active')
 */
export function getAllGiveaways(status?: 'active' | 'ended' | 'cancelled'): Giveaway[] {
  // This function is not compatible with the new Flashcore API structure
  // which requires a specific key. Return empty array for now.
  // If needed, this would require iterating the internal flashcoreStorage map
  return []
}

/**
 * Saves a giveaway to Flashcore
 *
 * @example
 * saveGiveaway(giveaway)
 */
export function saveGiveaway(giveaway: Giveaway): void {
  mockFlashcore.set(giveaway.id, giveaway, { namespace: ['giveaways', giveaway.status] })
}

/**
 * Deletes a giveaway from Flashcore
 *
 * @example
 * deleteGiveaway('giveaway-001', 'active')
 */
export function deleteGiveaway(giveawayId: string, status: 'active' | 'ended' | 'cancelled'): void {
  mockFlashcore.delete(giveawayId, { namespace: ['giveaways', status] })
}

/**
 * ====================
 * DISCORD INTERACTION HELPERS
 * ====================
 */

/**
 * Simulates a button click interaction
 *
 * @example
 * const response = await simulateButtonClick('giveaway-001', 'enter', mockUser)
 */
export function simulateButtonClick(
  giveawayId: string,
  action: 'enter' | 'leave',
  overrides: Partial<ButtonInteraction> = {}
): ButtonInteraction {
  const customId = `giveaway_${action}_${giveawayId}`
  return createMockButtonInteraction(customId, overrides)
}

/**
 * Simulates a command interaction
 *
 * @example
 * const interaction = simulateCommand('giveaway', {
 *   prize: 'Discord Nitro',
 *   winners: 1,
 *   duration: '1h'
 * })
 */
export function simulateCommand(
  commandName: string,
  options: Record<string, any> = {},
  overrides: Partial<CommandInteraction> = {}
): CommandInteraction {
  const interaction = createMockInteraction({
    commandName,
    ...overrides
  })

  // Configure option getters
  const interactionAny = interaction as any
  if (interactionAny.options) {
    interactionAny.options.getString = jest.fn((key: string) => {
      const value = options[key]
      return typeof value === 'string' ? value : null
    })

    interactionAny.options.getInteger = jest.fn((key: string) => {
      const value = options[key]
      return typeof value === 'number' ? value : null
    })

    interactionAny.options.getBoolean = jest.fn((key: string) => {
      const value = options[key]
      return typeof value === 'boolean' ? value : null
    })

    interactionAny.options.getUser = jest.fn((key: string) => {
      return options[key] || null
    })

    interactionAny.options.getRole = jest.fn((key: string) => {
      return options[key] || null
    })

    interactionAny.options.getChannel = jest.fn((key: string) => {
      return options[key] || null
    })
  }

  return interaction
}

/**
 * ====================
 * ASSERTION HELPERS
 * ====================
 */

/**
 * Asserts that a giveaway has a specific status
 *
 * @example
 * expectGiveawayStatus('giveaway-001', 'ended')
 */
export function expectGiveawayStatus(giveawayId: string, expectedStatus: 'active' | 'ended' | 'cancelled'): void {
  const giveaway = getFlashcoreValue(['giveaways', expectedStatus, giveawayId])
  expect(giveaway).toBeDefined()
  expect(giveaway.status).toBe(expectedStatus)
}

/**
 * Asserts that a user has entered a giveaway
 *
 * @example
 * expectUserEntered('giveaway-001', 'user-123', 'active')
 */
export function expectUserEntered(giveawayId: string, userId: string, status: string = 'active'): void {
  const giveaway = getFlashcoreValue(['giveaways', status, giveawayId])
  expect(giveaway).toBeDefined()
  expect(giveaway.entries).toHaveProperty(userId)
}

/**
 * Asserts that a user has NOT entered a giveaway
 *
 * @example
 * expectUserNotEntered('giveaway-001', 'user-123')
 */
export function expectUserNotEntered(giveawayId: string, userId: string, status: string = 'active'): void {
  const giveaway = getFlashcoreValue(['giveaways', status, giveawayId])
  expect(giveaway).toBeDefined()
  expect(giveaway.entries).not.toHaveProperty(userId)
}

/**
 * Asserts that winners have been selected
 *
 * @example
 * expectWinnersSelected('giveaway-001', 3)
 */
export function expectWinnersSelected(giveawayId: string, expectedCount: number, status: string = 'ended'): void {
  const giveaway = getFlashcoreValue(['giveaways', status, giveawayId])
  expect(giveaway).toBeDefined()
  expect(giveaway.winners).toHaveLength(expectedCount)
  expect(giveaway.finalizedAt).not.toBeNull()
}

/**
 * Asserts that a giveaway has specific entry count
 *
 * @example
 * expectEntryCount('giveaway-001', 10)
 */
export function expectEntryCount(giveawayId: string, expectedCount: number, status: string = 'active'): void {
  const giveaway = getFlashcoreValue(['giveaways', status, giveawayId])
  expect(giveaway).toBeDefined()
  expect(Object.keys(giveaway.entries)).toHaveLength(expectedCount)
}

/**
 * Asserts that an interaction was replied to
 *
 * @example
 * expectInteractionReplied(interaction)
 */
export function expectInteractionReplied(interaction: CommandInteraction | ButtonInteraction): void {
  expect(interaction.reply).toHaveBeenCalled()
}

/**
 * Asserts that an interaction was deferred
 *
 * @example
 * expectInteractionDeferred(interaction)
 */
export function expectInteractionDeferred(interaction: CommandInteraction | ButtonInteraction): void {
  expect(interaction.deferReply).toHaveBeenCalled()
}

/**
 * ====================
 * SETUP/TEARDOWN HELPERS
 * ====================
 */

/**
 * Sets up the test environment
 * Call this in beforeEach hooks
 *
 * @example
 * beforeEach(() => {
 *   setupTestEnvironment()
 * })
 */
export function setupTestEnvironment(): void {
  // Clear all mocks and storage
  resetAllMocks()

  // Don't automatically set up fake timers - let individual tests do it if needed
  // jest.useFakeTimers()
}

/**
 * Cleans up the test environment
 * Call this in afterEach hooks
 *
 * @example
 * afterEach(() => {
 *   cleanupTestEnvironment()
 * })
 */
export function cleanupTestEnvironment(): void {
  // Clear all storage
  clearFlashcoreStorage()
  resetUlidCounter()
  clearCronJobs()

  // Clear all mocks
  jest.clearAllMocks()

  // Restore real timers if they were faked
  // jest.useRealTimers()
}

/**
 * Sets up a basic test environment with common mocks configured
 * Includes default Flashcore behavior and client setup
 *
 * @example
 * beforeEach(() => {
 *   setupBasicTestEnvironment({
 *     giveaways: [giveaway1, giveaway2],
 *     settings: { 'guild-123': settings }
 *   })
 * })
 */
export interface BasicTestEnvironmentOptions {
  giveaways?: Giveaway[]
  settings?: Record<string, any>
  currentTime?: number
}

export function setupBasicTestEnvironment(options: BasicTestEnvironmentOptions = {}): void {
  setupTestEnvironment()

  // Set current time if provided
  if (options.currentTime) {
    setSystemTime(options.currentTime)
  }

  // Seed giveaways
  if (options.giveaways) {
    for (const giveaway of options.giveaways) {
      saveGiveaway(giveaway)
    }
  }

  // Seed settings
  if (options.settings) {
    for (const [guildId, settings] of Object.entries(options.settings)) {
      mockFlashcore.set(guildId, settings, { namespace: ['giveaways', 'settings'] })
    }
  }
}

/**
 * ====================
 * WAIT HELPERS
 * ====================
 */

/**
 * Checks if Jest fake timers are currently active
 */
function areFakeTimersActive(): boolean {
  // Jest sets the global clock when fake timers are active
  return (globalThis as any).clock !== undefined
}

/**
 * Waits for a condition to be true
 *
 * NOTE: This helper uses real timers. Do not use with fake timers.
 * If you need to wait for a condition with fake timers, manually advance
 * timers and check the condition.
 *
 * @example
 * await waitFor(() => mockFunction.mock.calls.length > 0, 1000)
 */
export async function waitFor(condition: () => boolean, timeout: number = 5000): Promise<void> {
  if (areFakeTimersActive()) {
    throw new Error('waitFor() cannot be used with fake timers. Use advanceTime() and check conditions manually.')
  }

  const startTime = Date.now()

  while (!condition()) {
    if (Date.now() - startTime > timeout) {
      throw new Error('Timeout waiting for condition')
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}

/**
 * Waits for a specific number of milliseconds using real timers
 *
 * NOTE: This helper uses real timers and will NOT work with fake timers.
 * Use advanceTime() instead when fake timers are active.
 *
 * @example
 * await waitReal(1000) // Wait 1 second with real timers
 */
export async function waitReal(ms: number): Promise<void> {
  if (areFakeTimersActive()) {
    throw new Error('waitReal() cannot be used with fake timers. Use advanceTime() instead.')
  }
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Waits for a specific number of milliseconds by advancing fake timers
 *
 * NOTE: This helper requires fake timers to be active. If you need to wait
 * with real timers, use waitReal() instead.
 *
 * @example
 * jest.useFakeTimers()
 * await waitFake(1000) // Advance fake timers by 1 second
 */
export async function waitFake(ms: number): Promise<void> {
  if (!areFakeTimersActive()) {
    throw new Error('waitFake() requires fake timers to be active. Call jest.useFakeTimers() first or use waitReal() instead.')
  }
  await advanceTime(ms)
}

/**
 * Waits for a specific number of milliseconds, automatically detecting timer mode
 *
 * @deprecated Use waitReal() or waitFake() explicitly to avoid confusion
 * @example
 * await wait(1000) // Wait 1 second (auto-detects timer mode)
 */
export async function wait(ms: number): Promise<void> {
  if (areFakeTimersActive()) {
    await waitFake(ms)
  } else {
    await waitReal(ms)
  }
}

/**
 * Flushes all pending promises
 *
 * @example
 * await flushPromises()
 */
export async function flushPromises(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve))
}

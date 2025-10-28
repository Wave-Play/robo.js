/**
 * Command-focused test for /rank embed output with custom branding.
 * Mocks a minimal ChatInputCommandInteraction and asserts labels are applied.
 */

import { test, expect, beforeEach, afterEach, jest } from '@jest/globals'
import type { ChatInputCommandInteraction, Guild } from 'discord.js'
import { Flashcore } from 'robo.js'

// Use built APIs for XP and config to exercise real persistence and math
import { xp, config } from '../.robo/build/index.js'
import * as service from '../.robo/build/runtime/service.js'

// Import the rank command handler directly from source (returns CommandResult)
import rankCommand from '../src/commands/rank.js'

// =============================================================================
// Mock Flashcore (shared with other integration tests pattern)
// =============================================================================

let mockFlashcoreStore = new Map<string, unknown>()

const originalFlashcoreGet = Flashcore.get
const originalFlashcoreSet = Flashcore.set

function setupMockFlashcore() {
	mockFlashcoreStore.clear()

	Flashcore.get = jest.fn(async (key: string, options: any = {}) => {
		const namespace = options.namespace || ''
		const fullKey = namespace ? `${namespace}:${key}` : key
		return mockFlashcoreStore.get(fullKey)
	}) as any

	Flashcore.set = jest.fn(async (key: string, value: unknown, options: any = {}) => {
		const namespace = options.namespace || ''
		const fullKey = namespace ? `${namespace}:${key}` : key
		if (value === undefined) {
			mockFlashcoreStore.delete(fullKey)
		} else {
			mockFlashcoreStore.set(fullKey, value)
		}
	}) as any
}

function restoreFlashcore() {
	Flashcore.get = originalFlashcoreGet
	Flashcore.set = originalFlashcoreSet
	service.clearAllCaches()
	mockFlashcoreStore.clear()
}

beforeEach(() => {
	setupMockFlashcore()
})

afterEach(() => {
	restoreFlashcore()
})

// =============================================================================
// Helpers
// =============================================================================

function createInteractionMock(guildId: string, user: { id: string; username: string }): ChatInputCommandInteraction {
	// Minimal fields used by the command
	const interaction = {
		guildId,
		user: {
			id: user.id,
			username: user.username,
			bot: false,
			displayAvatarURL: () => 'https://example.com/avatar.png'
		},
		options: {
			getUser: (_name: string) => null // default to invoker
		},
		// Not needed for this test; multiplier calc is skipped when guild is undefined
		guild: undefined as unknown as Guild
	} as unknown as ChatInputCommandInteraction

	return interaction
}

// =============================================================================
// Test
// =============================================================================

test('rank command uses custom label in embed fields', async () => {
	const guildId = 'rank-guild-1'
	const userId = 'rank-user-1'

	// Configure custom label
	await config.set(guildId, { labels: { xpDisplayName: 'Reputation' } } as any)

	// Give the user some XP so /rank has data to render
	await xp.add(guildId, userId, 1_500)

	// Execute command with minimal interaction
	const interaction = createInteractionMock(guildId, { id: userId, username: 'Tester' })
	const result = (await rankCommand(interaction)) as any

	expect(result.embeds?.length).toBeGreaterThan(0)
	const embed: any = result.embeds![0]
	const api = typeof embed.toJSON === 'function' ? embed.toJSON() : embed.data

	expect(api?.fields?.length).toBeGreaterThan(0)
	const fields: Array<{ name: string; value: string }> = api.fields

	// Assert there is no raw 'XP' field name
	expect(fields.some((f) => f.name === 'XP')).toBe(false)

	// Assert main value field uses custom label name and value formatting
	const mainLabelField = fields.find((f) => f.name === 'Reputation')
	expect(mainLabelField).toBeDefined()
	expect(mainLabelField!.value).toContain('Reputation')

	// Assert the progress-in-level field name is customized
	expect(fields.some((f) => f.name === 'Reputation in Level')).toBe(true)

	// Assert the "Next Level" field value includes the custom label
	const nextLevelField = fields.find((f) => f.name === 'Next Level')
	expect(nextLevelField).toBeDefined()
	expect(nextLevelField!.value).toContain('Reputation')
})

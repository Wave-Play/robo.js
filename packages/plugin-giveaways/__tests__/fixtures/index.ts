/**
 * Fixture data for testing
 * Provides pre-configured test data for giveaways, settings, and users
 */

import type { Giveaway, GuildSettings } from 'types/giveaway.js'

// Import fixture data
import giveawaysData from './giveaways.json' assert { type: 'json' }
import settingsData from './settings.json' assert { type: 'json' }
import usersData from './users.json' assert { type: 'json' }

/**
 * Sample giveaway scenarios for testing
 *
 * Available fixtures:
 * - activeNoEntries: Active giveaway with no participants
 * - activeMultipleEntries: Active giveaway with 8 participants
 * - activeWithRoleRestrictions: Active giveaway restricted to specific roles
 * - activeWithAccountAge: Active giveaway with minimum account age requirement
 * - endedWithWinners: Completed giveaway with selected winners
 * - endedNoWinners: Completed giveaway with insufficient participants
 * - endedWithRerolls: Completed giveaway with reroll history
 * - cancelled: Cancelled giveaway
 * - longDuration: Giveaway lasting longer than 24.8 days (tests setTimeout limits)
 * - expired: Giveaway that has passed its end time but hasn't been finalized
 */
export const giveaways = giveawaysData as Record<string, Giveaway>

/**
 * Sample guild settings configurations for testing
 *
 * Available fixtures:
 * - defaultSettings: Standard default settings
 * - customDefaults: Modified default values
 * - restrictiveSettings: Low limits and strict restrictions
 * - permissiveSettings: High limits and relaxed restrictions
 * - withAllowedRoles: Settings with role whitelist
 * - withDeniedRoles: Settings with role blacklist
 * - withMinAccountAge: Settings with account age requirement
 * - noDmWinners: Settings with DM notifications disabled
 * - strictRestrictions: Combination of multiple restrictions
 * - communityGiveaway: Settings for large community events
 */
export const settings = settingsData as Record<string, GuildSettings>

/**
 * Sample user data for testing eligibility and restrictions
 *
 * User profiles include:
 * - Users with various role combinations
 * - Users with different account ages
 * - Users at boundary ages (exactly 7, 30, 60, 90 days old)
 * - Very new accounts (created within last week)
 * - Very old accounts (created 2+ years ago)
 * - Users with admin/moderator roles
 * - Users with restricted roles
 * - Users with no roles
 *
 * Each user has: id, username, createdTimestamp, roles[]
 */
export interface FixtureUser {
  id: string
  username: string
  createdTimestamp: number
  roles: string[]
}

export const users = usersData as FixtureUser[]

/**
 * Helper to get a specific giveaway by key
 * Returns a deep clone to prevent cross-test mutation
 */
export function getGiveaway(key: keyof typeof giveawaysData): Giveaway {
  return JSON.parse(JSON.stringify(giveaways[key]))
}

/**
 * Helper to get specific settings by key
 * Returns a deep clone to prevent cross-test mutation
 */
export function getSettings(key: keyof typeof settingsData): GuildSettings {
  return JSON.parse(JSON.stringify(settings[key]))
}

/**
 * Helper to get a user by username
 */
export function getUserByUsername(username: string): FixtureUser | undefined {
  return users.find(u => u.username === username)
}

/**
 * Helper to get a user by ID
 */
export function getUserById(id: string): FixtureUser | undefined {
  return users.find(u => u.id === id)
}

/**
 * Helper to get users with specific roles
 */
export function getUsersWithRole(roleId: string): FixtureUser[] {
  return users.filter(u => u.roles.includes(roleId))
}

/**
 * Helper to get users by account age
 */
export function getUsersByAccountAge(minDays: number, referenceTime: number = Date.now()): FixtureUser[] {
  const minTimestamp = referenceTime - (minDays * 24 * 60 * 60 * 1000)
  return users.filter(u => u.createdTimestamp <= minTimestamp)
}

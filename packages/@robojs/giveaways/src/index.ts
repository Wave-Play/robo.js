/**
 * Imperative helpers for managing giveaway configuration programmatically.
 *
 * These utilities expose read/write access to guild-scoped giveaway settings,
 * enabling dashboards or external services to stay in sync with the bot's
 * Flashcore-backed configuration.
 */
import { Flashcore } from 'robo.js'
import type { GuildSettings } from './types/giveaway.js'
import { DEFAULT_SETTINGS } from './types/giveaway.js'
import { guildSettingsNamespace } from './core/namespaces.js'

/**
 * Resolve the persisted giveaway settings for a Discord guild.
 *
 * Defaults are applied automatically when a guild has not stored any custom
 * settings yet, ensuring downstream consumers always receive a complete
 * {@link GuildSettings} object.
 *
 * @param guildId - Discord guild ID to load settings for.
 * @returns Promise that resolves to the guild's configured giveaway settings.
 * @example
 * const settings = await getGuildSettings('123456789012345678')
 * console.log(settings.defaults.winners)
 */
export async function getGuildSettings(guildId: string): Promise<GuildSettings> {
  return (
    (await Flashcore.get<GuildSettings>('data', { namespace: guildSettingsNamespace(guildId) })) ||
    DEFAULT_SETTINGS
  )
}

/**
 * Persist custom giveaway settings for a Discord guild.
 *
 * This overwrites the guild's stored configuration, replacing the default
 * values provided by {@link DEFAULT_SETTINGS}. Values are stored in
 * Flashcore under a deterministic namespace keyed by the guild ID.
 *
 * @param guildId - Discord guild ID whose settings should be updated.
 * @param settings - Complete {@link GuildSettings} object to persist.
 * @returns Promise that resolves once the settings have been written.
 * @example
 * await setGuildSettings('123456789012345678', {
 *   defaults: { winners: 2, duration: '2h', buttonLabel: 'Join', dmWinners: true },
 *   limits: { maxWinners: 10, maxDurationDays: 14 },
 *   restrictions: { allowRoleIds: [], denyRoleIds: [], minAccountAgeDays: null }
 * })
 */
export async function setGuildSettings(guildId: string, settings: GuildSettings): Promise<void> {
  await Flashcore.set('data', settings, { namespace: guildSettingsNamespace(guildId) })
}

export type { Giveaway, GuildSettings } from './types/giveaway.js'

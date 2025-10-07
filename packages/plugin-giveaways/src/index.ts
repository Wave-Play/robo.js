import { Flashcore } from 'robo.js'
import type { GuildSettings } from './types/giveaway.js'
import { DEFAULT_SETTINGS } from './types/giveaway.js'

export async function getGuildSettings(guildId: string): Promise<GuildSettings> {
  return await Flashcore.get<GuildSettings>(`guild:${guildId}:settings`) || DEFAULT_SETTINGS
}

export async function setGuildSettings(guildId: string, settings: GuildSettings): Promise<void> {
  await Flashcore.set(`guild:${guildId}:settings`, settings)
}

export type { Giveaway, GuildSettings } from './types/giveaway.js'

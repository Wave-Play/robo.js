import { Flashcore } from 'robo.js'
import type { GuildSettings } from '../../../types/giveaway.js'
import { DEFAULT_SETTINGS } from '../../../types/giveaway.js'

interface RequestParams {
  params: {
    guildId: string
  }
}

export default async (request: RequestParams) => {
  const { guildId } = request.params

  const settings = await Flashcore.get<GuildSettings>(`guild:${guildId}:settings`) || DEFAULT_SETTINGS

  return settings
}

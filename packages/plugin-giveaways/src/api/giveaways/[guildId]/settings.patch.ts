import { Flashcore } from 'robo.js'
import type { GuildSettings } from '../../../types/giveaway.js'

interface RequestParams {
  params: {
    guildId: string
  }
  body: GuildSettings
}

export default async (request: RequestParams) => {
  const { guildId } = request.params
  const newSettings = request.body

  await Flashcore.set(`guild:${guildId}:settings`, newSettings)

  return { success: true, settings: newSettings }
}

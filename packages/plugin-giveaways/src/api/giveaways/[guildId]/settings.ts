import { Flashcore } from 'robo.js'
import type { GuildSettings } from '../../../types/giveaway'
import { DEFAULT_SETTINGS } from '../../../types/giveaway'

export default async (request: any, reply: any) => {
  const { guildId } = request.params

  // Handle GET request - Fetch guild settings
  if (request.method === 'GET') {
    const settings = await Flashcore.get<GuildSettings>(`guild:${guildId}:settings`) || DEFAULT_SETTINGS
    return settings
  }

  // Handle PATCH request - Update guild settings
  if (request.method === 'PATCH') {
    const newSettings = await request.json()
    await Flashcore.set(`guild:${guildId}:settings`, newSettings)
    return { success: true, settings: newSettings }
  }

  // Unsupported HTTP method
  throw new Error('Method not allowed')
}

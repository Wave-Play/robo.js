import { Flashcore } from 'robo.js'
import type { Giveaway } from '../../../types/giveaway.js'

interface RequestParams {
  params: {
    guildId: string
  }
}

export default async (request: RequestParams) => {
  const { guildId } = request.params

  const activeIds = (await Flashcore.get<string[]>(`guild:${guildId}:active`)) || []
  const recentIds = (await Flashcore.get<string[]>(`guild:${guildId}:recent`)) || []

  const active = await Promise.all(
    activeIds.map(id => Flashcore.get<Giveaway>(`giveaway:${id}`))
  )

  const recent = await Promise.all(
    recentIds.slice(0, 20).map(id => Flashcore.get<Giveaway>(`giveaway:${id}`))
  )

  return {
    active: active.filter(Boolean),
    recent: recent.filter(Boolean)
  }
}

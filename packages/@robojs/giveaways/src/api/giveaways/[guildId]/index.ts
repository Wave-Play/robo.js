import { Flashcore } from 'robo.js'
import type { RoboRequest } from '@robojs/server'

const GIVEAWAY_DATA_NAMESPACE: string[] = ['giveaways', 'data']
const guildActiveNamespace = (guildId: string): string[] => [
  'giveaways',
  'guilds',
  guildId,
  'active'
]
const guildRecentNamespace = (guildId: string): string[] => [
  'giveaways',
  'guilds',
  guildId,
  'recent'
]

export default async (request: RoboRequest) => {
  const { guildId } = request.params

  const activeIds =
    (await Flashcore.get<string[]>('list', { namespace: guildActiveNamespace(guildId) })) || []
  const recentIds =
    (await Flashcore.get<string[]>('list', { namespace: guildRecentNamespace(guildId) })) || []

  const active = await Promise.all(
    activeIds.map(id => Flashcore.get(id, { namespace: GIVEAWAY_DATA_NAMESPACE }))
  )

  const recent = await Promise.all(
    recentIds.slice(0, 20).map(id => Flashcore.get(id, { namespace: GIVEAWAY_DATA_NAMESPACE }))
  )

  return {
    active: active.filter(Boolean),
    recent: recent.filter(Boolean)
  }
}

import { Flashcore } from 'robo.js'
import type { Giveaway } from '../../../types/giveaway.js'

interface RequestParams {
  params: {
    guildId: string
    id: string
  }
  body: {
    action: 'end' | 'cancel' | 'reroll'
    count?: number
  }
}

export default async (request: RequestParams) => {
  const { guildId, id } = request.params
  const { action, count } = request.body

  const giveaway = await Flashcore.get<Giveaway>(`giveaway:${id}`)

  if (!giveaway || giveaway.guildId !== guildId) {
    return { error: 'Giveaway not found' }
  }

  if (action === 'end') {
    const { endGiveaway } = await import('../../../utils/giveaway-utils.js')
    await endGiveaway(id)
    return { success: true }
  }

  if (action === 'cancel') {
    giveaway.status = 'cancelled'
    giveaway.finalizedAt = Date.now()
    await Flashcore.set(`giveaway:${id}`, giveaway)
    return { success: true }
  }

  if (action === 'reroll') {
    const { rerollWinners } = await import('../../../utils/giveaway-utils.js')
    const newWinners = await rerollWinners(id, count || giveaway.winnersCount)
    return { success: true, winners: newWinners }
  }

  return { error: 'Invalid action' }
}

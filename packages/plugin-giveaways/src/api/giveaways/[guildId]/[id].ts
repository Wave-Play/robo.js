import { Flashcore } from 'robo.js'
import type { Giveaway } from '../../../types/giveaway'

export default async (request: any, reply: any) => {
  const { guildId, id } = request.params

  // Handle GET request - Fetch single giveaway
  if (request.method === 'GET') {
    const giveaway = await Flashcore.get<Giveaway>(`giveaway:${id}`)
    
    if (!giveaway || giveaway.guildId !== guildId) {
      reply.code(404).send(JSON.stringify({ error: 'Giveaway not found' }))
      return
    }
    
    return giveaway
  }

  // Handle PATCH request - Modify giveaway (end, cancel, reroll)
  if (request.method === 'PATCH') {
    const body = await request.json()
    const { action, count } = body
    
    const giveaway = await Flashcore.get<Giveaway>(`giveaway:${id}`)

    if (!giveaway || giveaway.guildId !== guildId) {
      reply.code(404).send(JSON.stringify({ error: 'Giveaway not found' }))
      return
    }

    // Handle end action
    if (action === 'end') {
      const { endGiveaway } = await import('../../../utils/giveaway-utils')
      await endGiveaway(id)
      return { success: true }
    }

    // Handle cancel action
    if (action === 'cancel') {
      giveaway.status = 'cancelled'
      giveaway.finalizedAt = Date.now()
      await Flashcore.set(`giveaway:${id}`, giveaway)
      return { success: true }
    }

    // Handle reroll action
    if (action === 'reroll') {
      const { rerollWinners } = await import('../../../utils/giveaway-utils')
      const newWinners = await rerollWinners(id, count || giveaway.winnersCount)
      return { success: true, winners: newWinners }
    }

    return { error: 'Invalid action' }
  }

  // Unsupported HTTP method
  throw new Error('Method not allowed')
}

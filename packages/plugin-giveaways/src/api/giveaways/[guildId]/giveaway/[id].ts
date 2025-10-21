import { Flashcore } from 'robo.js'
import type { RoboRequest } from '@robojs/server'
import type { Giveaway } from '../../../../types/giveaway'

const GIVEAWAY_DATA_NAMESPACE: string[] = ['giveaways', 'data']
const guildActiveNamespace = (guildId: string): string[] => [
  'giveaways',
  'guilds',
  guildId,
  'active'
]

type PatchBody = {
  action: 'end' | 'cancel' | 'reroll'
  count?: number
}

export default async (request: RoboRequest) => {
  const { guildId, id } = request.params

  // Handle GET request - Fetch single giveaway
  if (request.method === 'GET') {
    const giveaway = await Flashcore.get<Giveaway>(id, { namespace: GIVEAWAY_DATA_NAMESPACE })

    if (!giveaway || giveaway.guildId !== guildId) {
      return { status: 404, error: 'Giveaway not found' }
    }

    return giveaway
  }

  // Handle PATCH request - Modify giveaway (end, cancel, reroll)
  if (request.method === 'PATCH') {
    let body: PatchBody
    try {
      body = (await request.json()) as PatchBody
    } catch (error) {
      return { status: 400, error: 'Invalid JSON body' }
    }

    const { action, count } = body || {}

    if (!action || !['end', 'cancel', 'reroll'].includes(action)) {
      return {
        status: 400,
        error: 'Invalid or missing action. Must be one of: end, cancel, reroll'
      }
    }

    if (action === 'reroll' && count !== undefined) {
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > 50) {
        return { status: 400, error: 'Reroll count must be between 1 and 50' }
      }
    }

    const giveaway = await Flashcore.get<Giveaway>(id, { namespace: GIVEAWAY_DATA_NAMESPACE })

    if (!giveaway || giveaway.guildId !== guildId) {
      return { status: 404, error: 'Giveaway not found' }
    }

    if (action === 'end' && (giveaway.status === 'ended' || giveaway.status === 'cancelled')) {
      return { status: 400, error: 'Giveaway has already ended or been cancelled' }
    }

    if (action === 'cancel' && giveaway.status !== 'active') {
      return { status: 400, error: 'Only active giveaways can be cancelled' }
    }

    if (action === 'reroll' && giveaway.status !== 'ended') {
      return { status: 400, error: 'Only ended giveaways can be rerolled' }
    }

    // Handle end action
    if (action === 'end') {
      try {
        const { endGiveaway } = await import('../../../../utils/giveaway-utils.js')
        await endGiveaway(id)
        return { success: true }
      } catch (error) {
        console.error('Failed to end giveaway', error)
        return {
          status: 500,
          error: 'Failed to perform action',
          details: error instanceof Error ? error.message : String(error)
        }
      }
    }

    // Handle cancel action
    if (action === 'cancel') {
      try {
        const { cancelScheduledJob } = await import('../../../../utils/scheduler.js')
        await cancelScheduledJob(id, giveaway.cronJobId)

        giveaway.status = 'cancelled'
        giveaway.finalizedAt = Date.now()
        await Flashcore.set(id, giveaway, { namespace: GIVEAWAY_DATA_NAMESPACE })

        // Remove from active list
        const activeIds =
          (await Flashcore.get<string[]>('list', { namespace: guildActiveNamespace(guildId) })) ||
          []
        const filtered = activeIds.filter(activeId => activeId !== id)
        await Flashcore.set('list', filtered, { namespace: guildActiveNamespace(guildId) })

        return { success: true }
      } catch (error) {
        console.error('Failed to cancel giveaway', error)
        return {
          status: 500,
          error: 'Failed to perform action',
          details: error instanceof Error ? error.message : String(error)
        }
      }
    }

    // Handle reroll action
    if (action === 'reroll') {
      try {
        const { rerollWinners } = await import('../../../../utils/giveaway-utils.js')
        const rerollCount = count ?? giveaway.winnersCount
        const newWinners = await rerollWinners(id, rerollCount)
        return { success: true, winners: newWinners }
      } catch (error) {
        console.error('Failed to reroll giveaway winners', error)
        return {
          status: 500,
          error: 'Failed to perform action',
          details: error instanceof Error ? error.message : String(error)
        }
      }
    }

    return { status: 400, error: 'Invalid action' }
  }

  // Unsupported HTTP method
  return { status: 405, error: 'Method not allowed' }
}

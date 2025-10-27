import { Flashcore } from 'robo.js'
import { giveawaysLogger } from '../core/logger.js'

export default async function endGiveawayCron(jobId: string) {
  if (!jobId) {
    giveawaysLogger.warn('⚠️  Cron job triggered without a job ID, skipping')
    return
  }

  const giveawayId = await Flashcore.get<string>(jobId, { namespace: ['giveaways', 'cron'] })

  if (!giveawayId) {
    giveawaysLogger.warn(`⚠️  No giveaway mapping found for cron job ${jobId}`)
    return
  }

  try {
    giveawaysLogger.debug(`⏰ Executing cron job ${jobId} for giveaway ${giveawayId}`)
    const { endGiveaway } = await import('../utils/giveaway-utils.js')
    await endGiveaway(giveawayId)
    await Flashcore.delete(jobId, { namespace: ['giveaways', 'cron'] })
    giveawaysLogger.debug(`✅ Completed cron job ${jobId} for giveaway ${giveawayId}`)
  } catch (error) {
    giveawaysLogger.error(`❌ Error ending giveaway ${giveawayId} for cron job ${jobId}:`, error)
  }
}

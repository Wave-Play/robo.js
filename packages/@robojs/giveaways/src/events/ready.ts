import { Flashcore } from 'robo.js'
import type { Client } from 'discord.js'
import type { Giveaway } from '../types/giveaway.js'
import { scheduleGiveawayEnd, initCron } from '../utils/scheduler.js'
import { giveawaysLogger } from '../core/logger.js'

type CronStatic = {
  (expression: string, job: string | (() => void)): { save(id?: string): Promise<string> }
  get(id: string): unknown
  remove(id: string): Promise<void>
}

const giveawayDataNamespace: string[] = ['giveaways', 'data']
const guildActiveNamespace = (guildId: string): string[] => [
  'giveaways',
  'guilds',
  guildId,
  'active'
]

export default async (client: Client) => {
  giveawaysLogger.debug('🔄 Recovering active giveaways...')

  // Initialize cron detection before recovery
  await initCron()

  // Runtime detection for @robojs/cron
  let Cron: CronStatic | null = null
  try {
    const cronModule = await import('@robojs/cron')
    Cron = cronModule.Cron
  } catch {
    // @robojs/cron not available
  }

  // Get all guilds
  const guilds = client.guilds.cache.map(g => g.id)

  for (const guildId of guilds) {
    try {
      const activeIds =
        (await Flashcore.get<string[]>('list', { namespace: guildActiveNamespace(guildId) })) || []

      giveawaysLogger.debug(`📋 Found ${activeIds.length} active giveaways in guild ${guildId}`)

      for (const giveawayId of activeIds) {
        const giveaway = await Flashcore.get<Giveaway>(giveawayId, {
          namespace: giveawayDataNamespace
        })

        if (!giveaway) {
          giveawaysLogger.warn(`⚠️  Giveaway ${giveawayId} not found, skipping...`)
          continue
        }

        // Skip if already ended
        if (giveaway.status !== 'active') {
          giveawaysLogger.debug(`⏭️  Giveaway ${giveawayId} is ${giveaway.status}, skipping...`)
          continue
        }

        // Check if should have ended
        if (giveaway.endsAt <= Date.now()) {
          giveawaysLogger.debug(`⏰ Giveaway ${giveawayId} should have ended, ending now...`)
          // End immediately
          const { endGiveaway } = await import('../utils/giveaway-utils.js')
          await endGiveaway(giveawayId)
        } else {
          // Check if cron job exists
          let needsRescheduling = true

          if (giveaway.cronJobId && Cron) {
            try {
              const existingJob = await Cron.get(giveaway.cronJobId)
              if (existingJob) {
                giveawaysLogger.debug(
                  `✅ Cron job ${giveaway.cronJobId} for giveaway ${giveawayId} still exists`
                )
                needsRescheduling = false
              }
            } catch {
              giveawaysLogger.warn(`⚠️  Cron job ${giveaway.cronJobId} not found, will reschedule`)
            }
          }

          if (needsRescheduling) {
            // Reschedule using scheduler
            const delay = giveaway.endsAt - Date.now()
            giveawaysLogger.debug(
              `⏱️  Rescheduling giveaway ${giveawayId} to end in ${Math.round(delay / 1000)}s`
            )

            const jobId = await scheduleGiveawayEnd(giveaway)

            // Update cronJobId if it changed
            if (jobId && jobId !== giveaway.cronJobId) {
              giveaway.cronJobId = jobId
              await Flashcore.set(giveawayId, giveaway, { namespace: giveawayDataNamespace })
            }
          }
        }
      }
    } catch (error) {
      giveawaysLogger.error(`❌ Error recovering giveaways for guild ${guildId}:`, error)
    }
  }

  giveawaysLogger.debug('✅ Giveaway recovery complete')
}

import { Flashcore } from 'robo.js'
import type { Client } from 'discord.js'
import type { Giveaway } from '../types/giveaway.js'
import { scheduleGiveawayEnd } from '../utils/scheduler.js'

export default async (client: Client) => {
  console.log(`✅ Bot logged in as ${client.user?.tag}`)
  console.log('🔄 Recovering active giveaways...')

  // Get all guilds
  const guilds = client.guilds.cache.map(g => g.id)

  for (const guildId of guilds) {
    try {
      const activeIds = (await Flashcore.get<string[]>(`guild:${guildId}:active`)) || []
      
      console.log(`📋 Found ${activeIds.length} active giveaways in guild ${guildId}`)
      
      for (const giveawayId of activeIds) {
        const giveaway = await Flashcore.get<Giveaway>(`giveaway:${giveawayId}`)
        
        if (!giveaway) {
          console.log(`⚠️  Giveaway ${giveawayId} not found, skipping...`)
          continue
        }

        // Skip if already ended
        if (giveaway.status !== 'active') {
          console.log(`⏭️  Giveaway ${giveawayId} is ${giveaway.status}, skipping...`)
          continue
        }

        // Check if should have ended
        if (giveaway.endsAt <= Date.now()) {
          console.log(`⏰ Giveaway ${giveawayId} should have ended, ending now...`)
          // End immediately
          const { endGiveaway } = await import('../utils/giveaway-utils.js')
          await endGiveaway(giveawayId)
        } else {
          // Reschedule using scheduler
          const delay = giveaway.endsAt - Date.now()
          console.log(`⏱️  Rescheduling giveaway ${giveawayId} to end in ${Math.round(delay / 1000)}s`)
          
          scheduleGiveawayEnd(giveaway)
        }
      }
    } catch (error) {
      console.error(`❌ Error recovering giveaways for guild ${guildId}:`, error)
    }
  }

  console.log('✅ Giveaway recovery complete')
}

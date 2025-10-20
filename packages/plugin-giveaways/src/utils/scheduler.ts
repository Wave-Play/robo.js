import type { Giveaway } from '../types/giveaway.js'

/**
 * Schedule a giveaway to end at its configured time
 * Uses setTimeout with automatic rescheduling for long durations
 */
export function scheduleGiveawayEnd(giveaway: Giveaway): void {
  const delay = giveaway.endsAt - Date.now()
  
  if (delay <= 0) {
    // Already expired, end immediately
    endGiveawayImmediately(giveaway.id)
    return
  }

  // setTimeout has a max value of ~24.8 days (2147483647ms)
  // For longer durations, we'll reschedule periodically
  const MAX_TIMEOUT = 2147483647
  const actualDelay = Math.min(delay, MAX_TIMEOUT)
  
  setTimeout(async () => {
    // Check if giveaway should end now or needs rescheduling
    const remainingTime = giveaway.endsAt - Date.now()
    
    if (remainingTime <= 0) {
      // Time's up - end the giveaway
      const { endGiveaway } = await import('./giveaway-utils.js')
      await endGiveaway(giveaway.id)
    } else {
      // Still time left - reschedule
      console.log(`⏱️  Rescheduling giveaway ${giveaway.id} (${Math.round(remainingTime / 1000)}s remaining)`)
      scheduleGiveawayEnd(giveaway)
    }
  }, actualDelay)
  
  const timeUntilEnd = Math.round(delay / 1000)
  console.log(`⏰ Scheduled giveaway ${giveaway.id} to end in ${timeUntilEnd}s`)
}

async function endGiveawayImmediately(giveawayId: string): Promise<void> {
  console.log(`⚡ Ending expired giveaway ${giveawayId} immediately`)
  const { endGiveaway } = await import('./giveaway-utils.js')
  await endGiveaway(giveawayId)
}

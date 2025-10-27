import { Flashcore } from 'robo.js'
import { EmbedBuilder, TextBasedChannel } from 'discord.js'
import type { TextChannel } from 'discord.js'
import { giveawaysLogger } from '../core/logger.js'
import type { Giveaway, GuildSettings } from '../types/giveaway.js'
import {
  GIVEAWAY_DATA_NAMESPACE,
  guildActiveNamespace,
  guildRecentNamespace,
  guildSettingsNamespace
} from '../core/namespaces.js'
import { RECENT_GIVEAWAYS_LIMIT } from '../core/constants.js'

/**
 * Finalize an active giveaway by selecting winners, persisting results, and
 * notifying participants.
 *
 * The implementation is idempotent: if the giveaway has already ended or been
 * cancelled the function resolves early without side effects. When the
 * giveaway is still active it marks the record as ended, updates the message,
 * moves the giveaway to the recent list, optionally DMs winners, and cleans up
 * any scheduled jobs.
 *
 * @param giveawayId - Unique identifier of the giveaway to finalize.
 * @returns Promise that resolves once the giveaway has been processed.
 * @example
 * await endGiveaway('01HQRS5F1GZ9J3YF7WXT7H2K2B')
 */
export async function endGiveaway(giveawayId: string) {
  const giveaway = await Flashcore.get<Giveaway>(giveawayId, { namespace: GIVEAWAY_DATA_NAMESPACE })

  if (!giveaway || giveaway.status !== 'active') {
    return // Already ended or cancelled
  }

  // Select winners
  const winners = selectWinners(giveaway.entries, giveaway.winnersCount)

  // Update giveaway
  giveaway.status = 'ended'
  giveaway.winners = winners
  giveaway.finalizedAt = Date.now()
  await Flashcore.set(giveawayId, giveaway, { namespace: GIVEAWAY_DATA_NAMESPACE })

  // Update message
  await updateGiveawayMessage(giveaway, winners)

  // Move to recent
  const activeIds =
    (await Flashcore.get<string[]>('list', {
      namespace: guildActiveNamespace(giveaway.guildId)
    })) || []
  const filtered = activeIds.filter(id => id !== giveawayId)
  await Flashcore.set('list', filtered, { namespace: guildActiveNamespace(giveaway.guildId) })

  const recentIds =
    (await Flashcore.get<string[]>('list', {
      namespace: guildRecentNamespace(giveaway.guildId)
    })) || []
  recentIds.unshift(giveawayId)
  await Flashcore.set('list', recentIds.slice(0, RECENT_GIVEAWAYS_LIMIT), {
    namespace: guildRecentNamespace(giveaway.guildId)
  })

  // DM winners if enabled
  const settings = await Flashcore.get<GuildSettings | null>('data', {
    namespace: guildSettingsNamespace(giveaway.guildId)
  })
  if (settings?.defaults.dmWinners) {
    await dmWinners(giveaway, winners)
  }

  // Cleanup scheduled job
  const { cancelScheduledJob } = await import('./scheduler.js')
  await cancelScheduledJob(giveaway.id, giveaway.cronJobId)
}

/**
 * Reroll a completed giveaway, selecting additional winners from the remaining
 * eligible entrants.
 *
 * Previously selected winners (including historical rerolls) are excluded from
 * the candidate pool, ensuring no duplicates are produced. The giveaway
 * message is updated to display the full winner list and the new winners are
 * appended to the reroll history.
 *
 * @param giveawayId - Unique identifier of the giveaway being rerolled.
 * @param count - Number of new winners to draw from remaining entrants.
 * @returns Promise that resolves to the newly selected winner IDs (empty array
 * if insufficient eligible entrants remain).
 * @example
 * const newWinners = await rerollWinners('01HQRS5F1GZ9J3YF7WXT7H2K2B', 2)
 */
export async function rerollWinners(giveawayId: string, count: number) {
  const giveaway = await Flashcore.get<Giveaway>(giveawayId, { namespace: GIVEAWAY_DATA_NAMESPACE })

  if (!giveaway || giveaway.status !== 'ended') {
    return []
  }

  // Get remaining eligible entrants (exclude previous winners)
  const allWinners = [...giveaway.winners, ...giveaway.rerolls.flat()]
  const remainingEntrants = Object.keys(giveaway.entries).filter(
    userId => !allWinners.includes(userId)
  )

  const newWinners = selectWinners(Object.fromEntries(remainingEntrants.map(id => [id, 1])), count)

  if (newWinners.length === 0) {
    return []
  }

  // Store reroll
  giveaway.rerolls.push(newWinners)
  await Flashcore.set(giveawayId, giveaway, { namespace: GIVEAWAY_DATA_NAMESPACE })

  // Update message
  await updateGiveawayMessage(giveaway)

  return newWinners
}

/**
 * Randomly select winners from an entrant map without replacement.
 *
 * Uses the Fisher–Yates shuffle to guarantee unbiased permutations of the
 * candidate list, then slices the requested number of winners. The contained
 * `giveaway` context is currently unused by the algorithm but provides rich
 * metadata for future weighting strategies.
 *
 * @param entries - Map of eligible user IDs to entry weights.
 * @param count - Maximum number of winners to select.
 * @returns Array of selected user IDs; length can be less than `count` when
 * there are not enough entrants.
 */
function selectWinners(entries: Record<string, number>, count: number): string[] {
  const eligible = Object.keys(entries)

  if (eligible.length === 0) return []

  // Fisher-Yates shuffle for unbiased random selection
  const shuffled = [...eligible]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  return shuffled.slice(0, Math.min(count, shuffled.length))
}

/**
 * Update the giveaway's Discord message to reflect its finalized state.
 *
 * The embed is rewritten with winner information, interactive components are
 * removed, and a celebratory follow-up message is sent to highlight the
 * winners. Errors related to missing channels or permissions are logged but do
 * not reject the promise.
 *
 * @param giveaway - Giveaway context to render into the message.
 * @param winners - User IDs that should be showcased as winners (optional, derived from giveaway if not provided).
 * @returns Promise that resolves once the message has been updated.
 */
async function updateGiveawayMessage(giveaway: Giveaway, winners?: string[]) {
  type SendableTextChannel = TextBasedChannel & {
    send: TextChannel['send']
    messages: TextChannel['messages']
  }

  try {
    const { client } = await import('robo.js')
    const channel = await client.channels.fetch(giveaway.channelId)

    // Type guard for text-based channels with send method
    if (!channel?.isTextBased()) {
      return
    }

    const text = channel as unknown as SendableTextChannel // After isTextBased(), channel behaves like a send-capable TextBasedChannel (double cast bridges workspace djs versions)
    const message = await text.messages.fetch(giveaway.messageId)
    const embed = EmbedBuilder.from(message.embeds[0])

    if (giveaway.status === 'ended') {
      // Derive winners list if not explicitly provided
      const displayWinners = winners ?? [...giveaway.winners, ...giveaway.rerolls.flat()]
      const isRerollScenario = winners === undefined && giveaway.rerolls.length > 0
      const newRerolledWinners = giveaway.rerolls.flat()

      embed.setTitle(`🎉 Giveaway Ended: ${giveaway.prize}`).setColor(0x808080)

      // Build fields array to replace existing fields
      const fieldsArray = []

      // Show original winners
      if (isRerollScenario) {
        // In reroll scenario, show original winners separately (or omit if none)
        if (giveaway.winners.length > 0) {
          fieldsArray.push({
            name: 'Original Winners 🏆',
            value: giveaway.winners.map(id => `<@${id}>`).join(', ')
          })
        } else {
          fieldsArray.push({
            name: 'Original Winners',
            value: 'None'
          })
        }
      } else {
        // Non-reroll scenario: show winners or "No Winners"
        fieldsArray.push({
          name: displayWinners.length > 0 ? 'Winners 🏆' : 'No Winners',
          value:
            displayWinners.length > 0
              ? displayWinners.map(id => `<@${id}>`).join(', ')
              : 'Not enough entrants'
        })
      }

      // Show rerolled winners separately if this is a reroll scenario
      if (isRerollScenario && newRerolledWinners.length > 0) {
        fieldsArray.push({
          name: 'Rerolled Winners 🔄',
          value: newRerolledWinners.map(id => `<@${id}>`).join(', ')
        })
      }

      // Replace fields instead of appending
      embed.setFields(fieldsArray)
    }

    await message.edit({ embeds: [embed], components: [] })

    // Post winner announcement
    const displayWinners = winners ?? [...giveaway.winners, ...giveaway.rerolls.flat()]
    const isRerollScenario = winners === undefined && giveaway.rerolls.length > 0
    const newRerolledWinners = giveaway.rerolls.flat()

    if (displayWinners.length > 0) {
      const congratsMessage = isRerollScenario
        ? `🎊 Congratulations to our rerolled winners: ${newRerolledWinners.map(id => `<@${id}>`).join(', ')}! You won **${giveaway.prize}**!`
        : `🎊 Congratulations ${displayWinners.map(id => `<@${id}>`).join(', ')}! You won **${giveaway.prize}**!`

      await text.send({
        content: congratsMessage
      })
    }
  } catch (error) {
    const err = error as { code?: number; name?: string } | undefined
    const codeSuffix = typeof err?.code === 'number' ? ` (code ${err.code})` : ''
    const name = err?.name ?? 'Unknown error'
    giveawaysLogger.error(
      `Failed to update giveaway message for giveaway ${giveaway.id}; ${name}${codeSuffix}. Channel or message may have been removed or permissions are missing.`,
      error
    )
  }
}

/**
 * Send direct messages to giveaway winners, notifying them of their prize.
 *
 * Each message is attempted independently; failures for specific users are
 * logged and do not prevent other winners from being contacted.
 *
 * @param giveaway - Giveaway context containing prize information.
 * @param winners - User IDs to send direct messages to.
 * @returns Promise that resolves after all DM attempts have completed.
 */
async function dmWinners(giveaway: Giveaway, winners: string[]) {
  const { client } = await import('robo.js')

  for (const winnerId of winners) {
    try {
      const user = await client.users.fetch(winnerId)
      await user.send(`🎉 Congratulations! You won **${giveaway.prize}** in the giveaway!`)
    } catch (error) {
      giveawaysLogger.error(`Failed to DM winner ${winnerId}:`, error)
    }
  }
}

export const __test = {
  selectWinners
}

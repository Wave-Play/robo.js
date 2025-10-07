import { createCommandConfig, Flashcore } from 'robo.js'
import type { CommandOptions, CommandResult } from 'robo.js'
import type { CommandInteraction } from 'discord.js'
import type { Giveaway } from '../../types/giveaway.js'

export const config = createCommandConfig({
  description: 'Reroll winners for a giveaway',
  options: [
    {
      name: 'message_id',
      description: 'The message ID of the giveaway',
      type: 'string',
      required: true
    },
    {
      name: 'count',
      description: 'Number of winners to reroll (default: all)',
      type: 'integer',
      required: false
    }
  ]
} as const)

export default async (
  interaction: CommandInteraction,
  options: CommandOptions<typeof config>
): Promise<CommandResult> => {
  const { message_id, count } = options

  const giveawayId = await Flashcore.get<string>(`message:${message_id}`)
  if (!giveawayId) {
    return { content: 'Giveaway not found', ephemeral: true }
  }

  const giveaway = await Flashcore.get<Giveaway>(`giveaway:${giveawayId}`)
  if (!giveaway || giveaway.status !== 'ended') {
    return { content: 'Can only reroll ended giveaways', ephemeral: true }
  }

  // Check permissions
  const hasPermission = interaction.memberPermissions?.has('ManageGuild')
  if (!hasPermission) {
    return { content: 'You need Manage Guild permission', ephemeral: true }
  }

  const { rerollWinners } = await import('../../utils/giveaway-utils.js')
  const newWinners = await rerollWinners(giveawayId, count || giveaway.winnersCount)

  if (newWinners.length === 0) {
    return { content: 'No eligible entrants remaining', ephemeral: true }
  }

  return { content: `Rerolled ${newWinners.length} winner(s)!`, ephemeral: true }
}

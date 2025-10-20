import { createCommandConfig, Flashcore } from 'robo.js'
import type { CommandOptions, CommandResult } from 'robo.js'
import type { CommandInteraction } from 'discord.js'
import type { Giveaway } from '../../types/giveaway.js'

export const config = createCommandConfig({
  description: 'End a giveaway early',
  options: [
    {
      name: 'message_id',
      description: 'The message ID of the giveaway',
      type: 'string',
      required: true
    }
  ]
} as const)

export default async (
  interaction: CommandInteraction,
  options: CommandOptions<typeof config>
): Promise<CommandResult> => {
  const { message_id } = options

  const giveawayId = await Flashcore.get<string>(`message:${message_id}`)
  if (!giveawayId) {
    return { content: 'Giveaway not found', ephemeral: true }
  }

  const giveaway = await Flashcore.get<Giveaway>(`giveaway:${giveawayId}`)
  if (!giveaway) {
    return { content: 'Giveaway not found', ephemeral: true }
  }

  if (giveaway.status !== 'active') {
    return { content: 'This giveaway is not active', ephemeral: true }
  }

  // Check permissions
  const hasPermission = interaction.memberPermissions?.has('ManageGuild')
  if (!hasPermission && giveaway.startedBy !== interaction.user.id) {
    return { content: 'You do not have permission to end this giveaway', ephemeral: true }
  }

  // End giveaway
  const { endGiveaway } = await import('../../utils/giveaway-utils.js')
  await endGiveaway(giveawayId)

  return { content: 'Giveaway ended!', ephemeral: true }
}

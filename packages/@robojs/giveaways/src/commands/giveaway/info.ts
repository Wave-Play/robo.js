import { createCommandConfig, Flashcore } from 'robo.js'
import type { CommandOptions, CommandResult } from 'robo.js'
import type { CommandInteraction } from 'discord.js'
import { EmbedBuilder } from 'discord.js'
import type { Giveaway } from '../../types/giveaway.js'
import { MESSAGES_NAMESPACE } from '../../core/namespaces.js'

const GIVEAWAY_DATA_NAMESPACE: string[] = ['giveaways', 'data']

export const config = createCommandConfig({
  description: 'Get details about a giveaway',
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

  const giveawayId = await Flashcore.get<string>(message_id, { namespace: MESSAGES_NAMESPACE })
  if (!giveawayId) {
    return { content: 'Giveaway not found', ephemeral: true }
  }

  const giveaway = await Flashcore.get<Giveaway>(giveawayId, { namespace: GIVEAWAY_DATA_NAMESPACE })
  if (!giveaway) {
    return { content: 'Giveaway not found', ephemeral: true }
  }

  const embed = new EmbedBuilder()
    .setTitle(`🎉 ${giveaway.prize}`)
    .addFields(
      { name: 'Status', value: giveaway.status, inline: true },
      { name: 'Winners', value: giveaway.winnersCount.toString(), inline: true },
      { name: 'Entries', value: Object.keys(giveaway.entries).length.toString(), inline: true },
      { name: 'Started by', value: `<@${giveaway.startedBy}>`, inline: true },
      { name: 'Ends', value: `<t:${Math.floor(giveaway.endsAt / 1000)}:F>`, inline: true }
    )
    .setColor(giveaway.status === 'active' ? 0x00ff00 : 0x808080)

  if (giveaway.winners.length > 0) {
    embed.addFields({
      name: 'Winners',
      value: giveaway.winners.map((id: string) => `<@${id}>`).join(', ')
    })
  }

  return { embeds: [embed], ephemeral: true }
}

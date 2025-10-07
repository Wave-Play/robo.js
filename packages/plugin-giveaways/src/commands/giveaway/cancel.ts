import { createCommandConfig, Flashcore } from 'robo.js'
import type { CommandOptions, CommandResult } from 'robo.js'
import type { CommandInteraction, TextChannel, NewsChannel } from 'discord.js'
import { EmbedBuilder } from 'discord.js'
import type { Giveaway } from '../../types/giveaway.js'

export const config = createCommandConfig({
  description: 'Cancel a giveaway',
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
  if (!giveaway || giveaway.status !== 'active') {
    return { content: 'Giveaway not active', ephemeral: true }
  }

  // Check permissions
  const hasPermission = interaction.memberPermissions?.has('ManageGuild')
  if (!hasPermission && giveaway.startedBy !== interaction.user.id) {
    return { content: 'You do not have permission', ephemeral: true }
  }

  // Cancel giveaway
  giveaway.status = 'cancelled'
  giveaway.finalizedAt = Date.now()
  await Flashcore.set(`giveaway:${giveawayId}`, giveaway)

  // Update message
  const channel = await interaction.client.channels.fetch(giveaway.channelId) as TextChannel | NewsChannel
  if (channel && 'send' in channel) {
    const message = await channel.messages.fetch(giveaway.messageId)
    const embed = message.embeds[0]
    
    const updatedEmbed = EmbedBuilder.from(embed)
      .setTitle(`❌ Giveaway Cancelled: ${giveaway.prize}`)
      .setColor(0xff0000)

    await message.edit({ embeds: [updatedEmbed], components: [] })
  }

  // Remove from active list
  const activeIds = (await Flashcore.get<string[]>(`guild:${giveaway.guildId}:active`)) || []
  const filtered = activeIds.filter(id => id !== giveawayId)
  await Flashcore.set(`guild:${giveaway.guildId}:active`, filtered)

  return { content: 'Giveaway cancelled', ephemeral: true }
}

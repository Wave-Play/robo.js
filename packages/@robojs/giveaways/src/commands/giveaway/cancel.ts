import { createCommandConfig, Flashcore } from 'robo.js'
import type { CommandOptions, CommandResult } from 'robo.js'
import type { CommandInteraction, TextChannel, NewsChannel } from 'discord.js'
import { EmbedBuilder } from 'discord.js'
import type { Giveaway } from '../../types/giveaway.js'
import { giveawaysLogger } from '../../core/logger.js'
import { MESSAGES_NAMESPACE } from '../../core/namespaces.js'

const GIVEAWAY_DATA_NAMESPACE: string[] = ['giveaways', 'data']
const guildActiveNamespace = (guildId: string): string[] => [
  'giveaways',
  'guilds',
  guildId,
  'active'
]

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

  const giveawayId = await Flashcore.get<string>(message_id, { namespace: MESSAGES_NAMESPACE })
  if (!giveawayId) {
    return { content: 'Giveaway not found', ephemeral: true }
  }

  const giveaway = await Flashcore.get<Giveaway>(giveawayId, { namespace: GIVEAWAY_DATA_NAMESPACE })
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
  await Flashcore.set(giveawayId, giveaway, { namespace: GIVEAWAY_DATA_NAMESPACE })

  // Cleanup scheduled job
  const { cancelScheduledJob } = await import('../../utils/scheduler.js')
  await cancelScheduledJob(giveawayId, giveaway.cronJobId)

  // Update message
  try {
    const channel = (await interaction.client.channels.fetch(giveaway.channelId)) as
      | TextChannel
      | NewsChannel
    if (channel && 'send' in channel) {
      const message = await channel.messages.fetch(giveaway.messageId)
      const embed = message.embeds[0]

      const updatedEmbed = EmbedBuilder.from(embed)
        .setTitle(`❌ Giveaway Cancelled: ${giveaway.prize}`)
        .setColor(0xff0000)

      await message.edit({ embeds: [updatedEmbed], components: [] })

      // Post cancellation announcement
      await channel.send({
        content: `❌ The giveaway for **${giveaway.prize}** has been cancelled by <@${interaction.user.id}>.`
      })
    }
  } catch (error) {
    giveawaysLogger.error(
      'Failed to update giveaway message during cancel; channel or message may have been removed.',
      error
    )
  }

  // Remove from active list
  const activeIds =
    (await Flashcore.get<string[]>('list', {
      namespace: guildActiveNamespace(giveaway.guildId)
    })) || []
  const filtered = activeIds.filter(id => id !== giveawayId)
  await Flashcore.set('list', filtered, { namespace: guildActiveNamespace(giveaway.guildId) })

  // Cleanup message mapping
  await Flashcore.delete(giveaway.messageId, { namespace: MESSAGES_NAMESPACE })

  return { content: 'Giveaway cancelled', ephemeral: true }
}

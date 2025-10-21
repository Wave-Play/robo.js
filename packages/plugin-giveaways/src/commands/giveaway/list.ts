import { createCommandConfig, Flashcore } from 'robo.js'
import type { CommandResult } from 'robo.js'
import type { CommandInteraction } from 'discord.js'
import { EmbedBuilder } from 'discord.js'
import type { Giveaway } from '../../types/giveaway.js'

const GIVEAWAY_DATA_NAMESPACE: string[] = ['giveaways', 'data']
const guildActiveNamespace = (guildId: string): string[] => [
  'giveaways',
  'guilds',
  guildId,
  'active'
]
const guildRecentNamespace = (guildId: string): string[] => [
  'giveaways',
  'guilds',
  guildId,
  'recent'
]

export const config = createCommandConfig({
  description: 'List active and recent giveaways'
} as const)

export default async (interaction: CommandInteraction): Promise<CommandResult> => {
  const activeIds =
    (await Flashcore.get<string[]>('list', {
      namespace: guildActiveNamespace(interaction.guildId!)
    })) || []
  const recentIds =
    (await Flashcore.get<string[]>('list', {
      namespace: guildRecentNamespace(interaction.guildId!)
    })) || []

  const embed = new EmbedBuilder().setTitle('🎉 Giveaways').setColor(0x00ff00)

  if (activeIds.length > 0) {
    const activeList = []
    for (const id of activeIds.slice(0, 5)) {
      const giveaway = await Flashcore.get<Giveaway>(id, { namespace: GIVEAWAY_DATA_NAMESPACE })
      if (giveaway) {
        activeList.push(`**${giveaway.prize}** - Ends <t:${Math.floor(giveaway.endsAt / 1000)}:R>`)
      }
    }
    embed.addFields({ name: 'Active', value: activeList.join('\n') || 'None' })
  }

  if (recentIds.length > 0) {
    const recentList = []
    for (const id of recentIds.slice(0, 5)) {
      const giveaway = await Flashcore.get<Giveaway>(id, { namespace: GIVEAWAY_DATA_NAMESPACE })
      if (giveaway) {
        recentList.push(`**${giveaway.prize}** - ${giveaway.status}`)
      }
    }
    embed.addFields({ name: 'Recent', value: recentList.join('\n') || 'None' })
  }

  return { embeds: [embed], ephemeral: true }
}

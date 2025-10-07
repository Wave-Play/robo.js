import { createCommandConfig, Flashcore } from 'robo.js'
import type { CommandResult } from 'robo.js'
import type { CommandInteraction } from 'discord.js'
import { EmbedBuilder } from 'discord.js'
import type { GuildSettings } from '../../../types/giveaway.js'
import { DEFAULT_SETTINGS } from '../../../types/giveaway.js'

export const config = createCommandConfig({
  description: 'Get current giveaway settings for this server'
} as const)

export default async (interaction: CommandInteraction): Promise<CommandResult> => {
  const settings = await Flashcore.get<GuildSettings>(`guild:${interaction.guildId}:settings`) || DEFAULT_SETTINGS

  const embed = new EmbedBuilder()
    .setTitle('⚙️ Giveaway Settings')
    .addFields(
      { name: 'Default Winners', value: settings.defaults.winners.toString(), inline: true },
      { name: 'Default Duration', value: settings.defaults.duration, inline: true },
      { name: 'Button Label', value: settings.defaults.buttonLabel, inline: true },
      { name: 'DM Winners', value: settings.defaults.dmWinners ? 'Yes' : 'No', inline: true },
      { name: 'Max Winners', value: settings.limits.maxWinners.toString(), inline: true },
      { name: 'Max Duration (days)', value: settings.limits.maxDurationDays.toString(), inline: true }
    )
    .setColor(0x00ff00)

  return { embeds: [embed], ephemeral: true }
}

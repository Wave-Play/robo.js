import { createCommandConfig, Flashcore } from 'robo.js'
import type { CommandResult } from 'robo.js'
import type { CommandInteraction } from 'discord.js'

export const config = createCommandConfig({
  description: 'Reset giveaway settings to defaults'
} as const)

export default async (interaction: CommandInteraction): Promise<CommandResult> => {
  // Check permissions
  const hasPermission = interaction.memberPermissions?.has('ManageGuild')
  if (!hasPermission) {
    return { content: 'You need Manage Guild permission', ephemeral: true }
  }

  await Flashcore.set(`guild:${interaction.guildId}:settings`, null)

  return { content: 'Settings reset to defaults!', ephemeral: true }
}

import { createCommandConfig, Flashcore } from 'robo.js'
import type { CommandResult } from 'robo.js'
import type { CommandInteraction } from 'discord.js'

const guildSettingsNamespace = (guildId: string): string[] => [
  'giveaways',
  'guilds',
  guildId,
  'settings'
]

export const config = createCommandConfig({
  description: 'Reset giveaway settings to defaults'
} as const)

export default async (interaction: CommandInteraction): Promise<CommandResult> => {
  // Check permissions
  const hasPermission = interaction.memberPermissions?.has('ManageGuild')
  if (!hasPermission) {
    return { content: 'You need Manage Guild permission', ephemeral: true }
  }

  await Flashcore.delete('data', { namespace: guildSettingsNamespace(interaction.guildId!) })

  return { content: 'Settings reset to defaults!', ephemeral: true }
}

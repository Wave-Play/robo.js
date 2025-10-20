import { createCommandConfig, Flashcore } from 'robo.js'
import type { CommandOptions, CommandResult } from 'robo.js'
import type { CommandInteraction } from 'discord.js'
import type { GuildSettings } from '../../../types/giveaway.js'
import { DEFAULT_SETTINGS } from '../../../types/giveaway.js'

export const config = createCommandConfig({
  description: 'Update giveaway settings',
  options: [
    {
      name: 'default_winners',
      description: 'Default number of winners',
      type: 'integer',
      required: false
    },
    {
      name: 'default_duration',
      description: 'Default duration (e.g., 1h)',
      type: 'string',
      required: false
    },
    {
      name: 'button_label',
      description: 'Button label text',
      type: 'string',
      required: false
    },
    {
      name: 'dm_winners',
      description: 'DM winners when they win',
      type: 'boolean',
      required: false
    },
    {
      name: 'max_winners',
      description: 'Maximum winners allowed',
      type: 'integer',
      required: false
    }
  ]
} as const)

export default async (
  interaction: CommandInteraction,
  options: CommandOptions<typeof config>
): Promise<CommandResult> => {
  // Check permissions
  const hasPermission = interaction.memberPermissions?.has('ManageGuild')
  if (!hasPermission) {
    return { content: 'You need Manage Guild permission', ephemeral: true }
  }

  const currentSettings = await Flashcore.get<GuildSettings>(`guild:${interaction.guildId}:settings`) || DEFAULT_SETTINGS

  // Update settings
  if (options.default_winners !== undefined) {
    currentSettings.defaults.winners = options.default_winners
  }
  if (options.default_duration !== undefined) {
    currentSettings.defaults.duration = options.default_duration
  }
  if (options.button_label !== undefined) {
    currentSettings.defaults.buttonLabel = options.button_label
  }
  if (options.dm_winners !== undefined) {
    currentSettings.defaults.dmWinners = options.dm_winners
  }
  if (options.max_winners !== undefined) {
    currentSettings.limits.maxWinners = options.max_winners
  }

  await Flashcore.set(`guild:${interaction.guildId}:settings`, currentSettings)

  return { content: 'Settings updated!', ephemeral: true }
}

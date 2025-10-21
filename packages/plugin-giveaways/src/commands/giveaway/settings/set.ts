import { createCommandConfig, Flashcore } from 'robo.js'
import type { CommandOptions, CommandResult } from 'robo.js'
import type { CommandInteraction } from 'discord.js'
import type { GuildSettings } from '../../../types/giveaway.js'
import { DEFAULT_SETTINGS } from '../../../types/giveaway.js'

const guildSettingsNamespace = (guildId: string): string[] => [
  'giveaways',
  'guilds',
  guildId,
  'settings'
]

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

  const currentSettings =
    (await Flashcore.get<GuildSettings>('data', {
      namespace: guildSettingsNamespace(interaction.guildId!)
    })) || DEFAULT_SETTINGS

  // Update settings
  let nextDefaultWinners = currentSettings.defaults.winners
  if (options.default_winners !== undefined) {
    if (options.default_winners < 1) {
      return { content: 'Default winners must be at least 1', ephemeral: true }
    }
    nextDefaultWinners = options.default_winners
  }

  let nextDefaultDuration = currentSettings.defaults.duration
  if (options.default_duration !== undefined) {
    const durationMatch = /^(\d+)[mhd]$/.exec(options.default_duration)
    const durationValue = durationMatch ? parseInt(durationMatch[1], 10) : NaN
    if (!durationMatch || Number.isNaN(durationValue) || durationValue <= 0) {
      return {
        content:
          'Invalid duration format. Use format like: 10m (minutes), 1h (hours), or 2d (days). Value must be greater than 0.',
        ephemeral: true
      }
    }
    nextDefaultDuration = options.default_duration
  }

  let nextButtonLabel = currentSettings.defaults.buttonLabel
  if (options.button_label !== undefined) {
    if (options.button_label.length === 0 || options.button_label.length > 80) {
      return { content: 'Button label must be between 1 and 80 characters', ephemeral: true }
    }
    nextButtonLabel = options.button_label
  }

  if (options.dm_winners !== undefined) {
    currentSettings.defaults.dmWinners = options.dm_winners
  }

  let nextMaxWinners = currentSettings.limits.maxWinners
  if (options.max_winners !== undefined) {
    if (options.max_winners < 1 || options.max_winners > 100) {
      return { content: 'Maximum winners must be between 1 and 100', ephemeral: true }
    }
    nextMaxWinners = options.max_winners
  }

  if (nextMaxWinners < nextDefaultWinners) {
    return { content: 'Maximum winners cannot be less than default winners', ephemeral: true }
  }

  currentSettings.defaults.winners = nextDefaultWinners
  currentSettings.defaults.duration = nextDefaultDuration
  currentSettings.defaults.buttonLabel = nextButtonLabel
  currentSettings.limits.maxWinners = nextMaxWinners

  await Flashcore.set('data', currentSettings, {
    namespace: guildSettingsNamespace(interaction.guildId!)
  })

  return { content: 'Settings updated!', ephemeral: true }
}

import { createCommandConfig, Flashcore } from 'robo.js'
import type { CommandOptions, CommandResult } from 'robo.js'
import type { CommandInteraction, TextChannel, NewsChannel } from 'discord.js'
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } from 'discord.js'
import { ulid } from 'ulid'
import type { Giveaway, GuildSettings } from '../../types/giveaway.js'
import { DEFAULT_SETTINGS } from '../../types/giveaway.js'
import { scheduleGiveawayEnd } from '../../utils/scheduler.js'
import { MESSAGES_NAMESPACE } from '../../core/namespaces.js'

const GIVEAWAY_DATA_NAMESPACE: string[] = ['giveaways', 'data']
const guildActiveNamespace = (guildId: string): string[] => [
  'giveaways',
  'guilds',
  guildId,
  'active'
]
const guildSettingsNamespace = (guildId: string): string[] => [
  'giveaways',
  'guilds',
  guildId,
  'settings'
]

export const config = createCommandConfig({
  description: 'Start a new giveaway',
  options: [
    {
      name: 'prize',
      description: 'The prize for the giveaway',
      type: 'string',
      required: true
    },
    {
      name: 'duration',
      description: 'Duration (e.g., 10m, 1h, 2d) or timestamp',
      type: 'string',
      required: true
    },
    {
      name: 'winners',
      description: 'Number of winners',
      type: 'integer',
      required: false
    },
    {
      name: 'channel',
      description: 'Channel to post giveaway',
      type: 'channel',
      required: false
    },
    {
      name: 'allow_roles',
      description: 'Comma-separated role IDs that can enter',
      type: 'string',
      required: false
    },
    {
      name: 'deny_roles',
      description: 'Comma-separated role IDs that cannot enter',
      type: 'string',
      required: false
    },
    {
      name: 'min_account_age_days',
      description: 'Minimum account age in days',
      type: 'integer',
      required: false
    }
  ]
} as const)

export default async (
  interaction: CommandInteraction,
  options: CommandOptions<typeof config>
): Promise<CommandResult> => {
  const {
    prize,
    duration,
    winners = 1,
    channel,
    allow_roles,
    deny_roles,
    min_account_age_days
  } = options

  // Parse duration
  const endsAt = parseDuration(duration)
  if (!endsAt) {
    return {
      content:
        'Invalid duration format. Use format like: 10m (minutes), 1h (hours), or 2d (days). Duration must be greater than 0 and less than 1 year.',
      ephemeral: true
    }
  }

  // Get settings for limits
  const settings = await getGuildSettings(interaction.guildId!)

  // Validate duration against maxDurationDays
  const durationMs = endsAt - Date.now()
  const durationDays = durationMs / 86400000
  if (durationDays > settings.limits.maxDurationDays) {
    return {
      content: `Maximum duration is ${settings.limits.maxDurationDays} days`,
      ephemeral: true
    }
  }

  if (winners < 1) {
    return { content: 'Winners must be at least 1.', ephemeral: true }
  }

  if (winners > settings.limits.maxWinners) {
    return { content: `Maximum ${settings.limits.maxWinners} winners allowed`, ephemeral: true }
  }

  const targetChannel = channel
    ? await interaction.guild!.channels.fetch(channel.id)
    : interaction.channel

  // Type guard for text-based channels
  if (
    !targetChannel ||
    (targetChannel.type !== ChannelType.GuildText &&
      targetChannel.type !== ChannelType.GuildNews &&
      targetChannel.type !== ChannelType.PublicThread &&
      targetChannel.type !== ChannelType.PrivateThread)
  ) {
    return { content: 'Invalid channel - must be a text channel', ephemeral: true }
  }

  // Create giveaway data
  const giveawayId = ulid()
  const allowRoleIds = allow_roles ? allow_roles.split(',').map(r => r.trim()) : []
  const denyRoleIds = deny_roles ? deny_roles.split(',').map(r => r.trim()) : []

  const embed = new EmbedBuilder()
    .setTitle(`🎉 Giveaway: ${prize}`)
    .setDescription('Click the button below to enter!')
    .addFields(
      { name: 'Winners', value: winners.toString(), inline: true },
      { name: 'Ends', value: `<t:${Math.floor(endsAt / 1000)}:R>`, inline: true },
      { name: 'Hosted by', value: `<@${interaction.user.id}>`, inline: true }
    )
    .setColor(0x00ff00)
    .setTimestamp(endsAt)

  // Create Enter button
  const enterButton = new ButtonBuilder()
    .setCustomId(`ga:enter:${giveawayId}`)
    .setLabel(settings.defaults.buttonLabel)
    .setStyle(ButtonStyle.Primary)
    .setEmoji('🎉')

  // Create Leave button
  const leaveButton = new ButtonBuilder()
    .setCustomId(`ga:leave:${giveawayId}`)
    .setLabel('Leave')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('👋')

  // Add both buttons to the action row
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(enterButton, leaveButton)

  const message = await (targetChannel as TextChannel | NewsChannel).send({
    embeds: [embed],
    components: [row]
  })

  // Store giveaway
  const giveaway: Giveaway = {
    id: giveawayId,
    guildId: interaction.guildId!,
    channelId: targetChannel.id,
    messageId: message.id,
    prize,
    winnersCount: winners,
    endsAt,
    startedBy: interaction.user.id,
    status: 'active',
    allowRoleIds,
    denyRoleIds,
    minAccountAgeDays: min_account_age_days || null,
    entries: {},
    winners: [],
    rerolls: [],
    createdAt: Date.now(),
    finalizedAt: null,
    cronJobId: null
  }

  await Flashcore.set(giveawayId, giveaway, { namespace: GIVEAWAY_DATA_NAMESPACE })

  // Add to active list
  const activeIds =
    (await Flashcore.get<string[]>('list', {
      namespace: guildActiveNamespace(interaction.guildId!)
    })) || []
  activeIds.push(giveawayId)
  await Flashcore.set('list', activeIds, { namespace: guildActiveNamespace(interaction.guildId!) })

  // Index by message
  await Flashcore.set(message.id, giveawayId, { namespace: MESSAGES_NAMESPACE })

  // Schedule end and capture job ID
  const jobId = await scheduleGiveawayEnd(giveaway)

  // Update giveaway with cronJobId if one was returned
  if (jobId) {
    giveaway.cronJobId = jobId
    await Flashcore.set(giveawayId, giveaway, { namespace: GIVEAWAY_DATA_NAMESPACE })
  }

  return { content: `Giveaway started! Message: ${message.url}`, ephemeral: true }
}

// Helper functions
function parseDuration(duration: string): number | null {
  const trimmed = duration.trim()
  const numericMatch = trimmed.match(/^\d+$/)
  const now = Date.now()
  const maxDurationMs = 365 * 86400000

  if (numericMatch) {
    let endsAt: number

    if (trimmed.length === 10) {
      endsAt = Number(trimmed) * 1000
    } else if (trimmed.length === 13) {
      endsAt = Number(trimmed)
    } else {
      return null
    }

    if (!Number.isFinite(endsAt)) {
      return null
    }

    const remaining = endsAt - now
    if (remaining <= 0 || remaining > maxDurationMs) {
      return null
    }

    return endsAt
  }

  const match = trimmed.match(/^(\d+)([mhd])$/)
  if (!match) return null

  const value = parseInt(match[1], 10)
  if (Number.isNaN(value) || value <= 0) {
    return null
  }

  const unit = match[2] as 'm' | 'h' | 'd'
  const multipliers = { m: 60000, h: 3600000, d: 86400000 }
  const durationMs = value * multipliers[unit]
  if (durationMs > maxDurationMs) {
    return null
  }

  return now + durationMs
}

async function getGuildSettings(guildId: string): Promise<GuildSettings> {
  return (
    (await Flashcore.get<GuildSettings>('data', { namespace: guildSettingsNamespace(guildId) })) ||
    DEFAULT_SETTINGS
  )
}

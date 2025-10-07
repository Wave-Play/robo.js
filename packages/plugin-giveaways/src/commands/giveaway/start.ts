import { createCommandConfig, Flashcore } from 'robo.js'
import type { CommandOptions, CommandResult } from 'robo.js'
import type { CommandInteraction, TextChannel, NewsChannel } from 'discord.js'
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } from 'discord.js'
import { ulid } from 'ulid'
import type { Giveaway, GuildSettings } from '../../types/giveaway.js'
import { DEFAULT_SETTINGS } from '../../types/giveaway.js'
import { scheduleGiveawayEnd } from '../../utils/scheduler.js'

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
  const { prize, duration, winners = 1, channel, allow_roles, deny_roles, min_account_age_days } = options

  // Parse duration
  const endsAt = parseDuration(duration)
  if (!endsAt) {
    return { content: 'Invalid duration format. Use 10m, 1h, 2d, etc.', ephemeral: true }
  }

  // Get settings for limits
  const settings = await getGuildSettings(interaction.guildId!)
  if (winners > settings.limits.maxWinners) {
    return { content: `Maximum ${settings.limits.maxWinners} winners allowed`, ephemeral: true }
  }

  const targetChannel = channel ? await interaction.guild!.channels.fetch(channel.id) : interaction.channel
  
  // Type guard for text-based channels
  if (!targetChannel || 
      (targetChannel.type !== ChannelType.GuildText && 
       targetChannel.type !== ChannelType.GuildNews &&
       targetChannel.type !== ChannelType.PublicThread &&
       targetChannel.type !== ChannelType.PrivateThread)) {
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
    finalizedAt: null
  }

  await Flashcore.set(`giveaway:${giveawayId}`, giveaway)
  
  // Add to active list
  const activeIds = (await Flashcore.get<string[]>(`guild:${interaction.guildId}:active`)) || []
  activeIds.push(giveawayId)
  await Flashcore.set(`guild:${interaction.guildId}:active`, activeIds)

  // Index by message
  await Flashcore.set(`message:${message.id}`, giveawayId)

  // Schedule end
  scheduleGiveawayEnd(giveaway)

  return { content: `Giveaway started! Message: ${message.url}`, ephemeral: true }
}

// Helper functions
function parseDuration(duration: string): number | null {
  const match = duration.match(/^(\d+)([mhd])$/)
  if (!match) return null

  const value = parseInt(match[1])
  const unit = match[2]
  const multipliers = { m: 60000, h: 3600000, d: 86400000 }
  
  return Date.now() + value * multipliers[unit as 'm' | 'h' | 'd']
}

async function getGuildSettings(guildId: string): Promise<GuildSettings> {
  return (await Flashcore.get<GuildSettings>(`guild:${guildId}:settings`)) || DEFAULT_SETTINGS
}

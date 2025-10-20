import { Flashcore } from 'robo.js'
import { EmbedBuilder, ChannelType, type TextChannel, type NewsChannel } from 'discord.js'
import type { Giveaway, GuildSettings } from '../types/giveaway.js'

export async function endGiveaway(giveawayId: string) {
  const giveaway = await Flashcore.get<Giveaway>(`giveaway:${giveawayId}`)
  
  if (!giveaway || giveaway.status !== 'active') {
    return // Already ended or cancelled
  }

  // Select winners
  const winners = selectWinners(giveaway.entries, giveaway.winnersCount, giveaway)

  // Update giveaway
  giveaway.status = 'ended'
  giveaway.winners = winners
  giveaway.finalizedAt = Date.now()
  await Flashcore.set(`giveaway:${giveawayId}`, giveaway)

  // Update message
  await updateGiveawayMessage(giveaway, winners)

  // Move to recent
  const activeIds = (await Flashcore.get<string[]>(`guild:${giveaway.guildId}:active`)) || []
  const filtered = activeIds.filter(id => id !== giveawayId)
  await Flashcore.set(`guild:${giveaway.guildId}:active`, filtered)

  const recentIds = (await Flashcore.get<string[]>(`guild:${giveaway.guildId}:recent`)) || []
  recentIds.unshift(giveawayId)
  await Flashcore.set(`guild:${giveaway.guildId}:recent`, recentIds.slice(0, 50))

  // DM winners if enabled
  const settings = await Flashcore.get<GuildSettings>(`guild:${giveaway.guildId}:settings`)
  if (settings?.defaults.dmWinners) {
    await dmWinners(giveaway, winners)
  }
}

export async function rerollWinners(giveawayId: string, count: number) {
  const giveaway = await Flashcore.get<Giveaway>(`giveaway:${giveawayId}`)
  
  if (!giveaway || giveaway.status !== 'ended') {
    return []
  }

  // Get remaining eligible entrants (exclude previous winners)
  const allWinners = [...giveaway.winners, ...giveaway.rerolls.flat()]
  const remainingEntrants = Object.keys(giveaway.entries).filter(
    userId => !allWinners.includes(userId)
  )

  const newWinners = selectWinners(
    Object.fromEntries(remainingEntrants.map(id => [id, 1])),
    count,
    giveaway
  )

  if (newWinners.length === 0) {
    return []
  }

  // Store reroll
  giveaway.rerolls.push(newWinners)
  await Flashcore.set(`giveaway:${giveawayId}`, giveaway)

  // Update message
  await updateGiveawayMessage(giveaway, [...giveaway.winners, ...newWinners])

  return newWinners
}

function selectWinners(entries: Record<string, number>, count: number, giveaway: Giveaway): string[] {
  const eligible = Object.keys(entries)
  
  if (eligible.length === 0) return []

  // Shuffle and select
  const shuffled = [...eligible].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(count, shuffled.length))
}

async function updateGiveawayMessage(giveaway: Giveaway, winners: string[]) {
  try {
    const { client } = await import('robo.js')
    const channel = await client.channels.fetch(giveaway.channelId)
    
    // Type guard for text-based channels with send method
    if (!channel || 
        (channel.type !== ChannelType.GuildText && 
         channel.type !== ChannelType.GuildNews &&
         channel.type !== ChannelType.PublicThread &&
         channel.type !== ChannelType.PrivateThread)) {
      return
    }

    const textChannel = channel as TextChannel | NewsChannel
    const message = await textChannel.messages.fetch(giveaway.messageId)
    const embed = EmbedBuilder.from(message.embeds[0])

    if (giveaway.status === 'ended') {
      embed
        .setTitle(`🎉 Giveaway Ended: ${giveaway.prize}`)
        .setColor(0x808080)
        .addFields({
          name: winners.length > 0 ? 'Winners 🏆' : 'No Winners',
          value: winners.length > 0 
            ? winners.map(id => `<@${id}>`).join(', ')
            : 'Not enough entrants'
        })
    }

    await message.edit({ embeds: [embed], components: [] })

    // Post winner announcement
    if (winners.length > 0) {
      await textChannel.send({
        content: `🎊 Congratulations ${winners.map(id => `<@${id}>`).join(', ')}! You won **${giveaway.prize}**!`
      })
    }
  } catch (error) {
    console.error('Failed to update giveaway message:', error)
  }
}

async function dmWinners(giveaway: Giveaway, winners: string[]) {
  const { client } = await import('robo.js')
  
  for (const winnerId of winners) {
    try {
      const user = await client.users.fetch(winnerId)
      await user.send(`🎉 Congratulations! You won **${giveaway.prize}** in the giveaway!`)
    } catch (error) {
      console.error(`Failed to DM winner ${winnerId}:`, error)
    }
  }
}

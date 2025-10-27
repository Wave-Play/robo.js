import { Flashcore } from 'robo.js'
import type { Interaction, ButtonInteraction, GuildMember } from 'discord.js'
import type { Giveaway } from '../types/giveaway.js'
import { BUTTON_COOLDOWN_MS } from '../core/constants.js'

const GIVEAWAY_DATA_NAMESPACE: string[] = ['giveaways', 'data']

export default async (interaction: Interaction) => {
  if (!interaction.isButton()) return

  const [action, type, giveawayId] = interaction.customId.split(':')

  if (action !== 'ga') return

  if (type === 'enter') {
    await handleEnter(interaction, giveawayId)
  } else if (type === 'leave') {
    await handleLeave(interaction, giveawayId)
  }
}

// Rate limiting cooldowns
const cooldowns = new Map<string, number>()

async function handleEnter(interaction: ButtonInteraction, giveawayId: string) {
  const userId = interaction.user.id
  const now = Date.now()
  const cooldownAmount = BUTTON_COOLDOWN_MS

  // Rate limiting check
  if (cooldowns.has(userId)) {
    const expirationTime = cooldowns.get(userId)! + cooldownAmount
    if (now < expirationTime) {
      const timeLeft = Math.ceil((expirationTime - now) / 1000)
      return interaction.reply({
        content: `⏰ Please wait ${timeLeft} second(s) before clicking again!`,
        ephemeral: true
      })
    }
  }

  const giveaway = await Flashcore.get<Giveaway>(giveawayId, { namespace: GIVEAWAY_DATA_NAMESPACE })

  if (!giveaway || giveaway.status !== 'active') {
    return interaction.reply({ content: 'This giveaway is no longer active', ephemeral: true })
  }

  // Check if already entered
  if (giveaway.entries[interaction.user.id]) {
    return interaction.reply({ content: 'You are already entered!', ephemeral: true })
  }

  // Validate eligibility
  const member = interaction.member as GuildMember

  // Check role restrictions
  if (giveaway.allowRoleIds.length > 0) {
    const hasRole = giveaway.allowRoleIds.some((roleId: string) => member.roles.cache.has(roleId))
    if (!hasRole) {
      return interaction.reply({ content: 'You do not have the required role', ephemeral: true })
    }
  }

  if (giveaway.denyRoleIds.length > 0) {
    const hasDeniedRole = giveaway.denyRoleIds.some((roleId: string) =>
      member.roles.cache.has(roleId)
    )
    if (hasDeniedRole) {
      return interaction.reply({
        content: 'You are not eligible for this giveaway',
        ephemeral: true
      })
    }
  }

  // Check account age
  if (giveaway.minAccountAgeDays) {
    const accountAge = Date.now() - interaction.user.createdTimestamp
    const minAge = giveaway.minAccountAgeDays * 86400000
    if (accountAge < minAge) {
      return interaction.reply({
        content: `Your account must be at least ${giveaway.minAccountAgeDays} days old`,
        ephemeral: true
      })
    }
  }

  // Add entry
  giveaway.entries[interaction.user.id] = 1
  await Flashcore.set(giveawayId, giveaway, { namespace: GIVEAWAY_DATA_NAMESPACE })

  // Set cooldown after successful entry
  cooldowns.set(userId, now)
  setTimeout(() => cooldowns.delete(userId), cooldownAmount)

  await interaction.reply({ content: '🎉 Entry confirmed! Good luck!', ephemeral: true })
}

async function handleLeave(interaction: ButtonInteraction, giveawayId: string) {
  const userId = interaction.user.id
  const now = Date.now()
  const cooldownAmount = BUTTON_COOLDOWN_MS

  // Rate limiting check for leave button too
  if (cooldowns.has(userId)) {
    const expirationTime = cooldowns.get(userId)! + cooldownAmount
    if (now < expirationTime) {
      const timeLeft = Math.ceil((expirationTime - now) / 1000)
      return interaction.reply({
        content: `⏰ Please wait ${timeLeft} second(s) before clicking again!`,
        ephemeral: true
      })
    }
  }

  const giveaway = await Flashcore.get<Giveaway>(giveawayId, { namespace: GIVEAWAY_DATA_NAMESPACE })

  if (!giveaway || giveaway.status !== 'active') {
    return interaction.reply({ content: 'This giveaway is no longer active', ephemeral: true })
  }

  if (!giveaway.entries[interaction.user.id]) {
    return interaction.reply({ content: 'You are not entered in this giveaway', ephemeral: true })
  }

  delete giveaway.entries[interaction.user.id]
  await Flashcore.set(giveawayId, giveaway, { namespace: GIVEAWAY_DATA_NAMESPACE })

  // Set cooldown after successful leave
  cooldowns.set(userId, now)
  setTimeout(() => cooldowns.delete(userId), cooldownAmount)

  await interaction.reply({ content: '👋 You have left the giveaway', ephemeral: true })
}

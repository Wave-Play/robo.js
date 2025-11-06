import type { PluginOptions } from '@robojs/xp'

/**
 * @robojs/xp Plugin Configuration
 *
 * Configure global XP defaults for all guilds.
 * Individual guilds can override via /xp config commands or the API.
 *
 * Learn more: https://robojs.dev/plugins/xp
 */
export default {
  defaults: {
    cooldownSeconds: 60,
    xpRate: 1.0,

    // Customize XP terminology to match your bot's theme
    // labels: { xpDisplayName: 'Reputation' },

    // Double XP for everyone
    // multipliers: { server: 2.0 },

    // Exclude specific roles or channels from earning XP
    // noXpRoleIds: ['MUTED_ROLE_ID'],
    // noXpChannelIds: ['SPAM_CHANNEL_ID'],
  },
} satisfies PluginOptions


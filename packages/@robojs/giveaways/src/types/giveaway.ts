/**
 * Flashcore-backed data model representing a single giveaway lifecycle.
 *
 * Giveaway records are written when a giveaway is created, mutated as entries
 * are collected and winners announced, and stored in the `giveaways:data`
 * namespace for durability across restarts.
 */
export interface Giveaway {
  /** Unique giveaway identifier, currently a ULID string. */
  id: string
  /** Discord guild ID hosting the giveaway. */
  guildId: string
  /** Discord channel ID where the giveaway message lives. */
  channelId: string
  /** Discord message ID for the giveaway announcement. */
  messageId: string
  /** Prize description that appears in embeds and DMs. */
  prize: string
  /** Number of winners that should be selected when the giveaway ends. */
  winnersCount: number
  /** Epoch timestamp (ms) at which the giveaway should end. */
  endsAt: number
  /** Discord user ID of the moderator that started the giveaway. */
  startedBy: string
  /** Current lifecycle state of the giveaway. */
  status: 'active' | 'ended' | 'cancelled'
  /** Whitelist of role IDs; empty array allows all roles to enter. */
  allowRoleIds: string[]
  /** Blacklist of role IDs prohibited from entering. */
  denyRoleIds: string[]
  /** Minimum required account age for entrants, or null to disable. */
  minAccountAgeDays: number | null
  /** Entrant weighting map keyed by Discord user ID. */
  entries: Record<string, number>
  /** User IDs selected as winners when the giveaway finalized. */
  winners: string[]
  /** Historical reroll batches, newest appended to the array. */
  rerolls: string[][]
  /** Epoch timestamp (ms) when the giveaway record was created. */
  createdAt: number
  /** Epoch timestamp (ms) when the giveaway ended or was cancelled. */
  finalizedAt: number | null
  /** Optional cron job identifier when scheduled via @robojs/cron. */
  cronJobId?: string | null
}

/**
 * Per-guild configuration envelope that customizes giveaway behaviour.
 *
 * Settings are merged with {@link DEFAULT_SETTINGS} at runtime to ensure a
 * complete object is always available to commands and utilities.
 */
export interface GuildSettings {
  /** Default attributes applied to newly created giveaways. */
  defaults: {
    /** Default number of winners for `/giveaway start`. */
    winners: number
    /** Default ISO 8601 duration string (e.g. `1h`, `2d`). */
    duration: string
    /** Custom label displayed on the entry button component. */
    buttonLabel: string
    /** Whether winners should receive direct messages when selected. */
    dmWinners: boolean
  }
  /** Safety limits enforced across all giveaways within a guild. */
  limits: {
    /** Upper bound on the number of winners that can be configured. */
    maxWinners: number
    /** Maximum giveaway duration expressed in whole days. */
    maxDurationDays: number
  }
  /** Guild-wide entry requirements enforced for every giveaway. */
  restrictions: {
    /** Role IDs that are explicitly allowed to enter; empty means all roles allowed. */
    allowRoleIds: string[]
    /** Role IDs that are prevented from entering. */
    denyRoleIds: string[]
    /** Minimum required Discord account age in days, or null to disable. */
    minAccountAgeDays: number | null
  }
}

/**
 * Baseline giveaway settings applied when a guild has not customized its
 * configuration. Defaults provide one winner, one-hour duration, and sensible
 * safety limits (20 winners max, 30-day maximum duration).
 */
export const DEFAULT_SETTINGS: GuildSettings = {
  defaults: {
    winners: 1,
    duration: '1h',
    buttonLabel: 'Enter Giveaway',
    dmWinners: true
  },
  limits: {
    maxWinners: 20,
    maxDurationDays: 30
  },
  restrictions: {
    allowRoleIds: [],
    denyRoleIds: [],
    minAccountAgeDays: null
  }
}

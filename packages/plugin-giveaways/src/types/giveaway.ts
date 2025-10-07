export interface Giveaway {
  id: string
  guildId: string
  channelId: string
  messageId: string
  prize: string
  winnersCount: number
  endsAt: number
  startedBy: string
  status: 'active' | 'ended' | 'cancelled'
  allowRoleIds: string[]
  denyRoleIds: string[]
  minAccountAgeDays: number | null
  entries: Record<string, number>
  winners: string[]
  rerolls: string[][]
  createdAt: number
  finalizedAt: number | null
}

export interface GuildSettings {
  defaults: {
    winners: number
    duration: string
    buttonLabel: string
    dmWinners: boolean
  }
  limits: {
    maxWinners: number
    maxDurationDays: number
  }
  restrictions: {
    allowRoleIds: string[]
    denyRoleIds: string[]
    minAccountAgeDays: number | null
  }
}

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

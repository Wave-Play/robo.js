export const GIVEAWAY_DATA_NAMESPACE: string[] = ['giveaways', 'data']
export const MESSAGES_NAMESPACE: string[] = ['giveaways', 'messages']

export const guildActiveNamespace = (guildId: string): string[] => [
  'giveaways',
  'guilds',
  guildId,
  'active'
]

export const guildRecentNamespace = (guildId: string): string[] => [
  'giveaways',
  'guilds',
  guildId,
  'recent'
]

export const guildSettingsNamespace = (guildId: string): string[] => [
  'giveaways',
  'guilds',
  guildId,
  'settings'
]

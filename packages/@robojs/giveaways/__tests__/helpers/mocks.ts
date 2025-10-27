/**
 * Comprehensive mock implementations for external dependencies
 * Used across all test files to simulate Flashcore, Discord.js, and other dependencies
 */

import { jest } from '@jest/globals'
import type {
  CommandInteraction,
  ButtonInteraction,
  TextChannel,
  Message,
  GuildMember,
  Client,
  User,
  EmbedBuilder,
  Guild,
  Role
} from 'discord.js'

/**
 * Helper to create typed jest mocks
 * @jest/globals has strict typing that doesn't work well with our mock patterns
 */
const fn = jest.fn as any

/**
 * ====================
 * FLASHCORE MOCKS
 * ====================
 */

// In-memory storage for Flashcore mock
const flashcoreStorage = new Map<string, any>()

/**
 * Converts a namespace array to a storage key
 */
function namespaceToKey(namespace: string[]): string {
  return namespace.join(':')
}

/**
 * Mock Flashcore implementation with in-memory storage
 */
export const mockFlashcore = {
  get: fn((key: string, options?: { namespace?: string[] }) => {
    const namespace = options?.namespace || []
    const fullKey = [...namespace, key].join(':')
    return flashcoreStorage.get(fullKey)
  }) as any,
  set: fn((key: string, value: any, options?: { namespace?: string[] }) => {
    const namespace = options?.namespace || []
    const fullKey = [...namespace, key].join(':')
    flashcoreStorage.set(fullKey, value)
    return value
  }) as any,
  delete: fn((key: string, options?: { namespace?: string[] }) => {
    const namespace = options?.namespace || []
    const fullKey = [...namespace, key].join(':')
    flashcoreStorage.delete(fullKey)
  }) as any
}

/**
 * Clears all stored data in Flashcore mock
 */
export function clearFlashcoreStorage(): void {
  flashcoreStorage.clear()
}

/**
 * Gets the internal storage map for inspection in tests
 */
export function getFlashcoreStorage(): Map<string, any> {
  return flashcoreStorage
}

/**
 * ====================
 * DISCORD.JS MOCKS
 * ====================
 */

/**
 * Creates a mock CommandInteraction for testing command handlers
 */
export function createMockInteraction(overrides: Partial<CommandInteraction> = {}): CommandInteraction {
  const defaultUser = createMockUser({ id: 'test-user-123', username: 'TestUser' } as any)
  const defaultGuild = { id: 'test-guild-123', name: 'Test Guild' } as Guild
  const defaultChannel = createMockChannel({ id: 'test-channel-456' } as any)

  const interaction = {
    user: defaultUser,
    guild: defaultGuild,
    guildId: defaultGuild.id,
    channel: defaultChannel,
    channelId: defaultChannel.id,
    member: createMockGuildMember({ user: defaultUser } as any),
    id: 'test-interaction-001',
    createdTimestamp: Date.now(),
    replied: false,
    deferred: false,
    isButton: fn().mockReturnValue(false),
    isCommand: fn().mockReturnValue(true),
    isChatInputCommand: fn().mockReturnValue(true),
    reply: fn().mockImplementation(async function(this: any) {
      this.replied = true
      return Promise.resolve()
    }),
    deferReply: fn().mockImplementation(async function(this: any) {
      this.deferred = true
      return Promise.resolve()
    }),
    editReply: fn().mockResolvedValue({}),
    followUp: fn().mockResolvedValue({}),
    options: {
      getString: fn(),
      getInteger: fn(),
      getBoolean: fn(),
      getUser: fn(),
      getRole: fn(),
      getChannel: fn()
    },
    commandName: 'test-command',
    ...overrides
  } as unknown as CommandInteraction

  return interaction
}

/**
 * Creates a mock ButtonInteraction for testing button handlers
 */
export function createMockButtonInteraction(customId: string, overrides: Partial<ButtonInteraction> = {}): ButtonInteraction {
  const defaultUser = createMockUser({ id: 'test-user-123', username: 'TestUser' } as any)
  const defaultGuild = { id: 'test-guild-123', name: 'Test Guild' } as Guild
  const defaultChannel = createMockChannel({ id: 'test-channel-456' } as any)

  const interaction = {
    customId,
    user: defaultUser,
    guild: defaultGuild,
    guildId: defaultGuild.id,
    channel: defaultChannel,
    channelId: defaultChannel.id,
    member: createMockGuildMember({ user: defaultUser } as any),
    message: createMockMessage({ id: 'test-message-789' } as any),
    id: 'test-interaction-002',
    createdTimestamp: Date.now(),
    replied: false,
    deferred: false,
    isButton: fn().mockReturnValue(true),
    isCommand: fn().mockReturnValue(false),
    reply: fn().mockImplementation(async function(this: any) {
      this.replied = true
      return Promise.resolve()
    }),
    deferReply: fn().mockImplementation(async function(this: any) {
      this.deferred = true
      return Promise.resolve()
    }),
    update: fn().mockResolvedValue({}),
    editReply: fn().mockResolvedValue({}),
    followUp: fn().mockResolvedValue({}),
    ...overrides
  } as unknown as ButtonInteraction

  return interaction
}

/**
 * Creates a mock TextChannel for testing channel operations
 */
export function createMockChannel(overrides: Partial<TextChannel> = {}): TextChannel {
  const messageMap = new Map<string, Message>()
  let messageCounter = 1

  const channel = {
    id: 'test-channel-123',
    type: 0, // GUILD_TEXT
    name: 'test-channel',
    guild: { id: 'test-guild-123' } as Guild,
    isTextBased: fn().mockReturnValue(true),
    send: fn(),
    messages: {
      fetch: fn().mockImplementation(async (messageId: string) => {
        const message = messageMap.get(messageId)
        if (!message) throw new Error('Unknown Message')
        return message
      }),
      cache: messageMap
    },
    fetch: fn(),
    ...overrides
  } as unknown as TextChannel

  // Set fetch to return channel after initialization
  channel.fetch = fn().mockResolvedValue(channel)

  // Wire up send to create messages bound to this channel and add to cache
  channel.send = fn().mockImplementation(async () => {
    const messageId = `test-message-${String(messageCounter++).padStart(3, '0')}`
    const message = createMockMessage({ id: messageId, channel, channelId: channel.id } as any)
    messageMap.set(messageId, message)
    return message
  })

  return channel
}

/**
 * Creates a mock Message for testing message operations
 */
export function createMockMessage(overrides: Partial<Message> = {}): Message {
  // Use provided channel or create a new one
  const channel = overrides.channel || createMockChannel()

  const message = {
    id: 'test-message-123',
    content: 'Test message',
    embeds: [],
    author: createMockUser(),
    channel,
    channelId: overrides.channelId || channel.id,
    guild: (channel as any).guild,
    guildId: (channel as any).guild?.id,
    url: `https://discord.com/channels/test-guild-123/${channel.id}/test-message-123`,
    createdTimestamp: Date.now(),
    edit: fn(),
    delete: fn(),
    fetch: fn(),
    ...overrides
  } as unknown as Message

  // Set methods to return message after initialization
  message.edit = fn().mockResolvedValue(message)
  message.delete = fn().mockResolvedValue(message)
  message.fetch = fn().mockResolvedValue(message)

  return message
}

/**
 * Creates a mock channel and message setup for testing giveaway operations
 * Returns configured mocks ready for channel.fetch to resolve
 */
export function createMockChannelWithMessage(overrides: {
  channelOverrides?: Partial<TextChannel>
  messageOverrides?: Partial<Message>
} = {}): { mockChannel: any; mockMessage: any } {
  const mockMessage = {
    embeds: [{}],
    edit: fn().mockResolvedValue(undefined),
    ...overrides.messageOverrides
  }

  const mockChannel = {
    isTextBased: fn().mockReturnValue(true),
    send: fn().mockResolvedValue({}),
    messages: {
      fetch: fn().mockResolvedValue(mockMessage)
    },
    ...overrides.channelOverrides
  }

  return { mockChannel, mockMessage }
}

/**
 * Creates a mock GuildMember for testing member operations
 */
export function createMockGuildMember(overrides: Partial<GuildMember> = {}): GuildMember {
  const user = overrides.user || createMockUser()
  const roleMap = new Map<string, Role>()

  const member = {
    id: user.id,
    user,
    guild: { id: 'test-guild-123' } as Guild,
    roles: {
      cache: roleMap,
      add: fn(),
      remove: fn(),
      set: fn()
    },
    nickname: null,
    displayName: user.username,
    joinedTimestamp: Date.now() - 86400000, // 1 day ago
    ...overrides
  } as unknown as GuildMember

  // Set role methods to return member after initialization
  member.roles.add = fn().mockResolvedValue(member)
  member.roles.remove = fn().mockResolvedValue(member)
  member.roles.set = fn().mockResolvedValue(member)

  return member
}

/**
 * Creates a mock User for testing user operations
 */
export function createMockUser(overrides: Partial<User> = {}): User {
  const user = {
    id: 'test-user-123',
    username: 'TestUser',
    discriminator: '0001',
    bot: false,
    createdTimestamp: Date.now() - 31536000000, // 1 year ago
    displayName: 'TestUser',
    tag: 'TestUser#0001',
    send: fn().mockResolvedValue({}),
    ...overrides
  } as unknown as User

  return user
}

/**
 * Creates a mock Client for testing client operations
 */
export function createMockClient(overrides: Partial<Client> = {}): Client {
  const channelMap = new Map()
  const userMap = new Map()

  const client = {
    user: createMockUser({ id: 'bot-user-123', username: 'TestBot', bot: true } as any),
    channels: {
      fetch: fn().mockImplementation(async (channelId: string) => {
        if (channelMap.has(channelId)) return channelMap.get(channelId)
        const channel = createMockChannel({ id: channelId } as any)
        channelMap.set(channelId, channel)
        return channel
      }),
      cache: channelMap
    },
    users: {
      fetch: fn().mockImplementation(async (userId: string) => {
        if (userMap.has(userId)) return userMap.get(userId)
        const user = createMockUser({ id: userId } as any)
        userMap.set(userId, user)
        return user
      }),
      cache: userMap
    },
    guilds: {
      fetch: fn(),
      cache: new Map()
    },
    ...overrides
  } as unknown as Client

  return client
}

/**
 * Creates a mock EmbedBuilder for testing embed creation
 */
export function createMockEmbed(data: any = {}): EmbedBuilder {
  const embedData = { ...data }

  const embed = {
    data: embedData,
    setTitle: fn().mockImplementation(function(this: any, title: string) {
      this.data.title = title
      return this
    }),
    setDescription: fn().mockImplementation(function(this: any, description: string) {
      this.data.description = description
      return this
    }),
    setColor: fn().mockImplementation(function(this: any, color: number) {
      this.data.color = color
      return this
    }),
    addFields: fn().mockImplementation(function(this: any, ...fields: any[]) {
      this.data.fields = [...(this.data.fields || []), ...fields]
      return this
    }),
    setFooter: fn().mockImplementation(function(this: any, footer: any) {
      this.data.footer = footer
      return this
    }),
    setTimestamp: fn().mockImplementation(function(this: any, timestamp?: number) {
      this.data.timestamp = timestamp || Date.now()
      return this
    }),
    toJSON: fn().mockImplementation(function(this: any) {
      return this.data
    })
  } as unknown as EmbedBuilder

  return embed
}

/**
 * ====================
 * ROBO.JS MOCKS
 * ====================
 */

/**
 * Mock client that can be imported by tested modules
 */
export let mockClient: Client = createMockClient()

/**
 * Updates the mock client instance
 */
export function setMockClient(client: Client): void {
  mockClient = client
}

/**
 * ====================
 * UTILITY MOCKS
 * ====================
 */

let ulidCounter = 0

/**
 * Mock ULID generator that returns predictable IDs
 */
export const mockUlid = fn((): string => {
  ulidCounter++
  return `test-ulid-${String(ulidCounter).padStart(3, '0')}`
})

/**
 * Resets the ULID counter
 */
export function resetUlidCounter(): void {
  ulidCounter = 0
}

/**
 * ====================
 * CRON MOCKS
 * ====================
 */

const cronJobs = new Map<string, any>()
let cronAvailable = true

/**
 * Mock save method that can be tracked across all Cron calls
 */
const mockSave = fn(async function(this: any, id?: string) {
  const jobId = id || `job-${cronJobs.size + 1}`
  cronJobs.set(jobId, { expression: this.expression, job: this.job })
  return jobId
})

/**
 * Mock Cron function for @robojs/cron
 * The Cron function is called with (expression, job) and returns an object with a save method
 */
export const mockCron: any = fn((expression: string, job: string | (() => void)) => {
  return {
    expression,
    job,
    save: mockSave
  }
})

// Static methods on Cron
mockCron.get = fn((id: string) => {
  return cronJobs.get(id)
})

mockCron.remove = fn(async (id: string) => {
  cronJobs.delete(id)
})

mockCron.list = fn(() => {
  return Array.from(cronJobs.keys())
})

mockCron.save = mockSave

/**
 * Mock for @robojs/cron module imports
 */
export const mockCronModule = {
  Cron: mockCron
}

/**
 * Sets whether cron is available (for testing fallback behavior)
 */
export function setCronAvailable(available: boolean): void {
  cronAvailable = available
}

/**
 * Checks if cron is available
 */
export function isCronAvailable(): boolean {
  return cronAvailable
}

/**
 * Clears all cron jobs
 */
export function clearCronJobs(): void {
  cronJobs.clear()
  mockSave.mockClear()
}

/**
 * ====================
 * RESET ALL MOCKS
 * ====================
 */

/**
 * Resets all mocks to their initial state
 * Call this in afterEach hooks
 */
export function resetAllMocks(): void {
  clearFlashcoreStorage()
  resetUlidCounter()
  clearCronJobs()
  setCronAvailable(true)

  jest.clearAllMocks()

  mockFlashcore.get.mockImplementation((key: string, options?: { namespace?: string[] }) => {
    const namespace = options?.namespace || []
    const fullKey = [...namespace, key].join(':')
    return flashcoreStorage.get(fullKey)
  })

  mockFlashcore.set.mockImplementation((key: string, value: any, options?: { namespace?: string[] }) => {
    const namespace = options?.namespace || []
    const fullKey = [...namespace, key].join(':')
    flashcoreStorage.set(fullKey, value)
    return value
  })

  mockFlashcore.delete.mockImplementation((key: string, options?: { namespace?: string[] }) => {
    const namespace = options?.namespace || []
    const fullKey = [...namespace, key].join(':')
    flashcoreStorage.delete(fullKey)
  })
}

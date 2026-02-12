/**
 * Member Presence Tests
 *
 * Tests for dispatching PRESENCE_UPDATE events for other guild members
 * with rich activity details including clientStatus, timestamps, assets,
 * party, buttons, and emoji.
 */
import { ActivityType, Client, Events, GatewayIntentBits, Presence } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { PRIVILEGED_INTENTS } from '../setup/constants.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForReady, delay } from '../utils/helpers.js'

describe('Member Presence', () => {
  let client: Client | null = null
  let session: { id: string; token: string }
  let guildId: string

  beforeAll(async () => {
    session = await createSession({
      name: 'member-presence-tests',
      config: {
        guilds: [{ name: 'Presence Test Guild' }],
        enforceIntents: true,
        approvedPrivilegedIntents: BigInt(PRIVILEGED_INTENTS.GUILD_PRESENCES | PRIVILEGED_INTENTS.GUILD_MEMBERS)
      }
    })

    client = createTestClient({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildPresences, GatewayIntentBits.GuildMembers]
    })
    await client.login(session.token)
    await waitForReady(client)

    const guild = client.guilds.cache.first()!
    guildId = guild.id
  })

  afterAll(async () => {
    await destroyClient(client)
    client = null
  })

  /**
   * Helper to add a member to the guild
   */
  async function addMember(userId: string, username: string): Promise<void> {
    await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
      guild_id: guildId,
      user: {
        id: userId,
        username,
        discriminator: '0000',
        avatar: null,
        bot: false
      },
      roles: [],
      joined_at: new Date().toISOString(),
      deaf: false,
      mute: false
    })
    await delay(100)
  }

  describe('Client Status', () => {
    it('should receive PRESENCE_UPDATE with clientStatus', async () => {
      const memberId = generateSnowflake()
      await addMember(memberId, 'ClientStatusUser')

      // Set up presence update listener
      const presencePromise = new Promise<Presence>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout waiting for presenceUpdate')), 5000)
        client!.once(Events.PresenceUpdate, (_oldPresence, newPresence) => {
          clearTimeout(timeout)
          resolve(newPresence)
        })
      })

      // Dispatch PRESENCE_UPDATE
      await dispatchEvent(session.id, 'PRESENCE_UPDATE', {
        user: { id: memberId },
        guild_id: guildId,
        status: 'online',
        client_status: {
          desktop: 'online',
          mobile: 'idle',
          web: 'dnd'
        },
        activities: []
      })

      const presence = await presencePromise

      expect(presence.clientStatus?.desktop).toBe('online')
      expect(presence.clientStatus?.mobile).toBe('idle')
      expect(presence.clientStatus?.web).toBe('dnd')
    })
  })

  describe('Activity Timestamps', () => {
    it('should have activity timestamps', async () => {
      const memberId = generateSnowflake()
      await addMember(memberId, 'TimestampUser')

      const presencePromise = new Promise<Presence>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout waiting for presenceUpdate')), 5000)
        client!.once(Events.PresenceUpdate, (_oldPresence, newPresence) => {
          clearTimeout(timeout)
          resolve(newPresence)
        })
      })

      const startTime = Date.now() - 60000
      const endTime = Date.now() + 60000

      await dispatchEvent(session.id, 'PRESENCE_UPDATE', {
        user: { id: memberId },
        guild_id: guildId,
        status: 'online',
        activities: [
          {
            name: 'Test Game',
            type: ActivityType.Playing,
            timestamps: {
              start: startTime,
              end: endTime
            }
          }
        ]
      })

      const presence = await presencePromise
      const activity = presence.activities[0]

      expect(activity?.timestamps?.start?.getTime()).toBe(startTime)
      expect(activity?.timestamps?.end?.getTime()).toBe(endTime)
    })
  })

  describe('Activity Assets', () => {
    it('should have activity assets', async () => {
      const memberId = generateSnowflake()
      await addMember(memberId, 'AssetsUser')

      const presencePromise = new Promise<Presence>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout waiting for presenceUpdate')), 5000)
        client!.once(Events.PresenceUpdate, (_oldPresence, newPresence) => {
          clearTimeout(timeout)
          resolve(newPresence)
        })
      })

      await dispatchEvent(session.id, 'PRESENCE_UPDATE', {
        user: { id: memberId },
        guild_id: guildId,
        status: 'online',
        activities: [
          {
            name: 'Rich Game',
            type: ActivityType.Playing,
            assets: {
              large_image: 'large_image_id',
              large_text: 'Large Image Text',
              small_image: 'small_image_id',
              small_text: 'Small Image Text'
            }
          }
        ]
      })

      const presence = await presencePromise
      const activity = presence.activities[0]

      expect(activity?.assets?.largeImage).toBe('large_image_id')
      expect(activity?.assets?.largeText).toBe('Large Image Text')
      expect(activity?.assets?.smallImage).toBe('small_image_id')
      expect(activity?.assets?.smallText).toBe('Small Image Text')
    })
  })

  describe('Activity Party', () => {
    it('should have activity party', async () => {
      const memberId = generateSnowflake()
      await addMember(memberId, 'PartyUser')

      const presencePromise = new Promise<Presence>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout waiting for presenceUpdate')), 5000)
        client!.once(Events.PresenceUpdate, (_oldPresence, newPresence) => {
          clearTimeout(timeout)
          resolve(newPresence)
        })
      })

      await dispatchEvent(session.id, 'PRESENCE_UPDATE', {
        user: { id: memberId },
        guild_id: guildId,
        status: 'online',
        activities: [
          {
            name: 'Party Game',
            type: ActivityType.Playing,
            party: {
              id: 'party123',
              size: [3, 5]
            }
          }
        ]
      })

      const presence = await presencePromise
      const activity = presence.activities[0]

      expect(activity?.party?.id).toBe('party123')
      expect(activity?.party?.size).toEqual([3, 5])
    })
  })

  describe('Activity Buttons', () => {
    it('should have activity buttons', async () => {
      const memberId = generateSnowflake()
      await addMember(memberId, 'ButtonsUser')

      const presencePromise = new Promise<Presence>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout waiting for presenceUpdate')), 5000)
        client!.once(Events.PresenceUpdate, (_oldPresence, newPresence) => {
          clearTimeout(timeout)
          resolve(newPresence)
        })
      })

      await dispatchEvent(session.id, 'PRESENCE_UPDATE', {
        user: { id: memberId },
        guild_id: guildId,
        status: 'online',
        activities: [
          {
            name: 'Button Game',
            type: ActivityType.Playing,
            buttons: ['Join Game', 'View Profile']
          }
        ]
      })

      const presence = await presencePromise
      const activity = presence.activities[0]

      expect(activity?.buttons).toContain('Join Game')
      expect(activity?.buttons).toContain('View Profile')
    })
  })

  describe('Activity Emoji', () => {
    it('should have activity emoji for custom status', async () => {
      const memberId = generateSnowflake()
      await addMember(memberId, 'EmojiUser')

      const presencePromise = new Promise<Presence>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout waiting for presenceUpdate')), 5000)
        client!.once(Events.PresenceUpdate, (_oldPresence, newPresence) => {
          clearTimeout(timeout)
          resolve(newPresence)
        })
      })

      await dispatchEvent(session.id, 'PRESENCE_UPDATE', {
        user: { id: memberId },
        guild_id: guildId,
        status: 'online',
        activities: [
          {
            name: 'Custom Status',
            type: ActivityType.Custom,
            state: 'Feeling good!',
            emoji: {
              name: '😊'
            }
          }
        ]
      })

      const presence = await presencePromise
      const activity = presence.activities[0]

      expect(activity?.emoji?.name).toBe('😊')
    })
  })

  describe('Multiple Activities', () => {
    it('should have multiple activities', async () => {
      const memberId = generateSnowflake()
      await addMember(memberId, 'MultiActivityUser')

      const presencePromise = new Promise<Presence>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout waiting for presenceUpdate')), 5000)
        client!.once(Events.PresenceUpdate, (_oldPresence, newPresence) => {
          clearTimeout(timeout)
          resolve(newPresence)
        })
      })

      await dispatchEvent(session.id, 'PRESENCE_UPDATE', {
        user: { id: memberId },
        guild_id: guildId,
        status: 'online',
        activities: [
          { name: 'Game 1', type: ActivityType.Playing },
          { name: 'Spotify', type: ActivityType.Listening },
          { name: 'Happy!', type: ActivityType.Custom, state: 'Happy!' }
        ]
      })

      const presence = await presencePromise

      expect(presence.activities.length).toBe(3)
    })
  })
})

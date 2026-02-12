/**
 * Typing Start Event Tests
 *
 * Tests for the typing start event including channel, user, member, and timestamp properties.
 */
import { ChannelType, Client, Events, GatewayIntentBits, TextChannel, Typing } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForReady } from '../utils/helpers.js'

describe('Typing Start Event', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'typing-start-tests',
			config: {
				guilds: [
					{
						name: 'Typing Test Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createTestClient({
			intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessageTyping, GatewayIntentBits.DirectMessageTyping]
		})
		await client.login(session.token)
		await waitForReady(client)

		channel = client.guilds.cache.first()!.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	it('should receive typing start event', async () => {
		const userId = generateSnowflake()

		const typingPromise = new Promise<Typing>((resolve, reject) => {
			const timeout = setTimeout(() => {
				client!.off(Events.TypingStart, handler)
				reject(new Error('Timeout waiting for typing event'))
			}, 5000)

			const handler = (typing: Typing) => {
				if (typing.channel.id === channel.id) {
					clearTimeout(timeout)
					client!.off(Events.TypingStart, handler)
					resolve(typing)
				}
			}

			client!.on(Events.TypingStart, handler)
		})

		await dispatchEvent(session.id, 'TYPING_START', {
			channel_id: channel.id,
			guild_id: channel.guildId,
			user_id: userId,
			timestamp: Math.floor(Date.now() / 1000),
			member: {
				user: { id: userId, username: 'Typer', discriminator: '0', avatar: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			}
		})

		const typing = await typingPromise

		expect(typing.channel.id).toBe(channel.id)
		expect(typing.user?.id).toBe(userId)
	})

	it('should have member property', async () => {
		const memberId = generateSnowflake()

		const typingPromise = new Promise<Typing>((resolve, reject) => {
			const timeout = setTimeout(() => {
				client!.off(Events.TypingStart, handler)
				reject(new Error('Timeout waiting for typing event'))
			}, 5000)

			const handler = (typing: Typing) => {
				if (typing.user?.id === memberId) {
					clearTimeout(timeout)
					client!.off(Events.TypingStart, handler)
					resolve(typing)
				}
			}

			client!.on(Events.TypingStart, handler)
		})

		await dispatchEvent(session.id, 'TYPING_START', {
			channel_id: channel.id,
			guild_id: channel.guildId,
			user_id: memberId,
			member: {
				user: { id: memberId, username: 'TyperMember', discriminator: '0', avatar: null },
				nick: 'Typing Nick',
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			},
			timestamp: Math.floor(Date.now() / 1000)
		})

		const typing = await typingPromise

		expect(typing.member?.nickname).toBe('Typing Nick')
	})

	it('should have startedTimestamp', async () => {
		const userId = generateSnowflake()
		const timestamp = Math.floor(Date.now() / 1000)

		const typingPromise = new Promise<Typing>((resolve, reject) => {
			const timeout = setTimeout(() => {
				client!.off(Events.TypingStart, handler)
				reject(new Error('Timeout waiting for typing event'))
			}, 5000)

			const handler = (typing: Typing) => {
				if (typing.user?.id === userId) {
					clearTimeout(timeout)
					client!.off(Events.TypingStart, handler)
					resolve(typing)
				}
			}

			client!.on(Events.TypingStart, handler)
		})

		await dispatchEvent(session.id, 'TYPING_START', {
			channel_id: channel.id,
			guild_id: channel.guildId,
			user_id: userId,
			timestamp,
			member: {
				user: { id: userId, username: 'TimestampTyper', discriminator: '0', avatar: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			}
		})

		const typing = await typingPromise

		expect(typing.startedTimestamp).toBe(timestamp * 1000)
		expect(typing.startedAt).toBeInstanceOf(Date)
	})

	it('should work in DM', async () => {
		const recipientId = generateSnowflake()

		// Add the user to the session first
		await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
			guild_id: client!.guilds.cache.first()!.id,
			user: { id: recipientId, username: 'DMTyper', discriminator: '0', avatar: null },
			roles: [],
			joined_at: new Date().toISOString(),
			deaf: false,
			mute: false
		})

		// Fetch user and create DM channel
		const user = await client!.users.fetch(recipientId)
		const dmChannel = await user.createDM()

		const typingPromise = new Promise<Typing>((resolve, reject) => {
			const timeout = setTimeout(() => {
				client!.off(Events.TypingStart, handler)
				reject(new Error('Timeout waiting for DM typing event'))
			}, 5000)

			const handler = (typing: Typing) => {
				if (typing.channel.id === dmChannel.id) {
					clearTimeout(timeout)
					client!.off(Events.TypingStart, handler)
					resolve(typing)
				}
			}

			client!.on(Events.TypingStart, handler)
		})

		await dispatchEvent(session.id, 'TYPING_START', {
			channel_id: dmChannel.id,
			user_id: recipientId,
			timestamp: Math.floor(Date.now() / 1000)
		})

		const typing = await typingPromise

		expect(typing.channel.id).toBe(dmChannel.id)
	}, 10000)
})

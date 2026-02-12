import { Client, Events, ChatInputCommandInteraction, ApplicationCommandType, ChannelType } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForEvent, waitForReady, generateSnowflake } from '../utils/helpers.js'

describe('Interaction Response States', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guildId: string
	let channelId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'interaction-states',
			config: {
				guilds: [
					{
						name: 'Test Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createTestClient()
		await client.login(session.token)
		await waitForReady(client)

		const guild = client.guilds.cache.first()!
		guildId = guild.id
		const channel = guild.channels.cache.first()!
		channelId = channel.id
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	it('should track replied state', async () => {
		const interactionId = generateSnowflake()
		const userId = generateSnowflake()
		const eventPromise = waitForEvent(client!, Events.InteractionCreate, 5000)

		await dispatchEvent(session.id, 'INTERACTION_CREATE', {
			id: interactionId,
			application_id: client!.user!.id,
			type: 2, // ApplicationCommand
			guild_id: guildId,
			channel_id: channelId,
			channel: {
				id: channelId,
				type: ChannelType.GuildText
			},
			member: {
				user: { id: userId, username: 'TestUser', discriminator: '0000', avatar: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			},
			user: { id: userId, username: 'TestUser', discriminator: '0000', avatar: null },
			data: {
				id: generateSnowflake(),
				name: 'testcmd',
				type: ApplicationCommandType.ChatInput
			},
			token: `test-${Date.now()}`,
			version: 1
		})

		const interaction = (await eventPromise) as ChatInputCommandInteraction
		expect(interaction.replied).toBe(false)

		await interaction.reply({ content: 'Response' })
		expect(interaction.replied).toBe(true)
	})

	it('should track deferred state', async () => {
		const interactionId = generateSnowflake()
		const userId = generateSnowflake()
		const eventPromise = waitForEvent(client!, Events.InteractionCreate, 5000)

		await dispatchEvent(session.id, 'INTERACTION_CREATE', {
			id: interactionId,
			application_id: client!.user!.id,
			type: 2,
			guild_id: guildId,
			channel_id: channelId,
			channel: {
				id: channelId,
				type: ChannelType.GuildText
			},
			member: {
				user: { id: userId, username: 'TestUser', discriminator: '0000', avatar: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			},
			user: { id: userId, username: 'TestUser', discriminator: '0000', avatar: null },
			data: {
				id: generateSnowflake(),
				name: 'testcmd',
				type: ApplicationCommandType.ChatInput
			},
			token: `test-${Date.now()}`,
			version: 1
		})

		const interaction = (await eventPromise) as ChatInputCommandInteraction
		expect(interaction.deferred).toBe(false)

		await interaction.deferReply()
		expect(interaction.deferred).toBe(true)
	})

	it('should track ephemeral state', async () => {
		const interactionId = generateSnowflake()
		const userId = generateSnowflake()
		const eventPromise = waitForEvent(client!, Events.InteractionCreate, 5000)

		await dispatchEvent(session.id, 'INTERACTION_CREATE', {
			id: interactionId,
			application_id: client!.user!.id,
			type: 2,
			guild_id: guildId,
			channel_id: channelId,
			channel: {
				id: channelId,
				type: ChannelType.GuildText
			},
			member: {
				user: { id: userId, username: 'TestUser', discriminator: '0000', avatar: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			},
			user: { id: userId, username: 'TestUser', discriminator: '0000', avatar: null },
			data: {
				id: generateSnowflake(),
				name: 'testcmd',
				type: ApplicationCommandType.ChatInput
			},
			token: `test-${Date.now()}`,
			version: 1
		})

		const interaction = (await eventPromise) as ChatInputCommandInteraction
		expect(interaction.ephemeral).toBeNull()

		await interaction.reply({ content: 'Secret response', ephemeral: true })
		expect(interaction.ephemeral).toBe(true)
	})

	it('should fetchReply after responding', async () => {
		const interactionId = generateSnowflake()
		const userId = generateSnowflake()
		const eventPromise = waitForEvent(client!, Events.InteractionCreate, 5000)

		await dispatchEvent(session.id, 'INTERACTION_CREATE', {
			id: interactionId,
			application_id: client!.user!.id,
			type: 2,
			guild_id: guildId,
			channel_id: channelId,
			channel: {
				id: channelId,
				type: ChannelType.GuildText
			},
			member: {
				user: { id: userId, username: 'TestUser', discriminator: '0000', avatar: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			},
			user: { id: userId, username: 'TestUser', discriminator: '0000', avatar: null },
			data: {
				id: generateSnowflake(),
				name: 'testcmd',
				type: ApplicationCommandType.ChatInput
			},
			token: `test-${Date.now()}`,
			version: 1
		})

		const interaction = (await eventPromise) as ChatInputCommandInteraction
		await interaction.reply({ content: 'Fetch me!' })

		const message = await interaction.fetchReply()
		expect(message).toBeDefined()
		expect(message.content).toBe('Fetch me!')
	})
})

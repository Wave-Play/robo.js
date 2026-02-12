import {
	Client,
	Events,
	AutocompleteInteraction,
	ApplicationCommandType,
	ApplicationCommandOptionType,
	ChannelType
} from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForEvent, waitForReady, generateSnowflake } from '../utils/helpers.js'

describe('Autocomplete Interaction', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guildId: string
	let channelId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'autocomplete',
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

	it('should identify as autocomplete interaction', async () => {
		const interactionId = generateSnowflake()
		const userId = generateSnowflake()
		const eventPromise = waitForEvent(client!, Events.InteractionCreate, 5000)

		await dispatchEvent(session.id, 'INTERACTION_CREATE', {
			id: interactionId,
			application_id: client!.user!.id,
			type: 4, // ApplicationCommandAutocomplete
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
				name: 'search',
				type: ApplicationCommandType.ChatInput,
				options: [
					{
						name: 'query',
						type: ApplicationCommandOptionType.String,
						value: 'test',
						focused: true
					}
				]
			},
			token: `test-${Date.now()}`,
			version: 1
		})

		const interaction = (await eventPromise) as AutocompleteInteraction
		expect(interaction.isAutocomplete()).toBe(true)
	})

	it('should respond with choices', async () => {
		const interactionId = generateSnowflake()
		const userId = generateSnowflake()
		const eventPromise = waitForEvent(client!, Events.InteractionCreate, 5000)

		await dispatchEvent(session.id, 'INTERACTION_CREATE', {
			id: interactionId,
			application_id: client!.user!.id,
			type: 4,
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
				name: 'search',
				type: ApplicationCommandType.ChatInput,
				options: [
					{
						name: 'query',
						type: ApplicationCommandOptionType.String,
						value: 'app',
						focused: true
					}
				]
			},
			token: `test-${Date.now()}`,
			version: 1
		})

		const interaction = (await eventPromise) as AutocompleteInteraction
		await expect(
			interaction.respond([
				{ name: 'Apple', value: 'apple' },
				{ name: 'Application', value: 'application' },
				{ name: 'Applet', value: 'applet' }
			])
		).resolves.not.toThrow()
	})

	it('should get focused option', async () => {
		const interactionId = generateSnowflake()
		const userId = generateSnowflake()
		const eventPromise = waitForEvent(client!, Events.InteractionCreate, 5000)

		await dispatchEvent(session.id, 'INTERACTION_CREATE', {
			id: interactionId,
			application_id: client!.user!.id,
			type: 4,
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
				name: 'search',
				type: ApplicationCommandType.ChatInput,
				options: [
					{
						name: 'query',
						type: ApplicationCommandOptionType.String,
						value: 'focused_value',
						focused: true
					}
				]
			},
			token: `test-${Date.now()}`,
			version: 1
		})

		const interaction = (await eventPromise) as AutocompleteInteraction
		const focused = interaction.options.getFocused(true)
		expect(focused.name).toBe('query')
		expect(focused.value).toBe('focused_value')
	})

	it('should reject more than 25 choices', async () => {
		const interactionId = generateSnowflake()
		const userId = generateSnowflake()
		const eventPromise = waitForEvent(client!, Events.InteractionCreate, 5000)

		await dispatchEvent(session.id, 'INTERACTION_CREATE', {
			id: interactionId,
			application_id: client!.user!.id,
			type: 4,
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
				name: 'search',
				type: ApplicationCommandType.ChatInput,
				options: [
					{
						name: 'query',
						type: ApplicationCommandOptionType.String,
						value: 'test',
						focused: true
					}
				]
			},
			token: `test-${Date.now()}`,
			version: 1
		})

		const interaction = (await eventPromise) as AutocompleteInteraction
		const tooManyChoices = Array.from({ length: 26 }, (_, i) => ({
			name: `Choice ${i + 1}`,
			value: `choice_${i + 1}`
		}))

		await expect(interaction.respond(tooManyChoices)).rejects.toThrow()
	})
})

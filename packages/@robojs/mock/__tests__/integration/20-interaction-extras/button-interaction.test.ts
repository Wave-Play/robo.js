import {
	Client,
	Events,
	type TextChannel,
	ChannelType,
	ComponentType,
	ButtonStyle,
	type ButtonInteraction
} from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForEvent, waitForReady, generateSnowflake } from '../utils/helpers.js'

describe('Button Interaction Properties', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'button-interaction',
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
		channel = guild.channels.cache.find(c => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	it('should have component properties', async () => {
		const messageId = generateSnowflake()
		const interactionId = generateSnowflake()
		const guild = client!.guilds.cache.first()!

		const eventPromise = waitForEvent(client!, Events.InteractionCreate, 5000)

		// Dispatch button click
		await dispatchEvent(session.id, 'INTERACTION_CREATE', {
			id: interactionId,
			application_id: client!.user!.id,
			type: 3, // MessageComponent
			guild_id: guild.id,
			channel_id: channel.id,
			channel: {
				id: channel.id,
				type: ChannelType.GuildText,
				name: channel.name,
				guild_id: guild.id
			},
			member: {
				user: { id: '123', username: 'TestUser', discriminator: '0000', avatar: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			},
			user: { id: '123', username: 'TestUser', discriminator: '0000', avatar: null },
			message: {
				id: messageId,
				channel_id: channel.id,
				content: 'Button message',
				author: { id: client!.user!.id, username: 'Bot', discriminator: '0000', avatar: null },
				timestamp: new Date().toISOString(),
				edited_timestamp: null,
				tts: false,
				mention_everyone: false,
				mentions: [],
				mention_roles: [],
				attachments: [],
				embeds: [],
				pinned: false,
				type: 0,
				components: [
					{
						type: ComponentType.ActionRow,
						components: [
							{
								type: ComponentType.Button,
								custom_id: 'test_button',
								label: 'Click Me',
								style: ButtonStyle.Primary
							}
						]
					}
				]
			},
			token: `test-${Date.now()}`,
			data: {
				custom_id: 'test_button',
				component_type: ComponentType.Button
			},
			version: 1
		})

		const interaction = (await eventPromise) as ButtonInteraction
		expect(interaction.isButton()).toBe(true)
		expect(interaction.customId).toBe('test_button')
		expect(interaction.component.type).toBe(ComponentType.Button)
	})

	it('should update message with interaction.update()', async () => {
		const messageId = generateSnowflake()
		const interactionId = generateSnowflake()
		const guild = client!.guilds.cache.first()!

		const eventPromise = waitForEvent(client!, Events.InteractionCreate, 5000)

		await dispatchEvent(session.id, 'INTERACTION_CREATE', {
			id: interactionId,
			application_id: client!.user!.id,
			type: 3,
			guild_id: guild.id,
			channel_id: channel.id,
			channel: {
				id: channel.id,
				type: ChannelType.GuildText,
				name: channel.name,
				guild_id: guild.id
			},
			member: {
				user: { id: '123', username: 'TestUser', discriminator: '0000', avatar: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			},
			user: { id: '123', username: 'TestUser', discriminator: '0000', avatar: null },
			message: {
				id: messageId,
				channel_id: channel.id,
				content: 'Original content',
				author: { id: client!.user!.id, username: 'Bot', discriminator: '0000', avatar: null },
				timestamp: new Date().toISOString(),
				edited_timestamp: null,
				tts: false,
				mention_everyone: false,
				mentions: [],
				mention_roles: [],
				attachments: [],
				embeds: [],
				pinned: false,
				type: 0,
				components: [
					{
						type: ComponentType.ActionRow,
						components: [
							{
								type: ComponentType.Button,
								custom_id: 'update_button',
								label: 'Update',
								style: ButtonStyle.Secondary
							}
						]
					}
				]
			},
			token: `test-${Date.now()}`,
			data: {
				custom_id: 'update_button',
				component_type: ComponentType.Button
			},
			version: 1
		})

		const interaction = (await eventPromise) as ButtonInteraction

		// Verify update() method can be called without error
		await expect(interaction.update({ content: 'Updated content' })).resolves.not.toThrow()
	})

	it('should defer update with interaction.deferUpdate()', async () => {
		const messageId = generateSnowflake()
		const interactionId = generateSnowflake()
		const guild = client!.guilds.cache.first()!

		const eventPromise = waitForEvent(client!, Events.InteractionCreate, 5000)

		await dispatchEvent(session.id, 'INTERACTION_CREATE', {
			id: interactionId,
			application_id: client!.user!.id,
			type: 3,
			guild_id: guild.id,
			channel_id: channel.id,
			channel: {
				id: channel.id,
				type: ChannelType.GuildText,
				name: channel.name,
				guild_id: guild.id
			},
			member: {
				user: { id: '123', username: 'TestUser', discriminator: '0000', avatar: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			},
			user: { id: '123', username: 'TestUser', discriminator: '0000', avatar: null },
			message: {
				id: messageId,
				channel_id: channel.id,
				content: 'Defer test',
				author: { id: client!.user!.id, username: 'Bot', discriminator: '0000', avatar: null },
				timestamp: new Date().toISOString(),
				edited_timestamp: null,
				tts: false,
				mention_everyone: false,
				mentions: [],
				mention_roles: [],
				attachments: [],
				embeds: [],
				pinned: false,
				type: 0,
				components: [
					{
						type: ComponentType.ActionRow,
						components: [
							{
								type: ComponentType.Button,
								custom_id: 'defer_button',
								label: 'Defer',
								style: ButtonStyle.Success
							}
						]
					}
				]
			},
			token: `test-${Date.now()}`,
			data: {
				custom_id: 'defer_button',
				component_type: ComponentType.Button
			},
			version: 1
		})

		const interaction = (await eventPromise) as ButtonInteraction
		expect(interaction.deferred).toBe(false)

		await interaction.deferUpdate()
		expect(interaction.deferred).toBe(true)
	})
})

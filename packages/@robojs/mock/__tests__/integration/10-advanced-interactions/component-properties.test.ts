/**
 * Button Component Properties Tests
 *
 * Tests for accessing button component properties from interactions.
 */
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonComponent,
	ButtonInteraction,
	ButtonStyle,
	ChannelType,
	Client,
	ComponentType,
	Events,
	GatewayIntentBits,
	Interaction,
	InteractionType,
	TextChannel
} from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForReady } from '../utils/helpers.js'

/**
 * Wait for an interaction event with a filter predicate
 */
function waitForInteraction<T extends Interaction = Interaction>(
	client: Client,
	predicate: (interaction: Interaction) => boolean,
	timeout = 5000
): Promise<T> {
	return new Promise((resolve, reject) => {
		const timeoutId = setTimeout(() => {
			client.off(Events.InteractionCreate, handler)
			reject(new Error(`Timeout waiting for interaction after ${timeout}ms`))
		}, timeout)

		const handler = (interaction: Interaction) => {
			if (predicate(interaction)) {
				clearTimeout(timeoutId)
				client.off(Events.InteractionCreate, handler)
				resolve(interaction as T)
			}
		}

		client.on(Events.InteractionCreate, handler)
	})
}

describe('Button Component Properties', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'component-properties-tests',
			config: {
				guilds: [
					{
						name: 'Component Properties Test Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages])
		await client.login(session.token)
		await waitForReady(client)

		const guild = client.guilds.cache.first()!
		guildId = guild.id
		channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	it('should access button component from interaction', async () => {
		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId('component_btn')
				.setLabel('Test Button')
				.setStyle(ButtonStyle.Primary)
				.setEmoji('\uD83C\uDFAE')
		)

		const message = await channel.send({ content: 'Components', components: [row] })

		const interactionId = generateSnowflake()

		const eventPromise = waitForInteraction<ButtonInteraction>(client!, (i) => i.isButton() && i.id === interactionId)

		await dispatchEvent(session.id, 'INTERACTION_CREATE', {
			id: interactionId,
			application_id: client!.user!.id,
			type: InteractionType.MessageComponent,
			guild_id: guildId,
			channel_id: channel.id,
			channel: {
				id: channel.id,
				type: ChannelType.GuildText,
				name: channel.name,
				guild_id: guildId
			},
			member: {
				user: { id: generateSnowflake(), username: 'TestUser', discriminator: '0', avatar: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			},
			data: {
				custom_id: 'component_btn',
				component_type: ComponentType.Button
			},
			message: {
				id: message.id,
				channel_id: channel.id,
				content: 'Components',
				author: { id: client!.user!.id, username: 'Bot', discriminator: '0', avatar: null },
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
								custom_id: 'component_btn',
								label: 'Test Button',
								style: ButtonStyle.Primary,
								emoji: { name: '\uD83C\uDFAE' }
							}
						]
					}
				]
			},
			token: `token-${Date.now()}`,
			version: 1
		})

		const interaction = await eventPromise

		// Access the component that was clicked
		const button = interaction.component as ButtonComponent
		expect(button.type).toBe(ComponentType.Button)
		expect(button.customId).toBe('component_btn')
		expect(button.label).toBe('Test Button')
		expect(button.style).toBe(ButtonStyle.Primary)
		expect(button.emoji?.name).toBe('\uD83C\uDFAE')
	})

	it('should access message from button interaction', async () => {
		const interactionId = generateSnowflake()

		const eventPromise = waitForInteraction<ButtonInteraction>(client!, (i) => i.isButton() && i.id === interactionId)

		await dispatchEvent(session.id, 'INTERACTION_CREATE', {
			id: interactionId,
			application_id: client!.user!.id,
			type: InteractionType.MessageComponent,
			guild_id: guildId,
			channel_id: channel.id,
			channel: {
				id: channel.id,
				type: ChannelType.GuildText,
				name: channel.name,
				guild_id: guildId
			},
			member: {
				user: { id: generateSnowflake(), username: 'TestUser', discriminator: '0', avatar: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			},
			data: {
				custom_id: 'msg_btn',
				component_type: ComponentType.Button
			},
			message: {
				id: generateSnowflake(),
				channel_id: channel.id,
				content: 'Message content',
				author: { id: client!.user!.id, username: 'Bot', discriminator: '0', avatar: null },
				timestamp: new Date().toISOString(),
				edited_timestamp: null,
				tts: false,
				mention_everyone: false,
				mentions: [],
				mention_roles: [],
				attachments: [],
				embeds: [{ title: 'Embed Title' }],
				pinned: false,
				type: 0
			},
			token: `token-${Date.now()}`,
			version: 1
		})

		const interaction = await eventPromise

		expect(interaction.message.content).toBe('Message content')
		expect(interaction.message.embeds[0].title).toBe('Embed Title')
	})
})

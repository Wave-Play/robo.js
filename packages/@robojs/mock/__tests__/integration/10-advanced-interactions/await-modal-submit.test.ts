/**
 * Message.awaitModalSubmit() Tests
 *
 * Tests for awaiting modal submissions after showing a modal.
 */
import {
	ActionRowBuilder,
	ApplicationCommandType,
	ChannelType,
	ChatInputCommandInteraction,
	Client,
	ComponentType,
	Events,
	GatewayIntentBits,
	Interaction,
	InteractionType,
	ModalBuilder,
	TextChannel,
	TextInputBuilder,
	TextInputStyle
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

describe('awaitModalSubmit()', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'await-modal-submit-tests',
			config: {
				guilds: [
					{
						name: 'Await Modal Submit Test Guild',
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

	it('should await modal submit after showing modal', async () => {
		// First, get an interaction
		const interactionId = generateSnowflake()

		const cmdPromise = waitForInteraction<ChatInputCommandInteraction>(
			client!,
			(i) => i.isChatInputCommand() && i.id === interactionId
		)

		await dispatchEvent(session.id, 'INTERACTION_CREATE', {
			id: interactionId,
			application_id: client!.user!.id,
			type: InteractionType.ApplicationCommand,
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
				id: generateSnowflake(),
				name: 'modal_test',
				type: ApplicationCommandType.ChatInput
			},
			token: `token-${Date.now()}`,
			version: 1
		})

		const interaction = await cmdPromise

		// Show modal
		const modal = new ModalBuilder()
			.setCustomId('await_modal')
			.setTitle('Test Modal')
			.addComponents(
				new ActionRowBuilder<TextInputBuilder>().addComponents(
					new TextInputBuilder().setCustomId('input').setLabel('Input').setStyle(TextInputStyle.Short)
				)
			)

		await interaction.showModal(modal)

		// Now await the modal submit
		const awaitPromise = interaction.awaitModalSubmit({
			filter: (i) => i.customId === 'await_modal',
			time: 5000
		})

		// Simulate modal submission
		setTimeout(async () => {
			await dispatchEvent(session.id, 'INTERACTION_CREATE', {
				id: generateSnowflake(),
				application_id: client!.user!.id,
				type: InteractionType.ModalSubmit,
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
					custom_id: 'await_modal',
					components: [
						{
							type: ComponentType.ActionRow,
							components: [{ type: ComponentType.TextInput, custom_id: 'input', value: 'User input' }]
						}
					]
				},
				token: `modal-token-${Date.now()}`,
				version: 1
			})
		}, 100)

		const modalInteraction = await awaitPromise

		expect(modalInteraction.customId).toBe('await_modal')
		expect(modalInteraction.fields.getTextInputValue('input')).toBe('User input')
	})
})

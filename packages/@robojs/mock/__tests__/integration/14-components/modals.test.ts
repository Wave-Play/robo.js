/**
 * Modal & TextInput Variations Tests
 *
 * Tests for modal builders and text input configurations.
 */
import {
	ActionRowBuilder,
	ChannelType,
	Client,
	ComponentType,
	Events,
	GatewayIntentBits,
	Interaction,
	InteractionType,
	ModalBuilder,
	ModalSubmitInteraction,
	TextChannel,
	TextInputBuilder,
	TextInputModalData,
	TextInputStyle
} from 'discord.js'
import type { APIActionRowComponent, APITextInputComponent } from 'discord-api-types/v10'
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

describe('Modal & TextInput Variations', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'modal-tests',
			config: {
				guilds: [
					{
						name: 'Modal Test Guild',
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

	it('should create modal with short text input', () => {
		const modal = new ModalBuilder()
			.setCustomId('short_modal')
			.setTitle('Short Input')
			.addComponents(
				new ActionRowBuilder<TextInputBuilder>().addComponents(
					new TextInputBuilder().setCustomId('short_input').setLabel('Short Text').setStyle(TextInputStyle.Short)
				)
			)

		const json = modal.toJSON()
		const row = json.components?.[0] as APIActionRowComponent<APITextInputComponent> | undefined
		expect(row?.components?.[0]?.style).toBe(TextInputStyle.Short)
	})

	it('should create modal with paragraph text input', () => {
		const modal = new ModalBuilder()
			.setCustomId('paragraph_modal')
			.setTitle('Paragraph Input')
			.addComponents(
				new ActionRowBuilder<TextInputBuilder>().addComponents(
					new TextInputBuilder().setCustomId('paragraph_input').setLabel('Long Text').setStyle(TextInputStyle.Paragraph)
				)
			)

		const json = modal.toJSON()
		const row = json.components?.[0] as APIActionRowComponent<APITextInputComponent> | undefined
		expect(row?.components?.[0]?.style).toBe(TextInputStyle.Paragraph)
	})

	it('should create text input with placeholder', () => {
		const input = new TextInputBuilder()
			.setCustomId('placeholder_input')
			.setLabel('With Placeholder')
			.setStyle(TextInputStyle.Short)
			.setPlaceholder('Enter text here...')

		expect(input.data.placeholder).toBe('Enter text here...')
	})

	it('should create text input with min/max length', () => {
		const input = new TextInputBuilder()
			.setCustomId('length_input')
			.setLabel('Limited Length')
			.setStyle(TextInputStyle.Short)
			.setMinLength(10)
			.setMaxLength(100)

		expect(input.data.min_length).toBe(10)
		expect(input.data.max_length).toBe(100)
	})

	it('should create required text input', () => {
		const input = new TextInputBuilder()
			.setCustomId('required_input')
			.setLabel('Required')
			.setStyle(TextInputStyle.Short)
			.setRequired(true)

		expect(input.data.required).toBe(true)
	})

	it('should create text input with default value', () => {
		const input = new TextInputBuilder()
			.setCustomId('default_input')
			.setLabel('With Default')
			.setStyle(TextInputStyle.Short)
			.setValue('Default text')

		expect(input.data.value).toBe('Default text')
	})

	it('should create modal with multiple inputs', () => {
		const modal = new ModalBuilder()
			.setCustomId('multi_modal')
			.setTitle('Multiple Inputs')
			.addComponents(
				new ActionRowBuilder<TextInputBuilder>().addComponents(
					new TextInputBuilder().setCustomId('input1').setLabel('First').setStyle(TextInputStyle.Short)
				),
				new ActionRowBuilder<TextInputBuilder>().addComponents(
					new TextInputBuilder().setCustomId('input2').setLabel('Second').setStyle(TextInputStyle.Short)
				),
				new ActionRowBuilder<TextInputBuilder>().addComponents(
					new TextInputBuilder().setCustomId('input3').setLabel('Third').setStyle(TextInputStyle.Paragraph)
				)
			)

		const json = modal.toJSON()
		expect(json.components?.length).toBe(3)
	})

	it('should allow max 5 rows in modal builder', () => {
		const modal = new ModalBuilder().setCustomId('max_rows').setTitle('Max Rows')

		for (let i = 0; i < 5; i++) {
			modal.addComponents(
				new ActionRowBuilder<TextInputBuilder>().addComponents(
					new TextInputBuilder().setCustomId(`input${i}`).setLabel(`Input ${i}`).setStyle(TextInputStyle.Short)
				)
			)
		}

		// Builder allows 5 rows
		const json = modal.toJSON()
		expect(json.components?.length).toBe(5)
	})

	it('should receive modal with multiple values', async () => {
		const eventPromise = waitForInteraction<ModalSubmitInteraction>(client!, (i) => i.isModalSubmit())

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
				user: { id: '123', username: 'User', discriminator: '0', avatar: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			},
			data: {
				custom_id: 'multi_value_modal',
				components: [
					{
						type: ComponentType.ActionRow,
						components: [{ type: ComponentType.TextInput, custom_id: 'name', value: 'John' }]
					},
					{
						type: ComponentType.ActionRow,
						components: [{ type: ComponentType.TextInput, custom_id: 'email', value: 'john@example.com' }]
					},
					{
						type: ComponentType.ActionRow,
						components: [{ type: ComponentType.TextInput, custom_id: 'message', value: 'Hello there!' }]
					}
				]
			},
			token: `modal-token-${Date.now()}`,
			version: 1
		})

		const interaction = await eventPromise

		expect(interaction.fields.getTextInputValue('name')).toBe('John')
		expect(interaction.fields.getTextInputValue('email')).toBe('john@example.com')
		expect(interaction.fields.getTextInputValue('message')).toBe('Hello there!')
	})

	it('should access fields via getField()', async () => {
		const eventPromise = waitForInteraction<ModalSubmitInteraction>(client!, (i) => i.isModalSubmit())

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
				user: { id: '123', username: 'User', discriminator: '0', avatar: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			},
			data: {
				custom_id: 'field_modal',
				components: [
					{
						type: ComponentType.ActionRow,
						components: [{ type: ComponentType.TextInput, custom_id: 'test_field', value: 'Test Value' }]
					}
				]
			},
			token: `field-token-${Date.now()}`,
			version: 1
		})

		const interaction = await eventPromise

		const field = interaction.fields.getField('test_field') as TextInputModalData
		expect(field.customId).toBe('test_field')
		expect(field.value).toBe('Test Value')
		expect(field.type).toBe(ComponentType.TextInput)
	})
})

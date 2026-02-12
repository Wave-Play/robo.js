/**
 * Message Completeness Tests
 *
 * Tests for message validation including embed limits, component limits,
 * and content restrictions according to Discord API specifications.
 */
import {
	Client,
	ChannelType,
	TextChannel,
	EmbedBuilder,
	ActionRow,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	MessageActionRowComponent,
	StringSelectMenuBuilder
} from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Message Completeness', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'message-completeness-tests',
			config: {
				guilds: [
					{
						name: 'Message Test Guild',
						channels: [{ name: 'completeness', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createTestClient()
		await client.login(session.token)
		await waitForReady(client)

		channel = client.guilds.cache.first()!.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Valid Message Content', () => {
		it('should send simple text message', async () => {
			const message = await channel.send('Hello, World!')

			expect(message.content).toBe('Hello, World!')
		})

		it('should send message with single embed', async () => {
			const embed = new EmbedBuilder().setTitle('Test Embed').setDescription('This is a test embed')

			const message = await channel.send({ embeds: [embed] })

			expect(message.embeds.length).toBe(1)
			expect(message.embeds[0].title).toBe('Test Embed')
		})

		it('should send message with multiple valid embeds', async () => {
			const embeds = Array(5)
				.fill(null)
				.map((_, i) => new EmbedBuilder().setTitle(`Embed ${i + 1}`).setDescription('Description'))

			const message = await channel.send({ embeds })

			expect(message.embeds.length).toBe(5)
		})

		it('should send message with content and embeds', async () => {
			const embed = new EmbedBuilder().setTitle('Combined')

			const message = await channel.send({
				content: 'Text with embed',
				embeds: [embed]
			})

			expect(message.content).toBe('Text with embed')
			expect(message.embeds.length).toBe(1)
		})
	})

	describe('Embed Field Validation', () => {
		it('should send embed with valid fields', async () => {
			const embed = new EmbedBuilder().setTitle('With Fields').addFields(
				{ name: 'Field 1', value: 'Value 1' },
				{ name: 'Field 2', value: 'Value 2' },
				{ name: 'Field 3', value: 'Value 3', inline: true }
			)

			const message = await channel.send({ embeds: [embed] })

			expect(message.embeds[0].fields?.length).toBe(3)
		})

		it('should send embed with 25 fields (max)', async () => {
			const fields = Array(25)
				.fill(null)
				.map((_, i) => ({
					name: `Field ${i + 1}`,
					value: 'Value'
				}))

			const embed = new EmbedBuilder().setTitle('Max Fields').addFields(fields)

			const message = await channel.send({ embeds: [embed] })

			expect(message.embeds[0].fields?.length).toBe(25)
		})

		it('should reject embed with more than 25 fields', async () => {
			const fields = Array(26)
				.fill(null)
				.map((_, i) => ({
					name: `Field ${i + 1}`,
					value: 'Value'
				}))

			const embed = new EmbedBuilder().setTitle('Too Many Fields')

			// Discord.js will throw validation error before sending
			expect(() => embed.addFields(fields)).toThrow()
		})

		it('should send embed with max field name length (256)', async () => {
			const embed = new EmbedBuilder().setTitle('Long Field Name').addFields({ name: 'a'.repeat(256), value: 'Value' })

			const message = await channel.send({ embeds: [embed] })
			expect(message.embeds[0].fields?.[0].name.length).toBe(256)
		})

		it('should reject embed with field name over 256 chars', async () => {
			const embed = new EmbedBuilder().setTitle('Too Long Name')

			// Discord.js validates locally
			expect(() =>
				embed.addFields({
					name: 'a'.repeat(257),
					value: 'Value'
				})
			).toThrow()
		})

		it('should send embed with max field value length (1024)', async () => {
			const embed = new EmbedBuilder().setTitle('Long Field Value').addFields({ name: 'Field', value: 'a'.repeat(1024) })

			const message = await channel.send({ embeds: [embed] })
			expect(message.embeds[0].fields?.[0].value.length).toBe(1024)
		})

		it('should reject embed with field value over 1024 chars', async () => {
			const embed = new EmbedBuilder().setTitle('Too Long Value')

			expect(() =>
				embed.addFields({
					name: 'Field',
					value: 'a'.repeat(1025)
				})
			).toThrow()
		})
	})

	describe('Embed Limits', () => {
		it('should send 10 embeds (max)', async () => {
			const embeds = Array(10)
				.fill(null)
				.map((_, i) => new EmbedBuilder().setTitle(`Embed ${i + 1}`))

			const message = await channel.send({ embeds })

			expect(message.embeds.length).toBe(10)
		})

		it('should reject more than 10 embeds', async () => {
			const embeds = Array(11)
				.fill(null)
				.map((_, i) => new EmbedBuilder().setTitle(`Embed ${i + 1}`))

			await expect(channel.send({ embeds })).rejects.toBeDefined()
		})

		it('should send embed with max title length (256)', async () => {
			const embed = new EmbedBuilder().setTitle('a'.repeat(256))

			const message = await channel.send({ embeds: [embed] })
			expect(message.embeds[0].title?.length).toBe(256)
		})

		it('should reject embed with title over 256 chars', async () => {
			expect(() => new EmbedBuilder().setTitle('a'.repeat(257))).toThrow()
		})

		it('should send embed with max description length (4096)', async () => {
			const embed = new EmbedBuilder().setTitle('Long Description').setDescription('a'.repeat(4096))

			const message = await channel.send({ embeds: [embed] })
			expect(message.embeds[0].description?.length).toBe(4096)
		})

		it('should reject embed with description over 4096 chars', async () => {
			expect(() => new EmbedBuilder().setDescription('a'.repeat(4097))).toThrow()
		})
	})

	describe('Component Limits (V1)', () => {
		it('should send message with valid action row', async () => {
			const button = new ButtonBuilder().setCustomId('test_btn').setLabel('Click').setStyle(ButtonStyle.Primary)

			const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button)

			const message = await channel.send({
				content: 'With button',
				components: [row]
			})

			expect(message.components.length).toBe(1)
		})

		it('should send 5 action rows (max)', async () => {
			const rows = Array(5)
				.fill(null)
				.map((_, i) =>
					new ActionRowBuilder<ButtonBuilder>().addComponents(
						new ButtonBuilder().setCustomId(`btn_row_${i}`).setLabel(`Row ${i + 1}`).setStyle(ButtonStyle.Primary)
					)
				)

			const message = await channel.send({
				content: 'Max rows',
				components: rows
			})

			expect(message.components.length).toBe(5)
		})

		it('should reject more than 5 action rows', async () => {
			const rows = Array(6)
				.fill(null)
				.map((_, i) =>
					new ActionRowBuilder<ButtonBuilder>().addComponents(
						new ButtonBuilder().setCustomId(`btn_${i}`).setLabel(`Row ${i + 1}`).setStyle(ButtonStyle.Primary)
					)
				)

			await expect(
				channel.send({
					content: 'Too many rows',
					components: rows
				})
			).rejects.toBeDefined()
		})

		it('should send 5 buttons per row (max)', async () => {
			const buttons = Array(5)
				.fill(null)
				.map((_, i) =>
					new ButtonBuilder().setCustomId(`max_btn_${i}`).setLabel(`B${i + 1}`).setStyle(ButtonStyle.Primary)
				)

			const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)

			const message = await channel.send({
				content: 'Max buttons',
				components: [row]
			})

			expect((message.components[0] as ActionRow<MessageActionRowComponent>).components.length).toBe(5)
		})

		it('should reject more than 5 buttons per row', async () => {
			const buttons = Array(6)
				.fill(null)
				.map((_, i) => new ButtonBuilder().setCustomId(`btn_${i}`).setLabel(`B${i + 1}`).setStyle(ButtonStyle.Primary))

			// Discord.js validates this locally
			expect(() => new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)).toThrow()
		})

		it('should send button with max custom_id length (100)', async () => {
			const button = new ButtonBuilder().setCustomId('a'.repeat(100)).setLabel('Long ID').setStyle(ButtonStyle.Primary)

			const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button)

			const message = await channel.send({
				content: 'Long custom_id',
				components: [row]
			})

			expect(message.components.length).toBe(1)
		})

		it('should reject custom_id over 100 chars', async () => {
			expect(() => new ButtonBuilder().setCustomId('a'.repeat(101)).setLabel('Too Long').setStyle(ButtonStyle.Primary)).toThrow()
		})

		it('should send button with max label length (80)', async () => {
			const button = new ButtonBuilder().setCustomId('long_label').setLabel('a'.repeat(80)).setStyle(ButtonStyle.Primary)

			const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button)

			const message = await channel.send({
				content: 'Long label',
				components: [row]
			})

			expect(message.components.length).toBe(1)
		})

		it('should reject button label over 80 chars', async () => {
			expect(() => new ButtonBuilder().setCustomId('test').setLabel('a'.repeat(81)).setStyle(ButtonStyle.Primary)).toThrow()
		})
	})

	describe('Select Menu Validation', () => {
		it('should send select menu with valid options', async () => {
			const select = new StringSelectMenuBuilder()
				.setCustomId('select_test')
				.setPlaceholder('Choose')
				.addOptions({ label: 'Option 1', value: 'opt1' }, { label: 'Option 2', value: 'opt2' })

			const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)

			const message = await channel.send({
				content: 'Select menu',
				components: [row]
			})

			expect(message.components.length).toBe(1)
		})

		it('should send select menu with 25 options (max)', async () => {
			const options = Array(25)
				.fill(null)
				.map((_, i) => ({
					label: `Option ${i + 1}`,
					value: `opt_${i}`
				}))

			const select = new StringSelectMenuBuilder().setCustomId('max_options').setPlaceholder('Choose').addOptions(options)

			const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)

			const message = await channel.send({
				content: 'Max options',
				components: [row]
			})

			expect(message.components.length).toBe(1)
		})

		it('should reject select menu with more than 25 options', async () => {
			const options = Array(26)
				.fill(null)
				.map((_, i) => ({
					label: `Option ${i + 1}`,
					value: `opt_${i}`
				}))

			const select = new StringSelectMenuBuilder().setCustomId('too_many').setPlaceholder('Choose')

			// Discord.js validates this locally
			expect(() => select.addOptions(options)).toThrow()
		})
	})

	describe('Content Length Validation', () => {
		it('should send message with max content length (2000)', async () => {
			const message = await channel.send('a'.repeat(2000))
			expect(message.content.length).toBe(2000)
		})

		it('should reject content over 2000 chars', async () => {
			await expect(channel.send('a'.repeat(2001))).rejects.toBeDefined()
		})
	})
})

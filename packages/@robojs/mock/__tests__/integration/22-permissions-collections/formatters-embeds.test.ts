/**
 * Formatters & Embeds Round-Trip Tests
 *
 * Tests for validating that the mock server correctly preserves formatted message content
 * and embed properties (including colors) through REST API and gateway events.
 */
import {
	ChannelType,
	chatInputApplicationCommandMention,
	Client,
	Colors,
	EmbedBuilder,
	formatEmoji,
	Guild,
	heading,
	HeadingLevel,
	hideLinkEmbed,
	orderedList,
	spoiler,
	TextChannel,
	unorderedList
} from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Formatters & Embeds Round-Trip', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild
	let channel: TextChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'formatters-embeds-tests',
			config: {
				guilds: [
					{
						name: 'Formatter Test Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createTestClient()
		await client.login(session.token)
		await waitForReady(client)
		guild = client.guilds.cache.first()!
		channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel

		if (!channel) {
			throw new Error('No text channel found in test guild')
		}
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Formatters in Messages', () => {
		it('should preserve chatInputApplicationCommandMention format through mock', async () => {
			const commandMention = chatInputApplicationCommandMention('help', '123456789')
			const message = await channel.send({ content: `Use ${commandMention} for assistance` })

			expect(message.content).toContain('</help:123456789>')
		})

		it('should preserve chatInputApplicationCommandMention with subcommand', async () => {
			const subcommandMention = chatInputApplicationCommandMention(
				'settings',
				'reset',
				'987654321'
			)
			const message = await channel.send({ content: `Try ${subcommandMention}` })

			expect(message.content).toContain('</settings reset:987654321>')
		})

		it('should preserve spoiler formatting through mock', async () => {
			const spoilerText = spoiler('This is a spoiler')
			const message = await channel.send({ content: spoilerText })

			expect(message.content).toBe('||This is a spoiler||')
		})

		it('should preserve hideLinkEmbed formatting through mock', async () => {
			const hiddenLink = hideLinkEmbed('https://example.com')
			const message = await channel.send({ content: `Check this: ${hiddenLink}` })

			expect(message.content).toContain('<https://example.com>')
		})

		it('should preserve heading formatting through mock', async () => {
			const h1 = heading('Main Title', HeadingLevel.One)
			const h2 = heading('Subtitle', HeadingLevel.Two)
			const h3 = heading('Section', HeadingLevel.Three)

			const message = await channel.send({ content: `${h1}\n${h2}\n${h3}` })

			expect(message.content).toContain('# Main Title')
			expect(message.content).toContain('## Subtitle')
			expect(message.content).toContain('### Section')
		})

		it('should preserve orderedList formatting through mock', async () => {
			const list = orderedList(['First item', 'Second item', 'Third item'])
			const message = await channel.send({ content: list })

			// orderedList prefixes each item with "1." (Discord markdown auto-numbers)
			expect(message.content).toContain('First item')
			expect(message.content).toContain('Second item')
			expect(message.content).toContain('Third item')
			// Verify it's a numbered list format
			expect(message.content).toMatch(/\d+\.\s/)
		})

		it('should preserve unorderedList formatting through mock', async () => {
			const list = unorderedList(['Apple', 'Banana', 'Cherry'])
			const message = await channel.send({ content: list })

			expect(message.content).toContain('- Apple')
			expect(message.content).toContain('- Banana')
			expect(message.content).toContain('- Cherry')
		})

		it('should preserve formatEmoji through mock', async () => {
			// Test static emoji format - formatEmoji returns <:emoji:id> format
			const staticEmoji = formatEmoji('123456789012345678')
			const message1 = await channel.send({ content: `Check this emoji: ${staticEmoji}` })

			// Verify emoji format is preserved (discord.js uses 'emoji' as placeholder name)
			expect(message1.content).toMatch(/<:\w+:123456789012345678>/)

			// Test animated emoji format
			const animatedEmoji = formatEmoji('987654321098765432', true)
			const message2 = await channel.send({ content: `Animated: ${animatedEmoji}` })

			// Animated emoji has 'a' prefix
			expect(message2.content).toMatch(/<a:\w+:987654321098765432>/)
		})

		it('should preserve complex combined formatting through mock', async () => {
			// Test multiple formatters combined in one message
			const commandMention = chatInputApplicationCommandMention('settings', '123')
			const spoilerText = spoiler('secret')
			const list = orderedList(['Step 1', 'Step 2'])

			const content = `Use ${commandMention} to configure.\n${spoilerText}\n${list}`
			const message = await channel.send({ content })

			expect(message.content).toContain('</settings:123>')
			expect(message.content).toContain('||secret||')
			expect(message.content).toContain('1. Step 1')
		})
	})

	describe('Embeds with Colors', () => {
		it('should preserve Colors.Blurple in embeds through mock', async () => {
			const embed = new EmbedBuilder()
				.setTitle('Blurple Embed')
				.setDescription('Testing Blurple color')
				.setColor(Colors.Blurple)

			const message = await channel.send({ embeds: [embed] })

			expect(message.embeds[0]).toBeDefined()
			expect(message.embeds[0].color).toBe(Colors.Blurple)
		})

		it('should preserve hex color in embeds through mock', async () => {
			const hexColor = 0xff0000 // Red

			const embed = new EmbedBuilder()
				.setTitle('Hex Color Embed')
				.setDescription('Testing hex color')
				.setColor(hexColor)

			const message = await channel.send({ embeds: [embed] })

			expect(message.embeds[0].color).toBe(hexColor)
		})

		it('should preserve Colors constants in embeds', async () => {
			const colors = [
				{ name: 'Red', value: Colors.Red },
				{ name: 'Green', value: Colors.Green },
				{ name: 'Blue', value: Colors.Blue },
				{ name: 'Yellow', value: Colors.Yellow },
				{ name: 'Purple', value: Colors.Purple },
				{ name: 'Gold', value: Colors.Gold }
			]

			for (const colorTest of colors) {
				const embed = new EmbedBuilder()
					.setTitle(`${colorTest.name} Color`)
					.setColor(colorTest.value)

				const message = await channel.send({ embeds: [embed] })

				expect(message.embeds[0].color).toBe(colorTest.value)
			}
		})

		it('should handle random color generation and preserve through mock', async () => {
			// Generate a random color manually (Colors.Random isn't a valid setColor value)
			const randomColor = Math.floor(Math.random() * 0xffffff)

			const embed = new EmbedBuilder()
				.setTitle('Random Color Embed')
				.setDescription('Testing random color')
				.setColor(randomColor)

			const message = await channel.send({ embeds: [embed] })

			// Random color should be preserved exactly
			expect(message.embeds[0].color).toBe(randomColor)
			expect(message.embeds[0].color).toBeGreaterThanOrEqual(0)
			expect(message.embeds[0].color).toBeLessThanOrEqual(0xffffff)
		})

		it('should preserve multiple embeds with different colors', async () => {
			const embed1 = new EmbedBuilder().setTitle('Embed 1').setColor(Colors.Red)

			const embed2 = new EmbedBuilder().setTitle('Embed 2').setColor(Colors.Blue)

			const embed3 = new EmbedBuilder().setTitle('Embed 3').setColor(Colors.Green)

			const message = await channel.send({ embeds: [embed1, embed2, embed3] })

			expect(message.embeds.length).toBe(3)
			expect(message.embeds[0].color).toBe(Colors.Red)
			expect(message.embeds[1].color).toBe(Colors.Blue)
			expect(message.embeds[2].color).toBe(Colors.Green)
		})

		it('should preserve embed with no color set', async () => {
			const embed = new EmbedBuilder().setTitle('No Color Embed').setDescription('Testing no color')

			const message = await channel.send({ embeds: [embed] })

			// No color set should return null
			expect(message.embeds[0].color).toBeNull()
		})

		it('should preserve complex embed with color and all fields', async () => {
			const embed = new EmbedBuilder()
				.setTitle('Complex Embed')
				.setDescription('Testing complex embed with color')
				.setColor(Colors.Blurple)
				.setAuthor({ name: 'Test Author' })
				.setFooter({ text: 'Test Footer' })
				.addFields(
					{ name: 'Field 1', value: 'Value 1', inline: true },
					{ name: 'Field 2', value: 'Value 2', inline: true }
				)
				.setTimestamp()

			const message = await channel.send({ embeds: [embed] })

			expect(message.embeds[0].color).toBe(Colors.Blurple)
			expect(message.embeds[0].title).toBe('Complex Embed')
			expect(message.embeds[0].description).toBe('Testing complex embed with color')
			expect(message.embeds[0].fields.length).toBe(2)
		})
	})
})

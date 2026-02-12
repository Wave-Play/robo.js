/**
 * Extended Embed Features Tests
 *
 * Tests for EmbedBuilder including all fields, multiple embeds,
 * limits enforcement, data property, and toJSON.
 */
import { ChannelType, Client, EmbedBuilder, GatewayIntentBits, Guild, TextChannel } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Extended Embed Features', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild
	let channel: TextChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'embeds-tests',
			config: {
				guilds: [
					{
						name: 'Embeds Test',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages])
		await client.login(session.token)
		await waitForReady(client)

		guild = client.guilds.cache.first()!
		channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Full Embed', () => {
		it('should send embed with all fields', async () => {
			const embed = new EmbedBuilder()
				.setTitle('Full Embed')
				.setDescription('Description text')
				.setURL('https://discord.com')
				.setColor(0xff5733)
				.setTimestamp()
				.setAuthor({
					name: 'Author Name',
					iconURL: 'https://example.com/author.png',
					url: 'https://example.com'
				})
				.setFooter({
					text: 'Footer Text',
					iconURL: 'https://example.com/footer.png'
				})
				.setThumbnail('https://example.com/thumb.png')
				.setImage('https://example.com/image.png')
				.addFields(
					{ name: 'Field 1', value: 'Value 1', inline: true },
					{ name: 'Field 2', value: 'Value 2', inline: true },
					{ name: 'Field 3', value: 'Value 3', inline: false }
				)

			const message = await channel.send({ embeds: [embed] })

			expect(message.embeds[0].title).toBe('Full Embed')
			expect(message.embeds[0].description).toBe('Description text')
			expect(message.embeds[0].fields.length).toBe(3)
			expect(message.embeds[0].author?.name).toBe('Author Name')
			expect(message.embeds[0].footer?.text).toBe('Footer Text')
		})

		it('should preserve embed color', async () => {
			const embed = new EmbedBuilder().setTitle('Colored').setColor(0x00ff00)

			const message = await channel.send({ embeds: [embed] })

			expect(message.embeds[0].color).toBe(0x00ff00)
		})

		it('should preserve timestamp', async () => {
			const now = new Date()
			const embed = new EmbedBuilder().setTitle('Timestamped').setTimestamp(now)

			const message = await channel.send({ embeds: [embed] })

			expect(message.embeds[0].timestamp).toBeDefined()
		})
	})

	describe('Multiple Embeds', () => {
		it('should send multiple embeds', async () => {
			const embed1 = new EmbedBuilder().setTitle('Embed 1').setColor(0xff0000)
			const embed2 = new EmbedBuilder().setTitle('Embed 2').setColor(0x00ff00)
			const embed3 = new EmbedBuilder().setTitle('Embed 3').setColor(0x0000ff)

			const message = await channel.send({ embeds: [embed1, embed2, embed3] })

			expect(message.embeds.length).toBe(3)
			expect(message.embeds[0].title).toBe('Embed 1')
			expect(message.embeds[1].title).toBe('Embed 2')
			expect(message.embeds[2].title).toBe('Embed 3')
		})

		it('should send up to 10 embeds', async () => {
			const embeds = Array.from({ length: 10 }, (_, i) => new EmbedBuilder().setTitle(`Embed ${i + 1}`))

			const message = await channel.send({ embeds })

			expect(message.embeds.length).toBe(10)
		})
	})

	describe('Embed Limits', () => {
		it('should allow up to 10 embeds', async () => {
			// Discord allows up to 10 embeds per message
			const embeds = Array.from({ length: 10 }, (_, i) => new EmbedBuilder().setTitle(`Embed ${i}`))

			const message = await channel.send({ embeds })
			expect(message.embeds.length).toBe(10)
		})

		it('should enforce max 25 fields client-side', () => {
			const embed = new EmbedBuilder().setTitle('Too Many Fields')

			// Discord.js validates fields client-side
			expect(() => {
				for (let i = 0; i < 26; i++) {
					embed.addFields({ name: `Field ${i}`, value: 'Value' })
				}
			}).toThrow()
		})

		it('should accept exactly 25 fields', async () => {
			const embed = new EmbedBuilder().setTitle('Max Fields')

			for (let i = 0; i < 25; i++) {
				embed.addFields({ name: `Field ${i}`, value: 'Value' })
			}

			const message = await channel.send({ embeds: [embed] })

			expect(message.embeds[0].fields.length).toBe(25)
		})
	})

	describe('EmbedBuilder.data', () => {
		it('should have embed.data property', () => {
			const embed = new EmbedBuilder().setTitle('Data Test').setDescription('Testing data access')

			expect(embed.data.title).toBe('Data Test')
			expect(embed.data.description).toBe('Testing data access')
		})

		it('should access color via data', () => {
			const embed = new EmbedBuilder().setColor(0x123456)

			expect(embed.data.color).toBe(0x123456)
		})

		it('should access fields via data', () => {
			const embed = new EmbedBuilder().addFields({ name: 'Test', value: 'Value', inline: true })

			expect(embed.data.fields?.[0].name).toBe('Test')
			expect(embed.data.fields?.[0].value).toBe('Value')
			expect(embed.data.fields?.[0].inline).toBe(true)
		})
	})

	describe('EmbedBuilder.toJSON()', () => {
		it('should copy embed with toJSON', () => {
			const original = new EmbedBuilder().setTitle('Original').setColor(0x123456)

			const json = original.toJSON()
			const copy = new EmbedBuilder(json)

			expect(copy.data.title).toBe('Original')
			expect(copy.data.color).toBe(0x123456)
		})

		it('should preserve all fields in toJSON', () => {
			const original = new EmbedBuilder()
				.setTitle('Full Copy')
				.setDescription('Description')
				.addFields({ name: 'Field', value: 'Value' })
				.setFooter({ text: 'Footer' })

			const json = original.toJSON()

			expect(json.title).toBe('Full Copy')
			expect(json.description).toBe('Description')
			expect(json.fields?.[0].name).toBe('Field')
			expect(json.footer?.text).toBe('Footer')
		})

		it('should allow modification of copy', () => {
			const original = new EmbedBuilder().setTitle('Original')

			const json = original.toJSON()
			const copy = new EmbedBuilder(json)
			copy.setTitle('Modified')

			expect(original.data.title).toBe('Original')
			expect(copy.data.title).toBe('Modified')
		})
	})

	describe('Embed Field Methods', () => {
		it('should add single field', () => {
			const embed = new EmbedBuilder().addFields({ name: 'Single', value: 'Field' })

			expect(embed.data.fields?.length).toBe(1)
		})

		it('should add multiple fields at once', () => {
			const embed = new EmbedBuilder().addFields(
				{ name: 'First', value: '1' },
				{ name: 'Second', value: '2' },
				{ name: 'Third', value: '3' }
			)

			expect(embed.data.fields?.length).toBe(3)
		})

		it('should set fields (replace)', () => {
			const embed = new EmbedBuilder()
				.addFields({ name: 'Old', value: 'Field' })
				.setFields({ name: 'New', value: 'Field' })

			expect(embed.data.fields?.length).toBe(1)
			expect(embed.data.fields?.[0].name).toBe('New')
		})

		it('should splice fields', () => {
			const embed = new EmbedBuilder().addFields(
				{ name: 'A', value: '1' },
				{ name: 'B', value: '2' },
				{ name: 'C', value: '3' }
			)

			embed.spliceFields(1, 1, { name: 'X', value: 'replaced' })

			expect(embed.data.fields?.[1].name).toBe('X')
		})
	})

	describe('Empty Embed', () => {
		it('should create empty embed', () => {
			const embed = new EmbedBuilder()

			expect(embed.data).toBeDefined()
		})

		it('should send embed with only description', async () => {
			const embed = new EmbedBuilder().setDescription('Just description')

			const message = await channel.send({ embeds: [embed] })

			expect(message.embeds[0].description).toBe('Just description')
		})
	})

	describe('Embed URL Properties', () => {
		it('should set URL', () => {
			const embed = new EmbedBuilder().setTitle('Click Me').setURL('https://discord.com')

			expect(embed.data.url).toBe('https://discord.com')
		})

		it('should set author URL', () => {
			const embed = new EmbedBuilder().setAuthor({ name: 'Author', url: 'https://example.com' })

			expect(embed.data.author?.url).toBe('https://example.com')
		})
	})
})

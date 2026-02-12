/**
 * Miscellaneous Discord.js Methods Tests
 *
 * Tests for Discord.js utilities including Snowflake utilities, BitField operations,
 * formatters, Collection methods, and EmbedBuilder.
 */
import {
	bold,
	ChannelType,
	channelMention,
	Client,
	codeBlock,
	EmbedBuilder,
	GatewayIntentBits,
	Guild,
	hyperlink,
	inlineCode,
	italic,
	PermissionFlagsBits,
	PermissionsBitField,
	roleMention,
	SnowflakeUtil,
	TextChannel,
	time,
	TimestampStyles,
	userMention
} from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Miscellaneous Discord.js Methods', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild

	beforeAll(async () => {
		session = await createSession({
			name: 'utilities-tests',
			config: {
				guilds: [
					{
						name: 'Utilities Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				],
				enforceIntents: true,
				approvedPrivilegedIntents: BigInt(GatewayIntentBits.GuildMembers)
			}
		})

		client = createClientWithIntents([
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.GuildMembers
		])
		await client.login(session.token)
		await waitForReady(client)

		guild = client.guilds.cache.first()!
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Snowflake Utilities', () => {
		it('should extract timestamp from snowflake', () => {
			const channel = guild.channels.cache.first()

			if (channel) {
				const timestamp = SnowflakeUtil.timestampFrom(channel.id)
				expect(timestamp).toBeGreaterThan(0)
			}
		})

		it('should generate snowflake', () => {
			const snowflake = SnowflakeUtil.generate()

			expect(snowflake.toString()).toMatch(/^\d{17,19}$/)
		})
	})

	describe('BitField Operations', () => {
		it('should work with PermissionsBitField', () => {
			const perms = new PermissionsBitField([
				PermissionFlagsBits.SendMessages,
				PermissionFlagsBits.ViewChannel
			])

			expect(perms.has(PermissionFlagsBits.SendMessages)).toBe(true)
			expect(perms.has(PermissionFlagsBits.Administrator)).toBe(false)
		})

		it('should add permissions', () => {
			const perms = new PermissionsBitField()

			perms.add(PermissionFlagsBits.SendMessages)

			expect(perms.has(PermissionFlagsBits.SendMessages)).toBe(true)
		})

		it('should remove permissions', () => {
			const perms = new PermissionsBitField([
				PermissionFlagsBits.SendMessages,
				PermissionFlagsBits.ViewChannel
			])

			perms.remove(PermissionFlagsBits.SendMessages)

			expect(perms.has(PermissionFlagsBits.SendMessages)).toBe(false)
			expect(perms.has(PermissionFlagsBits.ViewChannel)).toBe(true)
		})

		it('should serialize to array', () => {
			const perms = new PermissionsBitField([
				PermissionFlagsBits.SendMessages,
				PermissionFlagsBits.ViewChannel
			])

			const array = perms.toArray()

			expect(array).toContain('SendMessages')
			expect(array).toContain('ViewChannel')
		})
	})

	describe('Formatters', () => {
		it('should format user mention', () => {
			const mention = userMention('123456789')

			expect(mention).toBe('<@123456789>')
		})

		it('should format channel mention', () => {
			const mention = channelMention('123456789')

			expect(mention).toBe('<#123456789>')
		})

		it('should format role mention', () => {
			const mention = roleMention('123456789')

			expect(mention).toBe('<@&123456789>')
		})

		it('should format timestamp', () => {
			const ts = time(new Date(), TimestampStyles.RelativeTime)

			expect(ts).toMatch(/<t:\d+:R>/)
		})

		it('should format code block', () => {
			const block = codeBlock('javascript', 'const x = 1;')

			expect(block).toContain('```javascript')
			expect(block).toContain('const x = 1;')
		})

		it('should format inline code', () => {
			const code = inlineCode('hello')

			expect(code).toBe('`hello`')
		})

		it('should format bold', () => {
			const text = bold('important')

			expect(text).toBe('**important**')
		})

		it('should format italic', () => {
			const text = italic('emphasis')

			expect(text).toBe('_emphasis_')
		})

		it('should format hyperlink', () => {
			const link = hyperlink('Click here', 'https://example.com')

			expect(link).toBe('[Click here](https://example.com)')
		})
	})

	describe('Collection Methods', () => {
		it('should filter cache', () => {
			const textChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildText)

			expect(textChannels.size).toBeGreaterThan(0)
		})

		it('should find in cache', () => {
			const found = guild.channels.cache.find((c) => c.type === ChannelType.GuildText)

			expect(found).toBeDefined()
		})

		it('should map cache', () => {
			const names = guild.channels.cache.map((c) => c.name)

			expect(names.length).toBeGreaterThan(0)
		})

		it('should sort cache', () => {
			const sorted = guild.channels.cache.sort((a, b) => a.name.localeCompare(b.name))

			expect(sorted.size).toBe(guild.channels.cache.size)
		})

		it('should partition cache', () => {
			const [text, other] = guild.channels.cache.partition((c) => c.type === ChannelType.GuildText)

			expect(text.size + other.size).toBe(guild.channels.cache.size)
		})
	})

	describe('Embed Builder', () => {
		it('should build complete embed', async () => {
			const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel

			if (!channel) {
				return
			}

			const embed = new EmbedBuilder()
				.setTitle('Title')
				.setDescription('Description')
				.setURL('https://example.com')
				.setColor(0x00ff00)
				.setAuthor({ name: 'Author', iconURL: 'https://example.com/icon.png' })
				.setFooter({ text: 'Footer', iconURL: 'https://example.com/footer.png' })
				.setThumbnail('https://example.com/thumb.png')
				.setImage('https://example.com/image.png')
				.setTimestamp()
				.addFields(
					{ name: 'Field 1', value: 'Value 1', inline: true },
					{ name: 'Field 2', value: 'Value 2', inline: true }
				)

			const message = await channel.send({ embeds: [embed] })

			expect(message.embeds[0].title).toBe('Title')
			expect(message.embeds[0].description).toBe('Description')
			expect(message.embeds[0].fields.length).toBe(2)
		})
	})
})

/**
 * Text in Voice Channels Tests
 *
 * Tests for sending and receiving messages in voice channels.
 */
import { ChannelType, Client, EmbedBuilder, GatewayIntentBits, type Guild, type VoiceChannel } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Text in Voice Channels', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild
	let voiceChannel: VoiceChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'text-in-voice',
			config: {
				botUser: { username: 'VoiceTextBot' },
				guilds: [{ name: 'Test Guild' }]
			}
		})

		client = createClientWithIntents([
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.MessageContent
		])
		await client.login(session.token)
		await waitForReady(client)
		guild = client.guilds.cache.first()!

		// Create a voice channel for testing
		voiceChannel = (await guild.channels.create({
			name: 'text-in-voice',
			type: ChannelType.GuildVoice
		})) as VoiceChannel
	})

	afterAll(async () => {
		if (voiceChannel) {
			try {
				await voiceChannel.delete()
			} catch {
				// Ignore errors on cleanup
			}
		}
		await destroyClient(client)
		client = null
	})

	it('should send message in voice channel', async () => {
		const message = await voiceChannel.send('Hello from voice channel')

		expect(message.channel.id).toBe(voiceChannel.id)
		expect(message.content).toBe('Hello from voice channel')
	})

	it('should fetch messages from voice channel', async () => {
		await voiceChannel.send('Fetch this message')

		const messages = await voiceChannel.messages.fetch({ limit: 1 })

		expect(messages.size).toBe(1)
	})

	it('should have messages manager on voice channel', () => {
		expect(voiceChannel.messages).toBeDefined()
		expect(typeof voiceChannel.messages.fetch).toBe('function')
	})

	it('should have lastMessage on voice channel after sending', async () => {
		await voiceChannel.send('Last message test')

		expect(voiceChannel.lastMessage).toBeDefined()
	})

	it('should support embeds in voice channel', async () => {
		const embed = new EmbedBuilder().setTitle('Voice Channel Embed').setDescription('Sent in a voice channel')

		const message = await voiceChannel.send({ embeds: [embed] })

		expect(message.embeds.length).toBe(1)
		expect(message.embeds[0].title).toBe('Voice Channel Embed')
	})
})

/**
 * Welcome Screen Tests
 *
 * Tests for guild welcome screen fetching, properties, and editing.
 */
import { ChannelType, Client, GatewayIntentBits, Guild, TextChannel } from 'discord.js'
import { createSession, mockRestAPI } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Welcome Screen', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild

	beforeAll(async () => {
		session = await createSession({
			name: 'welcome-screen-tests',
			config: {
				guilds: [
					{
						name: 'Welcome Screen Guild',
						channels: [
							{ name: 'general', type: ChannelType.GuildText },
							{ name: 'rules', type: ChannelType.GuildText }
						]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds])
		await client.login(session.token)
		await waitForReady(client)

		guild = client.guilds.cache.first()!
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	it('should fetch welcome screen', async () => {
		const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText)!

		// Set up welcome screen via REST API
		await mockRestAPI(session.token, `/guilds/${guild.id}/welcome-screen`, {
			method: 'PATCH',
			body: {
				description: 'Welcome to our server!',
				welcome_channels: [
					{
						channel_id: channel.id,
						description: 'Say hello here',
						emoji_name: '\ud83d\udc4b'
					}
				]
			}
		})

		const welcomeScreen = await guild.fetchWelcomeScreen()

		expect(welcomeScreen.description).toBe('Welcome to our server!')
		// welcomeChannels is a Collection, use .size instead of .length
		expect(welcomeScreen.welcomeChannels.size).toBeGreaterThan(0)
	})

	it('should have welcome channel properties', async () => {
		const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText)!

		// Set up welcome screen
		await mockRestAPI(session.token, `/guilds/${guild.id}/welcome-screen`, {
			method: 'PATCH',
			body: {
				description: 'Test',
				welcome_channels: [
					{
						channel_id: channel.id,
						description: 'Introduction channel',
						emoji_name: '\ud83d\udcdd'
					}
				]
			}
		})

		const welcomeScreen = await guild.fetchWelcomeScreen()
		// welcomeChannels is a Collection, use .first() to get the first element
		const welcomeChannel = welcomeScreen.welcomeChannels.first()!

		expect(welcomeChannel.channelId).toBe(channel.id)
		expect(welcomeChannel.channel?.id).toBe(channel.id)
		expect(welcomeChannel.description).toBe('Introduction channel')
		expect(welcomeChannel.emoji?.name).toBe('\ud83d\udcdd')
	})

	it('should edit welcome screen', async () => {
		await guild.editWelcomeScreen({
			description: 'Updated welcome message!',
			enabled: true
		})

		const updated = await guild.fetchWelcomeScreen()

		expect(updated.description).toBe('Updated welcome message!')
		// Note: Discord API doesn't return 'enabled' in the welcome screen response
		// The 'enabled' field is only an input parameter for modifications
	})

	it('should edit welcome channels', async () => {
		const channel1 = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
		const channel2 = await guild.channels.create({
			name: 'welcome-rules',
			type: ChannelType.GuildText
		})

		try {
			await guild.editWelcomeScreen({
				welcomeChannels: [
					{ channel: channel1.id, description: 'General chat', emoji: '\ud83d\udcac' },
					{ channel: channel2.id, description: 'Read the rules', emoji: '\ud83d\udcdc' }
				]
			})

			const updated = await guild.fetchWelcomeScreen()

			// welcomeChannels is a Collection, use .size instead of .length
			expect(updated.welcomeChannels.size).toBe(2)
		} finally {
			await channel2.delete().catch(() => {})
		}
	})
})

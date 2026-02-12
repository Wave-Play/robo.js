/**
 * Channel sendTyping Tests
 *
 * Tests for sending typing indicators in channels.
 */
import { ChannelType, Client, GatewayIntentBits, TextChannel } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Channel.sendTyping()', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'channel-typing-tests',
			config: {
				guilds: [
					{
						name: 'Channel Typing Test Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages])
		await client.login(session.token)
		await waitForReady(client)

		const guild = client.guilds.cache.first()!
		channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	it('should send typing indicator', async () => {
		// This should not throw
		await channel.sendTyping()
	})

	it('should send typing to DM', async () => {
		const userId = '999999999999999999'

		// Add the user to the session first
		await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
			guild_id: client!.guilds.cache.first()!.id,
			user: { id: userId, username: 'DMTyping', discriminator: '0', avatar: null },
			roles: [],
			joined_at: new Date().toISOString(),
			deaf: false,
			mute: false
		})

		const user = await client!.users.fetch(userId)
		const dm = await user.createDM()

		await dm.sendTyping()
	})
})

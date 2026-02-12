import { Client, Events, TextChannel, ChannelType, GatewayIntentBits } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForEvent, waitForReady, generateSnowflake } from '../utils/helpers.js'

describe('Message Role Subscription Data', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'role-subscription',
			config: {
				guilds: [
					{
						name: 'Test Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages])
		await client.login(session.token)
		await waitForReady(client)

		const guild = client.guilds.cache.first()!
		channel = guild.channels.cache.find(c => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	it('should have roleSubscriptionData property', async () => {
		const messageId = generateSnowflake()
		const listingId = generateSnowflake()
		const guild = client!.guilds.cache.first()!
		const eventPromise = waitForEvent(client!, Events.MessageCreate, 5000)

		await dispatchEvent(session.id, 'MESSAGE_CREATE', {
			id: messageId,
			channel_id: channel.id,
			guild_id: guild.id,
			content: 'Thank you for subscribing!',
			author: { id: '111', username: 'User', bot: false },
			type: 25, // MessageType.RoleSubscriptionPurchase
			role_subscription_data: {
				role_subscription_listing_id: listingId,
				tier_name: 'Premium Tier',
				total_months_subscribed: 3,
				is_renewal: true
			}
		})

		const message = await eventPromise
		expect(message.roleSubscriptionData).toBeDefined()
		expect(message.roleSubscriptionData!.roleSubscriptionListingId).toBe(listingId)
		expect(message.roleSubscriptionData!.tierName).toBe('Premium Tier')
		expect(message.roleSubscriptionData!.totalMonthsSubscribed).toBe(3)
		expect(message.roleSubscriptionData!.isRenewal).toBe(true)
	})
})

import { Client, Events, ChatInputCommandInteraction, ApplicationCommandType, ChannelType } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForEvent, waitForReady, generateSnowflake } from '../utils/helpers.js'

describe('Interaction Entitlements', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guildId: string
	let channelId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'entitlements',
			config: {
				guilds: [
					{
						name: 'Test Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createTestClient()
		await client.login(session.token)
		await waitForReady(client)

		const guild = client.guilds.cache.first()!
		guildId = guild.id
		const channel = guild.channels.cache.first()!
		channelId = channel.id
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	it('should have entitlements collection', async () => {
		const interactionId = generateSnowflake()
		const entitlementId = generateSnowflake()
		const skuId = generateSnowflake()
		const userId = generateSnowflake()
		const eventPromise = waitForEvent(client!, Events.InteractionCreate, 5000)

		await dispatchEvent(session.id, 'INTERACTION_CREATE', {
			id: interactionId,
			application_id: client!.user!.id,
			type: 2, // ApplicationCommand
			guild_id: guildId,
			channel_id: channelId,
			channel: {
				id: channelId,
				type: ChannelType.GuildText
			},
			member: {
				user: { id: userId, username: 'TestUser', discriminator: '0000', avatar: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			},
			user: { id: userId, username: 'TestUser', discriminator: '0000', avatar: null },
			data: {
				id: generateSnowflake(),
				name: 'premium',
				type: ApplicationCommandType.ChatInput
			},
			token: `test-${Date.now()}`,
			version: 1,
			entitlements: [
				{
					id: entitlementId,
					sku_id: skuId,
					application_id: client!.application!.id,
					user_id: userId,
					type: 8, // APPLICATION_SUBSCRIPTION
					deleted: false,
					starts_at: new Date().toISOString()
				}
			]
		})

		const interaction = (await eventPromise) as ChatInputCommandInteraction
		expect(interaction.entitlements).toBeDefined()
		expect(interaction.entitlements.size).toBe(1)

		const entitlement = interaction.entitlements.first()!
		expect(entitlement.id).toBe(entitlementId)
		expect(entitlement.skuId).toBe(skuId)
		expect(entitlement.deleted).toBe(false)
	})
})

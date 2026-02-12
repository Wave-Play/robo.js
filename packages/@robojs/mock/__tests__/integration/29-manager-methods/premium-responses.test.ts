/**
 * Premium Required Responses Tests
 *
 * Tests for premium/monetization features including
 * premium button styles, entitlements, and SKU IDs.
 */
import {
	ActionRowBuilder,
	ApplicationCommandType,
	ButtonBuilder,
	ButtonStyle,
	ChannelType,
	ChatInputCommandInteraction,
	Client,
	Events,
	GatewayIntentBits
} from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForEvent, waitForReady } from '../utils/helpers.js'

describe('Premium Required Responses', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guildId: string
	let channelId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'premium-responses',
			config: {
				guilds: [
					{
						name: 'Premium Guild',
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
		const channel = guild.channels.cache.first()!
		channelId = channel.id
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Premium Button Styles', () => {
		it('should use premium button style with SKU ID', () => {
			const skuId = '123456789012345678'

			const button = new ButtonBuilder().setStyle(ButtonStyle.Premium).setSKUId(skuId)

			expect(button.data.style).toBe(ButtonStyle.Premium)
			// Premium buttons use sku_id in API payload
			expect((button.data as Record<string, unknown>).sku_id).toBe(skuId)
		})

		it('should respond with premium required message', async () => {
			const userId = generateSnowflake()
			const interactionId = generateSnowflake()
			const interactionToken = `premium-${Date.now()}`

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
					user: { id: userId, username: 'User', discriminator: '0', avatar: null },
					roles: [],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				},
				user: { id: userId, username: 'User', discriminator: '0', avatar: null },
				data: {
					id: generateSnowflake(),
					name: 'premium',
					type: ApplicationCommandType.ChatInput
				},
				entitlements: [], // No entitlements
				token: interactionToken,
				version: 1
			})

			const interaction = (await eventPromise) as ChatInputCommandInteraction

			// Respond with premium required using Premium button style
			await interaction.reply({
				content: 'This feature requires a premium subscription!',
				components: [
					new ActionRowBuilder<ButtonBuilder>().addComponents(
						new ButtonBuilder().setStyle(ButtonStyle.Premium).setSKUId('123456789012345678')
					)
				]
			})

			// Verify the response was sent
			expect(interaction.replied).toBe(true)
		})
	})

	describe('Entitlements', () => {
		it('should check for entitlements in interaction', async () => {
			const userId = generateSnowflake()
			const interactionId = generateSnowflake()
			const entitlementId = generateSnowflake()
			const skuId = generateSnowflake()

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
					user: { id: userId, username: 'PremiumUser', discriminator: '0', avatar: null },
					roles: [],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				},
				user: { id: userId, username: 'PremiumUser', discriminator: '0', avatar: null },
				data: {
					id: generateSnowflake(),
					name: 'check-premium',
					type: ApplicationCommandType.ChatInput
				},
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
				],
				token: `check-premium-${Date.now()}`,
				version: 1
			})

			const interaction = (await eventPromise) as ChatInputCommandInteraction

			// Check if user has subscription entitlement
			const hasSubscription = interaction.entitlements.some(
				(e) => e.type === 8 // APPLICATION_SUBSCRIPTION
			)

			expect(hasSubscription).toBe(true)
			expect(interaction.entitlements.size).toBe(1)

			const entitlement = interaction.entitlements.first()!
			expect(entitlement.id).toBe(entitlementId)
			expect(entitlement.skuId).toBe(skuId)
		})
	})
})

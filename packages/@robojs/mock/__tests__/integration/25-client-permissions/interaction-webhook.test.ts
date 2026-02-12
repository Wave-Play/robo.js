/**
 * Interaction Webhook Tests
 *
 * Tests for interaction webhook property and methods including
 * the webhook property, followUp, editReply, and deleteReply via webhook.
 */
import {
	ApplicationCommandType,
	ChannelType,
	ChatInputCommandInteraction,
	Client,
	Events,
	GatewayIntentBits,
	Interaction,
	InteractionType,
	TextChannel
} from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForReady } from '../utils/helpers.js'

/**
 * Wait for an interaction event with a filter predicate
 */
function waitForInteraction(
	client: Client,
	predicate: (interaction: Interaction) => boolean,
	timeout = 5000
): Promise<Interaction> {
	return new Promise((resolve, reject) => {
		const timeoutId = setTimeout(() => {
			client.off(Events.InteractionCreate, handler)
			reject(new Error(`Timeout waiting for interaction after ${timeout}ms`))
		}, timeout)

		const handler = (interaction: Interaction) => {
			if (predicate(interaction)) {
				clearTimeout(timeoutId)
				client.off(Events.InteractionCreate, handler)
				resolve(interaction)
			}
		}

		client.on(Events.InteractionCreate, handler)
	})
}

describe('Interaction Webhook', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'interaction-webhook',
			config: {
				guilds: [
					{
						name: 'Interaction Webhook Guild',
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
		channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	/**
	 * Helper to dispatch a slash command interaction
	 */
	async function dispatchCommandInteraction(commandName: string): Promise<ChatInputCommandInteraction> {
		const interactionId = generateSnowflake()
		const token = `webhook-token-${Date.now()}`

		const eventPromise = waitForInteraction(client!, (i) => i.isChatInputCommand() && i.id === interactionId)

		await dispatchEvent(session.id, 'INTERACTION_CREATE', {
			id: interactionId,
			application_id: client!.user!.id,
			type: InteractionType.ApplicationCommand,
			guild_id: guildId,
			channel_id: channel.id,
			channel: {
				id: channel.id,
				type: ChannelType.GuildText,
				name: channel.name,
				guild_id: guildId
			},
			member: {
				user: { id: generateSnowflake(), username: 'TestUser', discriminator: '0000', avatar: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			},
			user: { id: generateSnowflake(), username: 'TestUser', discriminator: '0000', avatar: null },
			data: {
				id: generateSnowflake(),
				name: commandName,
				type: ApplicationCommandType.ChatInput
			},
			token,
			version: 1
		})

		return (await eventPromise) as ChatInputCommandInteraction
	}

	describe('webhook Property', () => {
		it('should have webhook property on interaction', async () => {
			const interaction = await dispatchCommandInteraction('webhook-test')

			expect(interaction.webhook).toBeDefined()
			expect(interaction.webhook.id).toBe(client!.user!.id)
		})
	})

	describe('followUp via Webhook', () => {
		it('should send followUp via webhook', async () => {
			const interaction = await dispatchCommandInteraction('followup-test')

			await interaction.reply('Initial reply')

			const followUp = await interaction.followUp('Follow up message')

			expect(followUp.content).toBe('Follow up message')
		})
	})

	describe('editReply via Webhook', () => {
		it('should edit reply via webhook', async () => {
			const interaction = await dispatchCommandInteraction('edit-reply-test')

			await interaction.reply('Original')

			const edited = await interaction.editReply('Edited')

			expect(edited.content).toBe('Edited')
		})
	})

	describe('deleteReply via Webhook', () => {
		it('should delete reply via webhook', async () => {
			const interaction = await dispatchCommandInteraction('delete-reply-test')

			await interaction.reply('Delete me')

			// Delete should complete without error
			await interaction.deleteReply()

			// Verify deletion by attempting to fetch (should fail)
			await expect(interaction.fetchReply()).rejects.toBeDefined()
		})
	})
})

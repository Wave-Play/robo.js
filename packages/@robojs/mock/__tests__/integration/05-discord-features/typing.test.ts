/**
 * Typing Indicator Tests
 *
 * Tests for typing indicator functionality via REST API.
 * Note: Event dispatch for TYPING_START is not currently supported,
 * so these tests focus on the sendTyping() REST endpoint.
 */
import { ChannelType, Client, GatewayIntentBits, TextChannel } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Typing Indicator', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'typing-tests',
			config: {
				guilds: [
					{
						name: 'Typing Test Guild',
						channels: [{ name: 'typing-channel', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createTestClient({
			intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessageTyping]
		})
		await client.login(session.token)
		await waitForReady(client)

		channel = client.guilds.cache.first()!.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Sending Typing Indicator', () => {
		it('should send typing indicator without error', async () => {
			// sendTyping() triggers POST /channels/{channel.id}/typing
			await expect(channel.sendTyping()).resolves.not.toThrow()
		})

		it('should allow multiple typing indicators', async () => {
			await channel.sendTyping()
			await channel.sendTyping()
			await channel.sendTyping()
			// If we get here without error, test passes
			expect(true).toBe(true)
		})

		it('should work on text channel', async () => {
			expect(channel.type).toBe(ChannelType.GuildText)
			await channel.sendTyping()
			// Success indicates typing endpoint works for text channels
			expect(true).toBe(true)
		})
	})

	describe('Typing Channel Properties', () => {
		it('should have channel with correct type', () => {
			expect(channel.type).toBe(ChannelType.GuildText)
		})

		it('should be a sendable channel', () => {
			expect(channel.isSendable()).toBe(true)
		})

		it('should have guild reference', () => {
			expect(channel.guild).toBeDefined()
			expect(channel.guildId).toBeDefined()
		})
	})
})

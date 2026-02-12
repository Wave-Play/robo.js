/**
 * Intent Tests
 *
 * Tests for Discord Gateway intent filtering:
 * - Receive events with correct intents
 * - Block events without required intents
 * - Strip message content without MessageContent intent
 * - Allow content for bot mentions
 */
import { GatewayIntentBits, Events, Message } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { destroyClient, createClientWithIntents } from '../setup/test-client.js'
import { waitForReady, waitForEvent, delay } from '../utils/helpers.js'

describe('Intents', () => {
	describe('Event Filtering', () => {
		it('should receive MESSAGE_CREATE with GuildMessages intent', async () => {
			const session = await createSession({
				name: 'message-intent-test',
				config: {
					guilds: [{ name: 'Message Intent Guild' }],
					enforceIntents: true
				}
			})

			const client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages])

			try {
				await client.login(session.token)
				await waitForReady(client)

				const channel = client.channels.cache.first()!

				// Set up message listener before dispatching
				const messagePromise = waitForEvent(client, Events.MessageCreate, 5000)

				// Dispatch a message event
				await dispatchEvent(session.id, 'MESSAGE_CREATE', {
					channel_id: channel.id,
					content: 'Test message with intent'
				})

				const message = await messagePromise
				expect(message).toBeDefined()
			} finally {
				await destroyClient(client)
			}
		})

		it('should NOT receive MESSAGE_CREATE without GuildMessages intent', async () => {
			const session = await createSession({
				name: 'no-message-intent-test',
				config: {
					guilds: [{ name: 'No Message Intent Guild' }],
					enforceIntents: true
				}
			})

			// Only Guilds intent, no GuildMessages
			const client = createClientWithIntents([GatewayIntentBits.Guilds])

			try {
				await client.login(session.token)
				await waitForReady(client)

				const channel = client.channels.cache.first()!

				let receivedMessage = false
				client.on(Events.MessageCreate, () => {
					receivedMessage = true
				})

				// Dispatch a message event
				await dispatchEvent(session.id, 'MESSAGE_CREATE', {
					channel_id: channel.id,
					content: 'Should not receive this'
				})

				// Wait a bit to ensure event would have been received if it was going to
				await delay(1000)

				expect(receivedMessage).toBe(false)
			} finally {
				await destroyClient(client)
			}
		})
	})

	describe('MessageContent Intent', () => {
		it(
			'should strip message content without MessageContent intent',
			async () => {
				// Create session with enforceIntents but MessageContent NOT approved
				const session = await createSession({
					name: 'content-strip-test',
					config: {
						guilds: [{ name: 'Content Strip Guild' }],
						enforceIntents: true,
						// Only approve GuildMembers and GuildPresences, NOT MessageContent
						approvedPrivilegedIntents: BigInt((1 << 1) | (1 << 8))
					}
				})

				// Client with GuildMessages but NOT MessageContent
				const client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages])

				try {
					await client.login(session.token)
					await waitForReady(client)

					const channel = client.channels.cache.first()!

					const messagePromise = waitForEvent(client, Events.MessageCreate, 5000)

					// Dispatch message with content from a non-bot user
					await dispatchEvent(session.id, 'MESSAGE_CREATE', {
						channel_id: channel.id,
						content: 'Secret content that should be stripped',
						author: {
							id: '999999999999999999',
							username: 'OtherUser',
							bot: false
						}
					})

					const message = (await messagePromise) as Message

					// Content should be stripped (empty string)
					expect(message.content).toBe('')
				} finally {
					await destroyClient(client)
				}
			},
			15000
		)

		it(
			'should receive full content WITH MessageContent intent',
			async () => {
				// Create session with MessageContent approved
				const session = await createSession({
					name: 'full-content-test',
					config: {
						guilds: [{ name: 'Full Content Guild' }],
						enforceIntents: true,
						// Approve MessageContent
						approvedPrivilegedIntents: BigInt(1 << 15)
					}
				})

				// Client WITH MessageContent intent
				const client = createClientWithIntents([
					GatewayIntentBits.Guilds,
					GatewayIntentBits.GuildMessages,
					GatewayIntentBits.MessageContent
				])

				try {
					await client.login(session.token)
					await waitForReady(client)

					const channel = client.channels.cache.first()!

					const messagePromise = waitForEvent(client, Events.MessageCreate, 5000)

					await dispatchEvent(session.id, 'MESSAGE_CREATE', {
						channel_id: channel.id,
						content: 'This content should be visible'
					})

					const message = (await messagePromise) as Message

					// Content should be present
					expect(message.content).toBe('This content should be visible')
				} finally {
					await destroyClient(client)
				}
			},
			15000
		)
	})

	describe('Bot Mention Exception', () => {
		it(
			'should NOT strip content when message mentions the bot',
			async () => {
				// Create session with enforceIntents and MessageContent NOT approved
				const session = await createSession({
					name: 'bot-mention-test',
					config: {
						botUser: { username: 'MentionBot' },
						guilds: [{ name: 'Bot Mention Guild' }],
						enforceIntents: true,
						// Do NOT approve MessageContent
						approvedPrivilegedIntents: BigInt((1 << 1) | (1 << 8))
					}
				})

				// Client WITHOUT MessageContent intent
				const client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages])

				try {
					await client.login(session.token)
					await waitForReady(client)

					const channel = client.channels.cache.first()!
					const botUserId = client.user!.id

					const messagePromise = waitForEvent(client, Events.MessageCreate, 5000)

					// Dispatch message that mentions the bot
					await dispatchEvent(session.id, 'MESSAGE_CREATE', {
						channel_id: channel.id,
						content: `Hey <@${botUserId}> check this out!`,
						mentions: [{ id: botUserId, username: 'MentionBot', bot: true }],
						author: {
							id: '888888888888888888',
							username: 'SomeUser',
							bot: false
						}
					})

					const message = (await messagePromise) as Message

					// Content should NOT be stripped because bot is mentioned
					expect(message.content).toContain(botUserId)
				} finally {
					await destroyClient(client)
				}
			},
			15000
		)
	})
})

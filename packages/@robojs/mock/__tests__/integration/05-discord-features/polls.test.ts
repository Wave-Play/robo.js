/**
 * Poll Tests
 *
 * Tests for poll creation and properties via REST API.
 * Note: Event dispatch for poll vote events is not currently supported,
 * so these tests focus on poll creation and expiration.
 */
import { ChannelType, Client, GatewayIntentBits, TextChannel } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { MOCK_CONFIG } from '../setup/constants.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Polls', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'poll-tests',
			config: {
				guilds: [
					{
						name: 'Poll Test Guild',
						channels: [{ name: 'poll-channel', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createTestClient({
			intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessagePolls]
		})
		await client.login(session.token)
		await waitForReady(client)

		channel = client.guilds.cache.first()!.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Creating Polls', () => {
		it('should send message with poll', async () => {
			const message = await channel.send({
				poll: {
					question: { text: 'What is your favorite color?' },
					answers: [{ text: 'Red' }, { text: 'Blue' }, { text: 'Green' }],
					duration: 24,
					allowMultiselect: false
				}
			})

			expect(message.poll).toBeDefined()
			expect(message.poll!.question.text).toBe('What is your favorite color?')
			expect(message.poll!.answers.size).toBe(3)
		})

		it('should create multi-select poll', async () => {
			const message = await channel.send({
				poll: {
					question: { text: 'Select all that apply:' },
					answers: [{ text: 'Option A' }, { text: 'Option B' }],
					duration: 24,
					allowMultiselect: true
				}
			})

			expect(message.poll!.allowMultiselect).toBe(true)
		})

		it('should create poll with emoji answers', async () => {
			const message = await channel.send({
				poll: {
					question: { text: 'Rate this:' },
					answers: [
						{ text: 'Great', emoji: '\ud83d\udc4d' },
						{ text: 'Bad', emoji: '\ud83d\udc4e' }
					],
					duration: 24,
					allowMultiselect: false
				}
			})

			expect(message.poll!.answers.size).toBe(2)
		})

		it('should create poll with longer duration', async () => {
			const message = await channel.send({
				poll: {
					question: { text: 'Week-long poll' },
					answers: [{ text: 'Yes' }, { text: 'No' }],
					duration: 168, // 7 days
					allowMultiselect: false
				}
			})

			expect(message.poll).toBeDefined()
		})
	})

	describe('Ending Polls', () => {
		it('should end poll early', async () => {
			const message = await channel.send({
				poll: {
					question: { text: 'End early test' },
					answers: [{ text: 'A' }, { text: 'B' }],
					duration: 24,
					allowMultiselect: false
				}
			})

			// End the poll via REST API
			const response = await fetch(`${MOCK_CONFIG.REST_URL}/v10/channels/${channel.id}/polls/${message.id}/expire`, {
				method: 'POST',
				headers: {
					Authorization: `Bot ${session.token}`,
					'Content-Type': 'application/json'
				}
			})

			expect(response.ok).toBe(true)

			// Fetch the message to verify poll is finalized
			const fetched = await channel.messages.fetch(message.id)
			expect(fetched.poll!.resultsFinalized).toBe(true)
		})

		it('should not allow ending already finalized poll', async () => {
			const message = await channel.send({
				poll: {
					question: { text: 'Already ended test' },
					answers: [{ text: 'A' }, { text: 'B' }],
					duration: 24,
					allowMultiselect: false
				}
			})

			// End the poll
			await fetch(`${MOCK_CONFIG.REST_URL}/v10/channels/${channel.id}/polls/${message.id}/expire`, {
				method: 'POST',
				headers: {
					Authorization: `Bot ${session.token}`,
					'Content-Type': 'application/json'
				}
			})

			// Try to end again
			const response = await fetch(`${MOCK_CONFIG.REST_URL}/v10/channels/${channel.id}/polls/${message.id}/expire`, {
				method: 'POST',
				headers: {
					Authorization: `Bot ${session.token}`,
					'Content-Type': 'application/json'
				}
			})

			expect(response.ok).toBe(false)
			expect(response.status).toBe(400)
		})
	})

	describe('Poll Properties', () => {
		it('should have question text', async () => {
			const message = await channel.send({
				poll: {
					question: { text: 'Question text test' },
					answers: [{ text: 'Answer' }],
					duration: 24,
					allowMultiselect: false
				}
			})

			expect(message.poll!.question.text).toBe('Question text test')
		})

		it('should have correct answer count', async () => {
			const message = await channel.send({
				poll: {
					question: { text: 'Answer count test' },
					answers: [
						{ text: 'One' },
						{ text: 'Two' },
						{ text: 'Three' },
						{ text: 'Four' }
					],
					duration: 24,
					allowMultiselect: false
				}
			})

			expect(message.poll!.answers.size).toBe(4)
		})

		it('should have expiry timestamp', async () => {
			const message = await channel.send({
				poll: {
					question: { text: 'Expiry test' },
					answers: [{ text: 'A' }],
					duration: 24,
					allowMultiselect: false
				}
			})

			expect(message.poll!.expiresTimestamp).toBeDefined()
		})
	})

	describe('Fetching Poll Messages', () => {
		it('should fetch message with poll', async () => {
			const message = await channel.send({
				poll: {
					question: { text: 'Fetch test' },
					answers: [{ text: 'Yes' }, { text: 'No' }],
					duration: 24,
					allowMultiselect: false
				}
			})

			const fetched = await channel.messages.fetch(message.id)
			expect(fetched.poll).toBeDefined()
			expect(fetched.poll!.question.text).toBe('Fetch test')
		})

		it('should maintain poll data after fetch', async () => {
			const message = await channel.send({
				poll: {
					question: { text: 'Maintain test' },
					answers: [{ text: 'A' }, { text: 'B' }, { text: 'C' }],
					duration: 24,
					allowMultiselect: true
				}
			})

			const fetched = await channel.messages.fetch(message.id)
			expect(fetched.poll!.answers.size).toBe(3)
			expect(fetched.poll!.allowMultiselect).toBe(true)
		})
	})
})

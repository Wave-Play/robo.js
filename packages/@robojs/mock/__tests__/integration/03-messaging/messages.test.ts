/**
 * Message Operations Tests
 *
 * Covers sending, editing, deleting, fetching, pins, reactions, and message events.
 */
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	Client,
	EmbedBuilder,
	Events,
	GatewayIntentBits,
	type TextChannel
} from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForEvent, waitForReady } from '../utils/helpers.js'

describe('Messages', () => {
	let client: Client | null = null
	let channel: TextChannel
	let session: Awaited<ReturnType<typeof createSession>>

	beforeAll(async () => {
		session = await createSession({
			name: 'message-operations-tests',
			config: {
				guilds: [{ name: 'Message Ops Guild' }],
				enforceIntents: true,
				approvedPrivilegedIntents: BigInt(GatewayIntentBits.MessageContent)
			}
		})

		client = createClientWithIntents([
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.MessageContent,
			GatewayIntentBits.GuildMessageReactions
		])

		await client.login(session.token)
		await waitForReady(client)

		const guild = client.guilds.cache.first()
		if (!guild) {
			throw new Error('Guild not found after login')
		}

		const textChannel = guild.channels.cache.find((c) => c?.type === 0) as TextChannel | undefined
		if (!textChannel) {
			throw new Error('Text channel not found for message tests')
		}
		channel = textChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Sending Messages', () => {
		it('should send simple text', async () => {
			const message = await channel.send('Hello!')
			expect(message.content).toBe('Hello!')
			expect(message.author.id).toBe(client!.user!.id)
		})

		it('should send with embed', async () => {
			const embed = new EmbedBuilder().setTitle('Test').setDescription('Description').setColor(0x00ff00)

			const message = await channel.send({ embeds: [embed] })
			expect(message.embeds.length).toBe(1)
			expect(message.embeds[0].title).toBe('Test')
		})

		it('should send with components', async () => {
			const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder().setCustomId('btn').setLabel('Click').setStyle(ButtonStyle.Primary)
			)

			const message = await channel.send({
				content: 'Click:',
				components: [row]
			})

			expect(message.components.length).toBe(1)
		})

		it('should send reply', async () => {
			const original = await channel.send('Original')
			const reply = await original.reply('Reply')

			expect(reply.reference?.messageId).toBe(original.id)
		})

		it('should enforce length limit', async () => {
			await expect(channel.send('a'.repeat(2001))).rejects.toMatchObject({ code: 50035 })
		})
	})

	describe('Editing Messages', () => {
		it('should edit content', async () => {
			const message = await channel.send('Original')
			await message.edit('Edited')

			expect(message.content).toBe('Edited')
			expect(message.editedTimestamp).not.toBeNull()
		})

		it('should fail to edit others message', async () => {
			const otherMessageId = generateSnowflake()
			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				id: otherMessageId,
				channel_id: channel.id,
				guild_id: channel.guildId,
				content: 'Other message',
				author: { id: '222', username: 'Other', bot: false }
			})

			const otherMessage = await channel.messages.fetch(otherMessageId)
			await expect(otherMessage.edit('Edit')).rejects.toMatchObject({ code: 50005 })
		})
	})

	describe('Deleting Messages', () => {
		it('should delete own message', async () => {
			const message = await channel.send('Delete me')
			const messageId = message.id
			await message.delete()

			await expect(channel.messages.fetch(messageId)).rejects.toMatchObject({ code: 10008 })
		})

		it('should bulk delete messages', async () => {
			const messages = await Promise.all([channel.send('Bulk 1'), channel.send('Bulk 2'), channel.send('Bulk 3')])

			const deleted = await channel.bulkDelete(messages)
			expect(deleted.size).toBe(3)
		})
	})

	describe('Fetching Messages', () => {
		it('should fetch single message', async () => {
			const sent = await channel.send('Fetch me')
			const fetched = await channel.messages.fetch(sent.id)
			expect(fetched.content).toBe('Fetch me')
		})

		it('should fetch with limit', async () => {
			const messages = await channel.messages.fetch({ limit: 5 })
			expect(messages.size).toBeLessThanOrEqual(5)
		})

		it('should fetch before/after', async () => {
			const marker = await channel.send('Marker')
			await channel.send('After')

			const before = await channel.messages.fetch({ before: marker.id, limit: 5 })
			expect(before.has(marker.id)).toBe(false)
		})
	})

	describe('Pins', () => {
		// Helper to pin a message via direct REST API
		// Note: Discord.js's message.pin() has routing issues with nested dynamic paths
		async function pinMessage(channelId: string, messageId: string) {
			const response = await fetch(`http://localhost:3000/api/v10/channels/${channelId}/pins/${messageId}`, {
				method: 'PUT',
				headers: { 'Authorization': `Bot ${session.token}` }
			})
			if (response.status !== 204) {
				throw new Error(`Pin failed with status ${response.status}`)
			}
		}

		// Helper to unpin a message via direct REST API
		async function unpinMessage(channelId: string, messageId: string) {
			const response = await fetch(`http://localhost:3000/api/v10/channels/${channelId}/pins/${messageId}`, {
				method: 'DELETE',
				headers: { 'Authorization': `Bot ${session.token}` }
			})
			if (response.status !== 204) {
				throw new Error(`Unpin failed with status ${response.status}`)
			}
		}

		it('should pin message', async () => {
			const message = await channel.send('Pin me')
			await pinMessage(channel.id, message.id)

			const refreshed = await channel.messages.fetch(message.id)
			expect(refreshed.pinned).toBe(true)
		})

		it('should fetch pinned', async () => {
			const message = await channel.send('Pinned')
			await pinMessage(channel.id, message.id)

			const pins = await channel.messages.fetchPinned()
			expect(pins.has(message.id)).toBe(true)
		})

		it('should unpin message', async () => {
			const message = await channel.send('Unpin')
			await pinMessage(channel.id, message.id)
			await unpinMessage(channel.id, message.id)

			const refreshed = await channel.messages.fetch(message.id)
			expect(refreshed.pinned).toBe(false)
		})
	})

	describe('Reactions', () => {
		it('should add reaction', async () => {
			const message = await channel.send('React')
			await message.react('👍')

			const fetched = await channel.messages.fetch(message.id)
			expect(fetched.reactions.cache.has('👍')).toBe(true)
		})

		it('should remove own reaction', async () => {
			const message = await channel.send('Remove react')
			await message.react('👎')

			// Use direct REST API to remove the reaction
			const removeResponse = await fetch(
				`http://localhost:3000/api/v10/channels/${channel.id}/messages/${message.id}/reactions/${encodeURIComponent('👎')}/@me`,
				{
					method: 'DELETE',
					headers: { Authorization: `Bot ${session.token}` }
				}
			)
			expect(removeResponse.status).toBe(204)

			// Verify via direct REST fetch
			const msgResp = await fetch(
				`http://localhost:3000/api/v10/channels/${channel.id}/messages/${message.id}`,
				{
					headers: { Authorization: `Bot ${session.token}` }
				}
			)
			const msgData = (await msgResp.json()) as { reactions?: Array<{ emoji?: { name?: string } }> }
			// After removing the only reaction, the reactions should be empty or the specific emoji should be gone
			const thumbsDownReaction = (msgData.reactions ?? []).find((r) => r.emoji?.name === '👎')
			expect(thumbsDownReaction).toBeUndefined()
		})

		it('should remove all reactions', async () => {
			const message = await channel.send('Clear reactions')
			await message.react('👍')
			await message.react('❤️')

			// Use direct REST API to remove all reactions
			const removeAllResponse = await fetch(
				`http://localhost:3000/api/v10/channels/${channel.id}/messages/${message.id}/reactions`,
				{
					method: 'DELETE',
					headers: { Authorization: `Bot ${session.token}` }
				}
			)
			expect(removeAllResponse.status).toBe(204)

			// Verify via direct REST fetch (Discord.js caching can be unreliable)
			const msgResp = await fetch(
				`http://localhost:3000/api/v10/channels/${channel.id}/messages/${message.id}`,
				{
					headers: { Authorization: `Bot ${session.token}` }
				}
			)
			const msgData = (await msgResp.json()) as { reactions?: unknown[] }
			expect(msgData.reactions?.length ?? 0).toBe(0)
		})
	})

	describe('Message Events', () => {
		it('should emit messageCreate', async () => {
			const eventPromise = waitForEvent(client!, Events.MessageCreate)
			const sent = await channel.send('Event')
			const received = await eventPromise
			expect(received.id).toBe(sent.id)
		})

		it('should emit messageUpdate', async () => {
			const message = await channel.send('Before')
			const eventPromise = new Promise<{ oldContent: string | null; newContent: string | null }>((resolve) => {
				client!.once(Events.MessageUpdate, (oldMsg, updatedMsg) =>
					resolve({ oldContent: oldMsg.content, newContent: updatedMsg.content })
				)
			})

			await message.edit('After')
			const { oldContent, newContent } = await eventPromise
			expect(oldContent).toBe('Before')
			expect(newContent).toBe('After')
		})

		it('should emit messageDelete', async () => {
			const message = await channel.send('Delete event')
			const messageId = message.id
			const eventPromise = waitForEvent(client!, Events.MessageDelete)

			await message.delete()
			const deleted = await eventPromise
			expect(deleted.id).toBe(messageId)
		})
	})
})


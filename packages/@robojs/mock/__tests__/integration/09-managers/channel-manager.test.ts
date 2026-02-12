/**
 * GuildChannelManager Methods Tests
 *
 * Tests for GuildChannelManager methods including setPositions() and fetchActiveThreads().
 */
import { ChannelType, Client, GatewayIntentBits, Guild, TextChannel } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('GuildChannelManager Methods', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild

	beforeAll(async () => {
		session = await createSession({
			name: 'channel-manager-tests',
			config: {
				guilds: [
					{
						name: 'Channel Manager Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				],
				enforceIntents: true,
				approvedPrivilegedIntents: BigInt(GatewayIntentBits.GuildMembers)
			}
		})

		client = createClientWithIntents([
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.GuildMembers
		])
		await client.login(session.token)
		await waitForReady(client)

		guild = client.guilds.cache.first()!
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('GuildChannelManager.setPositions()', () => {
		it('should bulk reorder channels', async () => {
			const channel1 = await guild.channels.create({
				name: 'reorder-1',
				type: ChannelType.GuildText
			})
			const channel2 = await guild.channels.create({
				name: 'reorder-2',
				type: ChannelType.GuildText
			})

			try {
				await guild.channels.setPositions([
					{ channel: channel1.id, position: 1 },
					{ channel: channel2.id, position: 0 }
				])

				const fetched1 = (await guild.channels.fetch(channel1.id)) as TextChannel
				const fetched2 = (await guild.channels.fetch(channel2.id)) as TextChannel

				// Channel2 should have a lower position than channel1
				expect(fetched2.position).toBeLessThanOrEqual(fetched1.position)
			} finally {
				await channel1.delete().catch(() => {})
				await channel2.delete().catch(() => {})
			}
		})

		it('should move channel to category', async () => {
			const category = await guild.channels.create({
				name: 'Move Category',
				type: ChannelType.GuildCategory
			})

			const channel = await guild.channels.create({
				name: 'move-me',
				type: ChannelType.GuildText
			})

			try {
				await guild.channels.setPositions([{ channel: channel.id, position: 0, parent: category.id }])

				const fetched = await guild.channels.fetch(channel.id)
				expect(fetched!.parentId).toBe(category.id)
			} finally {
				await channel.delete().catch(() => {})
				await category.delete().catch(() => {})
			}
		})
	})

	describe('GuildChannelManager.fetchActiveThreads()', () => {
		it('should fetch active threads', async () => {
			const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel

			if (!channel) {
				// Skip if no text channel available
				return
			}

			const message = await channel.send('Thread parent')
			const thread = await message.startThread({ name: 'Active Thread' })

			try {
				const active = await guild.channels.fetchActiveThreads()

				expect(active.threads.has(thread.id)).toBe(true)
			} finally {
				await thread.delete().catch(() => {})
			}
		})

		it('should include thread members', async () => {
			const active = await guild.channels.fetchActiveThreads()

			expect(active.members).toBeDefined()
		})
	})
})

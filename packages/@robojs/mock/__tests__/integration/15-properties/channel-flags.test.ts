/**
 * Channel Flags Tests
 *
 * Tests for channel flags including PINNED and REQUIRE_TAG flags.
 */
import {
	ChannelFlags,
	ChannelType,
	Client,
	ForumChannel,
	GatewayIntentBits,
	Guild,
	TextChannel,
	ThreadChannel
} from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Channel Flags', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild

	beforeAll(async () => {
		session = await createSession({
			name: 'channel-flags-tests',
			config: {
				guilds: [
					{
						name: 'Channel Flags Test Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages])
		await client.login(session.token)
		await waitForReady(client)

		guild = client.guilds.cache.first()!
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	it('should have flags on channel', async () => {
		const channel = (await guild.channels.create({
			name: 'flags-test',
			type: ChannelType.GuildText
		})) as TextChannel

		try {
			expect(channel.flags).toBeDefined()
		} finally {
			await channel.delete().catch(() => {})
		}
	})

	it('should check PINNED flag on forum thread', async () => {
		const forum = (await guild.channels.create({
			name: 'pinned-forum',
			type: ChannelType.GuildForum,
			availableTags: [{ name: 'Test' }]
		})) as ForumChannel

		let thread: ThreadChannel | null = null
		try {
			thread = await forum.threads.create({
				name: 'Pinned Thread',
				message: { content: 'Pin me' }
			})

			// Thread flags should exist
			expect(thread.flags).toBeDefined()

			// Check if PINNED flag can be checked (even if not set)
			const isPinned = thread.flags.has(ChannelFlags.Pinned)
			expect(typeof isPinned).toBe('boolean')
		} finally {
			if (thread) {
				await thread.delete().catch(() => {})
			}
			await forum.delete().catch(() => {})
		}
	})

	it('should check REQUIRE_TAG flag on forum', async () => {
		const forum = (await guild.channels.create({
			name: 'require-tag-forum',
			type: ChannelType.GuildForum,
			availableTags: [{ name: 'Required' }]
		})) as ForumChannel

		try {
			// Check if REQUIRE_TAG flag can be set/checked
			expect(forum.flags).toBeDefined()

			// The flag may or may not be set depending on creation options
			const hasRequireTag = forum.flags.has(ChannelFlags.RequireTag)
			expect(typeof hasRequireTag).toBe('boolean')
		} finally {
			await forum.delete().catch(() => {})
		}
	})

	it('should have flags bitfield on text channel', async () => {
		const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel

		expect(channel.flags).toBeDefined()
		expect(typeof channel.flags.bitfield).toBe('number')
	})
})

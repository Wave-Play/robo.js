/**
 * ForumChannel-Specific Methods Tests
 *
 * Tests for forum channel specific methods including tags,
 * settings, layouts, and forum post creation.
 *
 * Note: More comprehensive forum tests exist in 06-recording-state/forum-channels.test.ts
 * This file covers the specific tests outlined in Part 12 specification.
 */
import {
	ChannelType,
	Client,
	ForumChannel,
	ForumLayoutType,
	GatewayIntentBits,
	SortOrderType
} from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('ForumChannel-Specific Methods', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'forum-channel-methods-tests',
			config: {
				guilds: [
					{
						name: 'Forum Methods Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages])
		await client.login(session.token)
		await waitForReady(client)

		guildId = client.guilds.cache.first()!.id
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Creating Forum Channels', () => {
		it('should create forum channel with tags', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			const forum = (await guild.channels.create({
				name: 'test-forum',
				type: ChannelType.GuildForum,
				availableTags: [
					{ name: 'Question', moderated: false },
					{ name: 'Answered', moderated: true },
					{ name: 'Bug', emoji: { id: null, name: '🐛' } }
				]
			})) as ForumChannel

			try {
				expect(forum.availableTags.length).toBe(3)
				expect(forum.availableTags.find((t) => t.name === 'Question')).toBeDefined()
			} finally {
				await forum.delete().catch(() => {})
			}
		})
	})

	describe('Forum Tag Management', () => {
		it('should set available tags', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			const forum = (await guild.channels.create({
				name: 'tags-forum',
				type: ChannelType.GuildForum
			})) as ForumChannel

			try {
				await forum.setAvailableTags([{ name: 'New Tag' }, { name: 'Another Tag' }])

				expect(forum.availableTags.length).toBe(2)
			} finally {
				await forum.delete().catch(() => {})
			}
		})
	})

	describe('Forum Settings', () => {
		it('should set default reaction emoji', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			const forum = (await guild.channels.create({
				name: 'reaction-forum',
				type: ChannelType.GuildForum
			})) as ForumChannel

			try {
				await forum.setDefaultReactionEmoji({ id: null, name: '👍' })

				expect(forum.defaultReactionEmoji?.name).toBe('👍')
			} finally {
				await forum.delete().catch(() => {})
			}
		})

		it('should set default sort order', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			const forum = (await guild.channels.create({
				name: 'sort-forum',
				type: ChannelType.GuildForum
			})) as ForumChannel

			try {
				await forum.setDefaultSortOrder(SortOrderType.CreationDate)

				expect(forum.defaultSortOrder).toBe(SortOrderType.CreationDate)
			} finally {
				await forum.delete().catch(() => {})
			}
		})

		it('should set forum layout', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			const forum = (await guild.channels.create({
				name: 'layout-forum',
				type: ChannelType.GuildForum
			})) as ForumChannel

			try {
				await forum.setDefaultForumLayout(ForumLayoutType.GalleryView)

				expect(forum.defaultForumLayout).toBe(ForumLayoutType.GalleryView)
			} finally {
				await forum.delete().catch(() => {})
			}
		})
	})

	describe('Forum Posts', () => {
		it('should create forum post', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			const forum = (await guild.channels.create({
				name: 'post-forum',
				type: ChannelType.GuildForum,
				availableTags: [{ name: 'Discussion' }]
			})) as ForumChannel

			try {
				const tagId = forum.availableTags[0].id

				const thread = await forum.threads.create({
					name: 'Test Post',
					message: { content: 'Post content' },
					appliedTags: [tagId]
				})

				expect(thread.name).toBe('Test Post')
				expect(thread.appliedTags).toContain(tagId)

				await thread.delete().catch(() => {})
			} finally {
				await forum.delete().catch(() => {})
			}
		})
	})
})

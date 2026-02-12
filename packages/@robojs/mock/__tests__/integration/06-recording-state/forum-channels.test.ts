/**
 * Forum Channels Deep Tests
 *
 * Tests for forum channel features including tags, posts,
 * sorting, layouts, and forum-specific settings.
 */
import {
	Client,
	ChannelType,
	ForumChannel,
	ThreadAutoArchiveDuration,
	SortOrderType,
	ForumLayoutType,
	ChannelFlags
} from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady, delay } from '../utils/helpers.js'

describe('Forum Channels Deep', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guildId: string
	let forumChannel: ForumChannel | null = null

	beforeAll(async () => {
		session = await createSession({
			name: 'forum-channels-tests',
			config: {
				guilds: [
					{
						name: 'Forum Test Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createTestClient()
		await client.login(session.token)
		await waitForReady(client)

		guildId = client.guilds.cache.first()!.id
	})

	afterAll(async () => {
		// Cleanup forum channel if it exists
		if (forumChannel) {
			try {
				await forumChannel.delete()
			} catch {
				// May already be deleted
			}
		}
		await destroyClient(client)
		client = null
	})

	describe('Creating Forum Channels', () => {
		it('should create basic forum channel', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			forumChannel = (await guild.channels.create({
				name: 'test-forum',
				type: ChannelType.GuildForum
			})) as ForumChannel

			expect(forumChannel.type).toBe(ChannelType.GuildForum)
			expect(forumChannel.name).toBe('test-forum')
		})

		it('should create forum channel with topic', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			const forum = (await guild.channels.create({
				name: 'topic-forum',
				type: ChannelType.GuildForum,
				topic: 'Post your questions here'
			})) as ForumChannel

			expect(forum.topic).toBe('Post your questions here')

			await forum.delete()
		})

		it('should create forum channel with rate limit', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			const forum = (await guild.channels.create({
				name: 'slowmode-forum',
				type: ChannelType.GuildForum,
				rateLimitPerUser: 10
			})) as ForumChannel

			expect(forum.rateLimitPerUser).toBe(10)

			await forum.delete()
		})
	})

	describe('Forum Tags', () => {
		let taggedForum: ForumChannel

		beforeAll(async () => {
			const guild = client!.guilds.cache.get(guildId)!
			taggedForum = (await guild.channels.create({
				name: 'tagged-forum',
				type: ChannelType.GuildForum,
				availableTags: [
					{ name: 'Bug', emoji: { id: null, name: '🐛' } },
					{ name: 'Feature', emoji: { id: null, name: '✨' } },
					{ name: 'Question', emoji: { id: null, name: '❓' } }
				]
			})) as ForumChannel
		})

		afterAll(async () => {
			if (taggedForum) {
				try {
					await taggedForum.delete()
				} catch {
					// May already be deleted
				}
			}
		})

		it('should create forum with initial tags', async () => {
			expect(taggedForum.availableTags.length).toBe(3)
			expect(taggedForum.availableTags[0].name).toBe('Bug')
		})

		it('should have tag with unicode emoji', async () => {
			const bugTag = taggedForum.availableTags.find((t) => t.name === 'Bug')
			expect(bugTag?.emoji?.name).toBe('🐛')
		})

		it('should add new tag to forum', async () => {
			await taggedForum.setAvailableTags([...taggedForum.availableTags, { name: 'Resolved' }])

			expect(taggedForum.availableTags.some((t) => t.name === 'Resolved')).toBe(true)
		})

		it('should create moderated tag', async () => {
			await taggedForum.setAvailableTags([...taggedForum.availableTags, { name: 'Mod Only', moderated: true }])

			const modTag = taggedForum.availableTags.find((t) => t.name === 'Mod Only')
			expect(modTag?.moderated).toBe(true)
		})

		it('should remove tag from forum', async () => {
			const tagsWithoutQuestion = taggedForum.availableTags.filter((t) => t.name !== 'Question')
			await taggedForum.setAvailableTags(tagsWithoutQuestion)

			expect(taggedForum.availableTags.some((t) => t.name === 'Question')).toBe(false)
		})

		it('should update tag name', async () => {
			const featureTag = taggedForum.availableTags.find((t) => t.name === 'Feature')
			if (featureTag) {
				const updatedTags = taggedForum.availableTags.map((t) =>
					t.id === featureTag.id ? { ...t, name: 'Enhancement' } : t
				)
				await taggedForum.setAvailableTags(updatedTags)

				expect(taggedForum.availableTags.some((t) => t.name === 'Enhancement')).toBe(true)
			}
		})

		it('should enforce max 20 tags', async () => {
			const tooManyTags = Array(21)
				.fill(null)
				.map((_, i) => ({ name: `Tag ${i + 1}` }))

			await expect(taggedForum.setAvailableTags(tooManyTags)).rejects.toBeDefined()
		})
	})

	describe('Forum Posts (Threads)', () => {
		let postForum: ForumChannel

		beforeAll(async () => {
			const guild = client!.guilds.cache.get(guildId)!
			postForum = (await guild.channels.create({
				name: 'post-forum',
				type: ChannelType.GuildForum,
				availableTags: [{ name: 'Discussion' }, { name: 'Help' }]
			})) as ForumChannel
		})

		afterAll(async () => {
			if (postForum) {
				try {
					await postForum.delete()
				} catch {
					// May already be deleted
				}
			}
		})

		it('should create forum post', async () => {
			const thread = await postForum.threads.create({
				name: 'Test Post',
				message: { content: 'This is the opening post' }
			})

			expect(thread.name).toBe('Test Post')
			expect(thread.parentId).toBe(postForum.id)

			await thread.delete()
		})

		it('should create post with applied tags', async () => {
			const discussionTag = postForum.availableTags.find((t) => t.name === 'Discussion')

			if (discussionTag) {
				const thread = await postForum.threads.create({
					name: 'Tagged Post',
					message: { content: 'Post content' },
					appliedTags: [discussionTag.id]
				})

				expect(thread.appliedTags).toContain(discussionTag.id)

				await thread.delete()
			}
		})

		it('should create post with multiple tags', async () => {
			const tagIds = postForum.availableTags.slice(0, 2).map((t) => t.id)

			const thread = await postForum.threads.create({
				name: 'Multi Tagged',
				message: { content: 'Content' },
				appliedTags: tagIds
			})

			expect(thread.appliedTags.length).toBe(2)

			await thread.delete()
		})

		it('should edit post tags', async () => {
			const discussionTag = postForum.availableTags.find((t) => t.name === 'Discussion')
			const helpTag = postForum.availableTags.find((t) => t.name === 'Help')

			if (discussionTag && helpTag) {
				const thread = await postForum.threads.create({
					name: 'Edit Tags',
					message: { content: 'Content' },
					appliedTags: [discussionTag.id]
				})

				await thread.setAppliedTags([helpTag.id])

				expect(thread.appliedTags).toContain(helpTag.id)
				expect(thread.appliedTags).not.toContain(discussionTag.id)

				await thread.delete()
			}
		})

		it('should enforce max 5 applied tags', async () => {
			// First add more tags to the forum
			const moreTags = Array(6)
				.fill(null)
				.map((_, i) => ({ name: `Extra ${i}` }))
			await postForum.setAvailableTags([...postForum.availableTags, ...moreTags])

			const allTagIds = postForum.availableTags.slice(0, 6).map((t) => t.id)

			await expect(
				postForum.threads.create({
					name: 'Too Many Tags',
					message: { content: 'Content' },
					appliedTags: allTagIds // 6 tags
				})
			).rejects.toBeDefined()
		})
	})

	describe('Forum Settings', () => {
		let settingsForum: ForumChannel

		beforeAll(async () => {
			const guild = client!.guilds.cache.get(guildId)!
			settingsForum = (await guild.channels.create({
				name: 'settings-forum',
				type: ChannelType.GuildForum
			})) as ForumChannel
		})

		afterAll(async () => {
			if (settingsForum) {
				try {
					await settingsForum.delete()
				} catch {
					// May already be deleted
				}
			}
		})

		it('should set default reaction emoji (unicode)', async () => {
			await settingsForum.setDefaultReactionEmoji({ id: null, name: '👍' })

			expect(settingsForum.defaultReactionEmoji?.name).toBe('👍')
		})

		it('should set default auto archive duration', async () => {
			await settingsForum.setDefaultAutoArchiveDuration(ThreadAutoArchiveDuration.OneDay)

			expect(settingsForum.defaultAutoArchiveDuration).toBe(ThreadAutoArchiveDuration.OneDay)
		})

		it('should set default thread rate limit', async () => {
			await settingsForum.setDefaultThreadRateLimitPerUser(60)

			expect(settingsForum.defaultThreadRateLimitPerUser).toBe(60)
		})

		it('should set sort order to creation date', async () => {
			await settingsForum.setDefaultSortOrder(SortOrderType.CreationDate)

			expect(settingsForum.defaultSortOrder).toBe(SortOrderType.CreationDate)
		})

		it('should set sort order to latest activity', async () => {
			await settingsForum.setDefaultSortOrder(SortOrderType.LatestActivity)

			expect(settingsForum.defaultSortOrder).toBe(SortOrderType.LatestActivity)
		})

		it('should set forum layout to list view', async () => {
			await settingsForum.setDefaultForumLayout(ForumLayoutType.ListView)

			expect(settingsForum.defaultForumLayout).toBe(ForumLayoutType.ListView)
		})

		it('should set forum layout to gallery view', async () => {
			await settingsForum.setDefaultForumLayout(ForumLayoutType.GalleryView)

			expect(settingsForum.defaultForumLayout).toBe(ForumLayoutType.GalleryView)
		})
	})

	describe('Forum Require Tags', () => {
		let requireTagForum: ForumChannel

		beforeAll(async () => {
			const guild = client!.guilds.cache.get(guildId)!
			requireTagForum = (await guild.channels.create({
				name: 'require-tags-forum',
				type: ChannelType.GuildForum,
				availableTags: [{ name: 'Required Tag' }]
			})) as ForumChannel

			// Set require tag flag
			await requireTagForum.edit({
				flags: ChannelFlags.RequireTag
			})
		})

		afterAll(async () => {
			if (requireTagForum) {
				try {
					await requireTagForum.delete()
				} catch {
					// May already be deleted
				}
			}
		})

		it('should have require tag flag set', async () => {
			expect(requireTagForum.flags.has(ChannelFlags.RequireTag)).toBe(true)
		})

		it('should reject post without tags when required', async () => {
			await expect(
				requireTagForum.threads.create({
					name: 'No Tags',
					message: { content: 'Content without tags' }
					// No appliedTags
				})
			).rejects.toBeDefined()
		})

		it('should allow post with required tag', async () => {
			const requiredTag = requireTagForum.availableTags[0]

			const thread = await requireTagForum.threads.create({
				name: 'With Tag',
				message: { content: 'Content' },
				appliedTags: [requiredTag.id]
			})

			expect(thread.appliedTags.length).toBeGreaterThan(0)

			await thread.delete()
		})
	})

	describe('Forum Post Properties', () => {
		let propForum: ForumChannel

		beforeAll(async () => {
			const guild = client!.guilds.cache.get(guildId)!
			propForum = (await guild.channels.create({
				name: 'props-forum',
				type: ChannelType.GuildForum
			})) as ForumChannel
		})

		afterAll(async () => {
			if (propForum) {
				try {
					await propForum.delete()
				} catch {
					// May already be deleted
				}
			}
		})

		it('should create post and access starter message', async () => {
			const thread = await propForum.threads.create({
				name: 'Starter Message Test',
				message: { content: 'The opening message' }
			})

			const starterMessage = await thread.fetchStarterMessage()

			expect(starterMessage).toBeDefined()
			expect(starterMessage?.content).toBe('The opening message')

			await thread.delete()
		})

		it('should have correct parent reference', async () => {
			const thread = await propForum.threads.create({
				name: 'Parent Test',
				message: { content: 'Content' }
			})

			expect(thread.parent?.id).toBe(propForum.id)

			await thread.delete()
		})

		it('should track message count in post', async () => {
			const thread = await propForum.threads.create({
				name: 'Message Count',
				message: { content: 'First' }
			})

			// Send additional messages
			await thread.send('Second message')
			await thread.send('Third message')
			await delay(100)

			// Fetch to get updated counts
			const fetched = await thread.fetch()

			expect(fetched.messageCount).toBeGreaterThanOrEqual(2)

			await thread.delete()
		})
	})
})

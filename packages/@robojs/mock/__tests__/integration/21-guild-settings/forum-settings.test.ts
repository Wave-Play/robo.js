/**
 * Forum Channel Settings Tests
 *
 * Tests for forum channel specific settings including default reaction emoji,
 * sort order, forum layout, and available tags.
 */
import { ChannelType, Client, ForumChannel, ForumLayoutType, SortOrderType } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Forum Channel Settings', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let forum: ForumChannel | null = null

	beforeAll(async () => {
		session = await createSession({
			name: 'forum-settings',
			config: {
				guilds: [
					{
						name: 'Forum Settings Test Guild'
					}
				]
			}
		})

		client = createTestClient()
		await client.login(session.token)
		await waitForReady(client)

		const guild = client.guilds.cache.first()!
		forum = (await guild.channels.create({
			name: 'forum-settings',
			type: ChannelType.GuildForum
		})) as ForumChannel
	})

	afterAll(async () => {
		if (forum) await forum.delete().catch(() => {})
		await destroyClient(client)
		client = null
	})

	it('should have defaultReactionEmoji', async () => {
		await forum!.setDefaultReactionEmoji({ id: null, name: '👍' })

		expect(forum!.defaultReactionEmoji?.name).toBe('👍')
	})

	it('should set defaultReactionEmoji with custom emoji', async () => {
		const guild = client!.guilds.cache.first()!

		const emoji = await guild.emojis.create({
			attachment:
				'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
			name: 'forum_react'
		})

		try {
			await forum!.setDefaultReactionEmoji({ id: emoji.id, name: null })

			expect(forum!.defaultReactionEmoji?.id).toBe(emoji.id)
		} finally {
			await emoji.delete().catch(() => {})
		}
	})

	it('should have defaultSortOrder', async () => {
		await forum!.setDefaultSortOrder(SortOrderType.CreationDate)

		expect(forum!.defaultSortOrder).toBe(SortOrderType.CreationDate)
	})

	it('should set defaultSortOrder to LatestActivity', async () => {
		await forum!.setDefaultSortOrder(SortOrderType.LatestActivity)

		expect(forum!.defaultSortOrder).toBe(SortOrderType.LatestActivity)
	})

	it('should have defaultForumLayout', async () => {
		await forum!.setDefaultForumLayout(ForumLayoutType.GalleryView)

		expect(forum!.defaultForumLayout).toBe(ForumLayoutType.GalleryView)
	})

	it('should set defaultForumLayout to ListView', async () => {
		await forum!.setDefaultForumLayout(ForumLayoutType.ListView)

		expect(forum!.defaultForumLayout).toBe(ForumLayoutType.ListView)
	})

	it('should have availableTags', () => {
		expect(forum!.availableTags).toBeDefined()
		expect(Array.isArray(forum!.availableTags)).toBe(true)
	})

	it('should set available tags', async () => {
		await forum!.setAvailableTags([
			{ name: 'Bug', moderated: false },
			{ name: 'Feature', moderated: true },
			{ name: 'Question', moderated: false, emoji: { id: null, name: '❓' } }
		])

		expect(forum!.availableTags.length).toBe(3)
		expect(forum!.availableTags.find((t) => t.name === 'Bug')).toBeDefined()
		expect(forum!.availableTags.find((t) => t.name === 'Feature')?.moderated).toBe(true)
	})
})

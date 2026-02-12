/**
 * Emoji Tests
 *
 * Tests for emoji creation, editing, deletion, and events.
 */
import { Client, Events, GuildEmoji } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForEvent, waitForReady } from '../utils/helpers.js'

// Buffer for 1x1 transparent PNG for emoji tests
const TEST_IMAGE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

describe('Emoji', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'emoji-tests',
			config: {
				guilds: [{ name: 'Emoji Test Guild' }]
			}
		})

		client = createTestClient()
		await client.login(session.token)
		await waitForReady(client)

		guildId = client.guilds.cache.first()!.id
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Creating Emoji', () => {
		it('should create emoji with name', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			const emoji = await guild.emojis.create({
				attachment: TEST_IMAGE,
				name: 'test_emoji'
			})

			expect(emoji.name).toBe('test_emoji')
			expect(emoji.id).toMatch(/^\d{17,19}$/)

			await emoji.delete()
		})

		it('should create emoji with role restrictions', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const role = await guild.roles.create({ name: 'Emoji Role' })

			const emoji = await guild.emojis.create({
				attachment: TEST_IMAGE,
				name: 'restricted_emoji',
				roles: [role.id]
			})

			expect(emoji.roles.cache.has(role.id)).toBe(true)

			await emoji.delete()
			await role.delete()
		})

		it('should create emoji with reason', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			const emoji = await guild.emojis.create({
				attachment: TEST_IMAGE,
				name: 'reason_emoji',
				reason: 'Test emoji creation'
			})

			expect(emoji.name).toBe('reason_emoji')

			await emoji.delete()
		})
	})

	describe('Editing Emoji', () => {
		let emoji: GuildEmoji

		beforeEach(async () => {
			const guild = client!.guilds.cache.get(guildId)!
			emoji = await guild.emojis.create({
				attachment: TEST_IMAGE,
				name: 'edit_emoji'
			})
		})

		afterEach(async () => {
			if (emoji) {
				try {
					await emoji.delete()
				} catch {
					// Emoji may already be deleted
				}
			}
		})

		it('should edit emoji name', async () => {
			await emoji.edit({ name: 'renamed_emoji' })
			expect(emoji.name).toBe('renamed_emoji')
		})

		it('should edit emoji roles', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const role = await guild.roles.create({ name: 'New Role' })

			await emoji.edit({ roles: [role.id] })
			expect(emoji.roles.cache.has(role.id)).toBe(true)

			await role.delete()
		})

		it('should use setName helper', async () => {
			await emoji.setName('helper_renamed')
			expect(emoji.name).toBe('helper_renamed')
		})
	})

	describe('Fetching Emoji', () => {
		it('should fetch all guild emojis', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			// Create some emojis
			const emoji1 = await guild.emojis.create({
				attachment: TEST_IMAGE,
				name: 'fetch_emoji_1'
			})
			const emoji2 = await guild.emojis.create({
				attachment: TEST_IMAGE,
				name: 'fetch_emoji_2'
			})

			const emojis = await guild.emojis.fetch()

			expect(emojis.has(emoji1.id)).toBe(true)
			expect(emojis.has(emoji2.id)).toBe(true)

			await emoji1.delete()
			await emoji2.delete()
		})

		it('should fetch specific emoji', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const emoji = await guild.emojis.create({
				attachment: TEST_IMAGE,
				name: 'fetch_specific'
			})

			const fetched = await guild.emojis.fetch(emoji.id)
			expect(fetched.id).toBe(emoji.id)
			expect(fetched.name).toBe('fetch_specific')

			await emoji.delete()
		})
	})

	describe('Deleting Emoji', () => {
		it('should delete emoji', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const emoji = await guild.emojis.create({
				attachment: TEST_IMAGE,
				name: 'delete_emoji'
			})
			const emojiId = emoji.id

			await emoji.delete()

			expect(guild.emojis.cache.has(emojiId)).toBe(false)
		})

		it('should delete emoji with reason', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const emoji = await guild.emojis.create({
				attachment: TEST_IMAGE,
				name: 'delete_reason'
			})
			const emojiId = emoji.id

			await emoji.delete('Test deletion reason')

			expect(guild.emojis.cache.has(emojiId)).toBe(false)
		})
	})

	describe('Emoji Events', () => {
		it('should emit emojiCreate', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const eventPromise = waitForEvent(client!, Events.GuildEmojiCreate)

			const emoji = await guild.emojis.create({
				attachment: TEST_IMAGE,
				name: 'event_create'
			})
			const created = await eventPromise

			expect(created.id).toBe(emoji.id)

			await emoji.delete()
		})

		it('should emit emojiUpdate', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const emoji = await guild.emojis.create({
				attachment: TEST_IMAGE,
				name: 'event_update'
			})

			const eventPromise = new Promise<{ old: GuildEmoji; updated: GuildEmoji }>((resolve) => {
				client!.once(Events.GuildEmojiUpdate, (old, updated) => resolve({ old, updated }))
			})

			await emoji.edit({ name: 'updated_name' })
			const { old, updated } = await eventPromise

			expect(old.name).toBe('event_update')
			expect(updated.name).toBe('updated_name')

			await emoji.delete()
		})

		it('should emit emojiDelete', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const emoji = await guild.emojis.create({
				attachment: TEST_IMAGE,
				name: 'event_delete'
			})
			const emojiId = emoji.id

			const eventPromise = waitForEvent(client!, Events.GuildEmojiDelete)
			await emoji.delete()

			const deleted = await eventPromise
			expect(deleted.id).toBe(emojiId)
		})
	})

	describe('Emoji Properties', () => {
		it('should have correct identifier', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const emoji = await guild.emojis.create({
				attachment: TEST_IMAGE,
				name: 'identifier_test'
			})

			expect(emoji.identifier).toBe(`identifier_test:${emoji.id}`)
			expect(emoji.toString()).toBe(`<:identifier_test:${emoji.id}>`)

			await emoji.delete()
		})

		it('should report animated status', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const emoji = await guild.emojis.create({
				attachment: TEST_IMAGE,
				name: 'static_emoji'
			})

			// Static PNG should not be animated
			expect(emoji.animated).toBe(false)

			await emoji.delete()
		})
	})
})

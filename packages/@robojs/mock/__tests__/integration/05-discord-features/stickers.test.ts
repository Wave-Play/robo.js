/**
 * Sticker Tests
 *
 * Tests for sticker creation, editing, deletion, and fetching.
 */
import { Client, Events, Sticker } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForEvent, waitForReady } from '../utils/helpers.js'

// Buffer for 1x1 transparent PNG for sticker tests
const TEST_IMAGE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

describe('Stickers', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'sticker-tests',
			config: {
				guilds: [{ name: 'Sticker Test Guild' }]
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

	describe('Creating Stickers', () => {
		it('should create sticker with name and tags', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			const sticker = await guild.stickers.create({
				file: TEST_IMAGE,
				name: 'test_sticker',
				tags: 'test'
			})

			expect(sticker.name).toBe('test_sticker')
			expect(sticker.tags).toBe('test')
			expect(sticker.id).toMatch(/^\d{17,19}$/)

			await sticker.delete()
		})

		it('should create sticker with description', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			const sticker = await guild.stickers.create({
				file: TEST_IMAGE,
				name: 'desc_sticker',
				tags: 'description',
				description: 'A test sticker with description'
			})

			expect(sticker.description).toBe('A test sticker with description')

			await sticker.delete()
		})

		it('should create sticker with reason', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			const sticker = await guild.stickers.create({
				file: TEST_IMAGE,
				name: 'reason_sticker',
				tags: 'reason',
				reason: 'Test sticker creation'
			})

			expect(sticker.name).toBe('reason_sticker')

			await sticker.delete()
		})
	})

	describe('Editing Stickers', () => {
		let sticker: Sticker

		beforeEach(async () => {
			const guild = client!.guilds.cache.get(guildId)!
			sticker = await guild.stickers.create({
				file: TEST_IMAGE,
				name: 'edit_sticker',
				tags: 'edit'
			})
		})

		afterEach(async () => {
			if (sticker) {
				try {
					await sticker.delete()
				} catch {
					// Sticker may already be deleted
				}
			}
		})

		it('should edit sticker name', async () => {
			await sticker.edit({ name: 'renamed_sticker' })
			expect(sticker.name).toBe('renamed_sticker')
		})

		it('should edit sticker description', async () => {
			await sticker.edit({ description: 'Updated description' })
			expect(sticker.description).toBe('Updated description')
		})

		it('should edit sticker tags', async () => {
			await sticker.edit({ tags: 'updated' })
			expect(sticker.tags).toBe('updated')
		})

		it('should edit multiple properties at once', async () => {
			await sticker.edit({
				name: 'multi_edit',
				description: 'Multi edit description',
				tags: 'multi'
			})

			expect(sticker.name).toBe('multi_edit')
			expect(sticker.description).toBe('Multi edit description')
			expect(sticker.tags).toBe('multi')
		})
	})

	describe('Fetching Stickers', () => {
		it('should fetch all guild stickers', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			// Create some stickers
			const sticker1 = await guild.stickers.create({
				file: TEST_IMAGE,
				name: 'fetch_sticker_1',
				tags: 'fetch1'
			})
			const sticker2 = await guild.stickers.create({
				file: TEST_IMAGE,
				name: 'fetch_sticker_2',
				tags: 'fetch2'
			})

			const stickers = await guild.stickers.fetch()

			expect(stickers.has(sticker1.id)).toBe(true)
			expect(stickers.has(sticker2.id)).toBe(true)

			await sticker1.delete()
			await sticker2.delete()
		})

		it('should fetch specific sticker', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const sticker = await guild.stickers.create({
				file: TEST_IMAGE,
				name: 'fetch_specific',
				tags: 'specific'
			})

			const fetched = await guild.stickers.fetch(sticker.id)
			expect(fetched.id).toBe(sticker.id)
			expect(fetched.name).toBe('fetch_specific')

			await sticker.delete()
		})
	})

	describe('Deleting Stickers', () => {
		it('should delete sticker', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const sticker = await guild.stickers.create({
				file: TEST_IMAGE,
				name: 'delete_sticker',
				tags: 'delete'
			})
			const stickerId = sticker.id

			await sticker.delete()

			expect(guild.stickers.cache.has(stickerId)).toBe(false)
		})

		it('should delete sticker with reason', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const sticker = await guild.stickers.create({
				file: TEST_IMAGE,
				name: 'delete_reason',
				tags: 'delete'
			})
			const stickerId = sticker.id

			await sticker.delete('Test deletion reason')

			expect(guild.stickers.cache.has(stickerId)).toBe(false)
		})
	})

	describe('Sticker Events', () => {
		it('should emit stickerCreate', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const eventPromise = waitForEvent(client!, Events.GuildStickerCreate)

			const sticker = await guild.stickers.create({
				file: TEST_IMAGE,
				name: 'event_create',
				tags: 'event'
			})
			const created = await eventPromise

			expect(created.id).toBe(sticker.id)

			await sticker.delete()
		})

		it('should emit stickerUpdate', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const sticker = await guild.stickers.create({
				file: TEST_IMAGE,
				name: 'event_update',
				tags: 'event'
			})

			const eventPromise = new Promise<{ old: Sticker; updated: Sticker }>((resolve) => {
				client!.once(Events.GuildStickerUpdate, (old, updated) => resolve({ old, updated }))
			})

			await sticker.edit({ name: 'updated_name' })
			const { old, updated } = await eventPromise

			expect(old.name).toBe('event_update')
			expect(updated.name).toBe('updated_name')

			await sticker.delete()
		})

		it('should emit stickerDelete', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const sticker = await guild.stickers.create({
				file: TEST_IMAGE,
				name: 'event_delete',
				tags: 'event'
			})
			const stickerId = sticker.id

			const eventPromise = waitForEvent(client!, Events.GuildStickerDelete)
			await sticker.delete()

			const deleted = await eventPromise
			expect(deleted.id).toBe(stickerId)
		})
	})

	describe('Sticker Properties', () => {
		it('should have correct guild reference', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const sticker = await guild.stickers.create({
				file: TEST_IMAGE,
				name: 'guild_ref',
				tags: 'guild'
			})

			expect(sticker.guildId).toBe(guildId)
			expect(sticker.guild?.id).toBe(guildId)

			await sticker.delete()
		})

		it('should have user property for creator', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const sticker = await guild.stickers.create({
				file: TEST_IMAGE,
				name: 'creator_test',
				tags: 'creator'
			})

			// The creator should be the bot user
			expect(sticker.user?.id).toBe(client!.user!.id)

			await sticker.delete()
		})
	})
})

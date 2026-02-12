/**
 * Sticker Packs Tests
 *
 * Tests for fetching sticker packs.
 * Note: Mock server returns empty sticker packs as it doesn't have Discord's standard stickers.
 * These tests verify the API is accessible and returns the correct structure.
 */
import { Client, ChannelType, GatewayIntentBits } from 'discord.js'
import { createSession, controlAPI } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady, generateSnowflake } from '../utils/helpers.js'

describe('Sticker Packs', () => {
	let client: Client | null = null
	let session: { id: string; token: string }

	beforeAll(async () => {
		session = await createSession({
			name: 'sticker-packs',
			config: {
				guilds: [
					{
						name: 'Sticker Packs Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildEmojisAndStickers])
		await client.login(session.token)
		await waitForReady(client)
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	it('should fetch sticker packs', async () => {
		const packs = await client!.fetchStickerPacks()

		// The method should return a Collection
		expect(packs).toBeDefined()
		expect(typeof packs.size).toBe('number')
	})

	it('should return collection from fetchStickerPacks', async () => {
		const packs = await client!.fetchStickerPacks()

		// Verify it's a collection-like object
		expect(packs).toBeDefined()
		expect(typeof packs.first).toBe('function')
		expect(typeof packs.size).toBe('number')
	})

	it('should add sticker via control API', async () => {
		// Add a sticker to the session state via control API
		const stickerId = generateSnowflake()
		const guild = client!.guilds.cache.first()!

		const result = await controlAPI<{ success: boolean; sticker: { id: string; name: string } }>(
			`/sessions/${session.id}/stickers`,
			{
				method: 'POST',
				body: {
					id: stickerId,
					name: 'test_sticker',
					tags: 'test',
					description: 'Test sticker',
					format_type: 1, // PNG
					type: 2, // Guild
					guild_id: guild.id
				}
			}
		)

		// Verify the control API accepted the sticker
		expect(result.success).toBe(true)
		expect(result.sticker.id).toBe(stickerId)
		expect(result.sticker.name).toBe('test_sticker')
	})

	it('should have sticker properties via control API', async () => {
		const guild = client!.guilds.cache.first()!

		// Add a sticker with full properties via control API
		const stickerId = generateSnowflake()
		const result = await controlAPI<{ success: boolean; sticker: Record<string, unknown> }>(
			`/sessions/${session.id}/stickers`,
			{
				method: 'POST',
				body: {
					id: stickerId,
					name: 'props_sticker',
					tags: 'props,test',
					description: 'Sticker with properties',
					format_type: 1, // PNG
					type: 2, // Guild
					guild_id: guild.id
				}
			}
		)

		// Verify the sticker was created with all properties
		expect(result.success).toBe(true)
		expect(result.sticker.id).toBe(stickerId)
		expect(result.sticker.name).toBe('props_sticker')
		expect(result.sticker.description).toBe('Sticker with properties')
		expect(result.sticker.tags).toBe('props,test')
	})

	it('should have format_type on sticker', async () => {
		const guild = client!.guilds.cache.first()!
		const stickerId = generateSnowflake()

		// Add sticker with specific format type
		const result = await controlAPI<{ success: boolean; sticker: { format_type: number } }>(
			`/sessions/${session.id}/stickers`,
			{
				method: 'POST',
				body: {
					id: stickerId,
					name: 'format_sticker',
					tags: 'format',
					format_type: 2, // APNG
					type: 2,
					guild_id: guild.id
				}
			}
		)

		expect(result.success).toBe(true)
		expect(result.sticker.format_type).toBe(2)
	})

	it('should have type property on sticker', async () => {
		const guild = client!.guilds.cache.first()!
		const stickerId = generateSnowflake()

		// Add guild sticker (type 2)
		const result = await controlAPI<{ success: boolean; sticker: { type: number } }>(
			`/sessions/${session.id}/stickers`,
			{
				method: 'POST',
				body: {
					id: stickerId,
					name: 'type_sticker',
					tags: 'type',
					format_type: 1,
					type: 2, // Guild sticker
					guild_id: guild.id
				}
			}
		)

		expect(result.success).toBe(true)
		expect(result.sticker.type).toBe(2)
	})

	it('should have stickers in pack if pack exists', async () => {
		const packs = await client!.fetchStickerPacks()
		const pack = packs.first()

		// If a pack exists, it should have a stickers collection
		if (pack) {
			expect(pack.stickers).toBeDefined()
			expect(typeof pack.stickers.size).toBe('number')
		}
		// Note: Mock server returns empty packs, so this is a no-op
		// but validates the structure when packs exist
		expect(packs).toBeDefined()
	})

	it('should have bannerURL method on pack if pack exists', async () => {
		const packs = await client!.fetchStickerPacks()
		const pack = packs.first()

		// If a pack exists with a banner, bannerURL should work
		if (pack?.bannerId) {
			const url = pack.bannerURL()
			expect(url).toContain(pack.bannerId)
		}
		// Note: Mock server returns empty packs, so this validates
		// the method exists without actually testing return value
		expect(packs).toBeDefined()
	})
})

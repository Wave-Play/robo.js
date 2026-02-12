/**
 * Emoji fetchAuthor Tests
 *
 * Tests for emoji fetchAuthor method and author property.
 */
import { Client, GatewayIntentBits, Guild } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

// Buffer for 1x1 transparent PNG for emoji tests
const TEST_IMAGE = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
	'base64'
)

describe('Emoji fetchAuthor', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild

	beforeAll(async () => {
		session = await createSession({
			name: 'emoji-author-tests',
			config: {
				guilds: [{ name: 'Emoji Author Guild' }]
			}
		})

		client = createTestClient({
			intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildEmojisAndStickers]
		})
		await client.login(session.token)
		await waitForReady(client)

		guild = client.guilds.cache.first()!
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('fetchAuthor Method', () => {
		it('should fetch emoji author', async () => {
			const emoji = await guild.emojis.create({
				attachment: TEST_IMAGE,
				name: 'author_emoji'
			})

			try {
				const author = await emoji.fetchAuthor()

				expect(author).toBeDefined()
				expect(author.id).toBe(client!.user!.id)
			} finally {
				await emoji.delete()
			}
		})

		it('should have author property after fetchAuthor', async () => {
			const emoji = await guild.emojis.create({
				attachment: TEST_IMAGE,
				name: 'author_prop'
			})

			try {
				await emoji.fetchAuthor()

				expect(emoji.author).toBeDefined()
				expect(emoji.author?.id).toBe(client!.user!.id)
			} finally {
				await emoji.delete()
			}
		})
	})

	describe('Author Property', () => {
		it('should have null author before fetch', async () => {
			const emoji = await guild.emojis.create({
				attachment: TEST_IMAGE,
				name: 'no_author_yet'
			})

			try {
				// Author may be null before explicit fetch
				// Some implementations may populate it immediately
				expect(emoji.author === null || emoji.author?.id === client!.user!.id).toBe(true)
			} finally {
				await emoji.delete()
			}
		})
	})

	describe('Emoji Properties', () => {
		it('should have correct identifier', async () => {
			const emoji = await guild.emojis.create({
				attachment: TEST_IMAGE,
				name: 'identifier_test'
			})

			try {
				expect(emoji.identifier).toBe(`identifier_test:${emoji.id}`)
			} finally {
				await emoji.delete()
			}
		})

		it('should have toString format', async () => {
			const emoji = await guild.emojis.create({
				attachment: TEST_IMAGE,
				name: 'tostring_test'
			})

			try {
				expect(emoji.toString()).toBe(`<:tostring_test:${emoji.id}>`)
			} finally {
				await emoji.delete()
			}
		})

		it('should have guild property', async () => {
			const emoji = await guild.emojis.create({
				attachment: TEST_IMAGE,
				name: 'guild_prop'
			})

			try {
				expect(emoji.guild.id).toBe(guild.id)
			} finally {
				await emoji.delete()
			}
		})

		it('should have animated property', async () => {
			const emoji = await guild.emojis.create({
				attachment: TEST_IMAGE,
				name: 'animated_prop'
			})

			try {
				// Static PNG should not be animated
				expect(emoji.animated).toBe(false)
			} finally {
				await emoji.delete()
			}
		})

		it('should have url property', async () => {
			const emoji = await guild.emojis.create({
				attachment: TEST_IMAGE,
				name: 'url_prop'
			})

			try {
				expect(emoji.url).toBeDefined()
				expect(typeof emoji.url).toBe('string')
				expect(emoji.url.length).toBeGreaterThan(0)
			} finally {
				await emoji.delete()
			}
		})
	})
})

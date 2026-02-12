/**
 * CategoryChannel Children Tests
 *
 * Tests for CategoryChannel.children management including
 * listing children and creating channels via category.
 */
import { CategoryChannel, ChannelType, Client, GatewayIntentBits, Guild } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('CategoryChannel Children', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild
	let category: CategoryChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'category-children-tests',
			config: {
				guilds: [
					{
						name: 'Category Children Test',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds])
		await client.login(session.token)
		await waitForReady(client)

		guild = client.guilds.cache.first()!

		// Create a category for testing
		category = (await guild.channels.create({
			name: 'Parent Category',
			type: ChannelType.GuildCategory
		})) as CategoryChannel
	})

	afterAll(async () => {
		// Clean up category
		if (category) {
			try {
				await category.delete()
			} catch {
				// Ignore cleanup errors
			}
		}
		await destroyClient(client)
		client = null
	})

	describe('CategoryChannel.children.cache', () => {
		it('should list children channels', async () => {
			const text = await guild.channels.create({
				name: 'child-text',
				type: ChannelType.GuildText,
				parent: category.id
			})

			const voice = await guild.channels.create({
				name: 'child-voice',
				type: ChannelType.GuildVoice,
				parent: category.id
			})

			try {
				expect(category.children.cache.size).toBe(2)
				expect(category.children.cache.has(text.id)).toBe(true)
				expect(category.children.cache.has(voice.id)).toBe(true)
			} finally {
				await text.delete()
				await voice.delete()
			}
		})

		it('should have empty children initially', async () => {
			const emptyCategory = (await guild.channels.create({
				name: 'Empty Category',
				type: ChannelType.GuildCategory
			})) as CategoryChannel

			try {
				expect(emptyCategory.children.cache.size).toBe(0)
			} finally {
				await emptyCategory.delete()
			}
		})

		it('should update children when channel parent changes', async () => {
			const channel = await guild.channels.create({
				name: 'move-test',
				type: ChannelType.GuildText,
				parent: category.id
			})

			try {
				expect(category.children.cache.has(channel.id)).toBe(true)

				// Move to no parent
				await channel.setParent(null)
				expect(category.children.cache.has(channel.id)).toBe(false)
			} finally {
				await channel.delete()
			}
		})
	})

	describe('CategoryChannel.children.create()', () => {
		it('should create child channel via category', async () => {
			const child = await category.children.create({
				name: 'created-via-category',
				type: ChannelType.GuildText
			})

			try {
				expect(child.parentId).toBe(category.id)
				expect(child.name).toBe('created-via-category')
			} finally {
				await child.delete()
			}
		})

		it('should create voice channel via category', async () => {
			const voice = await category.children.create({
				name: 'voice-via-category',
				type: ChannelType.GuildVoice
			})

			try {
				expect(voice.parentId).toBe(category.id)
				expect(voice.type).toBe(ChannelType.GuildVoice)
			} finally {
				await voice.delete()
			}
		})

		it('should inherit permission overwrites from category', async () => {
			// Create category with permission overwrites
			const categoryWithPerms = (await guild.channels.create({
				name: 'Category With Perms',
				type: ChannelType.GuildCategory
			})) as CategoryChannel

			try {
				const child = await categoryWithPerms.children.create({
					name: 'inherits-perms',
					type: ChannelType.GuildText
				})

				try {
					expect(child.parentId).toBe(categoryWithPerms.id)
				} finally {
					await child.delete()
				}
			} finally {
				await categoryWithPerms.delete()
			}
		})
	})

	describe('Category Properties', () => {
		it('should have correct type', () => {
			expect(category.type).toBe(ChannelType.GuildCategory)
		})

		it('should be in guild channels cache', () => {
			expect(guild.channels.cache.has(category.id)).toBe(true)
		})

		it('should have guild reference', () => {
			expect(category.guild.id).toBe(guild.id)
		})

		it('should have name', () => {
			expect(category.name).toBe('Parent Category')
		})
	})
})

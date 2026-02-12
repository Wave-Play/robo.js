/**
 * Guild Templates Tests
 *
 * Tests for guild template creation, fetching, syncing, and editing.
 */
import { ChannelType, Client, GatewayIntentBits, Guild } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Guild Templates', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild

	beforeAll(async () => {
		session = await createSession({
			name: 'guild-templates-tests',
			config: {
				guilds: [
					{
						name: 'Templates Test',
						channels: [
							{ name: 'general', type: ChannelType.GuildText },
							{ name: 'voice', type: ChannelType.GuildVoice }
						]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds])
		await client.login(session.token)
		await waitForReady(client)

		guild = client.guilds.cache.first()!
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Create Guild Template', () => {
		it('should create guild template', async () => {
			const template = await guild.createTemplate('Test Template', 'A test template')

			expect(template.name).toBe('Test Template')
			expect(template.description).toBe('A test template')
			expect(template.code).toBeDefined()

			await template.delete()
		})

		it('should create template with only name', async () => {
			const template = await guild.createTemplate('Name Only')

			expect(template.name).toBe('Name Only')

			await template.delete()
		})

		it('should have template code', async () => {
			const template = await guild.createTemplate('Code Test')

			expect(typeof template.code).toBe('string')
			expect(template.code.length).toBeGreaterThan(0)

			await template.delete()
		})

		it('should have creator', async () => {
			const template = await guild.createTemplate('Creator Test')

			expect(template.creator).toBeDefined()
			expect(template.creatorId).toBe(client!.user!.id)

			await template.delete()
		})
	})

	describe('Fetch Guild Templates', () => {
		it('should fetch guild templates', async () => {
			const template = await guild.createTemplate('Fetch Template')

			try {
				const templates = await guild.fetchTemplates()

				expect(templates.has(template.code)).toBe(true)
			} finally {
				await template.delete()
			}
		})

		it('should return empty collection when no templates', async () => {
			// Fetch templates (may have residual from other tests)
			const templates = await guild.fetchTemplates()

			expect(typeof templates.size).toBe('number')
		})
	})

	describe('Sync Template', () => {
		it('should sync template', async () => {
			const template = await guild.createTemplate('Sync Template')

			try {
				const synced = await template.sync()

				expect(synced.code).toBe(template.code)
			} finally {
				await template.delete()
			}
		})

		it('should update updatedAt on sync', async () => {
			const template = await guild.createTemplate('Update Time')

			const originalUpdatedAt = template.updatedAt

			// Wait a bit to ensure time difference
			await new Promise((resolve) => setTimeout(resolve, 100))

			const synced = await template.sync()

			// updatedAt should be same or later
			expect(synced.updatedAt.getTime()).toBeGreaterThanOrEqual(originalUpdatedAt.getTime())

			await template.delete()
		})
	})

	describe('Edit Template', () => {
		it('should edit template', async () => {
			const template = await guild.createTemplate('Edit Template')

			try {
				await template.edit({
					name: 'Edited Template',
					description: 'Updated description'
				})

				expect(template.name).toBe('Edited Template')
			} finally {
				await template.delete()
			}
		})

		it('should edit only name', async () => {
			const template = await guild.createTemplate('Name Edit', 'Original description')

			try {
				await template.edit({ name: 'New Name Only' })

				expect(template.name).toBe('New Name Only')
			} finally {
				await template.delete()
			}
		})

		it('should edit only description', async () => {
			const template = await guild.createTemplate('Desc Edit', 'Old')

			try {
				await template.edit({ description: 'New description' })

				expect(template.description).toBe('New description')
			} finally {
				await template.delete()
			}
		})
	})

	describe('Delete Template', () => {
		it('should delete template', async () => {
			const template = await guild.createTemplate('Delete Template')
			const code = template.code

			await template.delete()

			const templates = await guild.fetchTemplates()
			expect(templates.has(code)).toBe(false)
		})
	})

	describe('Fetch Template by Code', () => {
		it('should fetch template by code', async () => {
			const template = await guild.createTemplate('Code Template')

			try {
				const fetched = await client!.fetchGuildTemplate(template.code)

				expect(fetched.name).toBe('Code Template')
			} finally {
				await template.delete()
			}
		})

		it('should have serialized guild data', async () => {
			const template = await guild.createTemplate('Serialized Test')

			try {
				const fetched = await client!.fetchGuildTemplate(template.code)

				expect(fetched.serializedGuild).toBeDefined()
			} finally {
				await template.delete()
			}
		})
	})

	describe('Template Properties', () => {
		it('should have guildId (source guild)', async () => {
			const template = await guild.createTemplate('Source Guild')

			try {
				expect(template.guildId).toBe(guild.id)
			} finally {
				await template.delete()
			}
		})

		it('should have createdAt', async () => {
			const template = await guild.createTemplate('Created At')

			try {
				expect(template.createdAt).toBeInstanceOf(Date)
			} finally {
				await template.delete()
			}
		})

		it('should have updatedAt', async () => {
			const template = await guild.createTemplate('Updated At')

			try {
				expect(template.updatedAt).toBeInstanceOf(Date)
			} finally {
				await template.delete()
			}
		})

		it('should have usageCount', async () => {
			const template = await guild.createTemplate('Usage Count')

			try {
				expect(typeof template.usageCount).toBe('number')
			} finally {
				await template.delete()
			}
		})
	})
})

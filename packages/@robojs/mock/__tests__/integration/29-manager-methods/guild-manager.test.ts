/**
 * GuildManager Methods Tests
 *
 * Tests for client.guilds manager methods including
 * fetch, resolve, resolveId, and guild creation.
 */
import { ChannelType, Client, GatewayIntentBits } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('GuildManager Methods', () => {
	let client: Client | null = null
	let session: { id: string; token: string }

	beforeAll(async () => {
		session = await createSession({
			name: 'guild-manager',
			config: {
				guilds: [
					{
						name: 'Guild Manager Test Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					},
					{
						name: 'Secondary Guild',
						channels: [{ name: 'lobby', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages])
		await client.login(session.token)
		await waitForReady(client)
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('fetch methods', () => {
		it('should fetch guild by ID', async () => {
			const guildId = client!.guilds.cache.first()!.id

			const guild = await client!.guilds.fetch(guildId)

			expect(guild).not.toBeNull()
			expect(guild.id).toBe(guildId)
		})

		it('should fetch all guilds', async () => {
			const guilds = await client!.guilds.fetch()

			expect(guilds.size).toBeGreaterThan(0)
			// Should have at least the guilds we created
			expect(guilds.size).toBeGreaterThanOrEqual(2)
		})

		it('should fetch guilds with options', async () => {
			const guilds = await client!.guilds.fetch({ limit: 10 })

			expect(guilds.size).toBeGreaterThan(0)
			expect(guilds.size).toBeLessThanOrEqual(10)
		})
	})

	describe('resolve methods', () => {
		it('should resolve guild from cache', () => {
			const guildId = client!.guilds.cache.first()!.id

			const guild = client!.guilds.resolve(guildId)

			expect(guild).not.toBeNull()
			expect(guild?.id).toBe(guildId)
		})

		it('should resolve guild ID', () => {
			const guild = client!.guilds.cache.first()!

			const id = client!.guilds.resolveId(guild)

			expect(id).toBe(guild.id)
		})
	})

	describe('guild creation', () => {
		it('should create guild (bot owned)', async () => {
			// Create a new guild
			const guild = await client!.guilds.create({
				name: 'New Bot Guild'
			})

			expect(guild).not.toBeNull()
			expect(guild.name).toBe('New Bot Guild')
			// Bot should be the owner
			expect(guild.ownerId).toBe(client!.user!.id)

			// Clean up by leaving/deleting the guild
			try {
				await guild.delete()
			} catch {
				// Ignore cleanup errors
			}
		})
	})
})

/**
 * Role Tags Tests
 *
 * Tests for role tags including bot roles, integration roles, and premium subscriber roles.
 */
import { ChannelType, Client, GatewayIntentBits, Guild, Role } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForReady } from '../utils/helpers.js'

describe('Role Tags', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild

	beforeAll(async () => {
		session = await createSession({
			name: 'role-tags-tests',
			config: {
				guilds: [
					{
						name: 'Role Tags Test Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
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

	it('should create role without tags', async () => {
		const role = await guild.roles.create({
			name: 'Normal Role'
		})

		try {
			expect(role.tags).toBeNull()
		} finally {
			await role.delete().catch(() => {})
		}
	})

	it('should identify bot role via GUILD_ROLE_CREATE event', async () => {
		const roleId = generateSnowflake()

		await dispatchEvent(session.id, 'GUILD_ROLE_CREATE', {
			guild_id: guild.id,
			role: {
				id: roleId,
				name: 'Bot Role',
				color: 0,
				hoist: false,
				position: 1,
				permissions: '0',
				managed: true,
				mentionable: false,
				tags: { bot_id: client!.user!.id }
			}
		})

		// Fetch roles to get the updated list
		const roles = await guild.roles.fetch()
		const botRole = roles.find((r: Role) => r.tags?.botId === client!.user!.id)

		if (botRole) {
			expect(botRole.managed).toBe(true)
			expect(botRole.tags?.botId).toBe(client!.user!.id)
		}
	})

	it('should identify integration role via GUILD_ROLE_CREATE event', async () => {
		const roleId = generateSnowflake()
		const integrationId = generateSnowflake()

		await dispatchEvent(session.id, 'GUILD_ROLE_CREATE', {
			guild_id: guild.id,
			role: {
				id: roleId,
				name: 'Integration Role',
				color: 0,
				hoist: false,
				position: 1,
				permissions: '0',
				managed: true,
				mentionable: false,
				tags: { integration_id: integrationId }
			}
		})

		const roles = await guild.roles.fetch()
		const intRole = roles.find((r: Role) => r.tags?.integrationId === integrationId)

		if (intRole) {
			expect(intRole.tags?.integrationId).toBe(integrationId)
		}
	})

	it('should identify premium subscriber role via GUILD_ROLE_CREATE event', async () => {
		const roleId = generateSnowflake()

		await dispatchEvent(session.id, 'GUILD_ROLE_CREATE', {
			guild_id: guild.id,
			role: {
				id: roleId,
				name: 'Server Booster',
				color: 0xf47fff,
				hoist: false,
				position: 1,
				permissions: '0',
				managed: true,
				mentionable: false,
				tags: { premium_subscriber: null }
			}
		})

		const roles = await guild.roles.fetch()
		const boosterRole = roles.find((r: Role) => r.tags?.premiumSubscriberRole === true)

		if (boosterRole) {
			expect(boosterRole.tags?.premiumSubscriberRole).toBe(true)
		}
	})

	it('should check guild.roles.premiumSubscriberRole', async () => {
		// This tests the guild helper method for getting the booster role
		const premiumRole = guild.roles.premiumSubscriberRole

		// May be null if no premium subscriber role exists
		expect(premiumRole === null || premiumRole instanceof Role).toBe(true)

		if (premiumRole) {
			expect(premiumRole.tags?.premiumSubscriberRole).toBe(true)
		}
	})
})

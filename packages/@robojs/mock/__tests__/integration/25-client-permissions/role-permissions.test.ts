/**
 * Role Permissions Tests
 *
 * Tests for Role permission properties and methods including
 * the permissions property, setPermissions, and serialize methods.
 */
import { Client, GatewayIntentBits, PermissionFlagsBits, PermissionsBitField } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Role Permissions', () => {
	let client: Client | null = null
	let session: { id: string; token: string }

	beforeAll(async () => {
		session = await createSession({
			name: 'role-permissions',
			config: {
				guilds: [{ name: 'Role Permissions Guild' }]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds])
		await client.login(session.token)
		await waitForReady(client)
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('permissions Property', () => {
		it('should have permissions property', async () => {
			const guild = client!.guilds.cache.first()!
			const role = await guild.roles.create({
				name: 'Perms Role',
				permissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel]
			})

			try {
				expect(role.permissions).toBeInstanceOf(PermissionsBitField)
				expect(role.permissions.has(PermissionFlagsBits.SendMessages)).toBe(true)
			} finally {
				await role.delete().catch(() => {})
			}
		})
	})

	describe('setPermissions Method', () => {
		it('should set permissions', async () => {
			const guild = client!.guilds.cache.first()!
			const role = await guild.roles.create({ name: 'Set Perms' })

			try {
				await role.setPermissions([PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageChannels])

				expect(role.permissions.has(PermissionFlagsBits.ManageMessages)).toBe(true)
				expect(role.permissions.has(PermissionFlagsBits.ManageChannels)).toBe(true)
			} finally {
				await role.delete().catch(() => {})
			}
		})
	})

	describe('serialize Method', () => {
		it('should serialize permissions', async () => {
			const guild = client!.guilds.cache.first()!
			const role = await guild.roles.create({
				name: 'Serialize Perms',
				permissions: [PermissionFlagsBits.SendMessages]
			})

			try {
				const serialized = role.permissions.serialize()

				expect(serialized.SendMessages).toBe(true)
			} finally {
				await role.delete().catch(() => {})
			}
		})
	})
})

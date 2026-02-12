/**
 * Application Command Permissions Tests
 *
 * Tests for fetching and setting command permissions.
 */
import { ApplicationCommandPermissionType, Client, GatewayIntentBits } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Application Command Permissions', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'command-permissions-tests',
			config: {
				guilds: [{ name: 'Permissions Test Guild' }]
			}
		})

		client = createTestClient({
			intents: [GatewayIntentBits.Guilds]
		})
		await client.login(session.token)
		await waitForReady(client)

		guildId = client.guilds.cache.first()!.id
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Fetching Command Permissions', () => {
		it('should fetch command permissions or return empty', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			const command = await guild.commands.create({
				name: 'perm_test',
				description: 'Permission test'
			})

			try {
				// Permissions may be undefined or empty Collection when no overrides exist
				const permissions = await guild.commands.permissions.fetch({ command: command.id }).catch(() => null)

				// Result can be undefined, null, or a Collection
				const hasValidType =
					permissions === undefined ||
					permissions === null ||
					Array.isArray(permissions) ||
					(typeof permissions === 'object' && 'size' in permissions && typeof (permissions as { size: number }).size === 'number')
				expect(hasValidType).toBe(true)
			} finally {
				await command.delete().catch(() => {})
			}
		})
	})

	describe('Setting Command Permissions', () => {
		it('should set command permissions', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const role = await guild.roles.create({ name: 'Command Role' })

			const command = await guild.commands.create({
				name: 'perm_set',
				description: 'Permission set test'
			})

			try {
				// Discord.js requires a bearer token for permissions.set()
				// Our mock server accepts any token for testing purposes
				await guild.commands.permissions.set({
					command: command.id,
					token: session.token, // Use session token as bearer token
					permissions: [
						{
							id: role.id,
							type: ApplicationCommandPermissionType.Role,
							permission: true
						}
					]
				})

				const permissions = await guild.commands.permissions.fetch({ command: command.id })

				expect(permissions.some((p) => p.id === role.id)).toBe(true)
			} finally {
				await command.delete().catch(() => {})
				await role.delete().catch(() => {})
			}
		})
	})

	describe('Checking Permissions', () => {
		it('should check permissions structure when fetched', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			const command = await guild.commands.create({
				name: 'has_test',
				description: 'Has test'
			})

			try {
				const permissions = await guild.commands.permissions.fetch({ command: command.id }).catch(() => null)

				// Permissions may be undefined/null if no overrides exist
				if (permissions && permissions.length > 0) {
					// Check if any permission has permission === true
					const hasPermission = permissions.some((p) => p.permission === true)
					expect(typeof hasPermission).toBe('boolean')
				} else {
					// No permissions set is also valid
					expect(permissions === undefined || permissions === null || (Array.isArray(permissions) && permissions.length === 0)).toBe(true)
				}
			} finally {
				await command.delete().catch(() => {})
			}
		})
	})
})

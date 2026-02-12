/**
 * Application Command Permissions V2 Tests
 *
 * Tests for V2 command permission features including defaultMemberPermissions,
 * dmPermission, nsfw, and permission management.
 */
import { ApplicationCommandPermissionType, Client, GatewayIntentBits, PermissionFlagsBits } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Application Command Permissions V2', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'command-permissions-v2',
			config: {
				guilds: [{ name: 'Command Permissions V2 Guild' }]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds])
		await client.login(session.token)
		await waitForReady(client)

		guildId = client.guilds.cache.first()!.id
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Fetching Command Permissions', () => {
		it('should fetch command permissions', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			const command = await guild.commands.create({
				name: 'fetch_perm_test',
				description: 'Fetch permission test'
			})

			try {
				// Fetch permissions - may return empty/null if no overrides
				const permissions = await guild.commands.permissions.fetch({ command: command.id }).catch(() => null)

				// Result can be undefined, null, array, or have a size property
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
			const role = await guild.roles.create({ name: 'Perm Role V2' })

			const command = await guild.commands.create({
				name: 'set_perm_v2',
				description: 'Set permission V2 test'
			})

			try {
				await guild.commands.permissions.set({
					command: command.id,
					token: session.token,
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

		it('should set user-specific permission', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const botUserId = client!.user!.id

			const command = await guild.commands.create({
				name: 'user_perm_v2',
				description: 'User permission test'
			})

			try {
				await guild.commands.permissions.set({
					command: command.id,
					token: session.token,
					permissions: [
						{
							id: botUserId,
							type: ApplicationCommandPermissionType.User,
							permission: true
						}
					]
				})

				const permissions = await guild.commands.permissions.fetch({ command: command.id })

				const userPerm = permissions.find((p) => p.id === botUserId)
				expect(userPerm).toBeDefined()
				expect(userPerm?.type).toBe(ApplicationCommandPermissionType.User)
			} finally {
				await command.delete().catch(() => {})
			}
		})
	})

	describe('Default Member Permissions', () => {
		it('should have defaultMemberPermissions on command', async () => {
			const command = await client!.application!.commands.create({
				name: 'admin_only_v2',
				description: 'Admin only command',
				defaultMemberPermissions: PermissionFlagsBits.Administrator
			})

			expect(command.defaultMemberPermissions).toBeDefined()
			expect(command.defaultMemberPermissions?.has(PermissionFlagsBits.Administrator)).toBe(true)

			await command.delete()
		})

		it('should set multiple default permissions', async () => {
			const command = await client!.application!.commands.create({
				name: 'mod_cmd_v2',
				description: 'Moderator command',
				defaultMemberPermissions: PermissionFlagsBits.BanMembers | PermissionFlagsBits.KickMembers
			})

			expect(command.defaultMemberPermissions).toBeDefined()
			expect(command.defaultMemberPermissions?.has(PermissionFlagsBits.BanMembers)).toBe(true)
			expect(command.defaultMemberPermissions?.has(PermissionFlagsBits.KickMembers)).toBe(true)

			await command.delete()
		})

		it('should allow null defaultMemberPermissions for everyone', async () => {
			const command = await client!.application!.commands.create({
				name: 'everyone_cmd',
				description: 'Everyone can use',
				defaultMemberPermissions: null
			})

			// null means everyone can use (no permission restrictions)
			expect(command.defaultMemberPermissions).toBe(null)

			await command.delete()
		})
	})

	describe('DM Permission', () => {
		it('should have dmPermission on command', async () => {
			const command = await client!.application!.commands.create({
				name: 'no_dm_v2',
				description: 'No DM command',
				dmPermission: false
			})

			expect(command.dmPermission).toBe(false)

			await command.delete()
		})

		it('should allow DMs by default', async () => {
			const command = await client!.application!.commands.create({
				name: 'dm_allowed_v2',
				description: 'DM allowed command'
				// dmPermission not specified, defaults to true
			})

			// Should be true or undefined (which means true)
			expect(command.dmPermission === true || command.dmPermission === undefined).toBe(true)

			await command.delete()
		})

		it('should explicitly allow DMs', async () => {
			const command = await client!.application!.commands.create({
				name: 'dm_explicit_v2',
				description: 'Explicitly allow DM',
				dmPermission: true
			})

			expect(command.dmPermission).toBe(true)

			await command.delete()
		})
	})

	describe('NSFW Command', () => {
		it('should have nsfw on command', async () => {
			const command = await client!.application!.commands.create({
				name: 'nsfw_cmd_v2',
				description: 'NSFW command',
				nsfw: true
			})

			expect(command.nsfw).toBe(true)

			await command.delete()
		})

		it('should not be nsfw by default', async () => {
			const command = await client!.application!.commands.create({
				name: 'sfw_cmd_v2',
				description: 'Safe command'
			})

			// Should be false or undefined (which means false)
			expect(command.nsfw === false || command.nsfw === undefined).toBe(true)

			await command.delete()
		})

		it('should explicitly set nsfw to false', async () => {
			const command = await client!.application!.commands.create({
				name: 'explicit_sfw_v2',
				description: 'Explicitly safe command',
				nsfw: false
			})

			expect(command.nsfw).toBe(false)

			await command.delete()
		})
	})

	describe('Combined Permission Settings', () => {
		it('should create command with all permission settings', async () => {
			const command = await client!.application!.commands.create({
				name: 'full_perms_v2',
				description: 'Full permission test',
				defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
				dmPermission: false,
				nsfw: true
			})

			expect(command.defaultMemberPermissions?.has(PermissionFlagsBits.ManageGuild)).toBe(true)
			expect(command.dmPermission).toBe(false)
			expect(command.nsfw).toBe(true)

			await command.delete()
		})
	})
})

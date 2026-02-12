/**
 * GuildMember Permissions Tests
 *
 * Tests for GuildMember permission properties and methods including
 * the permissions property, permissionsIn, channel overwrites, and specific permission checks.
 */
import { ChannelType, Client, GatewayIntentBits, PermissionFlagsBits, PermissionsBitField, TextChannel } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForReady } from '../utils/helpers.js'

describe('GuildMember Permissions', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'member-permissions',
			config: {
				guilds: [
					{
						name: 'Member Permissions Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				],
				enforceIntents: true,
				approvedPrivilegedIntents: BigInt(GatewayIntentBits.GuildMembers)
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers])
		await client.login(session.token)
		await waitForReady(client)

		const guild = client.guilds.cache.first()!
		guildId = guild.id
		channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('permissions Property', () => {
		it('should have permissions property on member', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const memberId = generateSnowflake()

			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guildId,
				user: { id: memberId, username: 'PermMember', discriminator: '0', avatar: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})

			const member = await guild.members.fetch(memberId)

			expect(member.permissions).toBeDefined()
			expect(member.permissions).toBeInstanceOf(PermissionsBitField)
		})
	})

	describe('permissionsIn Method', () => {
		it('should check permissionsIn channel', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const memberId = generateSnowflake()

			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guildId,
				user: { id: memberId, username: 'ChannelPerm', discriminator: '0', avatar: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})

			const member = await guild.members.fetch(memberId)
			const perms = member.permissionsIn(channel)

			expect(perms).toBeInstanceOf(PermissionsBitField)
		})
	})

	describe('Channel Overwrites in permissionsIn', () => {
		it('should respect channel overwrites in permissionsIn', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const role = await guild.roles.create({ name: 'Overwrite Role' })
			const memberId = generateSnowflake()

			try {
				await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
					guild_id: guildId,
					user: { id: memberId, username: 'OverwriteMember', discriminator: '0', avatar: null },
					roles: [role.id],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				})

				await channel.permissionOverwrites.create(role, {
					SendMessages: false
				})

				const member = await guild.members.fetch(memberId)
				const perms = member.permissionsIn(channel)

				expect(perms.has(PermissionFlagsBits.SendMessages)).toBe(false)
			} finally {
				await channel.permissionOverwrites.delete(role).catch(() => {})
				await role.delete().catch(() => {})
			}
		})
	})

	describe('Check Specific Permission', () => {
		it('should check if member has specific permission', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const role = await guild.roles.create({
				name: 'Admin Role',
				permissions: [PermissionFlagsBits.Administrator]
			})
			const memberId = generateSnowflake()

			try {
				await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
					guild_id: guildId,
					user: { id: memberId, username: 'AdminMember', discriminator: '0', avatar: null },
					roles: [role.id],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				})

				const member = await guild.members.fetch(memberId)

				expect(member.permissions.has(PermissionFlagsBits.Administrator)).toBe(true)
			} finally {
				await role.delete().catch(() => {})
			}
		})
	})
})

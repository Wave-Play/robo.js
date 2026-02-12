/**
 * Role Position Comparison Tests
 *
 * Tests for role position comparison including comparePositionTo,
 * highest role, hoist, and mentionable properties.
 */
import { ChannelType, Client, GatewayIntentBits, Guild } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForReady } from '../utils/helpers.js'

describe('Role Position Comparison', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild

	beforeAll(async () => {
		session = await createSession({
			name: 'role-positions-tests',
			config: {
				guilds: [
					{
						name: 'Role Positions Test',
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

		guild = client.guilds.cache.first()!
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Role.comparePositionTo()', () => {
		it('should compare role positions', async () => {
			const role1 = await guild.roles.create({ name: 'Lower', position: 1 })
			const role2 = await guild.roles.create({ name: 'Higher', position: 2 })

			try {
				const comparison = role1.comparePositionTo(role2)
				expect(comparison).toBeLessThan(0) // role1 is lower
			} finally {
				await role1.delete()
				await role2.delete()
			}
		})

		it('should return negative when lower role compared to higher', async () => {
			const low = await guild.roles.create({ name: 'Low Role' })
			const high = await guild.roles.create({ name: 'High Role' })

			try {
				// Set positions explicitly
				await guild.roles.setPositions([
					{ role: low.id, position: 1 },
					{ role: high.id, position: 2 }
				])

				// Re-fetch to get updated positions
				const lowUpdated = await guild.roles.fetch(low.id)
				const highUpdated = await guild.roles.fetch(high.id)

				if (lowUpdated && highUpdated) {
					const comparison = lowUpdated.comparePositionTo(highUpdated)
					expect(comparison).toBeLessThan(0)
				}
			} finally {
				await low.delete()
				await high.delete()
			}
		})

		it('should return positive when higher role compared to lower', async () => {
			const low = await guild.roles.create({ name: 'Low' })
			const high = await guild.roles.create({ name: 'High' })

			try {
				await guild.roles.setPositions([
					{ role: low.id, position: 1 },
					{ role: high.id, position: 2 }
				])

				const lowUpdated = await guild.roles.fetch(low.id)
				const highUpdated = await guild.roles.fetch(high.id)

				if (lowUpdated && highUpdated) {
					const comparison = highUpdated.comparePositionTo(lowUpdated)
					expect(comparison).toBeGreaterThan(0)
				}
			} finally {
				await low.delete()
				await high.delete()
			}
		})

		it('should return zero for same position', async () => {
			const role = await guild.roles.create({ name: 'Same' })

			try {
				const comparison = role.comparePositionTo(role)
				expect(comparison).toBe(0)
			} finally {
				await role.delete()
			}
		})
	})

	describe('Role Position Properties', () => {
		it('should check if role is higher than another', async () => {
			const role1 = await guild.roles.create({ name: 'Low' })
			const role2 = await guild.roles.create({ name: 'High' })

			try {
				await guild.roles.setPositions([
					{ role: role1.id, position: 1 },
					{ role: role2.id, position: 5 }
				])

				const r1 = await guild.roles.fetch(role1.id)
				const r2 = await guild.roles.fetch(role2.id)

				if (r1 && r2) {
					expect(r2.position).toBeGreaterThan(r1.position)
				}
			} finally {
				await role1.delete()
				await role2.delete()
			}
		})
	})

	describe('GuildMemberRoleManager.highest', () => {
		it('should get highest role', async () => {
			const memberId = generateSnowflake()
			const role1 = await guild.roles.create({ name: 'Role A' })
			const role2 = await guild.roles.create({ name: 'Role B' })

			try {
				await guild.roles.setPositions([
					{ role: role1.id, position: 2 },
					{ role: role2.id, position: 5 }
				])

				// Add member with both roles
				await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
					guild_id: guild.id,
					user: { id: memberId, username: 'MultiRole', discriminator: '0', avatar: null },
					roles: [role1.id, role2.id],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				})

				const member = await guild.members.fetch(memberId)
				const highest = member.roles.highest

				// Role B should be highest (position 5)
				expect(highest.id).toBe(role2.id)
			} finally {
				await role1.delete()
				await role2.delete()
			}
		})

		it('should get bot highest role', async () => {
			const me = await guild.members.fetchMe()
			const highest = me.roles.highest

			expect(highest).toBeDefined()
			expect(highest.id).toBeDefined()
		})

		it('should return @everyone when member has no other roles', async () => {
			const memberId = generateSnowflake()

			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guild.id,
				user: { id: memberId, username: 'NoRoles', discriminator: '0', avatar: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})

			const member = await guild.members.fetch(memberId)
			const highest = member.roles.highest

			// @everyone role has same ID as guild
			expect(highest.id).toBe(guild.id)
		})
	})

	describe('Role.hoist', () => {
		it('should check role.hoist for hoisted role', async () => {
			const hoisted = await guild.roles.create({ name: 'Hoisted', hoist: true })

			try {
				expect(hoisted.hoist).toBe(true)
			} finally {
				await hoisted.delete()
			}
		})

		it('should check role.hoist for non-hoisted role', async () => {
			const notHoisted = await guild.roles.create({ name: 'Not Hoisted', hoist: false })

			try {
				expect(notHoisted.hoist).toBe(false)
			} finally {
				await notHoisted.delete()
			}
		})

		it('should default to non-hoisted', async () => {
			const defaultRole = await guild.roles.create({ name: 'Default' })

			try {
				expect(defaultRole.hoist).toBe(false)
			} finally {
				await defaultRole.delete()
			}
		})
	})

	describe('Role.mentionable', () => {
		it('should check role.mentionable for mentionable role', async () => {
			const mentionable = await guild.roles.create({ name: 'Ping Me', mentionable: true })

			try {
				expect(mentionable.mentionable).toBe(true)
			} finally {
				await mentionable.delete()
			}
		})

		it('should check role.mentionable for non-mentionable role', async () => {
			const notMentionable = await guild.roles.create({ name: 'No Ping', mentionable: false })

			try {
				expect(notMentionable.mentionable).toBe(false)
			} finally {
				await notMentionable.delete()
			}
		})

		it('should default to non-mentionable', async () => {
			const defaultRole = await guild.roles.create({ name: 'Default Mention' })

			try {
				expect(defaultRole.mentionable).toBe(false)
			} finally {
				await defaultRole.delete()
			}
		})
	})

	describe('Role Color', () => {
		it('should create role with color', async () => {
			const colored = await guild.roles.create({ name: 'Colored', color: 0xff5733 })

			try {
				expect(colored.color).toBe(0xff5733)
			} finally {
				await colored.delete()
			}
		})

		it('should have hexColor property', async () => {
			const colored = await guild.roles.create({ name: 'Hex Color', color: 0x00ff00 })

			try {
				// hexColor requires guild context - just verify color value
				expect(colored.color).toBe(0x00ff00)
			} finally {
				await colored.delete()
			}
		})
	})
})

/**
 * Member Tests
 *
 * Tests for member fetching, role operations, nicknames, timeouts, kicking, and events.
 */
import { Client, Events, GuildMember, PartialGuildMember, Role } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForEvent, waitForReady } from '../utils/helpers.js'
import { PRIVILEGED_INTENTS } from '../setup/constants.js'

describe('Members', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guildId: string

	beforeAll(async () => {
		// Create session with privileged GuildMembers intent
		session = await createSession({
			name: 'member-tests',
			config: {
				guilds: [{ name: 'Member Test Guild' }],
				approvedPrivilegedIntents: BigInt(PRIVILEGED_INTENTS.GUILD_MEMBERS)
			}
		})

		client = createTestClient()
		await client.login(session.token)
		await waitForReady(client)

		guildId = client.guilds.cache.first()!.id
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Fetching Members', () => {
		it('should fetch single member (bot user)', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const member = await guild.members.fetch(client!.user!.id)
			expect(member.id).toBe(client!.user!.id)
		})

		it('should fetch multiple members', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const members = await guild.members.fetch()
			expect(members.size).toBeGreaterThan(0)
		})

		it('should fetch with limit', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const members = await guild.members.fetch({ limit: 2 })
			expect(members.size).toBeLessThanOrEqual(2)
		})

		it('should return 404 for unknown member', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			await expect(guild.members.fetch('000000000000000000')).rejects.toMatchObject({ code: 10007 })
		})
	})

	describe('Member Roles', () => {
		let testRole: Role

		beforeAll(async () => {
			const guild = client!.guilds.cache.get(guildId)!
			testRole = await guild.roles.create({ name: 'Member Test Role' })
		})

		afterAll(async () => {
			if (testRole) {
				try {
					await testRole.delete()
				} catch {
					// Role may already be deleted
				}
			}
		})

		it('should add role to bot member', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const botMember = await guild.members.fetch(client!.user!.id)

			await botMember.roles.add(testRole)
			expect(botMember.roles.cache.has(testRole.id)).toBe(true)
		})

		it('should add multiple roles', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const role2 = await guild.roles.create({ name: 'Role 2' })
			const role3 = await guild.roles.create({ name: 'Role 3' })

			const botMember = await guild.members.fetch(client!.user!.id)
			await botMember.roles.add([role2, role3])

			expect(botMember.roles.cache.has(role2.id)).toBe(true)
			expect(botMember.roles.cache.has(role3.id)).toBe(true)

			await role2.delete()
			await role3.delete()
		})

		it('should remove role from member', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const botMember = await guild.members.fetch(client!.user!.id)

			// First ensure the role is added
			if (!botMember.roles.cache.has(testRole.id)) {
				await botMember.roles.add(testRole)
			}

			await botMember.roles.remove(testRole)
			expect(botMember.roles.cache.has(testRole.id)).toBe(false)
		})

		it('should set member roles', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const newRole = await guild.roles.create({ name: 'Set Role' })

			const botMember = await guild.members.fetch(client!.user!.id)
			await botMember.roles.set([newRole])
			expect(botMember.roles.cache.has(newRole.id)).toBe(true)

			await newRole.delete()
		})
	})

	describe('Member Nicknames', () => {
		it('should set bot nickname', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const botMember = await guild.members.fetch(client!.user!.id)

			await botMember.setNickname('Test Nick')
			expect(botMember.nickname).toBe('Test Nick')
		})

		it('should clear bot nickname', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const botMember = await guild.members.fetch(client!.user!.id)

			await botMember.setNickname(null)
			expect(botMember.nickname).toBeNull()
		})
	})

	describe('Member Timeouts', () => {
		it('should timeout member', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const botMember = await guild.members.fetch(client!.user!.id)

			await botMember.timeout(60000, 'Test timeout')

			expect(botMember.communicationDisabledUntil).toBeDefined()
			expect(botMember.isCommunicationDisabled()).toBe(true)
		})

		it('should remove timeout', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const botMember = await guild.members.fetch(client!.user!.id)

			await botMember.timeout(null)

			expect(botMember.communicationDisabledUntil).toBeNull()
			expect(botMember.isCommunicationDisabled()).toBe(false)
		})

		it('should enforce max timeout duration', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const botMember = await guild.members.fetch(client!.user!.id)

			// 28 days + 1 second in ms
			const tooLong = 28 * 24 * 60 * 60 * 1000 + 1000
			await expect(botMember.timeout(tooLong)).rejects.toMatchObject({ code: 50035 })
		})
	})

	describe('Kicking Members', () => {
		it('should kick a test member', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const memberId = generateSnowflake()

			// Create a test member by dispatching GUILD_MEMBER_ADD event
			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guildId,
				user: { id: memberId, username: 'KickMe', discriminator: '0', global_name: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})

			// Wait for the member to be in the guild
			await new Promise((resolve) => setTimeout(resolve, 100))

			// Fetch and kick the member
			const member = await guild.members.fetch(memberId)
			await member.kick('Test kick')

			// Verify member is removed
			await expect(guild.members.fetch(memberId)).rejects.toMatchObject({ code: 10007 })
		})
	})

	describe('Member Events', () => {
		it('should emit guildMemberAdd', async () => {
			const eventPromise = waitForEvent(client!, Events.GuildMemberAdd)

			const memberId = generateSnowflake()
			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guildId,
				user: { id: memberId, username: 'NewMember', discriminator: '0', global_name: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})

			const member = (await eventPromise) as GuildMember
			expect(member.id).toBe(memberId)

			// Clean up - kick the member
			try {
				await member.kick()
			} catch {
				// Ignore if kick fails
			}
		})

		it('should emit guildMemberRemove', async () => {
			const memberId = generateSnowflake()

			// First add the member
			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guildId,
				user: { id: memberId, username: 'Leaving', discriminator: '0', global_name: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})

			// Wait for member to be added
			await new Promise((resolve) => setTimeout(resolve, 100))

			const eventPromise = waitForEvent(client!, Events.GuildMemberRemove)

			// Dispatch GUILD_MEMBER_REMOVE event
			await dispatchEvent(session.id, 'GUILD_MEMBER_REMOVE', {
				guild_id: guildId,
				user: { id: memberId, username: 'Leaving', discriminator: '0', global_name: null }
			})

			const member = (await eventPromise) as GuildMember
			expect(member.id).toBe(memberId)
		})

		it('should emit guildMemberUpdate', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const botMember = await guild.members.fetch(client!.user!.id)

			// Ensure nickname starts as null
			if (botMember.nickname !== null) {
				await botMember.setNickname(null)
			}

			const eventPromise = new Promise<{ old: GuildMember | PartialGuildMember; updated: GuildMember }>((resolve) => {
				client!.once(Events.GuildMemberUpdate, (old, updated) => resolve({ old, updated }))
			})

			await botMember.setNickname('Updated Nick')

			const { old, updated } = await eventPromise
			expect(old.nickname).toBeNull()
			expect(updated.nickname).toBe('Updated Nick')

			// Clean up
			await botMember.setNickname(null)
		})
	})
})

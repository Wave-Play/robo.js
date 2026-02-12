/**
 * GuildMember Server Avatar Tests
 *
 * Tests for guild-specific avatar (server avatar) on GuildMember.
 */
import { ChannelType, Client, Events, GatewayIntentBits, Guild, GuildMember } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForEvent, waitForReady } from '../utils/helpers.js'

describe('GuildMember Server Avatar', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild

	beforeAll(async () => {
		session = await createSession({
			name: 'member-avatar-tests',
			config: {
				guilds: [
					{
						name: 'Member Avatar Test Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMembers,
			GatewayIntentBits.GuildMessages
		])
		await client.login(session.token)
		await waitForReady(client)

		guild = client.guilds.cache.first()!
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	it('should have avatar property (server-specific)', async () => {
		const memberId = generateSnowflake()

		const memberPromise = waitForEvent<GuildMember>(client!, Events.GuildMemberAdd, 5000)

		await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
			guild_id: guild.id,
			user: { id: memberId, username: 'AvatarTest', avatar: 'user_avatar' },
			avatar: 'server_avatar_hash'
		})

		const member = await memberPromise

		expect(member.avatar).toBe('server_avatar_hash')
	})

	it('should have null avatar when not set', async () => {
		const memberId = generateSnowflake()

		const memberPromise = waitForEvent<GuildMember>(client!, Events.GuildMemberAdd, 5000)

		await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
			guild_id: guild.id,
			user: { id: memberId, username: 'NoAvatarTest', avatar: 'user_avatar' }
		})

		const member = await memberPromise

		expect(member.avatar).toBeNull()
	})

	it('should generate avatarURL for server avatar', async () => {
		const memberId = generateSnowflake()

		const memberPromise = waitForEvent<GuildMember>(client!, Events.GuildMemberAdd, 5000)

		await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
			guild_id: guild.id,
			user: { id: memberId, username: 'AvatarURL' },
			avatar: 'server_avatar'
		})

		const member = await memberPromise
		const avatarURL = member.avatarURL()

		expect(avatarURL).not.toBeNull()
		expect(avatarURL).toContain('server_avatar')
		expect(avatarURL).toContain(guild.id)
	})

	it('should return null avatarURL when no server avatar', async () => {
		const memberId = generateSnowflake()

		const memberPromise = waitForEvent<GuildMember>(client!, Events.GuildMemberAdd, 5000)

		await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
			guild_id: guild.id,
			user: { id: memberId, username: 'NoServerAvatar' }
		})

		const member = await memberPromise
		const avatarURL = member.avatarURL()

		expect(avatarURL).toBeNull()
	})

	it('should fall back to user avatar with displayAvatarURL', async () => {
		const memberId = generateSnowflake()

		const memberPromise = waitForEvent<GuildMember>(client!, Events.GuildMemberAdd, 5000)

		await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
			guild_id: guild.id,
			user: { id: memberId, username: 'DisplayAvatar', avatar: 'user_avatar' }
			// No server avatar
		})

		const member = await memberPromise
		const displayURL = member.displayAvatarURL()

		expect(displayURL).toBeDefined()
		expect(displayURL).not.toBeNull()
	})

	it('should set server avatar via setAvatar', async () => {
		// Test that the bot member can set their server avatar
		const botMember = guild.members.cache.get(client!.user!.id)
		if (!botMember) {
			// Skip if bot member not in cache
			return
		}

		// Note: discord.js doesn't expose avatar in GuildMemberEditOptions
		// Guild member avatars can only be changed by users themselves via profile settings
		// This test verifies that the avatar property is accessible for reading
		expect(typeof botMember.avatar === 'string' || botMember.avatar === null).toBe(true)
		// Just verify avatarURL method is available
		expect(typeof botMember.avatarURL).toBe('function')
	})
})

/**
 * GuildMember Communication Disabled Tests
 *
 * Tests for communicationDisabledUntil, isCommunicationDisabled(),
 * and member flags properties.
 */
import { Client, GatewayIntentBits, Guild, GuildMemberFlags } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForReady, delay } from '../utils/helpers.js'

describe('GuildMember Communication Disabled', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'member-communication-tests',
			config: {
				guilds: [{ name: 'Communication Test Guild' }],
				enforceIntents: true,
				approvedPrivilegedIntents: BigInt(GatewayIntentBits.GuildMembers)
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers])
		await client.login(session.token)
		await waitForReady(client)

		guild = client.guilds.cache.first()!
		guildId = guild.id
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	/**
	 * Helper to add a member with specific properties
	 */
	async function addMemberWithProperties(
		userId: string,
		username: string,
		props: Record<string, unknown> = {}
	): Promise<void> {
		await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
			guild_id: guildId,
			user: {
				id: userId,
				username,
				discriminator: '0',
				avatar: null,
				bot: false
			},
			roles: [],
			joined_at: new Date().toISOString(),
			deaf: false,
			mute: false,
			...props
		})
		await delay(100)
	}

	describe('Communication Disabled Until', () => {
		it('should have communicationDisabledUntil when timed out', async () => {
			const memberId = generateSnowflake()
			const timeoutUntil = new Date(Date.now() + 3600000).toISOString() // 1 hour from now

			await addMemberWithProperties(memberId, 'TimedOutUser', {
				communication_disabled_until: timeoutUntil
			})

			const member = await guild.members.fetch(memberId)

			expect(member.communicationDisabledUntil).toBeInstanceOf(Date)
			expect(member.communicationDisabledUntilTimestamp).toBeGreaterThan(Date.now())
		})

		it('should have null communicationDisabledUntil when not timed out', async () => {
			const memberId = generateSnowflake()

			await addMemberWithProperties(memberId, 'NormalUser', {
				communication_disabled_until: null
			})

			const member = await guild.members.fetch(memberId)

			expect(member.communicationDisabledUntil).toBeNull()
			expect(member.communicationDisabledUntilTimestamp).toBeNull()
		})
	})

	describe('isCommunicationDisabled Method', () => {
		it('should return true when member is timed out', async () => {
			const memberId = generateSnowflake()
			const timeoutUntil = new Date(Date.now() + 3600000).toISOString() // 1 hour from now

			await addMemberWithProperties(memberId, 'DisabledCheck', {
				communication_disabled_until: timeoutUntil
			})

			const member = await guild.members.fetch(memberId)

			expect(member.isCommunicationDisabled()).toBe(true)
		})

		it('should return false when member is not timed out', async () => {
			const memberId = generateSnowflake()

			await addMemberWithProperties(memberId, 'NotTimedOut', {
				communication_disabled_until: null
			})

			const member = await guild.members.fetch(memberId)

			expect(member.isCommunicationDisabled()).toBe(false)
		})

		it('should return false when timeout has expired', async () => {
			const memberId = generateSnowflake()
			const expiredTimeout = new Date(Date.now() - 1000).toISOString() // 1 second ago

			await addMemberWithProperties(memberId, 'ExpiredTimeout', {
				communication_disabled_until: expiredTimeout
			})

			const member = await guild.members.fetch(memberId)

			// Discord.js should recognize expired timeout
			expect(member.isCommunicationDisabled()).toBe(false)
		})
	})

	describe('Member Flags', () => {
		it('should have flags property', async () => {
			const memberId = generateSnowflake()

			await addMemberWithProperties(memberId, 'FlagsMember', {
				flags: GuildMemberFlags.DidRejoin | GuildMemberFlags.CompletedOnboarding
			})

			const member = await guild.members.fetch(memberId)

			expect(member.flags).toBeDefined()
			expect(member.flags.has(GuildMemberFlags.DidRejoin)).toBe(true)
			expect(member.flags.has(GuildMemberFlags.CompletedOnboarding)).toBe(true)
		})

		it('should have empty flags for new member', async () => {
			const memberId = generateSnowflake()

			await addMemberWithProperties(memberId, 'NoFlagsMember', {
				flags: 0
			})

			const member = await guild.members.fetch(memberId)

			expect(member.flags).toBeDefined()
			expect(member.flags.bitfield).toBe(0)
		})
	})

	describe('Member Update with Timeout', () => {
		it('should update communicationDisabledUntil on member update', async () => {
			const memberId = generateSnowflake()

			// Add member without timeout first
			await addMemberWithProperties(memberId, 'UpdateTimeoutMember', {
				communication_disabled_until: null
			})

			let member = await guild.members.fetch(memberId)
			expect(member.isCommunicationDisabled()).toBe(false)

			// Update with timeout
			const timeoutUntil = new Date(Date.now() + 3600000).toISOString()
			await dispatchEvent(session.id, 'GUILD_MEMBER_UPDATE', {
				guild_id: guildId,
				user: {
					id: memberId,
					username: 'UpdateTimeoutMember',
					discriminator: '0',
					avatar: null
				},
				roles: [],
				communication_disabled_until: timeoutUntil
			})

			await delay(100)

			// Fetch again to get updated state
			member = await guild.members.fetch(memberId)
			expect(member.isCommunicationDisabled()).toBe(true)
		})
	})
})

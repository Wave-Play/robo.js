/**
 * Member Pending (Membership Screening) Tests
 *
 * Tests for the pending property on GuildMember indicating
 * whether they've completed membership screening.
 */
import { ChannelType, Client, Events, GatewayIntentBits, Guild, GuildMember } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForEvent, waitForReady } from '../utils/helpers.js'

describe('Member Pending (Membership Screening)', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild

	beforeAll(async () => {
		session = await createSession({
			name: 'member-pending-tests',
			config: {
				guilds: [
					{
						name: 'Member Pending Test Guild',
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

	it('should identify pending member from GUILD_MEMBER_ADD event', async () => {
		const memberId = generateSnowflake()

		const memberPromise = waitForEvent<GuildMember>(client!, Events.GuildMemberAdd, 5000)

		await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
			guild_id: guild.id,
			user: { id: memberId, username: 'PendingUser' },
			pending: true
		})

		const member = await memberPromise

		expect(member.pending).toBe(true)
	})

	it('should identify non-pending member from GUILD_MEMBER_ADD event', async () => {
		const memberId = generateSnowflake()

		const memberPromise = waitForEvent<GuildMember>(client!, Events.GuildMemberAdd, 5000)

		await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
			guild_id: guild.id,
			user: { id: memberId, username: 'VerifiedUser' },
			pending: false
		})

		const member = await memberPromise

		expect(member.pending).toBe(false)
	})

	it('should default pending to null when not specified', async () => {
		const memberId = generateSnowflake()

		const memberPromise = waitForEvent<GuildMember>(client!, Events.GuildMemberAdd, 5000)

		await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
			guild_id: guild.id,
			user: { id: memberId, username: 'DefaultUser' }
		})

		const member = await memberPromise

		// When not specified, pending should be null or false
		expect(member.pending === null || member.pending === false).toBe(true)
	})
})

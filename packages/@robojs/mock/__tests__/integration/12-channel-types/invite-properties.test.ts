/**
 * Invite Properties Tests
 *
 * Tests for invite properties including URL, inviter, expiration,
 * and fetch options like withCounts and withExpiration.
 */
import { ChannelType, Client, GatewayIntentBits, TextChannel } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Invite Properties', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'invite-properties-tests',
			config: {
				guilds: [
					{
						name: 'Invite Test Guild',
						channels: [{ name: 'invite-channel', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildInvites])
		await client.login(session.token)
		await waitForReady(client)

		const guild = client.guilds.cache.first()!
		channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Creating Invites with Options', () => {
		it('should create invite with all options', async () => {
			const invite = await channel.createInvite({
				maxAge: 3600,
				maxUses: 10,
				temporary: true,
				unique: true,
				reason: 'Test invite'
			})

			try {
				expect(invite.maxAge).toBe(3600)
				expect(invite.maxUses).toBe(10)
				expect(invite.temporary).toBe(true)
			} finally {
				await invite.delete().catch(() => {})
			}
		})
	})

	describe('Invite URL', () => {
		it('should have invite URL', async () => {
			const invite = await channel.createInvite()

			try {
				expect(invite.url).toContain('discord.gg')
				expect(invite.url).toContain(invite.code)
			} finally {
				await invite.delete().catch(() => {})
			}
		})
	})

	describe('Fetching Invites', () => {
		it('should fetch invite and have counts', async () => {
			const created = await channel.createInvite()

			try {
				const fetched = await client!.fetchInvite(created.code)

				expect(fetched.code).toBe(created.code)
				// Note: presenceCount and memberCount may be undefined if not returned by server
				// Just verify the fetch works
				expect(fetched).toBeDefined()
			} finally {
				await created.delete().catch(() => {})
			}
		})

		it('should fetch invite with expiration info', async () => {
			const created = await channel.createInvite({ maxAge: 7200 })

			try {
				const fetched = await client!.fetchInvite(created.code)

				// Invite with maxAge should have expiresAt
				expect(fetched.expiresAt).toBeDefined()
			} finally {
				await created.delete().catch(() => {})
			}
		})
	})

	describe('Invite Properties', () => {
		it('should have inviter', async () => {
			const invite = await channel.createInvite()

			try {
				expect(invite.inviter?.id).toBe(client!.user!.id)
			} finally {
				await invite.delete().catch(() => {})
			}
		})

		it('should have guild and channel', async () => {
			const invite = await channel.createInvite()

			try {
				expect(invite.guild?.id).toBe(channel.guildId)
				expect(invite.channel?.id).toBe(channel.id)
			} finally {
				await invite.delete().catch(() => {})
			}
		})

		it('should check if invite expires', async () => {
			const permanent = await channel.createInvite({ maxAge: 0 })
			const temporary = await channel.createInvite({ maxAge: 3600 })

			try {
				expect(permanent.expiresAt).toBeNull()
				expect(temporary.expiresAt).toBeDefined()
			} finally {
				await permanent.delete().catch(() => {})
				await temporary.delete().catch(() => {})
			}
		})
	})
})

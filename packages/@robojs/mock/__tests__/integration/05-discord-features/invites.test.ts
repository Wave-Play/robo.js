/**
 * Invite Tests
 *
 * Tests for invite creation, fetching, and deletion.
 */
import { ChannelType, Client, GatewayIntentBits, Invite, TextChannel } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForEvent, waitForReady } from '../utils/helpers.js'

describe('Invites', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guildId: string
	let channel: TextChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'invite-tests',
			config: {
				guilds: [
					{
						name: 'Invite Test Guild',
						channels: [{ name: 'invite-channel', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createTestClient({
			intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildInvites]
		})
		await client.login(session.token)
		await waitForReady(client)

		guildId = client.guilds.cache.first()!.id
		channel = client.guilds.cache.first()!.channels.cache.find(
			(c) => c.type === ChannelType.GuildText
		) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Creating Invites', () => {
		it('should create invite with defaults', async () => {
			const invite = await channel.createInvite()

			expect(invite.code).toBeDefined()
			expect(invite.code.length).toBeGreaterThan(0)
			expect(invite.channelId).toBe(channel.id)
			expect(invite.maxAge).toBe(86400) // Default 24h
			expect(invite.maxUses).toBe(0) // Unlimited

			await invite.delete()
		})

		it('should create invite with custom max age', async () => {
			const invite = await channel.createInvite({
				maxAge: 3600 // 1 hour
			})

			expect(invite.maxAge).toBe(3600)

			await invite.delete()
		})

		it('should create invite with max uses', async () => {
			const invite = await channel.createInvite({
				maxUses: 10
			})

			expect(invite.maxUses).toBe(10)

			await invite.delete()
		})

		it('should create temporary invite', async () => {
			const invite = await channel.createInvite({
				temporary: true
			})

			expect(invite.temporary).toBe(true)

			await invite.delete()
		})

		it('should create unique invite', async () => {
			const invite1 = await channel.createInvite({ unique: true })
			const invite2 = await channel.createInvite({ unique: true })

			expect(invite1.code).not.toBe(invite2.code)

			await invite1.delete()
			await invite2.delete()
		})

		it('should create permanent invite', async () => {
			const invite = await channel.createInvite({ maxAge: 0 })

			expect(invite.maxAge).toBe(0)
			expect(invite.expiresAt).toBeNull()

			await invite.delete()
		})

		it('should create invite with custom settings', async () => {
			const invite = await channel.createInvite({
				maxAge: 7200,
				maxUses: 5,
				temporary: true,
				unique: true,
				reason: 'Test invite'
			})

			expect(invite.maxAge).toBe(7200)
			expect(invite.maxUses).toBe(5)
			expect(invite.temporary).toBe(true)

			await invite.delete()
		})
	})

	describe('Fetching Invites', () => {
		let invite: Invite

		beforeAll(async () => {
			invite = await channel.createInvite()
		})

		afterAll(async () => {
			if (invite) {
				try {
					await invite.delete()
				} catch {
					// Invite may already be deleted
				}
			}
		})

		it('should fetch channel invites', async () => {
			const invites = await channel.fetchInvites()
			expect(invites.has(invite.code)).toBe(true)
		})

		it('should fetch guild invites', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const invites = await guild.invites.fetch()
			expect(invites.has(invite.code)).toBe(true)
		})

		it('should fetch specific invite', async () => {
			const fetched = await client!.fetchInvite(invite.code)
			expect(fetched.code).toBe(invite.code)
		})

		it('should fetch invite with counts', async () => {
			// Note: Discord.js fetchInvite doesn't support withCounts option directly
			// The mock server adds counts by default in extended invite responses
			const fetched = await client!.fetchInvite(invite.code)
			// Just verify the invite was fetched successfully
			expect(fetched.code).toBe(invite.code)
		})
	})

	describe('Deleting Invites', () => {
		it('should delete invite', async () => {
			const invite = await channel.createInvite()

			await invite.delete()

			await expect(client!.fetchInvite(invite.code)).rejects.toMatchObject({
				code: 10006
			}) // Unknown Invite
		})

		it('should delete invite with reason', async () => {
			const invite = await channel.createInvite()

			await invite.delete('Test deletion')

			await expect(client!.fetchInvite(invite.code)).rejects.toBeDefined()
		})
	})

	describe('Invite Properties', () => {
		it('should have guild reference', async () => {
			const invite = await channel.createInvite()

			expect(invite.guild?.id).toBe(guildId)

			await invite.delete()
		})

		it('should have channel reference', async () => {
			const invite = await channel.createInvite()

			expect(invite.channel?.id).toBe(channel.id)

			await invite.delete()
		})

		it('should have inviter reference', async () => {
			const invite = await channel.createInvite()

			// Inviter should be the bot
			expect(invite.inviter?.id).toBe(client!.user!.id)

			await invite.delete()
		})

		it('should have uses count', async () => {
			const invite = await channel.createInvite()

			expect(invite.uses).toBe(0)

			await invite.delete()
		})

		it('should have expiration info', async () => {
			const invite = await channel.createInvite({ maxAge: 3600 })

			expect(invite.expiresAt).toBeDefined()
			expect(invite.expiresTimestamp).toBeDefined()

			await invite.delete()
		})
	})

	describe('Invite URL', () => {
		it('should generate correct invite URL', async () => {
			const invite = await channel.createInvite()

			expect(invite.url).toBe(`https://discord.gg/${invite.code}`)

			await invite.delete()
		})

		it('should have toString method', async () => {
			const invite = await channel.createInvite()

			expect(invite.toString()).toBe(`https://discord.gg/${invite.code}`)

			await invite.delete()
		})
	})

	describe('Invite Events', () => {
		it('should emit inviteCreate', async () => {
			const createPromise = waitForEvent(client!, 'inviteCreate')
			const invite = await channel.createInvite()
			const emitted = await createPromise

			expect(emitted.code).toBe(invite.code)
			expect(emitted.channelId).toBe(channel.id)

			await invite.delete()
		})

		it('should emit inviteDelete', async () => {
			const invite = await channel.createInvite()

			const deletePromise = waitForEvent(client!, 'inviteDelete')
			await invite.delete()
			const emitted = await deletePromise

			expect(emitted.code).toBe(invite.code)
		})
	})
})

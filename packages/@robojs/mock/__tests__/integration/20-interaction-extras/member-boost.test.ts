import { Client, Events, GuildMember } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForEvent, waitForReady } from '../utils/helpers.js'

describe('GuildMember Boost Info', () => {
	let client: Client | null = null
	let session: { id: string; token: string }

	beforeAll(async () => {
		session = await createSession({
			name: 'member-boost',
			config: {
				guilds: [
					{
						name: 'Test Guild'
					}
				]
			}
		})

		client = createTestClient()
		await client.login(session.token)
		await waitForReady(client)
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	it('should have premiumSince for boosting members', async () => {
		const guild = client!.guilds.cache.first()!
		const boostDate = new Date('2024-01-15T10:00:00.000Z')
		const eventPromise = waitForEvent(client!, Events.GuildMemberAdd, 5000)

		await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
			guild_id: guild.id,
			user: { id: '555', username: 'Booster' },
			roles: [],
			premium_since: boostDate.toISOString()
		})

		const member = (await eventPromise) as GuildMember
		expect(member.premiumSince).toBeDefined()
		expect(member.premiumSince).toBeInstanceOf(Date)
		expect(member.premiumSince!.toISOString()).toBe(boostDate.toISOString())
		expect(member.premiumSinceTimestamp).toBeGreaterThan(0)
	})

	it('should have null premiumSince for non-boosting members', async () => {
		const guild = client!.guilds.cache.first()!
		const eventPromise = waitForEvent(client!, Events.GuildMemberAdd, 5000)

		await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
			guild_id: guild.id,
			user: { id: '666', username: 'NonBooster' },
			roles: []
			// No premium_since field
		})

		const member = (await eventPromise) as GuildMember
		expect(member.premiumSince).toBeNull()
		expect(member.premiumSinceTimestamp).toBeNull()
	})
})

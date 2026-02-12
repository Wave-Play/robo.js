/**
 * Thread Archive/Unarchive Edge Cases Tests
 *
 * Tests for thread archival, locking, duration, and invitability.
 */
import {
	ChannelType,
	Client,
	GatewayIntentBits,
	TextChannel,
	ThreadAutoArchiveDuration
} from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Thread Archive/Unarchive Edge Cases', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'thread-archive-tests',
			config: {
				guilds: [
					{
						name: 'Thread Archive Test Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages])
		await client.login(session.token)
		await waitForReady(client)

		const guild = client.guilds.cache.first()!
		channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	it('should archive thread', async () => {
		const message = await channel.send('Archive test')
		const thread = await message.startThread({ name: 'Archive Me' })

		try {
			await thread.setArchived(true)
			expect(thread.archived).toBe(true)
		} finally {
			await thread.delete().catch(() => {})
		}
	})

	it('should unarchive thread', async () => {
		const message = await channel.send('Unarchive test')
		const thread = await message.startThread({ name: 'Unarchive Me' })

		try {
			await thread.setArchived(true)
			expect(thread.archived).toBe(true)

			await thread.setArchived(false)
			expect(thread.archived).toBe(false)
		} finally {
			await thread.delete().catch(() => {})
		}
	})

	it('should lock thread', async () => {
		const message = await channel.send('Lock test')
		const thread = await message.startThread({ name: 'Lock Me' })

		try {
			await thread.setLocked(true)
			expect(thread.locked).toBe(true)
		} finally {
			await thread.delete().catch(() => {})
		}
	})

	it('should archive and lock simultaneously', async () => {
		const message = await channel.send('Archive and lock')
		const thread = await message.startThread({ name: 'Both' })

		try {
			// Archive with lock using edit
			await thread.edit({ archived: true, locked: true })

			expect(thread.archived).toBe(true)
			expect(thread.locked).toBe(true)
		} finally {
			await thread.delete().catch(() => {})
		}
	})

	it('should set auto archive duration', async () => {
		const message = await channel.send('Auto archive')
		const thread = await message.startThread({
			name: 'Auto Archive',
			autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek
		})

		try {
			expect(thread.autoArchiveDuration).toBe(ThreadAutoArchiveDuration.OneWeek)

			await thread.setAutoArchiveDuration(ThreadAutoArchiveDuration.OneDay)
			expect(thread.autoArchiveDuration).toBe(ThreadAutoArchiveDuration.OneDay)
		} finally {
			await thread.delete().catch(() => {})
		}
	})

	it('should set thread rate limit', async () => {
		const message = await channel.send('Rate limit')
		const thread = await message.startThread({ name: 'Rate Limited' })

		try {
			await thread.setRateLimitPerUser(30)
			expect(thread.rateLimitPerUser).toBe(30)
		} finally {
			await thread.delete().catch(() => {})
		}
	})

	it('should set invitable for private threads', async () => {
		const thread = await channel.threads.create({
			name: 'Private Invitable',
			type: ChannelType.PrivateThread,
			invitable: true
		})

		try {
			expect(thread.invitable).toBe(true)

			await thread.setInvitable(false)
			expect(thread.invitable).toBe(false)
		} finally {
			await thread.delete().catch(() => {})
		}
	})

	it('should fetch archived threads', async () => {
		const message = await channel.send('Archived threads')
		const thread = await message.startThread({ name: 'Will Archive' })

		try {
			await thread.setArchived(true)

			const archived = await channel.threads.fetchArchived()
			expect(archived.threads.has(thread.id)).toBe(true)
		} finally {
			await thread.delete().catch(() => {})
		}
	})

	it('should fetch archived threads with options', async () => {
		const archived = await channel.threads.fetchArchived({
			type: 'public',
			fetchAll: false,
			limit: 10
		})

		expect(archived.threads).toBeDefined()
	})

	it('should fetch private archived threads', async () => {
		const thread = await channel.threads.create({
			name: 'Private Archived',
			type: ChannelType.PrivateThread
		})

		try {
			await thread.setArchived(true)

			const archived = await channel.threads.fetchArchived({ type: 'private' })
			expect(archived.threads.has(thread.id)).toBe(true)
		} finally {
			await thread.delete().catch(() => {})
		}
	})
})

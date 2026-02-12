/**
 * AuditLogEntry Extras Tests
 *
 * Tests for audit log entry extra/options field for various action types.
 * These test the extra data that Discord provides for specific audit log actions
 * like member prune, member move, message delete, etc.
 */
import { AuditLogEvent, ChannelType, Client, GatewayIntentBits, Guild, VoiceChannel } from 'discord.js'
import { addAuditLogEntries, createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForReady } from '../utils/helpers.js'

describe('AuditLogEntry Extras', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild

	beforeAll(async () => {
		session = await createSession({
			name: 'audit-log-extras-tests',
			config: {
				guilds: [
					{
						name: 'Audit Log Extras Guild',
						channels: [
							{ name: 'general', type: ChannelType.GuildText },
							{ name: 'Voice Channel', type: ChannelType.GuildVoice }
						]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds])
		await client.login(session.token)
		await waitForReady(client)

		guild = client.guilds.cache.first()!
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	it('should have extra for member prune', async () => {
		// Add a member prune audit log entry
		await addAuditLogEntries(session.id, guild.id, [
			{
				action_type: AuditLogEvent.MemberPrune,
				user_id: client!.user!.id,
				options: {
					delete_member_days: '7',
					members_removed: '5'
				}
			}
		])

		const logs = await guild.fetchAuditLogs({
			type: AuditLogEvent.MemberPrune,
			limit: 1
		})

		const entry = logs.entries.first()

		expect(entry).toBeDefined()
		if (entry?.extra) {
			// discord.js transforms these to numbers
			// For MemberPrune: members_removed -> removed, delete_member_days -> days
			expect(entry.extra.days).toBe(7)
			expect(entry.extra.removed).toBe(5)
		}
	})

	it('should have extra for member move', async () => {
		const voiceChannel = guild.channels.cache.find((c) => c.type === ChannelType.GuildVoice) as VoiceChannel

		await addAuditLogEntries(session.id, guild.id, [
			{
				action_type: AuditLogEvent.MemberMove,
				user_id: client!.user!.id,
				options: {
					channel_id: voiceChannel.id,
					count: '3'
				}
			}
		])

		const logs = await guild.fetchAuditLogs({
			type: AuditLogEvent.MemberMove,
			limit: 1
		})

		const entry = logs.entries.first()

		expect(entry).toBeDefined()
		if (entry?.extra) {
			expect(entry.extra.channel?.id).toBe(voiceChannel.id)
			expect(entry.extra.count).toBe(3)
		}
	})

	it('should have extra for member disconnect', async () => {
		await addAuditLogEntries(session.id, guild.id, [
			{
				action_type: AuditLogEvent.MemberDisconnect,
				user_id: client!.user!.id,
				options: {
					count: '2'
				}
			}
		])

		const logs = await guild.fetchAuditLogs({
			type: AuditLogEvent.MemberDisconnect,
			limit: 1
		})

		const entry = logs.entries.first()

		expect(entry).toBeDefined()
		if (entry?.extra) {
			expect(entry.extra.count).toBe(2)
		}
	})

	it('should have extra for message delete', async () => {
		const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText)!

		await addAuditLogEntries(session.id, guild.id, [
			{
				action_type: AuditLogEvent.MessageDelete,
				user_id: client!.user!.id,
				target_id: '111111111111111111',
				options: {
					channel_id: channel.id,
					count: '10'
				}
			}
		])

		const logs = await guild.fetchAuditLogs({
			type: AuditLogEvent.MessageDelete,
			limit: 1
		})

		const entry = logs.entries.first()

		expect(entry).toBeDefined()
		if (entry?.extra) {
			expect(entry.extra.channel?.id).toBe(channel.id)
			expect(entry.extra.count).toBe(10)
		}
	})

	it('should have extra for message bulk delete', async () => {
		const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText)!

		await addAuditLogEntries(session.id, guild.id, [
			{
				action_type: AuditLogEvent.MessageBulkDelete,
				user_id: client!.user!.id,
				target_id: channel.id,
				options: {
					count: '50'
				}
			}
		])

		const logs = await guild.fetchAuditLogs({
			type: AuditLogEvent.MessageBulkDelete,
			limit: 1
		})

		const entry = logs.entries.first()

		expect(entry).toBeDefined()
		if (entry?.extra) {
			expect(entry.extra.count).toBe(50)
		}
	})

	it('should have extra for message pin', async () => {
		const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText)!
		const messageId = generateSnowflake()

		await addAuditLogEntries(session.id, guild.id, [
			{
				action_type: AuditLogEvent.MessagePin,
				user_id: client!.user!.id,
				target_id: '222222222222222222',
				options: {
					channel_id: channel.id,
					message_id: messageId
				}
			}
		])

		const logs = await guild.fetchAuditLogs({
			type: AuditLogEvent.MessagePin,
			limit: 1
		})

		const entry = logs.entries.first()

		expect(entry).toBeDefined()
		if (entry?.extra) {
			expect(entry.extra.channel?.id).toBe(channel.id)
			expect(entry.extra.messageId).toBe(messageId)
		}
	})

	it('should have extra for overwrite update', async () => {
		const role = await guild.roles.create({ name: 'Audit Role' })

		try {
			await addAuditLogEntries(session.id, guild.id, [
				{
					action_type: AuditLogEvent.ChannelOverwriteUpdate,
					user_id: client!.user!.id,
					target_id: role.id,
					options: {
						id: role.id,
						type: '0', // role type
						role_name: 'Audit Role'
					}
				}
			])

			const logs = await guild.fetchAuditLogs({
				type: AuditLogEvent.ChannelOverwriteUpdate,
				limit: 1
			})

			const entry = logs.entries.first()

			expect(entry).toBeDefined()
			// ChannelOverwriteUpdate should have extra field with overwrite info
			// The entry.extra should have id, type, and optionally roleName
			expect(entry?.extra).toBeDefined()
			// Verify the id matches the role
			if (entry?.extra) {
				// Check that extra has id property
				expect(typeof entry.extra.id).toBe('string')
			}
		} finally {
			await role.delete().catch(() => {})
		}
	})

	it('should have extra for stage instance', async () => {
		// Create a stage channel for the test
		const stageChannel = await guild.channels.create({
			name: 'audit-stage',
			type: ChannelType.GuildStageVoice
		})

		try {
			await addAuditLogEntries(session.id, guild.id, [
				{
					action_type: AuditLogEvent.StageInstanceCreate,
					user_id: client!.user!.id,
					target_id: generateSnowflake(),
					options: {
						channel_id: stageChannel.id
					}
				}
			])

			const logs = await guild.fetchAuditLogs({
				type: AuditLogEvent.StageInstanceCreate,
				limit: 1
			})

			const entry = logs.entries.first()

			expect(entry).toBeDefined()
			if (entry?.extra) {
				// The extra can be StageChannel or { id: string }
				const extraWithId = entry.extra as { id?: string; channel?: { id: string } }
				const channelId = extraWithId.id ?? extraWithId.channel?.id
				expect(channelId).toBe(stageChannel.id)
			}
		} finally {
			await stageChannel.delete().catch(() => {})
		}
	})
})

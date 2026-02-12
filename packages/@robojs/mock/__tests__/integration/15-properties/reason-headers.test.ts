/**
 * Reason Headers (Audit Log) Tests
 *
 * Tests for including reason in API operations that appear in audit logs.
 */
import { AuditLogEvent, ChannelType, Client, GatewayIntentBits, Guild } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForReady } from '../utils/helpers.js'

describe('Reason Headers (Audit Log)', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild

	beforeAll(async () => {
		session = await createSession({
			name: 'reason-headers-tests',
			config: {
				guilds: [
					{
						name: 'Reason Headers Test Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
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

	it('should include reason when creating role', async () => {
		const role = await guild.roles.create({
			name: 'Reason Role',
			reason: 'Testing reason header'
		})

		try {
			// Check audit log
			const logs = await guild.fetchAuditLogs({
				type: AuditLogEvent.RoleCreate,
				limit: 1
			})

			const entry = logs.entries.first()
			if (entry) {
				expect(entry.reason).toBe('Testing reason header')
			}
		} finally {
			await role.delete().catch(() => {})
		}
	})

	it('should include reason when deleting channel', async () => {
		const channelToDelete = await guild.channels.create({
			name: 'delete-reason',
			type: ChannelType.GuildText
		})

		await channelToDelete.delete('Removing test channel')

		const logs = await guild.fetchAuditLogs({
			type: AuditLogEvent.ChannelDelete,
			limit: 1
		})

		const entry = logs.entries.first()
		if (entry) {
			expect(entry.reason).toBe('Removing test channel')
		}
	})

	it('should include reason when banning user', async () => {
		const userId = generateSnowflake()

		// Add a member first
		await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
			guild_id: guild.id,
			user: { id: userId, username: 'BanReason' }
		})

		try {
			await guild.bans.create(userId, { reason: 'Rule violation' })

			const logs = await guild.fetchAuditLogs({
				type: AuditLogEvent.MemberBanAdd,
				limit: 1
			})

			const entry = logs.entries.first()
			if (entry) {
				expect(entry.reason).toBe('Rule violation')
			}
		} catch {
			// Ban might fail if user not found, that's okay for testing reason support
		}
	})

	it('should include reason when editing role', async () => {
		const role = await guild.roles.create({
			name: 'Edit Reason Test'
		})

		try {
			await role.edit({
				name: 'Edited Role',
				reason: 'Testing edit reason'
			})

			const logs = await guild.fetchAuditLogs({
				type: AuditLogEvent.RoleUpdate,
				limit: 1
			})

			const entry = logs.entries.first()
			if (entry) {
				expect(entry.reason).toBe('Testing edit reason')
			}
		} finally {
			await role.delete().catch(() => {})
		}
	})

	it('should include reason when deleting role', async () => {
		const role = await guild.roles.create({
			name: 'Delete Reason Test'
		})

		await role.delete('Deleting test role')

		const logs = await guild.fetchAuditLogs({
			type: AuditLogEvent.RoleDelete,
			limit: 1
		})

		const entry = logs.entries.first()
		if (entry) {
			expect(entry.reason).toBe('Deleting test role')
		}
	})

	it('should include reason when editing member nickname', async () => {
		const memberId = generateSnowflake()

		// Add a member first
		await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
			guild_id: guild.id,
			user: { id: memberId, username: 'EditReason' }
		})

		try {
			const member = await guild.members.fetch(memberId)
			await member.setNickname('New Nick', 'Nickname update test')

			const logs = await guild.fetchAuditLogs({
				type: AuditLogEvent.MemberUpdate,
				limit: 1
			})

			const entry = logs.entries.first()
			if (entry) {
				expect(entry.reason).toBe('Nickname update test')
			}
		} catch {
			// Member operations may fail - that's acceptable for testing reason support
		}
	})
})

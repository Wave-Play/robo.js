/**
 * Audit Log Entry Details Tests
 *
 * Tests for audit log filtering, properties, changes, and pagination.
 */
import { AuditLogEvent, Client, GatewayIntentBits, Guild } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Audit Log Entry Details', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild

	beforeAll(async () => {
		session = await createSession({
			name: 'audit-log-tests',
			config: {
				guilds: [{ name: 'Audit Log Test Guild' }]
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

	it('should fetch audit log with action type filter', async () => {
		// Create a role to generate an audit log entry
		const role = await guild.roles.create({ name: 'Filter Test Role' })

		try {
			const logs = await guild.fetchAuditLogs({
				type: AuditLogEvent.RoleCreate,
				limit: 10
			})

			// All entries should be RoleCreate
			logs.entries.forEach((entry) => {
				expect(entry.action).toBe(AuditLogEvent.RoleCreate)
			})
		} finally {
			await role.delete().catch(() => {})
		}
	})

	it('should fetch audit log with user filter', async () => {
		const logs = await guild.fetchAuditLogs({
			user: client!.user!.id,
			limit: 10
		})

		// All entries should be from the bot user
		logs.entries.forEach((entry) => {
			expect(entry.executor?.id).toBe(client!.user!.id)
		})
	})

	it('should have audit log entry properties', async () => {
		// Create and delete a role to generate audit log entries
		const role = await guild.roles.create({ name: 'Audit Test' })
		await role.delete()

		const logs = await guild.fetchAuditLogs({
			type: AuditLogEvent.RoleDelete,
			limit: 1
		})

		const entry = logs.entries.first()

		if (entry) {
			expect(entry.id).toBeDefined()
			expect(entry.action).toBe(AuditLogEvent.RoleDelete)
			expect(entry.executor).toBeDefined()
			expect(entry.target).toBeDefined()
			expect(entry.createdAt).toBeInstanceOf(Date)
		}
	})

	it('should have changes in audit log entry', async () => {
		// Create and edit role to generate changes
		const role = await guild.roles.create({ name: 'Change Test', color: 0xff0000 })

		try {
			await role.edit({ name: 'Changed Name', color: 0x00ff00 })

			const logs = await guild.fetchAuditLogs({
				type: AuditLogEvent.RoleUpdate,
				limit: 1
			})

			const entry = logs.entries.first()

			if (entry && entry.changes) {
				expect(entry.changes.length).toBeGreaterThan(0)

				const change = entry.changes[0]
				expect(change.key).toBeDefined()
			}
		} finally {
			await role.delete().catch(() => {})
		}
	})

	it('should have reason in audit log entry', async () => {
		const role = await guild.roles.create({
			name: 'Reason Test',
			reason: 'Testing audit log reason'
		})

		try {
			const logs = await guild.fetchAuditLogs({
				type: AuditLogEvent.RoleCreate,
				limit: 1
			})

			const entry = logs.entries.first()

			if (entry) {
				expect(entry.reason).toBe('Testing audit log reason')
			}
		} finally {
			await role.delete().catch(() => {})
		}
	})

	it('should fetch audit log before specific entry', async () => {
		// Create some roles to populate audit log
		const role1 = await guild.roles.create({ name: 'Pagination Test 1' })
		const role2 = await guild.roles.create({ name: 'Pagination Test 2' })
		const role3 = await guild.roles.create({ name: 'Pagination Test 3' })

		try {
			const firstBatch = await guild.fetchAuditLogs({ limit: 5 })
			const lastEntry = firstBatch.entries.last()

			if (lastEntry) {
				const secondBatch = await guild.fetchAuditLogs({
					before: lastEntry.id,
					limit: 5
				})

				// The second batch should not contain the entry we used as 'before'
				expect(secondBatch.entries.has(lastEntry.id)).toBe(false)
			}
		} finally {
			await role1.delete().catch(() => {})
			await role2.delete().catch(() => {})
			await role3.delete().catch(() => {})
		}
	})
})

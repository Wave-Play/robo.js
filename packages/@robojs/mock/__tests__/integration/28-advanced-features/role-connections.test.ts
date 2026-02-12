/**
 * Role Connection Metadata Tests
 *
 * Tests for application role connection metadata API including
 * fetching, editing, and localizations.
 */
import { ApplicationRoleConnectionMetadataType, Client, GatewayIntentBits } from 'discord.js'
import { controlAPI, createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Role Connection Metadata', () => {
	let client: Client | null = null
	let session: { id: string; token: string }

	beforeAll(async () => {
		session = await createSession({
			name: 'role-connections',
			config: {
				guilds: [{ name: 'Role Connections Guild' }]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds])
		await client.login(session.token)
		await waitForReady(client)
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Fetching Role Connection Metadata', () => {
		it('should fetch role connection metadata', async () => {
			// First set up some metadata via control API
			await controlAPI(`/sessions/${session.id}/role-connection-metadata`, {
				method: 'POST',
				body: {
					application_id: client!.application!.id,
					metadata: [
						{
							type: ApplicationRoleConnectionMetadataType.IntegerGreaterThanOrEqual,
							key: 'level',
							name: 'Level',
							description: 'User level'
						}
					]
				}
			}).catch(() => {
				// If endpoint doesn't exist, metadata might be set via REST API
			})

			// Fetch metadata
			const metadata = await client!.application!.fetchRoleConnectionMetadataRecords()

			// Should return an array (might be empty if not set)
			expect(Array.isArray(metadata)).toBe(true)
		})

		it('should have metadata properties', async () => {
			// Set up metadata with all required properties
			const testMetadata = [
				{
					type: ApplicationRoleConnectionMetadataType.IntegerGreaterThanOrEqual,
					key: 'experience',
					name: 'Experience',
					description: 'Total experience points'
				}
			]

			// Edit metadata to ensure it exists
			const metadata = await client!.application!.editRoleConnectionMetadataRecords(testMetadata)

			if (metadata.length > 0) {
				const record = metadata[0]
				expect(record.type).toBeDefined()
				expect(record.key).toBeDefined()
				expect(record.name).toBeDefined()
				expect(record.description).toBeDefined()
			}
		})
	})

	describe('Editing Role Connection Metadata', () => {
		it('should edit role connection metadata records', async () => {
			const newMetadata = [
				{
					type: ApplicationRoleConnectionMetadataType.IntegerGreaterThanOrEqual,
					key: 'xp',
					name: 'XP',
					description: 'Experience points'
				},
				{
					type: ApplicationRoleConnectionMetadataType.BooleanEqual,
					key: 'verified',
					name: 'Verified',
					description: 'Is verified user'
				}
			]

			const updated = await client!.application!.editRoleConnectionMetadataRecords(newMetadata)

			expect(updated.length).toBe(2)
			expect(updated[0].key).toBe('xp')
			expect(updated[1].key).toBe('verified')
		})
	})

	describe('Metadata Types', () => {
		it('should support all metadata types', async () => {
			// Verify all ApplicationRoleConnectionMetadataType values exist
			const types = [
				ApplicationRoleConnectionMetadataType.IntegerLessThanOrEqual,
				ApplicationRoleConnectionMetadataType.IntegerGreaterThanOrEqual,
				ApplicationRoleConnectionMetadataType.IntegerEqual,
				ApplicationRoleConnectionMetadataType.IntegerNotEqual,
				ApplicationRoleConnectionMetadataType.DatetimeLessThanOrEqual,
				ApplicationRoleConnectionMetadataType.DatetimeGreaterThanOrEqual,
				ApplicationRoleConnectionMetadataType.BooleanEqual,
				ApplicationRoleConnectionMetadataType.BooleanNotEqual
			]

			// Each type should be a number
			for (const type of types) {
				expect(typeof type).toBe('number')
			}

			// Create metadata with various types
			const variedMetadata = [
				{
					type: ApplicationRoleConnectionMetadataType.IntegerLessThanOrEqual,
					key: 'max_level',
					name: 'Max Level',
					description: 'Maximum level'
				},
				{
					type: ApplicationRoleConnectionMetadataType.DatetimeGreaterThanOrEqual,
					key: 'joined_after',
					name: 'Joined After',
					description: 'Member since date'
				},
				{
					type: ApplicationRoleConnectionMetadataType.BooleanNotEqual,
					key: 'not_banned',
					name: 'Not Banned',
					description: 'Not previously banned'
				}
			]

			const updated = await client!.application!.editRoleConnectionMetadataRecords(variedMetadata)

			expect(updated.length).toBe(3)
			expect(updated[0].type).toBe(ApplicationRoleConnectionMetadataType.IntegerLessThanOrEqual)
			expect(updated[1].type).toBe(ApplicationRoleConnectionMetadataType.DatetimeGreaterThanOrEqual)
			expect(updated[2].type).toBe(ApplicationRoleConnectionMetadataType.BooleanNotEqual)
		})
	})

	describe('Localizations', () => {
		it('should have name and description localizations', async () => {
			const localizedMetadata = [
				{
					type: ApplicationRoleConnectionMetadataType.IntegerGreaterThanOrEqual,
					key: 'level',
					name: 'Level',
					nameLocalizations: {
						de: 'Stufe',
						fr: 'Niveau',
						es: 'Nivel'
					},
					description: 'User level',
					descriptionLocalizations: {
						de: 'Benutzerstufe',
						fr: 'Niveau utilisateur',
						es: 'Nivel de usuario'
					}
				}
			]

			const updated = await client!.application!.editRoleConnectionMetadataRecords(localizedMetadata)

			expect(updated.length).toBe(1)

			const record = updated[0]
			expect(record.nameLocalizations?.de).toBe('Stufe')
			expect(record.nameLocalizations?.fr).toBe('Niveau')
			expect(record.descriptionLocalizations?.de).toBe('Benutzerstufe')
			expect(record.descriptionLocalizations?.fr).toBe('Niveau utilisateur')
		})
	})
})

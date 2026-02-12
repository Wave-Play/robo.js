/**
 * SKUs and Entitlements Tests
 *
 * Tests for client.application.fetchSKUs(), entitlements.fetch(),
 * entitlements.createTest(), and entitlement events.
 */
import { Client, Events, GatewayIntentBits, type Entitlement } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady, waitForEvent, generateSnowflake } from '../utils/helpers.js'

describe('SKUs and Entitlements', () => {
	let client: Client | null = null
	let session: { id: string; token: string }

	beforeAll(async () => {
		session = await createSession({
			name: 'skus-entitlements',
			config: {
				botUser: { username: 'SKUTestBot' },
				guilds: [{ name: 'Test Guild' }]
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

	describe('SKUs', () => {
		it('should fetch SKUs', async () => {
			const skus = await client!.application!.fetchSKUs()

			// SKUs should be a Collection (may be empty)
			expect(skus).toBeDefined()
			expect(typeof skus.size).toBe('number')
		})

		it('should have SKU properties when SKUs exist', async () => {
			const skus = await client!.application!.fetchSKUs()

			// If any SKUs exist, verify their properties
			if (skus.size > 0) {
				const sku = skus.first()
				expect(sku!.id).toBeDefined()
				expect(sku!.type).toBeDefined()
				expect(sku!.name).toBeDefined()
				expect(sku!.slug).toBeDefined()
			}
		})
	})

	describe('Entitlements', () => {
		it('should fetch entitlements', async () => {
			const entitlements = await client!.application!.entitlements.fetch()

			// Entitlements should be a Collection (may be empty)
			expect(entitlements).toBeDefined()
			expect(typeof entitlements.size).toBe('number')
		})

		it('should have entitlement properties when entitlements exist', async () => {
			const entitlements = await client!.application!.entitlements.fetch()

			// If any entitlements exist, verify their properties
			if (entitlements.size > 0) {
				const entitlement = entitlements.first()
				expect(entitlement!.id).toBeDefined()
				expect(entitlement!.skuId).toBeDefined()
				expect(entitlement!.type).toBeDefined()
			}
		})

		it('should fetch entitlements with options', async () => {
			const entitlements = await client!.application!.entitlements.fetch({
				excludeEnded: true
			})

			expect(entitlements).toBeDefined()
		})

		it('should create test entitlement', async () => {
			const skuId = generateSnowflake()
			const guild = client!.guilds.cache.first()!

			const entitlement = await client!.application!.entitlements.createTest({
				sku: skuId,
				guild: guild.id
			})

			expect(entitlement.id).toBeDefined()
			expect(entitlement.skuId).toBe(skuId)
		})

		it('should delete test entitlement', async () => {
			const skuId = generateSnowflake()
			const guild = client!.guilds.cache.first()!

			const entitlement = await client!.application!.entitlements.createTest({
				sku: skuId,
				guild: guild.id
			})

			// Delete using the manager's deleteTest method
			// This is the correct way to delete test entitlements
			await client!.application!.entitlements.deleteTest(entitlement.id)
		})
	})

	describe('Entitlement Events', () => {
		it('should emit entitlementCreate event', async () => {
			const entitlementId = generateSnowflake()
			const skuId = generateSnowflake()
			const userId = generateSnowflake()

			const eventPromise = waitForEvent<Entitlement>(client!, Events.EntitlementCreate, 5000)

			await dispatchEvent(session.id, 'ENTITLEMENT_CREATE', {
				id: entitlementId,
				sku_id: skuId,
				application_id: client!.application!.id,
				user_id: userId,
				type: 8, // ApplicationSubscription
				deleted: false
			})

			const entitlement = await eventPromise

			expect(entitlement.id).toBe(entitlementId)
			expect(entitlement.skuId).toBe(skuId)
		})

		it('should emit entitlementUpdate event', async () => {
			const entitlementId = generateSnowflake()
			const skuId = generateSnowflake()
			const userId = generateSnowflake()

			// Use a custom promise to capture both arguments
			const eventPromise = new Promise<{ oldEntitlement: Entitlement | null; newEntitlement: Entitlement }>((resolve, reject) => {
				const timeout = setTimeout(() => reject(new Error('Timeout waiting for entitlementUpdate')), 5000)
				client!.once(Events.EntitlementUpdate, (oldEnt, newEnt) => {
					clearTimeout(timeout)
					resolve({ oldEntitlement: oldEnt, newEntitlement: newEnt })
				})
			})

			await dispatchEvent(session.id, 'ENTITLEMENT_UPDATE', {
				id: entitlementId,
				sku_id: skuId,
				application_id: client!.application!.id,
				user_id: userId,
				type: 8,
				deleted: false,
				consumed: true
			})

			const { newEntitlement } = await eventPromise

			expect(newEntitlement.id).toBe(entitlementId)
		})
	})
})

/**
 * Final Client Properties Tests
 *
 * Tests for client properties including token, readyAt, ws, rest, voice,
 * shard, options, isReady, generateInvite, and destroy methods.
 */
import { Client, GatewayIntentBits, OAuth2Scopes, PermissionFlagsBits } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Final Client Properties', () => {
	let client: Client | null = null
	let session: { id: string; token: string }

	beforeAll(async () => {
		session = await createSession({
			name: 'client-properties',
			config: {
				guilds: [{ name: 'Client Properties Guild' }]
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

	describe('token Property', () => {
		it('should have token property', () => {
			expect(client!.token).toBe(session.token)
		})
	})

	describe('readyAt Property', () => {
		it('should have readyAt property', () => {
			expect(client!.readyAt).toBeInstanceOf(Date)
		})
	})

	describe('ws Property', () => {
		it('should have ws property with ping', () => {
			expect(client!.ws).toBeDefined()
			expect(client!.ws.ping).toBeGreaterThanOrEqual(-1)
		})
	})

	describe('rest Property', () => {
		it('should have rest property', () => {
			expect(client!.rest).toBeDefined()
		})
	})

	describe('voice Property', () => {
		it('should have voice property', () => {
			expect(client!.voice).toBeDefined()
			expect(client!.voice.adapters).toBeDefined()
		})
	})

	describe('shard Property', () => {
		it('should have shard property', () => {
			// In non-sharded mode, shard may be null or a single shard
			// Just verify the property exists
			expect('shard' in client!).toBe(true)
		})
	})

	describe('options Property', () => {
		it('should have options property', () => {
			expect(client!.options).toBeDefined()
			expect(client!.options.intents).toBeDefined()
		})
	})

	describe('isReady Method', () => {
		it('should return true when ready', () => {
			expect(client!.isReady()).toBe(true)
		})
	})

	describe('generateInvite Method', () => {
		it('should generate invite link', () => {
			const invite = client!.generateInvite({
				scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
				permissions: [PermissionFlagsBits.SendMessages]
			})

			expect(invite).toContain('client_id=')
			expect(invite).toContain('scope=')
			expect(invite).toContain('permissions=')
		})
	})

	describe('destroy Method', () => {
		it('should destroy client', async () => {
			const newSession = await createSession({
				name: 'destroy-client',
				config: {
					guilds: [{ name: 'Destroy Test Guild' }]
				}
			})

			const newClient = createClientWithIntents([GatewayIntentBits.Guilds])
			await newClient.login(newSession.token)
			await waitForReady(newClient)

			await newClient.destroy()

			expect(newClient.isReady()).toBe(false)
		})
	})
})

/**
 * Permission & Intent Enforcement Tests
 *
 * Tests for validating the mock server's permission enforcement and intent filtering systems.
 * These tests verify that the mock correctly handles PermissionsBitField and IntentsBitField
 * operations in integration with the server's enforcement mechanisms.
 */
import {
	ChannelType,
	Client,
	Events,
	GatewayIntentBits,
	Guild,
	PermissionFlagsBits,
	PermissionsBitField
} from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForEvent, waitForReady } from '../utils/helpers.js'

describe('Permission & Intent Enforcement', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild

	afterEach(async () => {
		await destroyClient(client)
		client = null
	})

	describe('PermissionsBitField with Mock Integration', () => {
		beforeEach(async () => {
			session = await createSession({
				name: 'permissions-tests',
				config: {
					guilds: [
						{
							name: 'Permission Test Guild',
							channels: [{ name: 'general', type: ChannelType.GuildText }]
						}
					],
					permissionEnforcement: 'basic'
				}
			})

			client = createTestClient()
			await client.login(session.token)
			await waitForReady(client)
			guild = client.guilds.cache.first()!
		})

		it('should check permissions with checkAdmin parameter on mock-provided roles', () => {
			// Get bot's permissions from mock-provided guild/channel
			const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText)

			if (!channel || !channel.permissionsFor) {
				return
			}

			const botPerms = channel.permissionsFor(client!.user!)

			if (!botPerms) {
				return
			}

			// Test checkAdmin parameter on mock-computed permissions
			// If bot has Administrator, checkAdmin=true should grant all permissions
			const hasAdmin = botPerms.has(PermissionFlagsBits.Administrator)

			if (hasAdmin) {
				// With checkAdmin=true (default), admin should have all permissions
				expect(botPerms.has(PermissionFlagsBits.ManageGuild, true)).toBe(true)
				expect(botPerms.has(PermissionFlagsBits.BanMembers, true)).toBe(true)

				// With checkAdmin=false, should only return true for permissions actually set
				expect(botPerms.has(PermissionFlagsBits.Administrator, false)).toBe(true)
			} else {
				// Without admin, test that checkAdmin doesn't magically grant permissions
				const hasManageGuild = botPerms.has(PermissionFlagsBits.ManageGuild, false)
				expect(botPerms.has(PermissionFlagsBits.ManageGuild, true)).toBe(hasManageGuild)
			}
		})

		it('should use any() method to check if any permissions match on mock channels', () => {
			const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText)

			if (!channel || !channel.permissionsFor) {
				return
			}

			const botPerms = channel.permissionsFor(client!.user!)

			if (!botPerms) {
				return
			}

			// Check if bot has ANY of these permissions
			const hasAny = botPerms.any([
				PermissionFlagsBits.SendMessages,
				PermissionFlagsBits.ManageGuild,
				PermissionFlagsBits.Administrator
			])

			expect(hasAny).toBe(true)
		})

		it('should use missing() to identify permission gaps in bot permissions on mock channels', () => {
			// Get bot's permissions from mock-provided channel
			const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText)

			if (!channel || !channel.permissionsFor) {
				return
			}

			const botPerms = channel.permissionsFor(client!.user!)

			if (!botPerms) {
				return
			}

			// Check what elevated permissions the bot is missing from mock's permission calculation
			const missing = botPerms.missing([
				PermissionFlagsBits.ViewChannel,
				PermissionFlagsBits.SendMessages,
				PermissionFlagsBits.Administrator,
				PermissionFlagsBits.ManageGuild,
				PermissionFlagsBits.BanMembers
			])

			// Verify missing() returns permission names as strings
			expect(Array.isArray(missing)).toBe(true)

			// Bot should likely be missing some elevated permissions
			// The exact permissions depend on mock's role configuration
			for (const perm of missing) {
				expect(typeof perm).toBe('string')
				// Verify the bot actually doesn't have these permissions
				expect(botPerms.has(PermissionFlagsBits[perm as keyof typeof PermissionFlagsBits])).toBe(false)
			}
		})

		it('should check permissions with has() array parameter on mock-computed permissions', () => {
			// Get bot's permissions from mock-provided channel
			const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText)

			if (!channel || !channel.permissionsFor) {
				return
			}

			const botPerms = channel.permissionsFor(client!.user!)

			if (!botPerms) {
				return
			}

			// Test has() with array on mock-computed permissions
			// Bot should have basic text channel permissions
			const hasBasicPerms = botPerms.has([
				PermissionFlagsBits.ViewChannel,
				PermissionFlagsBits.SendMessages
			])

			// Verify individual permissions match array check
			const hasView = botPerms.has(PermissionFlagsBits.ViewChannel)
			const hasSend = botPerms.has(PermissionFlagsBits.SendMessages)

			expect(hasBasicPerms).toBe(hasView && hasSend)

			// Test that has() with array returns false if any permission is missing
			const hasWithMissing = botPerms.has([
				PermissionFlagsBits.ViewChannel,
				PermissionFlagsBits.Administrator // Likely missing
			])

			// If bot doesn't have admin, this should be false
			if (!botPerms.has(PermissionFlagsBits.Administrator)) {
				expect(hasWithMissing).toBe(false)
			}
		})

		it('should validate mock computes permissions correctly for different channels', () => {
			// Test that mock computes different permissions for different channel types
			const textChannel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText)

			if (!textChannel || !textChannel.permissionsFor) {
				return
			}

			const textPerms = textChannel.permissionsFor(client!.user!)

			if (!textPerms) {
				return
			}

			// Bot should be able to view the channel (otherwise it wouldn't be in cache)
			expect(textPerms.has(PermissionFlagsBits.ViewChannel)).toBe(true)

			// Verify permissions are returned as a PermissionsBitField
			expect(textPerms).toBeInstanceOf(PermissionsBitField)

			// Verify bitfield value is a bigint
			expect(typeof textPerms.bitfield).toBe('bigint')
		})

		it('should validate mock role permissions are accessible', () => {
			// Test that mock provides role permissions
			const everyoneRole = guild.roles.cache.find((r) => r.name === '@everyone')

			if (!everyoneRole) {
				return
			}

			// Everyone role should exist with permissions
			expect(everyoneRole.permissions).toBeDefined()
			expect(everyoneRole.permissions).toBeInstanceOf(PermissionsBitField)

			// Verify we can check permissions on mock-provided roles
			const canSendMessages = everyoneRole.permissions.has(PermissionFlagsBits.SendMessages)
			expect(typeof canSendMessages).toBe('boolean')
		})
	})

	describe('IntentsBitField with Mock Integration', () => {
		it('should filter events based on intents configuration', async () => {
			// Create session with enforced intents
			session = await createSession({
				name: 'intents-filtering',
				config: {
					guilds: [
						{
							name: 'Intent Test Guild',
							channels: [{ name: 'general', type: ChannelType.GuildText }]
						}
					],
					enforceIntents: true
				}
			})

			// Create client WITHOUT GuildMessages intent
			client = createClientWithIntents([GatewayIntentBits.Guilds])
			await client.login(session.token)
			await waitForReady(client)

			const channel = client.channels.cache.first()

			if (!channel || channel.type !== ChannelType.GuildText) {
				return
			}

			// Set up message listener
			let messageReceived = false
			client.on(Events.MessageCreate, () => {
				messageReceived = true
			})

			// Dispatch a message event
			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				channel_id: channel.id,
				content: 'Test message',
				author: {
					id: '123456789',
					username: 'TestUser',
					discriminator: '0001',
					avatar: null
				}
			})

			// Wait a moment for event to potentially arrive
			await new Promise((resolve) => setTimeout(resolve, 500))

			// Should NOT receive message without GuildMessages intent
			expect(messageReceived).toBe(false)
		})

		it('should allow events with correct intents', async () => {
			session = await createSession({
				name: 'intents-allowed',
				config: {
					guilds: [
						{
							name: 'Intent Test Guild',
							channels: [{ name: 'general', type: ChannelType.GuildText }]
						}
					],
					enforceIntents: true,
					approvedPrivilegedIntents: BigInt(GatewayIntentBits.MessageContent)
				}
			})

			// Create client WITH GuildMessages and MessageContent intents
			client = createClientWithIntents([
				GatewayIntentBits.Guilds,
				GatewayIntentBits.GuildMessages,
				GatewayIntentBits.MessageContent
			])
			await client.login(session.token)
			await waitForReady(client)

			const channel = client.channels.cache.first()

			if (!channel || channel.type !== ChannelType.GuildText) {
				return
			}

			// Set up message listener
			const messagePromise = waitForEvent(client, Events.MessageCreate, 5000)

			// Dispatch a message event
			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				channel_id: channel.id,
				content: 'Test message with intents',
				author: {
					id: '123456789',
					username: 'TestUser',
					discriminator: '0001',
					avatar: null
				}
			})

			// Should receive message with correct intent and content
			const message = await messagePromise
			expect(message).toBeDefined()
			expect(message.content).toBe('Test message with intents')
		})

		it('should enforce privileged intents with approvedPrivilegedIntents', async () => {
			// Create session WITHOUT approving MESSAGE_CONTENT intent
			session = await createSession({
				name: 'privileged-intents-blocked',
				config: {
					guilds: [
						{
							name: 'Privileged Intent Test Guild',
							channels: [{ name: 'general', type: ChannelType.GuildText }]
						}
					],
					enforceIntents: true,
					approvedPrivilegedIntents: BigInt(0) // No privileged intents approved
				}
			})

			// Client WITHOUT MESSAGE_CONTENT intent (to avoid connection rejection)
			client = createClientWithIntents([
				GatewayIntentBits.Guilds,
				GatewayIntentBits.GuildMessages
			])
			await client.login(session.token)
			await waitForReady(client)

			const channel = client.channels.cache.first()

			if (!channel || channel.type !== ChannelType.GuildText) {
				return
			}

			const messagePromise = waitForEvent(client, Events.MessageCreate, 5000)

			// Dispatch message with content
			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				channel_id: channel.id,
				content: 'This content should be stripped',
				author: {
					id: '123456789',
					username: 'TestUser',
					discriminator: '0001',
					avatar: null
				}
			})

			const message = await messagePromise

			// Content should be stripped without MESSAGE_CONTENT privilege
			expect(message.content).toBe('')
		})

		it('should allow MESSAGE_CONTENT when approved', async () => {
			// Create session WITH approved MESSAGE_CONTENT intent
			session = await createSession({
				name: 'privileged-intents-allowed',
				config: {
					guilds: [
						{
							name: 'Privileged Intent Test Guild',
							channels: [{ name: 'general', type: ChannelType.GuildText }]
						}
					],
					enforceIntents: true,
					approvedPrivilegedIntents: BigInt(GatewayIntentBits.MessageContent)
				}
			})

			client = createClientWithIntents([
				GatewayIntentBits.Guilds,
				GatewayIntentBits.GuildMessages,
				GatewayIntentBits.MessageContent
			])
			await client.login(session.token)
			await waitForReady(client)

			const channel = client.channels.cache.first()

			if (!channel || channel.type !== ChannelType.GuildText) {
				return
			}

			const messagePromise = waitForEvent(client, Events.MessageCreate, 5000)

			// Dispatch message with content
			await dispatchEvent(session.id, 'MESSAGE_CREATE', {
				channel_id: channel.id,
				content: 'This content should be preserved',
				author: {
					id: '123456789',
					username: 'TestUser',
					discriminator: '0001',
					avatar: null
				}
			})

			const message = await messagePromise

			// Content should be preserved with approved MESSAGE_CONTENT
			expect(message.content).toBe('This content should be preserved')
		})

		it('should filter GUILD_MEMBERS events without proper intent', async () => {
			session = await createSession({
				name: 'guild-members-blocked',
				config: {
					guilds: [
						{
							name: 'Member Intent Test Guild'
						}
					],
					enforceIntents: true,
					approvedPrivilegedIntents: BigInt(0)
				}
			})

			// Client without GUILD_MEMBERS intent
			client = createClientWithIntents([GatewayIntentBits.Guilds])
			await client.login(session.token)
			await waitForReady(client)

			const guildId = client.guilds.cache.first()!.id

			// Try to listen for member events
			let memberJoinReceived = false
			client.on(Events.GuildMemberAdd, () => {
				memberJoinReceived = true
			})

			// Dispatch member join event
			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guildId,
				user: {
					id: '987654321',
					username: 'NewMember',
					discriminator: '0001',
					avatar: null
				},
				roles: [],
				joined_at: new Date().toISOString()
			})

			// Wait for potential event
			await new Promise((resolve) => setTimeout(resolve, 500))

			// Should NOT receive event without GUILD_MEMBERS intent
			expect(memberJoinReceived).toBe(false)
		})
	})
})

/**
 * Interaction Context Types Tests
 *
 * Tests for interaction context types and integration types including
 * contexts, integrationTypes, and authorizingIntegrationOwners.
 */
import {
	ApplicationCommandType,
	ApplicationIntegrationType,
	ChannelType,
	ChatInputCommandInteraction,
	Client,
	Events,
	GatewayIntentBits,
	Interaction,
	InteractionContextType,
	InteractionType,
	TextChannel
} from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForReady } from '../utils/helpers.js'

/**
 * Wait for an interaction event with a filter predicate
 */
function waitForInteraction(
	client: Client,
	predicate: (interaction: Interaction) => boolean,
	timeout = 5000
): Promise<Interaction> {
	return new Promise((resolve, reject) => {
		const timeoutId = setTimeout(() => {
			client.off(Events.InteractionCreate, handler)
			reject(new Error(`Timeout waiting for interaction after ${timeout}ms`))
		}, timeout)

		const handler = (interaction: Interaction) => {
			if (predicate(interaction)) {
				clearTimeout(timeoutId)
				client.off(Events.InteractionCreate, handler)
				resolve(interaction)
			}
		}

		client.on(Events.InteractionCreate, handler)
	})
}

describe('Interaction Context Types', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let channel: TextChannel
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'interaction-contexts',
			config: {
				guilds: [
					{
						name: 'Interaction Contexts Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages])
		await client.login(session.token)
		await waitForReady(client)

		const guild = client.guilds.cache.first()!
		guildId = guild.id
		channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Command Contexts', () => {
		it('should create command with contexts', async () => {
			const command = await client!.application!.commands.create({
				name: 'context_cmd',
				description: 'Context test command',
				contexts: [InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]
			})

			expect(command.contexts).toBeDefined()
			expect(command.contexts).toContain(InteractionContextType.Guild)
			expect(command.contexts).toContain(InteractionContextType.BotDM)
			expect(command.contexts).toContain(InteractionContextType.PrivateChannel)

			// Cleanup
			await command.delete()
		})

		it('should create guild-only command with context', async () => {
			const command = await client!.application!.commands.create({
				name: 'guild_only_ctx',
				description: 'Guild only context',
				contexts: [InteractionContextType.Guild]
			})

			expect(command.contexts).toBeDefined()
			expect(command.contexts?.length).toBe(1)
			expect(command.contexts).toContain(InteractionContextType.Guild)

			await command.delete()
		})
	})

	describe('Integration Types', () => {
		it('should create command with integration types', async () => {
			const command = await client!.application!.commands.create({
				name: 'integration_cmd',
				description: 'Integration type test',
				integrationTypes: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall]
			})

			expect(command.integrationTypes).toBeDefined()
			expect(command.integrationTypes).toContain(ApplicationIntegrationType.GuildInstall)
			expect(command.integrationTypes).toContain(ApplicationIntegrationType.UserInstall)

			await command.delete()
		})

		it('should create user-installable command', async () => {
			const command = await client!.application!.commands.create({
				name: 'user_install_cmd',
				description: 'User installable command',
				integrationTypes: [ApplicationIntegrationType.UserInstall]
			})

			expect(command.integrationTypes).toBeDefined()
			expect(command.integrationTypes?.length).toBe(1)
			expect(command.integrationTypes).toContain(ApplicationIntegrationType.UserInstall)

			await command.delete()
		})
	})

	describe('Interaction Context Property', () => {
		it('should have context in interaction', async () => {
			const interactionId = generateSnowflake()
			const token = `context-${Date.now()}`

			const eventPromise = waitForInteraction(client!, (i) => i.isChatInputCommand() && i.id === interactionId)

			await dispatchEvent(session.id, 'INTERACTION_CREATE', {
				id: interactionId,
				application_id: client!.user!.id,
				type: InteractionType.ApplicationCommand,
				guild_id: guildId,
				channel_id: channel.id,
				channel: {
					id: channel.id,
					type: ChannelType.GuildText,
					name: channel.name,
					guild_id: guildId
				},
				member: {
					user: { id: generateSnowflake(), username: 'TestUser', discriminator: '0', avatar: null },
					roles: [],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				},
				user: { id: generateSnowflake(), username: 'TestUser', discriminator: '0', avatar: null },
				data: {
					id: generateSnowflake(),
					name: 'context_test',
					type: ApplicationCommandType.ChatInput
				},
				context: InteractionContextType.Guild,
				token,
				version: 1
			})

			const interaction = (await eventPromise) as ChatInputCommandInteraction

			expect(interaction.context).toBe(InteractionContextType.Guild)
		})

		it('should have BotDM context for DM interactions', async () => {
			const interactionId = generateSnowflake()
			const token = `dm-context-${Date.now()}`
			const userId = generateSnowflake()

			const eventPromise = waitForInteraction(client!, (i) => i.isChatInputCommand() && i.id === interactionId)

			// Dispatch DM interaction (no guild_id)
			await dispatchEvent(session.id, 'INTERACTION_CREATE', {
				id: interactionId,
				application_id: client!.user!.id,
				type: InteractionType.ApplicationCommand,
				channel_id: channel.id,
				channel: {
					id: channel.id,
					type: ChannelType.DM,
					name: 'DM Channel'
				},
				user: { id: userId, username: 'DMUser', discriminator: '0', avatar: null },
				data: {
					id: generateSnowflake(),
					name: 'dm_context_test',
					type: ApplicationCommandType.ChatInput
				},
				context: InteractionContextType.BotDM,
				token,
				version: 1
			})

			const interaction = (await eventPromise) as ChatInputCommandInteraction

			expect(interaction.context).toBe(InteractionContextType.BotDM)
		})
	})

	describe('Authorizing Integration Owners', () => {
		it('should have authorizingIntegrationOwners', async () => {
			const interactionId = generateSnowflake()
			const token = `auth-${Date.now()}`

			const eventPromise = waitForInteraction(client!, (i) => i.isChatInputCommand() && i.id === interactionId)

			await dispatchEvent(session.id, 'INTERACTION_CREATE', {
				id: interactionId,
				application_id: client!.user!.id,
				type: InteractionType.ApplicationCommand,
				guild_id: guildId,
				channel_id: channel.id,
				channel: {
					id: channel.id,
					type: ChannelType.GuildText,
					name: channel.name,
					guild_id: guildId
				},
				member: {
					user: { id: generateSnowflake(), username: 'TestUser', discriminator: '0', avatar: null },
					roles: [],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				},
				user: { id: generateSnowflake(), username: 'TestUser', discriminator: '0', avatar: null },
				data: {
					id: generateSnowflake(),
					name: 'auth_test',
					type: ApplicationCommandType.ChatInput
				},
				authorizing_integration_owners: {
					'0': guildId // 0 = GuildInstall
				},
				token,
				version: 1
			})

			const interaction = (await eventPromise) as ChatInputCommandInteraction

			expect(interaction.authorizingIntegrationOwners).toBeDefined()
			// The map should contain the guild ID for guild install (key "0")
			if (interaction.authorizingIntegrationOwners) {
				// authorizingIntegrationOwners is an object, not a Map - use bracket notation
				const guildInstallOwner = interaction.authorizingIntegrationOwners[ApplicationIntegrationType.GuildInstall]
				expect(guildInstallOwner).toBe(guildId)
			}
		})

		it('should have user install owner', async () => {
			const interactionId = generateSnowflake()
			const token = `user-auth-${Date.now()}`
			const userId = generateSnowflake()

			const eventPromise = waitForInteraction(client!, (i) => i.isChatInputCommand() && i.id === interactionId)

			await dispatchEvent(session.id, 'INTERACTION_CREATE', {
				id: interactionId,
				application_id: client!.user!.id,
				type: InteractionType.ApplicationCommand,
				guild_id: guildId,
				channel_id: channel.id,
				channel: {
					id: channel.id,
					type: ChannelType.GuildText,
					name: channel.name,
					guild_id: guildId
				},
				member: {
					user: { id: userId, username: 'InstallUser', discriminator: '0', avatar: null },
					roles: [],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				},
				user: { id: userId, username: 'InstallUser', discriminator: '0', avatar: null },
				data: {
					id: generateSnowflake(),
					name: 'user_auth_test',
					type: ApplicationCommandType.ChatInput
				},
				authorizing_integration_owners: {
					'1': userId // 1 = UserInstall
				},
				token,
				version: 1
			})

			const interaction = (await eventPromise) as ChatInputCommandInteraction

			expect(interaction.authorizingIntegrationOwners).toBeDefined()
			if (interaction.authorizingIntegrationOwners) {
				// authorizingIntegrationOwners is an object, not a Map - use bracket notation
				const userInstallOwner = interaction.authorizingIntegrationOwners[ApplicationIntegrationType.UserInstall]
				expect(userInstallOwner).toBe(userId)
			}
		})
	})
})

/**
 * Command Localizations Tests
 *
 * Tests for application command localization support including
 * name localizations, description localizations, option localizations,
 * and choice localizations.
 */
import {
	ApplicationCommandOptionType,
	ApplicationCommandType,
	ChannelType,
	ChatInputCommandInteraction,
	Client,
	Events,
	GatewayIntentBits,
	Interaction,
	InteractionType,
	TextChannel
} from 'discord.js'
import type { APIApplicationCommandOptionChoice } from 'discord-api-types/v10'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForEvent, waitForReady } from '../utils/helpers.js'

describe('Command Localizations', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guildId: string
	let channelId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'command-localizations-tests',
			config: {
				guilds: [
					{
						name: 'Command Localizations Guild',
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
		const channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
		channelId = channel.id
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('name localizations', () => {
		it('should create command with name localizations', async () => {
			const command = await client!.application!.commands.create({
				name: 'greet',
				description: 'Greet someone',
				nameLocalizations: {
					de: 'gruessen',
					fr: 'saluer',
					'es-ES': 'saludar'
				}
			})

			expect(command.nameLocalizations?.de).toBe('gruessen')
			expect(command.nameLocalizations?.fr).toBe('saluer')
			expect(command.nameLocalizations?.['es-ES']).toBe('saludar')

			// Cleanup
			await command.delete()
		})
	})

	describe('description localizations', () => {
		it('should create command with description localizations', async () => {
			const command = await client!.application!.commands.create({
				name: 'help',
				description: 'Get help',
				descriptionLocalizations: {
					de: 'Hilfe bekommen',
					fr: "Obtenir de l'aide",
					ja: 'ヘルプを取得'
				}
			})

			expect(command.descriptionLocalizations?.de).toBe('Hilfe bekommen')
			expect(command.descriptionLocalizations?.ja).toBe('ヘルプを取得')

			// Cleanup
			await command.delete()
		})
	})

	describe('option localizations', () => {
		it('should create option with localizations', async () => {
			const command = await client!.application!.commands.create({
				name: 'echo',
				description: 'Echo a message',
				options: [
					{
						type: ApplicationCommandOptionType.String,
						name: 'message',
						description: 'The message to echo',
						nameLocalizations: {
							de: 'nachricht',
							fr: 'message'
						},
						descriptionLocalizations: {
							de: 'Die Nachricht zum Echo',
							fr: 'Le message à faire écho'
						},
						required: true
					}
				]
			})

			const option = command.options[0]
			expect(option.nameLocalizations?.de).toBe('nachricht')
			expect(option.descriptionLocalizations?.de).toBe('Die Nachricht zum Echo')

			// Cleanup
			await command.delete()
		})
	})

	describe('choice localizations', () => {
		it('should create choice with localizations', async () => {
			const command = await client!.application!.commands.create({
				name: 'color',
				description: 'Pick a color',
				options: [
					{
						type: ApplicationCommandOptionType.String,
						name: 'color',
						description: 'The color',
						choices: [
							{
								name: 'Red',
								value: 'red',
								nameLocalizations: { de: 'Rot', fr: 'Rouge' }
							},
							{
								name: 'Blue',
								value: 'blue',
								nameLocalizations: { de: 'Blau', fr: 'Bleu' }
							}
						]
					}
				]
			})

			const choices = (command.options[0] as unknown as { choices?: APIApplicationCommandOptionChoice<string>[] }).choices
			expect(choices?.[0].name_localizations?.de).toBe('Rot')
			expect(choices?.[1].name_localizations?.fr).toBe('Bleu')

			// Cleanup
			await command.delete()
		})
	})

	describe('interaction locale', () => {
		it('should have locale and guildLocale from interaction', async () => {
			const interactionId = generateSnowflake()
			const userId = generateSnowflake()

			const eventPromise = waitForEvent<ChatInputCommandInteraction>(
				client!,
				Events.InteractionCreate,
				5000,
				(i) => (i as Interaction).isChatInputCommand()
			)

			await dispatchEvent(session.id, 'INTERACTION_CREATE', {
				id: interactionId,
				application_id: client!.user!.id,
				type: InteractionType.ApplicationCommand,
				guild_id: guildId,
				channel_id: channelId,
				channel: {
					id: channelId,
					type: ChannelType.GuildText
				},
				member: {
					user: { id: userId, username: 'LocaleUser', discriminator: '0', avatar: null },
					roles: [],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				},
				user: { id: userId, username: 'LocaleUser', discriminator: '0', avatar: null },
				data: {
					id: generateSnowflake(),
					name: 'testcommand',
					type: ApplicationCommandType.ChatInput
				},
				locale: 'de',
				guild_locale: 'en-US',
				token: `locale-token-${Date.now()}`,
				version: 1,
				app_permissions: '0',
				entitlements: []
			})

			const interaction = await eventPromise

			expect(interaction.locale).toBe('de')
			expect(interaction.guildLocale).toBe('en-US')
		})

		it('should have different locale values', async () => {
			const interactionId = generateSnowflake()
			const userId = generateSnowflake()

			const eventPromise = waitForEvent<ChatInputCommandInteraction>(
				client!,
				Events.InteractionCreate,
				5000,
				(i) => (i as Interaction).isChatInputCommand()
			)

			await dispatchEvent(session.id, 'INTERACTION_CREATE', {
				id: interactionId,
				application_id: client!.user!.id,
				type: InteractionType.ApplicationCommand,
				guild_id: guildId,
				channel_id: channelId,
				channel: {
					id: channelId,
					type: ChannelType.GuildText
				},
				member: {
					user: { id: userId, username: 'JapaneseUser', discriminator: '0', avatar: null },
					roles: [],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
				},
				user: { id: userId, username: 'JapaneseUser', discriminator: '0', avatar: null },
				data: {
					id: generateSnowflake(),
					name: 'testcommand2',
					type: ApplicationCommandType.ChatInput
				},
				locale: 'ja',
				guild_locale: 'ja',
				token: `locale-token-ja-${Date.now()}`,
				version: 1,
				app_permissions: '0',
				entitlements: []
			})

			const interaction = await eventPromise

			expect(interaction.locale).toBe('ja')
			expect(interaction.guildLocale).toBe('ja')
		})
	})
})

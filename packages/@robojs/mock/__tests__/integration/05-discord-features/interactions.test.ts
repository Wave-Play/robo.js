/**
 * Interactions Tests
 *
 * Tests for application commands and interaction handling.
 */
import {
	ApplicationCommandOptionType,
	ApplicationCommandType,
	Client
} from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Interactions', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'interaction-tests',
			config: {
				guilds: [{ name: 'Interaction Test Guild' }]
			}
		})

		client = createTestClient()
		await client.login(session.token)
		await waitForReady(client)

		guildId = client.guilds.cache.first()!.id
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Global Commands', () => {
		it('should register global slash command', async () => {
			const command = await client!.application!.commands.create({
				name: 'test',
				description: 'Test command'
			})

			expect(command.name).toBe('test')
			expect(command.id).toMatch(/^\d{17,19}$/)

			await command.delete()
		})

		it('should register command with string option', async () => {
			const command = await client!.application!.commands.create({
				name: 'options',
				description: 'Command with options',
				options: [
					{
						type: ApplicationCommandOptionType.String,
						name: 'text',
						description: 'Text input',
						required: true
					}
				]
			})

			expect(command.options.length).toBe(1)
			expect(command.options[0].name).toBe('text')
			expect(command.options[0].type).toBe(ApplicationCommandOptionType.String)

			await command.delete()
		})

		it('should register command with multiple options', async () => {
			const command = await client!.application!.commands.create({
				name: 'multi',
				description: 'Multiple options',
				options: [
					{
						type: ApplicationCommandOptionType.String,
						name: 'text',
						description: 'Text input',
						required: true
					},
					{
						type: ApplicationCommandOptionType.Integer,
						name: 'number',
						description: 'Number input',
						minValue: 1,
						maxValue: 100
					},
					{
						type: ApplicationCommandOptionType.User,
						name: 'user',
						description: 'User input'
					}
				]
			})

			expect(command.options.length).toBe(3)

			await command.delete()
		})

		it('should register command with choices', async () => {
			const command = await client!.application!.commands.create({
				name: 'choices',
				description: 'Command with choices',
				options: [
					{
						type: ApplicationCommandOptionType.String,
						name: 'color',
						description: 'Select a color',
						choices: [
							{ name: 'Red', value: 'red' },
							{ name: 'Blue', value: 'blue' },
							{ name: 'Green', value: 'green' }
						]
					}
				]
			})

			const option = command.options[0] as { choices?: { name: string; value: string }[] }
			expect(option.choices?.length).toBe(3)

			await command.delete()
		})

		it('should register subcommand group', async () => {
			const command = await client!.application!.commands.create({
				name: 'parent',
				description: 'Parent command',
				options: [
					{
						type: ApplicationCommandOptionType.SubcommandGroup,
						name: 'group',
						description: 'Subcommand group',
						options: [
							{
								type: ApplicationCommandOptionType.Subcommand,
								name: 'sub',
								description: 'Subcommand'
							}
						]
					}
				]
			})

			expect(command.options[0].type).toBe(ApplicationCommandOptionType.SubcommandGroup)

			await command.delete()
		})

		it('should register context menu command - user', async () => {
			const command = await client!.application!.commands.create({
				name: 'User Info',
				type: ApplicationCommandType.User
			})

			expect(command.type).toBe(ApplicationCommandType.User)

			await command.delete()
		})

		it('should register context menu command - message', async () => {
			const command = await client!.application!.commands.create({
				name: 'Translate Message',
				type: ApplicationCommandType.Message
			})

			expect(command.type).toBe(ApplicationCommandType.Message)

			await command.delete()
		})
	})

	describe('Guild Commands', () => {
		it('should register guild slash command', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			const command = await guild.commands.create({
				name: 'guildtest',
				description: 'Guild test command'
			})

			expect(command.name).toBe('guildtest')
			expect(command.guildId).toBe(guildId)

			await command.delete()
		})

		it('should fetch guild commands', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			const command = await guild.commands.create({
				name: 'fetchtest',
				description: 'Fetch test'
			})

			const commands = await guild.commands.fetch()
			expect(commands.has(command.id)).toBe(true)

			await command.delete()
		})
	})

	describe('Command Management', () => {
		it('should edit command', async () => {
			const command = await client!.application!.commands.create({
				name: 'edit',
				description: 'Edit test'
			})

			await command.edit({ description: 'Updated description' })
			expect(command.description).toBe('Updated description')

			await command.delete()
		})

		it('should delete command', async () => {
			const command = await client!.application!.commands.create({
				name: 'delete',
				description: 'Delete test'
			})
			const commandId = command.id

			await command.delete()

			const commands = await client!.application!.commands.fetch()
			expect(commands.has(commandId)).toBe(false)
		})

		it('should fetch all global commands', async () => {
			const commands = await client!.application!.commands.fetch()
			expect(commands).toBeDefined()
		})

		it('should fetch specific command', async () => {
			const command = await client!.application!.commands.create({
				name: 'fetchone',
				description: 'Fetch one test'
			})

			const fetched = await client!.application!.commands.fetch(command.id)
			expect(fetched.id).toBe(command.id)

			await command.delete()
		})
	})

	describe('Command Options', () => {
		it('should register command with autocomplete', async () => {
			const command = await client!.application!.commands.create({
				name: 'autocomplete',
				description: 'Autocomplete test',
				options: [
					{
						type: ApplicationCommandOptionType.String,
						name: 'query',
						description: 'Search query',
						autocomplete: true
					}
				]
			})

			expect(command.options[0].autocomplete).toBe(true)

			await command.delete()
		})

		it('should register command with channel types', async () => {
			const command = await client!.application!.commands.create({
				name: 'channelopt',
				description: 'Channel option test',
				options: [
					{
						type: ApplicationCommandOptionType.Channel,
						name: 'channel',
						description: 'Select a channel',
						channelTypes: [0, 2] // GuildText, GuildVoice
					}
				]
			})

			const option = command.options[0] as { channelTypes?: number[] }
			expect(option.channelTypes).toContain(0)
			expect(option.channelTypes).toContain(2)

			await command.delete()
		})

		it('should register command with min/max length', async () => {
			const command = await client!.application!.commands.create({
				name: 'length',
				description: 'Length test',
				options: [
					{
						type: ApplicationCommandOptionType.String,
						name: 'text',
						description: 'Text with length limits',
						minLength: 5,
						maxLength: 100
					}
				]
			})

			const option = command.options[0] as { minLength?: number; maxLength?: number }
			expect(option.minLength).toBe(5)
			expect(option.maxLength).toBe(100)

			await command.delete()
		})

		it('should register command with number min/max', async () => {
			const command = await client!.application!.commands.create({
				name: 'numberopt',
				description: 'Number test',
				options: [
					{
						type: ApplicationCommandOptionType.Number,
						name: 'value',
						description: 'Number value',
						minValue: 0.5,
						maxValue: 10.5
					}
				]
			})

			const option = command.options[0] as { minValue?: number; maxValue?: number }
			expect(option.minValue).toBe(0.5)
			expect(option.maxValue).toBe(10.5)

			await command.delete()
		})
	})

	describe('Bulk Command Operations', () => {
		it('should set multiple commands at once', async () => {
			await client!.application!.commands.set([
				{ name: 'bulk1', description: 'Bulk command 1' },
				{ name: 'bulk2', description: 'Bulk command 2' },
				{ name: 'bulk3', description: 'Bulk command 3' }
			])

			const commands = await client!.application!.commands.fetch()

			const hasAllCommands =
				commands.some((c) => c.name === 'bulk1') &&
				commands.some((c) => c.name === 'bulk2') &&
				commands.some((c) => c.name === 'bulk3')

			expect(hasAllCommands).toBe(true)

			// Clean up
			for (const command of commands.values()) {
				if (command.name.startsWith('bulk')) {
					await command.delete()
				}
			}
		})

		it('should set guild commands', async () => {
			const guild = client!.guilds.cache.get(guildId)!

			await guild.commands.set([
				{ name: 'guildbulk1', description: 'Guild bulk 1' },
				{ name: 'guildbulk2', description: 'Guild bulk 2' }
			])

			const commands = await guild.commands.fetch()

			const hasAllCommands =
				commands.some((c) => c.name === 'guildbulk1') &&
				commands.some((c) => c.name === 'guildbulk2')

			expect(hasAllCommands).toBe(true)

			// Clean up
			for (const command of commands.values()) {
				if (command.name.startsWith('guildbulk')) {
					await command.delete()
				}
			}
		})
	})

	describe('Command Properties', () => {
		it('should have correct application ID', async () => {
			const command = await client!.application!.commands.create({
				name: 'appid',
				description: 'App ID test'
			})

			expect(command.applicationId).toBe(client!.application!.id)

			await command.delete()
		})

		it('should have default permission enabled', async () => {
			const command = await client!.application!.commands.create({
				name: 'defperm',
				description: 'Default permission test'
			})

			// By default, commands should be usable by everyone
			expect(command.defaultMemberPermissions).toBeNull()

			await command.delete()
		})

		it('should set DM permission', async () => {
			const command = await client!.application!.commands.create({
				name: 'dmtest',
				description: 'DM test',
				dmPermission: false
			})

			expect(command.dmPermission).toBe(false)

			await command.delete()
		})

		it('should set default member permissions', async () => {
			const command = await client!.application!.commands.create({
				name: 'memberperm',
				description: 'Member permission test',
				defaultMemberPermissions: ['Administrator']
			})

			expect(command.defaultMemberPermissions?.has('Administrator')).toBe(true)

			await command.delete()
		})

		it('should mark command as NSFW', async () => {
			const command = await client!.application!.commands.create({
				name: 'nsfw',
				description: 'NSFW test',
				nsfw: true
			})

			expect(command.nsfw).toBe(true)

			await command.delete()
		})
	})
})

/**
 * Application Command Registration Tests
 * Tests for Discord application command management and state operations
 */
import { createSessionState, createDefaultGuildWithChannel, MockServerState } from '../src/session/state.js'
import { mockCommandToAPICommand } from '../src/discord/payloads.js'
import type { MockApplicationCommandConfig } from '../src/types/index.js'
import { ApplicationCommandType, ApplicationCommandOptionType, CommandLimits } from '../src/types/index.js'

describe('Application Commands', () => {
	describe('Command creation', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should create a global CHAT_INPUT command with default type', () => {
			const command = sessionState.createCommand({
				name: 'ping',
				description: 'A simple ping command'
			})

			expect(command).toBeDefined()
			expect(command?.name).toBe('ping')
			expect(command?.description).toBe('A simple ping command')
			expect(command?.type).toBe(ApplicationCommandType.ChatInput)
			expect(command?.guild_id).toBeUndefined()
			expect(command?.application_id).toBe(sessionState.applicationId)
		})

		it('should create a guild command', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			const command = sessionState.createCommand(
				{
					name: 'server-info',
					description: 'Get server information'
				},
				guild.id
			)

			expect(command).toBeDefined()
			expect(command?.guild_id).toBe(guild.id)
		})

		it('should create a USER context menu command', () => {
			const command = sessionState.createCommand({
				name: 'Get User Info',
				type: ApplicationCommandType.User
			})

			expect(command).toBeDefined()
			expect(command?.type).toBe(ApplicationCommandType.User)
			expect(command?.description).toBe('') // USER/MESSAGE commands have empty description
		})

		it('should create a MESSAGE context menu command', () => {
			const command = sessionState.createCommand({
				name: 'Report Message',
				type: ApplicationCommandType.Message
			})

			expect(command).toBeDefined()
			expect(command?.type).toBe(ApplicationCommandType.Message)
		})

		it('should create command with options', () => {
			const command = sessionState.createCommand({
				name: 'echo',
				description: 'Echo a message',
				options: [
					{
						type: ApplicationCommandOptionType.String,
						name: 'message',
						description: 'The message to echo',
						required: true
					},
					{
						type: ApplicationCommandOptionType.Boolean,
						name: 'ephemeral',
						description: 'Make the response ephemeral',
						required: false
					}
				]
			})

			expect(command).toBeDefined()
			expect(command?.options).toHaveLength(2)
			expect(command?.options?.[0].name).toBe('message')
			expect(command?.options?.[1].name).toBe('ephemeral')
		})

		it('should lowercase CHAT_INPUT command names', () => {
			const command = sessionState.createCommand({
				name: 'MyCommand',
				description: 'Test command'
			})

			expect(command?.name).toBe('mycommand')
		})

		it('should preserve case for USER/MESSAGE commands', () => {
			const command = sessionState.createCommand({
				name: 'Get Info',
				type: ApplicationCommandType.User
			})

			expect(command?.name).toBe('Get Info')
		})

		it('should store command in session state', () => {
			const command = sessionState.createCommand({
				name: 'test',
				description: 'Test command'
			})

			const retrieved = sessionState.getCommand(command!.id)
			expect(retrieved).toBeDefined()
			expect(retrieved?.id).toBe(command?.id)
		})

		it('should generate unique command ID', () => {
			const command1 = sessionState.createCommand({
				name: 'cmd1',
				description: 'Command 1'
			})
			const command2 = sessionState.createCommand({
				name: 'cmd2',
				description: 'Command 2'
			})

			expect(command1?.id).not.toBe(command2?.id)
		})

		it('should generate version snowflake', () => {
			const command = sessionState.createCommand({
				name: 'test',
				description: 'Test'
			})

			expect(command?.version).toBeDefined()
			expect(typeof command?.version).toBe('string')
		})
	})

	describe('Command validation', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should reject empty command name', () => {
			const command = sessionState.createCommand({
				name: '',
				description: 'Test'
			})

			expect(command).toBeNull()
		})

		it('should reject command name exceeding max length', () => {
			const longName = 'a'.repeat(CommandLimits.MAX_NAME_LENGTH + 1)
			const command = sessionState.createCommand({
				name: longName,
				description: 'Test'
			})

			expect(command).toBeNull()
		})

		it('should reject CHAT_INPUT without description', () => {
			const command = sessionState.createCommand({
				name: 'test'
				// missing description
			})

			expect(command).toBeNull()
		})

		it('should reject empty description for CHAT_INPUT', () => {
			const command = sessionState.createCommand({
				name: 'test',
				description: ''
			})

			expect(command).toBeNull()
		})

		it('should reject description exceeding max length', () => {
			const longDesc = 'a'.repeat(CommandLimits.MAX_DESCRIPTION_LENGTH + 1)
			const command = sessionState.createCommand({
				name: 'test',
				description: longDesc
			})

			expect(command).toBeNull()
		})

		it('should reject duplicate command name in same scope', () => {
			sessionState.createCommand({
				name: 'duplicate',
				description: 'First command'
			})

			const duplicate = sessionState.createCommand({
				name: 'duplicate',
				description: 'Second command'
			})

			expect(duplicate).toBeNull()
		})

		it('should allow same name in different scopes', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			const globalCmd = sessionState.createCommand({
				name: 'shared',
				description: 'Global command'
			})

			const guildCmd = sessionState.createCommand(
				{
					name: 'shared',
					description: 'Guild command'
				},
				guild.id
			)

			expect(globalCmd).toBeDefined()
			expect(guildCmd).toBeDefined()
		})

		it('should reject command with invalid name pattern', () => {
			const command = sessionState.createCommand({
				name: 'has spaces',
				description: 'Invalid'
			})

			expect(command).toBeNull()
		})

		it('should reject too many options', () => {
			const options = Array.from({ length: CommandLimits.MAX_OPTIONS + 1 }, (_, i) => ({
				type: ApplicationCommandOptionType.String,
				name: `option${i}`,
				description: `Option ${i}`
			}))

			const command = sessionState.createCommand({
				name: 'test',
				description: 'Too many options',
				options
			})

			expect(command).toBeNull()
		})
	})

	describe('Command retrieval', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should get global commands', () => {
			sessionState.createCommand({ name: 'global1', description: 'G1' })
			sessionState.createCommand({ name: 'global2', description: 'G2' })

			const guild = createDefaultGuildWithChannel(sessionState)
			sessionState.createCommand({ name: 'guild1', description: 'Guild' }, guild.id)

			const globalCommands = sessionState.getGlobalCommands()
			expect(globalCommands).toHaveLength(2)
			expect(globalCommands.every((c) => c.guild_id === undefined)).toBe(true)
		})

		it('should get guild commands', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			sessionState.createCommand({ name: 'global', description: 'Global' })
			sessionState.createCommand({ name: 'guild1', description: 'G1' }, guild.id)
			sessionState.createCommand({ name: 'guild2', description: 'G2' }, guild.id)

			const guildCommands = sessionState.getGuildCommands(guild.id)
			expect(guildCommands).toHaveLength(2)
			expect(guildCommands.every((c) => c.guild_id === guild.id)).toBe(true)
		})

		it('should find command by name in global scope', () => {
			sessionState.createCommand({ name: 'findme', description: 'Find' })

			const found = sessionState.findCommandByName('findme', undefined)
			expect(found).toBeDefined()
			expect(found?.name).toBe('findme')
		})

		it('should find command by name in guild scope', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			sessionState.createCommand({ name: 'findme', description: 'Find' }, guild.id)

			const found = sessionState.findCommandByName('findme', guild.id)
			expect(found).toBeDefined()
			expect(found?.guild_id).toBe(guild.id)
		})

		it('should return undefined for non-existent command', () => {
			const found = sessionState.getCommand('nonexistent')
			expect(found).toBeUndefined()
		})
	})

	describe('Command updates', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should update command name', () => {
			const command = sessionState.createCommand({
				name: 'original',
				description: 'Test'
			})

			const updated = sessionState.updateCommand(command!.id, {
				name: 'renamed'
			})

			expect(updated?.name).toBe('renamed')
		})

		it('should update command description', () => {
			const command = sessionState.createCommand({
				name: 'test',
				description: 'Original description'
			})

			const updated = sessionState.updateCommand(command!.id, {
				description: 'Updated description'
			})

			expect(updated?.description).toBe('Updated description')
		})

		it('should update command options', () => {
			const command = sessionState.createCommand({
				name: 'test',
				description: 'Test'
			})

			const updated = sessionState.updateCommand(command!.id, {
				options: [
					{
						type: ApplicationCommandOptionType.String,
						name: 'newopt',
						description: 'New option'
					}
				]
			})

			expect(updated?.options).toHaveLength(1)
			expect(updated?.options?.[0].name).toBe('newopt')
		})

		it('should update version on any change', () => {
			const command = sessionState.createCommand({
				name: 'test',
				description: 'Test'
			})
			const originalVersion = command!.version

			const updated = sessionState.updateCommand(command!.id, {
				description: 'Changed'
			})

			expect(updated?.version).not.toBe(originalVersion)
		})

		it('should reject update with duplicate name', () => {
			sessionState.createCommand({ name: 'existing', description: 'First' })
			const command = sessionState.createCommand({ name: 'second', description: 'Second' })

			const updated = sessionState.updateCommand(command!.id, {
				name: 'existing'
			})

			expect(updated).toBeNull()
		})

		it('should return null for non-existent command', () => {
			const updated = sessionState.updateCommand('nonexistent', {
				description: 'Update'
			})

			expect(updated).toBeNull()
		})
	})

	describe('Command deletion', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should delete a command', () => {
			const command = sessionState.createCommand({
				name: 'todelete',
				description: 'Will be deleted'
			})

			const deleted = sessionState.deleteCommand(command!.id)
			expect(deleted).toBe(true)

			const retrieved = sessionState.getCommand(command!.id)
			expect(retrieved).toBeUndefined()
		})

		it('should return false for non-existent command', () => {
			const deleted = sessionState.deleteCommand('nonexistent')
			expect(deleted).toBe(false)
		})
	})

	describe('Bulk overwrite', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should replace all global commands', () => {
			// Create initial commands
			sessionState.createCommand({ name: 'old1', description: 'Old 1' })
			sessionState.createCommand({ name: 'old2', description: 'Old 2' })

			// Bulk overwrite
			const newCommands = sessionState.bulkOverwriteCommands([
				{ name: 'new1', description: 'New 1' },
				{ name: 'new2', description: 'New 2' },
				{ name: 'new3', description: 'New 3' }
			])

			expect(newCommands).toHaveLength(3)

			const globalCommands = sessionState.getGlobalCommands()
			expect(globalCommands).toHaveLength(3)
			expect(globalCommands.map((c) => c.name).sort()).toEqual(['new1', 'new2', 'new3'])
		})

		it('should replace only guild commands in scope', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			// Create initial commands
			sessionState.createCommand({ name: 'global', description: 'Global' })
			sessionState.createCommand({ name: 'guild-old', description: 'Old' }, guild.id)

			// Bulk overwrite guild commands
			sessionState.bulkOverwriteCommands(
				[{ name: 'guild-new', description: 'New' }],
				guild.id
			)

			// Global should be unchanged
			expect(sessionState.getGlobalCommands()).toHaveLength(1)
			expect(sessionState.getGlobalCommands()[0].name).toBe('global')

			// Guild should have only new command
			expect(sessionState.getGuildCommands(guild.id)).toHaveLength(1)
			expect(sessionState.getGuildCommands(guild.id)[0].name).toBe('guild-new')
		})

		it('should reject duplicate names in bulk', () => {
			const result = sessionState.bulkOverwriteCommands([
				{ name: 'duplicate', description: 'First' },
				{ name: 'duplicate', description: 'Second' }
			])

			expect(result).toBeNull()
		})

		it('should reject if exceeds command limit', () => {
			const commands: MockApplicationCommandConfig[] = Array.from(
				{ length: CommandLimits.MAX_GLOBAL_COMMANDS + 1 },
				(_, i) => ({
					name: `cmd${i}`,
					description: `Command ${i}`
				})
			)

			const result = sessionState.bulkOverwriteCommands(commands)
			expect(result).toBeNull()
		})

		it('should clear all commands with empty array', () => {
			sessionState.createCommand({ name: 'test1', description: 'T1' })
			sessionState.createCommand({ name: 'test2', description: 'T2' })

			sessionState.bulkOverwriteCommands([])

			expect(sessionState.getGlobalCommands()).toHaveLength(0)
		})
	})

	describe('Payload conversion', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should convert command to API format', () => {
			const command = sessionState.createCommand({
				name: 'test',
				description: 'Test command',
				options: [
					{
						type: ApplicationCommandOptionType.String,
						name: 'arg',
						description: 'An argument'
					}
				]
			})

			const api = mockCommandToAPICommand(command!)

			expect(api.id).toBe(command!.id)
			expect(api.name).toBe('test')
			expect(api.description).toBe('Test command')
			expect(api.type).toBe(ApplicationCommandType.ChatInput)
			expect(api.application_id).toBe(sessionState.applicationId)
			expect(api.version).toBe(command!.version)
			expect(api.options).toHaveLength(1)
		})

		it('should include guild_id for guild commands', () => {
			const guild = createDefaultGuildWithChannel(sessionState)
			const command = sessionState.createCommand(
				{ name: 'guild-cmd', description: 'Guild' },
				guild.id
			)

			const api = mockCommandToAPICommand(command!)

			expect(api.guild_id).toBe(guild.id)
		})

		it('should omit undefined optional fields', () => {
			const command = sessionState.createCommand({
				name: 'minimal',
				description: 'Minimal command'
			})

			const api = mockCommandToAPICommand(command!)

			expect(api).not.toHaveProperty('guild_id')
			expect(api).not.toHaveProperty('options')
			expect(api).not.toHaveProperty('nsfw')
		})

		it('should include optional fields when defined', () => {
			const command = sessionState.createCommand({
				name: 'full',
				description: 'Full command',
				dm_permission: false,
				nsfw: true,
				default_member_permissions: '8'
			})

			const api = mockCommandToAPICommand(command!)

			expect(api.dm_permission).toBe(false)
			expect(api.nsfw).toBe(true)
			expect(api.default_member_permissions).toBe('8')
		})
	})

	describe('Command limits', () => {
		let sessionState: MockServerState

		beforeEach(() => {
			sessionState = createSessionState({
				botUser: { username: 'TestBot', bot: true }
			})
		})

		it('should enforce global command limit', () => {
			// Create maximum allowed commands
			for (let i = 0; i < CommandLimits.MAX_GLOBAL_COMMANDS; i++) {
				sessionState.createCommand({
					name: `cmd${i}`,
					description: `Command ${i}`
				})
			}

			// Try to create one more
			const overflow = sessionState.createCommand({
				name: 'overflow',
				description: 'Should fail'
			})

			expect(overflow).toBeNull()
		})

		it('should enforce guild command limit separately', () => {
			const guild = createDefaultGuildWithChannel(sessionState)

			// Create maximum global commands
			for (let i = 0; i < CommandLimits.MAX_GLOBAL_COMMANDS; i++) {
				sessionState.createCommand({
					name: `global${i}`,
					description: `Global ${i}`
				})
			}

			// Should still be able to create guild command
			const guildCmd = sessionState.createCommand(
				{
					name: 'guild-cmd',
					description: 'Guild command'
				},
				guild.id
			)

			expect(guildCmd).toBeDefined()
		})
	})
})

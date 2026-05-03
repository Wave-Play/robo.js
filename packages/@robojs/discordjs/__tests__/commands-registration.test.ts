/**
 * Tests for command registration runtime path
 *
 * Verifies that:
 * - registerCommandsToDiscord handles global and guild registration
 * - Rate limiting with retry-after headers and exponential backoff
 * - Max retries exceeded throws error
 * - Timeout throws error
 * - Force mode deletes existing commands
 * - Entry command preservation
 * - Retry tracking
 * - recordsToCommands hierarchical parsing
 * - recordsToContext type filtering and path inference
 * - findCommandDifferences recursive detection
 */

import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fn = jest.fn as any

// Import mocked robo.js
const roboMock = (await import('robo.js')) as unknown as {
	getForkedLogger: (key: string) => {
		debug: jest.Mock
		info: jest.Mock
		warn: jest.Mock
		error: jest.Mock
	}
	clearForkedLoggers: () => void
}

const { getForkedLogger } = roboMock

// Pre-initialize the forked logger
getForkedLogger('discordjs')

// Import the module under test
const {
	registerCommandsToDiscord,
	findCommandDifferences,
	recordsToCommands,
	recordsToContext,
	bubbleSubcommandMetadata,
	getContextType,
	getIntegrationType
} = await import('../src/core/commands.js')

// Import enums from discord.js mock
const { InteractionContextType, ApplicationIntegrationType } = await import('discord.js')

// Helper: create a mock REST instance for tests (NOT the singleton)
function createMockRest() {
	return {
		get: fn().mockResolvedValue([]),
		put: fn().mockResolvedValue([]),
		delete: fn().mockResolvedValue(undefined),
		setToken: fn().mockReturnThis()
	}
}

describe('registerCommandsToDiscord', () => {
	let rest: ReturnType<typeof createMockRest>

	beforeEach(() => {
		jest.clearAllMocks()
		rest = createMockRest()
	})

	it('registers global commands via rest.put with correct route', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await registerCommandsToDiscord(rest as any, 'app123', undefined, [{ name: 'ping' }], false)

		expect(rest.get).toHaveBeenCalledWith('/applications/app123/commands')
		expect(rest.put).toHaveBeenCalledWith('/applications/app123/commands', { body: [{ name: 'ping' }] })
	})

	it('registers guild commands when guildId provided', async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await registerCommandsToDiscord(rest as any, 'app123', 'guild456', [{ name: 'ping' }], false)

		expect(rest.get).toHaveBeenCalledWith('/applications/app123/guilds/guild456/commands')
		expect(rest.put).toHaveBeenCalledWith('/applications/app123/guilds/guild456/commands', {
			body: [{ name: 'ping' }]
		})
	})

	it('retries on 429 rate limit (up to 3 attempts)', async () => {
		const rateLimitError = { status: 429, headers: { 'retry-after': '0.001' } }

		rest.put
			.mockRejectedValueOnce(rateLimitError)
			.mockRejectedValueOnce(rateLimitError)
			.mockResolvedValueOnce([])

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await registerCommandsToDiscord(rest as any, 'app123', undefined, [], false)

		// get is called once at start, put is called 3 times (2 failures + 1 success)
		expect(rest.put).toHaveBeenCalledTimes(3)
	})

	it('uses retry-after header for delay when available', async () => {
		const retries: Array<{ scope: string; attempt: number; reason: string; delay: number }> = []
		const rateLimitError = { status: 429, headers: { 'retry-after': '0.5' } }

		rest.put.mockRejectedValueOnce(rateLimitError).mockResolvedValueOnce([])

		await registerCommandsToDiscord(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			rest as any,
			'app123',
			undefined,
			[],
			false,
			{ retries }
		)

		expect(retries).toHaveLength(1)
		expect(retries[0].delay).toBe(500) // 0.5 * 1000
		expect(retries[0].reason).toBe('rate_limit')
		expect(retries[0].scope).toBe('global')
	})

	it('uses exponential backoff when no retry-after header', async () => {
		const retries: Array<{ scope: string; attempt: number; reason: string; delay: number }> = []
		const rateLimitError = { status: 429 } // No headers

		rest.put.mockRejectedValueOnce(rateLimitError).mockResolvedValueOnce([])

		await registerCommandsToDiscord(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			rest as any,
			'app123',
			undefined,
			[],
			false,
			{ retries }
		)

		expect(retries).toHaveLength(1)
		// First attempt: min(1000 * 2^0, 10000) = 1000
		expect(retries[0].delay).toBe(1000)
	})

	it('rejects after exhausting all retry attempts', async () => {
		const rateLimitError = { status: 429, headers: { 'retry-after': '0.001' } }

		rest.put
			.mockRejectedValueOnce(rateLimitError)
			.mockRejectedValueOnce(rateLimitError)
			.mockRejectedValueOnce(rateLimitError)
			.mockRejectedValueOnce(rateLimitError)

		await expect(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			registerCommandsToDiscord(rest as any, 'app123', undefined, [], false)
		).rejects.toBeDefined()
	})

	it('throws "Command registration timed out" on timeout', async () => {
		// Make rest.put hang forever
		rest.put.mockImplementation(() => new Promise(() => {}))

		await expect(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			registerCommandsToDiscord(rest as any, 'app123', undefined, [], false, { timeout: 10 })
		).rejects.toThrow('Command registration timed out')
	}, 5000)

	it('preserves existing entry commands (type 4) when not guild', async () => {
		const existingEntryCommand = { id: 'entry1', name: 'launch', type: 4 }
		rest.get.mockResolvedValue([existingEntryCommand])

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await registerCommandsToDiscord(rest as any, 'app123', undefined, [{ name: 'ping' }], false, {
			hasEmbeddedSdk: false
		})

		// The commandData should now include the entry command
		const putCall = rest.put.mock.calls[0]
		const body = putCall[1].body
		expect(body).toHaveLength(2)
		expect(body).toContainEqual(existingEntryCommand)
	})

	it('does NOT add entry command for guild registrations', async () => {
		const existingEntryCommand = { id: 'entry1', name: 'launch', type: 4 }
		rest.get.mockResolvedValue([existingEntryCommand])

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await registerCommandsToDiscord(rest as any, 'app123', 'guild456', [{ name: 'ping' }], false)

		const putCall = rest.put.mock.calls[0]
		const body = putCall[1].body
		expect(body).toHaveLength(1) // Only 'ping', no entry command
	})

	it('force mode deletes all existing commands before registration', async () => {
		rest.get.mockResolvedValue([
			{ id: 'cmd1', name: 'ping', type: 1 },
			{ id: 'cmd2', name: 'help', type: 1 }
		])

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await registerCommandsToDiscord(rest as any, 'app123', undefined, [], true)

		expect(rest.delete).toHaveBeenCalledTimes(2)
		expect(rest.delete).toHaveBeenCalledWith('/applications/app123/commands/cmd1')
		expect(rest.delete).toHaveBeenCalledWith('/applications/app123/commands/cmd2')
	})

	it('force mode creates a launch entry command for re-registration', async () => {
		rest.get.mockResolvedValue([])

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await registerCommandsToDiscord(rest as any, 'app123', undefined, [{ name: 'ping' }], true)

		const putCall = rest.put.mock.calls[0]
		const body = putCall[1].body
		// Should include original command + synthesized entry command
		expect(body).toHaveLength(2)
		const entryCmd = body.find((cmd: { type?: number }) => cmd.type === 4)
		expect(entryCmd).toBeDefined()
		expect(entryCmd.name).toBe('launch')
	})

	it('tracks retry entries when retries array provided', async () => {
		const retries: Array<{ scope: string; attempt: number; reason: string; delay: number }> = []
		const rateLimitError = { status: 429, headers: { 'retry-after': '0.001' } }

		rest.put.mockRejectedValueOnce(rateLimitError).mockResolvedValueOnce([])

		await registerCommandsToDiscord(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			rest as any,
			'app123',
			'guild789',
			[],
			false,
			{ retries }
		)

		expect(retries).toHaveLength(1)
		expect(retries[0].scope).toBe('guild:guild789')
		expect(retries[0].attempt).toBe(1)
	})

	it('succeeds on retry after rate limit clears', async () => {
		const rateLimitError = { status: 429, headers: { 'retry-after': '0.001' } }

		rest.put.mockRejectedValueOnce(rateLimitError).mockResolvedValueOnce([])

		// Should not throw
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await registerCommandsToDiscord(rest as any, 'app123', undefined, [{ name: 'ping' }], false)

		expect(rest.put).toHaveBeenCalledTimes(2)
	})
})

describe('findCommandDifferences', () => {
	it('detects added commands', () => {
		const result = findCommandDifferences(
			{ ping: { description: 'Ping' } },
			{ ping: { description: 'Ping' }, pong: { description: 'Pong' } },
			'added'
		)
		expect(result).toEqual(['pong'])
	})

	it('detects removed commands', () => {
		const result = findCommandDifferences(
			{ ping: { description: 'Ping' }, pong: { description: 'Pong' } },
			{ ping: { description: 'Ping' } },
			'removed'
		)
		expect(result).toEqual(['pong'])
	})

	it('detects changed commands (description change)', () => {
		const result = findCommandDifferences(
			{ ping: { description: 'Old' } },
			{ ping: { description: 'New' } },
			'changed'
		)
		expect(result).toEqual(['ping'])
	})

	it('detects changed commands (options change)', () => {
		const result = findCommandDifferences(
			{ cmd: { description: 'Cmd', options: [{ name: 'a', type: 'string' }] } },
			{ cmd: { description: 'Cmd', options: [{ name: 'b', type: 'integer' }] } },
			'changed'
		)
		expect(result).toEqual(['cmd'])
	})

	it('recurses into subcommands', () => {
		const result = findCommandDifferences(
			{ user: { description: 'User', subcommands: { info: { description: 'Info' } } } },
			{
				user: {
					description: 'User',
					subcommands: { info: { description: 'Info' }, ban: { description: 'Ban' } }
				}
			},
			'added'
		)
		expect(result).toContain('user ban')
	})

	it('applies prefix for nested keys', () => {
		const result = findCommandDifferences({}, { cmd: { description: 'Cmd' } }, 'added', 'root')
		expect(result).toEqual(['root cmd'])
	})

	it('returns empty for identical command sets', () => {
		const cmds = { ping: { description: 'Ping' }, help: { description: 'Help' } }
		expect(findCommandDifferences(cmds, cmds, 'added')).toEqual([])
		expect(findCommandDifferences(cmds, cmds, 'removed')).toEqual([])
		expect(findCommandDifferences(cmds, cmds, 'changed')).toEqual([])
	})

	it('handles empty inputs gracefully', () => {
		expect(findCommandDifferences({}, {}, 'added')).toEqual([])
		expect(findCommandDifferences({}, {}, 'removed')).toEqual([])
		expect(findCommandDifferences({}, {}, 'changed')).toEqual([])
	})
})

describe('recordsToCommands', () => {
	it('converts single-part keys to top-level commands', () => {
		const result = recordsToCommands({
			ping: { metadata: { description: 'Ping!' } }
		})
		expect(result.ping).toBeDefined()
		expect(result.ping.description).toBe('Ping!')
	})

	it('converts 2-part keys to subcommands', () => {
		const result = recordsToCommands({
			'user add': { metadata: { description: 'Add user' } },
			'user remove': { metadata: { description: 'Remove user' } }
		})
		expect(result.user).toBeDefined()
		expect(result.user.subcommands).toBeDefined()
		expect(result.user.subcommands!.add.description).toBe('Add user')
		expect(result.user.subcommands!.remove.description).toBe('Remove user')
	})

	it('converts 3-part keys to subcommand groups', () => {
		const result = recordsToCommands({
			'config settings view': { metadata: { description: 'View settings' } },
			'config settings edit': { metadata: { description: 'Edit settings' } }
		})
		expect(result.config).toBeDefined()
		expect(result.config.subcommands!.settings).toBeDefined()
		expect(result.config.subcommands!.settings.subcommands!.view.description).toBe('View settings')
		expect(result.config.subcommands!.settings.subcommands!.edit.description).toBe('Edit settings')
	})

	it('synthesizes root entry when only subcommands exist', () => {
		const result = recordsToCommands({
			'admin ban': { metadata: { description: 'Ban' } },
			'admin kick': { metadata: { description: 'Kick' } }
		})
		// Root should exist even though no top-level 'admin' record was provided
		expect(result.admin).toBeDefined()
		expect(result.admin.subcommands).toBeDefined()
	})

	it('preserves synthesized children when a root entry is encountered later', () => {
		const result = recordsToCommands({
			'admin ban': { metadata: { description: 'Ban' } },
			admin: { metadata: { description: 'Admin' } }
		})

		expect(result.admin.description).toBe('Admin')
		expect(result.admin.subcommands?.ban.description).toBe('Ban')
	})

	it('calls bubbleSubcommandMetadata on result', () => {
		const result = recordsToCommands({
			'rp cmd1': { metadata: { description: 'Cmd 1', integrationTypes: ['UserInstall'] } },
			'rp cmd2': { metadata: { description: 'Cmd 2', integrationTypes: ['GuildInstall'] } }
		})
		// bubbleSubcommandMetadata should have unioned the integrationTypes
		expect(result.rp.integrationTypes).toEqual(expect.arrayContaining(['UserInstall', 'GuildInstall']))
	})
})

describe('recordsToContext', () => {
	it('filters records by context type user (type=2)', () => {
		const records = {
			'User Info': { metadata: { contextType: 2 } },
			'Message Info': { metadata: { contextType: 3 } }
		}
		const result = recordsToContext(records, 'user')
		expect(Object.keys(result)).toEqual(['User Info'])
	})

	it('filters records by context type message (type=3)', () => {
		const records = {
			'User Info': { metadata: { contextType: 2 } },
			'Message Info': { metadata: { contextType: 3 } }
		}
		const result = recordsToContext(records, 'message')
		expect(Object.keys(result)).toEqual(['Message Info'])
	})

	it('infers context type from path when metadata missing', () => {
		const records = {
			'User Action': { metadata: {}, path: 'context/user/action.js' },
			'Message Action': { metadata: {}, path: 'context/message/action.js' }
		}
		const userResult = recordsToContext(records, 'user')
		const messageResult = recordsToContext(records, 'message')
		expect(Object.keys(userResult)).toEqual(['User Action'])
		expect(Object.keys(messageResult)).toEqual(['Message Action'])
	})

	it('returns empty for records of wrong type', () => {
		const records = {
			'User Info': { metadata: { contextType: 2 } }
		}
		const result = recordsToContext(records, 'message')
		expect(Object.keys(result)).toEqual([])
	})
})

describe('bubbleSubcommandMetadata', () => {
	it('bubbles integrationTypes as union from subcommands', () => {
		const commands = {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			root: { subcommands: { a: { integrationTypes: ['UserInstall'] }, b: { integrationTypes: ['GuildInstall'] } } } as any
		}
		bubbleSubcommandMetadata(commands)
		expect(commands.root.integrationTypes).toEqual(expect.arrayContaining(['UserInstall', 'GuildInstall']))
	})

	it('bubbles contexts as union from subcommands', () => {
		const commands = {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			root: { subcommands: { a: { contexts: ['Guild'] }, b: { contexts: ['BotDM'] } } } as any
		}
		bubbleSubcommandMetadata(commands)
		expect(commands.root.contexts).toEqual(expect.arrayContaining(['Guild', 'BotDM']))
	})

	it('bubbles defaultMemberPermissions when ALL subcommands agree', () => {
		const commands = {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			root: { subcommands: { a: { defaultMemberPermissions: '8' }, b: { defaultMemberPermissions: '8' } } } as any
		}
		bubbleSubcommandMetadata(commands)
		expect(commands.root.defaultMemberPermissions).toBe('8')
	})

	it('does NOT bubble defaultMemberPermissions on conflict', () => {
		const commands = {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			root: { subcommands: { a: { defaultMemberPermissions: '8' }, b: { defaultMemberPermissions: '16' } } } as any
		}
		bubbleSubcommandMetadata(commands)
		expect(commands.root.defaultMemberPermissions).toBeUndefined()
	})

	it('sets dmPermission false only when ALL subcommands set false', () => {
		const commands = {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			root: { subcommands: { a: { dmPermission: false }, b: { dmPermission: false } } } as any
		}
		bubbleSubcommandMetadata(commands)
		expect(commands.root.dmPermission).toBe(false)
	})

	it('bubbles nsfw true when ANY subcommand sets true', () => {
		const commands = {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			root: { subcommands: { a: { nsfw: false }, b: { nsfw: true } } } as any
		}
		bubbleSubcommandMetadata(commands)
		expect(commands.root.nsfw).toBe(true)
	})

	it('does NOT override explicit root metadata', () => {
		const commands = {
			root: {
				integrationTypes: ['GuildInstall'],
				contexts: ['Guild'],
				subcommands: {
					a: { integrationTypes: ['UserInstall'], contexts: ['BotDM'] }
				}
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any
		}
		bubbleSubcommandMetadata(commands)
		expect(commands.root.integrationTypes).toEqual(['GuildInstall'])
		expect(commands.root.contexts).toEqual(['Guild'])
	})

	it('handles subcommand groups (walks nested subcommands)', () => {
		const commands = {
			root: {
				subcommands: {
					group: {
						subcommands: {
							cmd1: { integrationTypes: ['UserInstall'] },
							cmd2: { integrationTypes: ['GuildInstall'] }
						}
					}
				}
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any
		}
		bubbleSubcommandMetadata(commands)
		expect(commands.root.integrationTypes).toEqual(expect.arrayContaining(['UserInstall', 'GuildInstall']))
	})

	it('no-ops when no subcommands present', () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const commands = { root: { description: 'Simple command' } as any }
		bubbleSubcommandMetadata(commands)
		expect(commands.root.integrationTypes).toBeUndefined()
	})
})

describe('getContextType', () => {
	it("maps 'Guild' to InteractionContextType.Guild", () => {
		expect(getContextType('Guild')).toBe(InteractionContextType.Guild)
	})

	it("maps 'BotDM' to InteractionContextType.BotDM", () => {
		expect(getContextType('BotDM')).toBe(InteractionContextType.BotDM)
	})

	it("maps 'PrivateChannel' to InteractionContextType.PrivateChannel", () => {
		expect(getContextType('PrivateChannel')).toBe(InteractionContextType.PrivateChannel)
	})

	it('passes through numeric values unchanged', () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect(getContextType(0 as any)).toBe(0)
	})
})

describe('getIntegrationType', () => {
	it("maps 'GuildInstall' to ApplicationIntegrationType.GuildInstall", () => {
		expect(getIntegrationType('GuildInstall')).toBe(ApplicationIntegrationType.GuildInstall)
	})

	it("maps 'UserInstall' to ApplicationIntegrationType.UserInstall", () => {
		expect(getIntegrationType('UserInstall')).toBe(ApplicationIntegrationType.UserInstall)
	})

	it('passes through numeric values unchanged', () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect(getIntegrationType(0 as any)).toBe(0)
	})
})

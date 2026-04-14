import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { SpiritMessage, TerminalExecResult } from '../../src/types/common.js'
import type { TerminalCommandEntry } from '../../src/types/cli.js'

// Mock interactive CLI — provided via context injection to avoid dynamic import issues
const mockShowDrawer = jest.fn()
const mockHideDrawer = jest.fn()
const mockIsActive = jest.fn(() => true)
const mockIsDrawerOpen = jest.fn(() => false)

const mockInteractiveCli = {
	isActive: mockIsActive,
	showDrawer: mockShowDrawer,
	hideDrawer: mockHideDrawer,
	isDrawerOpen: mockIsDrawerOpen
}

// Mock Spirits class that simulates the real Spirits.exec() / on() / off() contract
class MockSpirits {
	private listeners: Map<string, Array<(msg: SpiritMessage) => void>> = new Map()
	public execResult: TerminalExecResult | null = { success: true }
	public execShouldThrow = false
	public execPayloadCapture: unknown = null
	public offCalls: Array<{ spiritId: string }> = []

	// Track intermediate messages sent during exec (simulates spirit pushing writes)
	public intermediateMessages: SpiritMessage[] = []

	on(spiritId: string, callback: (msg: SpiritMessage) => void) {
		if (!this.listeners.has(spiritId)) {
			this.listeners.set(spiritId, [])
		}
		this.listeners.get(spiritId)!.push(callback)
	}

	off(spiritId: string, callback: (msg: SpiritMessage) => void) {
		this.offCalls.push({ spiritId })
		const cbs = this.listeners.get(spiritId)
		if (cbs) {
			const idx = cbs.indexOf(callback)
			if (idx >= 0) cbs.splice(idx, 1)
		}
	}

	async exec<T>(spiritId: string, message: SpiritMessage): Promise<T> {
		this.execPayloadCapture = message.payload

		if (this.execShouldThrow) {
			throw new Error('Spirit crashed')
		}

		// Deliver any intermediate messages to registered listeners before returning
		for (const msg of this.intermediateMessages) {
			const cbs = this.listeners.get(spiritId) ?? []
			for (const cb of cbs) {
				cb(msg)
			}
		}

		return this.execResult as T
	}
}

// Mock modules that cli-loader imports
jest.unstable_mockModule('../../src/core/logger.js', () => {
	const logFn = Object.assign(
		() => logFn,
		{
			debug: jest.fn(),
			error: jest.fn(),
			info: jest.fn(),
			warn: jest.fn(),
			flush: jest.fn(async () => {}),
			fork: jest.fn(() => logFn)
		}
	)
	return { logger: logFn }
})

jest.unstable_mockModule('../../src/core/color.js', () => ({
	color: { bold: (v: string) => v, cyan: (v: string) => v },
	composeColors: () => (v: string) => v
}))

jest.unstable_mockModule('../../src/core/env.js', () => ({
	Env: { data: () => ({}) }
}))

jest.unstable_mockModule('../../src/core/mode.js', () => ({
	Mode: { get: () => 'development' },
	resolveCliMode: jest.fn(() => 'development')
}))

describe('Terminal command execution via spirit IPC', () => {
	let mockSpirits: MockSpirits
	let stdoutWrites: string[]
	let buildTerminalCommands: typeof import('../../src/cli/utils/cli-loader.js').buildTerminalCommands

	beforeEach(async () => {
		mockSpirits = new MockSpirits()
		stdoutWrites = []
		const realWrite = process.stdout.write.bind(process.stdout)
		jest.spyOn(process.stdout, 'write').mockImplementation(function (this: NodeJS.WriteStream, ...args: unknown[]) {
			const text = args[0]
			if (typeof text === 'string') {
				stdoutWrites.push(text)
				// Pass through jest's own output (ANSI, test results)
				if (text.includes('\x1b') || text.includes('PASS') || text.includes('FAIL') || text.includes('●')) {
					return realWrite.call(this, ...args as Parameters<typeof realWrite>)
				}
			}
			return true
		} as typeof process.stdout.write)
		mockShowDrawer.mockClear()
		mockHideDrawer.mockClear()
		mockIsActive.mockReturnValue(true)

		const mod = await import('../../src/cli/utils/cli-loader.js')
		buildTerminalCommands = mod.buildTerminalCommands
	})

	afterEach(() => {
		jest.restoreAllMocks()
	})

	function makeTerminal(overrides: Partial<TerminalCommandEntry> = {}): Record<string, TerminalCommandEntry> {
		return {
			'test': {
				description: 'test command',
				path: '/tmp/test-handler.js',
				plugin: null as unknown as string,
				priority: 0,
				...overrides
			}
		}
	}

	function buildAndGetHandler(
		terminal: Record<string, TerminalCommandEntry>,
		spiritsOverride?: MockSpirits | undefined,
		spiritIdOverride?: string | null
	) {
		const cmds = buildTerminalCommands(terminal, {
			config: { plugins: [] } as never,
			getSpirits: () => (spiritsOverride ?? mockSpirits) as never,
			getSpiritId: () => spiritIdOverride ?? 'spirit-1',
			interactiveCli: mockInteractiveCli
		})
		return cmds[0]
	}

	// ===================================================================
	// Spirit availability / fallback
	// ===================================================================

	it('falls back to CLI when spirits is undefined', async () => {
		const cmds = buildTerminalCommands(makeTerminal(), {
			config: { plugins: [] } as never,
			getSpirits: () => undefined,
			getSpiritId: () => 'spirit-1'
		})

		expect(cmds).toHaveLength(1)
		expect(cmds[0].name).toBe('test')
	})

	it('falls back to CLI when spiritId is null', async () => {
		const cmds = buildTerminalCommands(makeTerminal(), {
			config: { plugins: [] } as never,
			getSpirits: () => mockSpirits as never,
			getSpiritId: () => null
		})

		expect(cmds).toHaveLength(1)
	})

	it('falls back to CLI when exec() returns null (terminated spirit)', async () => {
		mockSpirits.execResult = null

		const cmd = buildAndGetHandler(makeTerminal())
		const { handler } = await cmd.load()
		await handler([], {} as never)

		// exec returned null → tryExecuteInSpirit returns false → falls back to CLI
		// CLI fallback will fail on import but handler won't throw
		// Key: cleanup still happens
		expect(mockSpirits.offCalls).toHaveLength(1)
	})

	it('falls back to CLI when exec() throws (spirit crash)', async () => {
		mockSpirits.execShouldThrow = true

		const cmd = buildAndGetHandler(makeTerminal())
		const { handler } = await cmd.load()
		await handler([], {} as never)

		// Cleanup should still happen
		expect(mockSpirits.offCalls).toHaveLength(1)
	})

	// ===================================================================
	// Successful spirit execution
	// ===================================================================

	it('sends correct payload to spirit via exec()', async () => {
		mockSpirits.execResult = { success: true }

		const cmd = buildAndGetHandler(makeTerminal())
		const { handler } = await cmd.load()
		await handler(['arg1', 'arg2'], {} as never)

		const captured = mockSpirits.execPayloadCapture as Record<string, unknown>
		expect(captured.handlerPath).toBe('/tmp/test-handler.js')
		expect(captured.args).toEqual(['arg1', 'arg2'])
		expect(captured.drawerAvailable).toBe(true)
	})

	it('writes returnValue to stdout on successful exec', async () => {
		mockSpirits.execResult = { success: true, returnValue: 'command output' }

		const cmd = buildAndGetHandler(makeTerminal())
		const { handler } = await cmd.load()
		await handler([], {} as never)

		expect(stdoutWrites).toContain('command output\n')
	})

	it('writes error to stdout on failed exec result', async () => {
		mockSpirits.execResult = { success: false, error: 'something broke' }

		const cmd = buildAndGetHandler(makeTerminal())
		const { handler } = await cmd.load()
		await handler([], {} as never)

		expect(stdoutWrites).toContain('Error executing /test: something broke\n')
	})

	// ===================================================================
	// Intermediate IPC messages (terminal-write, terminal-drawer)
	// ===================================================================

	it('terminal-write messages from spirit write to stdout without extra newline', async () => {
		mockSpirits.execResult = { success: true }
		mockSpirits.intermediateMessages = [
			{ event: 'terminal-write', payload: { text: 'hello from spirit' } }
		]

		const cmd = buildAndGetHandler(makeTerminal())
		const { handler } = await cmd.load()
		await handler([], {} as never)

		expect(stdoutWrites).toContain('hello from spirit')
	})

	it('terminal-drawer show messages call showDrawer', async () => {
		mockSpirits.execResult = { success: true }
		mockSpirits.intermediateMessages = [
			{ event: 'terminal-drawer', payload: { action: 'show', lines: ['line 1', 'line 2'] } }
		]

		const cmd = buildAndGetHandler(makeTerminal())
		const { handler } = await cmd.load()
		await handler([], {} as never)

		expect(mockShowDrawer).toHaveBeenCalledWith(['line 1', 'line 2'])
	})

	it('terminal-drawer hide messages call hideDrawer', async () => {
		mockSpirits.execResult = { success: true }
		mockSpirits.intermediateMessages = [
			{ event: 'terminal-drawer', payload: { action: 'hide' } }
		]

		const cmd = buildAndGetHandler(makeTerminal())
		const { handler } = await cmd.load()
		await handler([], {} as never)

		expect(mockHideDrawer).toHaveBeenCalled()
	})

	// ===================================================================
	// Cleanup
	// ===================================================================

	it('always cleans up listener via off() even on success', async () => {
		mockSpirits.execResult = { success: true }

		const cmd = buildAndGetHandler(makeTerminal())
		const { handler } = await cmd.load()
		await handler([], {} as never)

		expect(mockSpirits.offCalls).toHaveLength(1)
		expect(mockSpirits.offCalls[0].spiritId).toBe('spirit-1')
	})

	it('always cleans up listener via off() even on failure', async () => {
		mockSpirits.execResult = { success: false, error: 'fail' }

		const cmd = buildAndGetHandler(makeTerminal())
		const { handler } = await cmd.load()
		await handler([], {} as never)

		expect(mockSpirits.offCalls).toHaveLength(1)
	})

	// ===================================================================
	// Subcommand dispatch and auto-generated parents
	// ===================================================================

	it('dispatches to subcommand handler', async () => {
		mockSpirits.execResult = { success: true, returnValue: 'from child' }

		const terminal: Record<string, TerminalCommandEntry> = {
			'parent': {
				description: 'parent command',
				path: '',
				plugin: null as unknown as string,
				priority: 0,
				subcommands: ['child']
			},
			'parent child': {
				description: 'child command',
				path: '/tmp/child-handler.js',
				plugin: null as unknown as string,
				priority: 0
			}
		}

		const cmds = buildTerminalCommands(terminal, {
			config: { plugins: [] } as never,
			getSpirits: () => mockSpirits as never,
			getSpiritId: () => 'spirit-1',
			interactiveCli: mockInteractiveCli
		})

		expect(cmds).toHaveLength(1)
		expect(cmds[0].name).toBe('parent')

		const { handler } = await cmds[0].load()
		await handler(['child'], {} as never)

		// Should have dispatched to child, sending child's path to spirit
		const captured = mockSpirits.execPayloadCapture as Record<string, unknown>
		expect(captured.handlerPath).toBe('/tmp/child-handler.js')
	})

	it('auto-generated parent (no path) lists subcommands without spirit exec', async () => {
		const terminal: Record<string, TerminalCommandEntry> = {
			'parent': {
				description: 'parent command',
				path: '',
				plugin: null as unknown as string,
				priority: 0,
				subcommands: ['sub1', 'sub2']
			},
			'parent sub1': {
				description: 'first subcommand',
				path: '/tmp/sub1.js',
				plugin: null as unknown as string,
				priority: 0
			},
			'parent sub2': {
				description: 'second subcommand',
				path: '/tmp/sub2.js',
				plugin: null as unknown as string,
				priority: 0
			}
		}

		const cmds = buildTerminalCommands(terminal, {
			config: { plugins: [] } as never,
			getSpirits: () => mockSpirits as never,
			getSpiritId: () => 'spirit-1',
			interactiveCli: mockInteractiveCli
		})

		const { handler } = await cmds[0].load()
		// Call without a subcommand arg — should list subcommands
		await handler([], {} as never)

		// Should NOT have called spirit exec (no handler path)
		expect(mockSpirits.execPayloadCapture).toBeNull()

		// Should have written subcommand listing
		expect(stdoutWrites).toContain('Available subcommands for /parent:\n')
		expect(stdoutWrites).toContain('  /parent sub1 - first subcommand\n')
		expect(stdoutWrites).toContain('  /parent sub2 - second subcommand\n')
	})

	// ===================================================================
	// drawerAvailable flag
	// ===================================================================

	it('sets drawerAvailable to false when interactive CLI is not active', async () => {
		mockIsActive.mockReturnValue(false)
		mockSpirits.execResult = { success: true }

		const cmd = buildAndGetHandler(makeTerminal())
		const { handler } = await cmd.load()
		await handler([], {} as never)

		const captured = mockSpirits.execPayloadCapture as Record<string, unknown>
		expect(captured.drawerAvailable).toBe(false)
	})
})

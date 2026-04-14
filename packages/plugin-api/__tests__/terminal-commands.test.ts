import { beforeEach, afterEach, describe, expect, it, jest } from '@jest/globals'
import type { HandlerSummary } from 'robo.js'

// ── Mocks ────────────────────────────────────────────────────────────

const routeSummaries = jest.fn(async () => [] as HandlerSummary[])
const routeSummariesSync = jest.fn(() => [] as HandlerSummary[])

jest.unstable_mockModule('robo.js', () => ({
	createTerminalCommandConfig: (c: unknown) => c,
	Manifest: {
		routeSummaries,
		routeSummariesSync
	}
}))

jest.unstable_mockModule('../src/core/logger.js', () => ({
	logger: {
		debug: jest.fn(),
		warn: jest.fn(),
		error: jest.fn()
	}
}))

const tunnelGetAll = jest.fn(async () => [] as Array<{ id: string; pid: number; port: number; url: string; startedAt: number; provider: string }>)
const tunnelKill = jest.fn(async () => true)
const tunnelKillAll = jest.fn(async () => 0)

jest.unstable_mockModule('../src/core/tunnel/registry.js', () => ({
	TunnelRegistry: {
		getAll: tunnelGetAll,
		kill: tunnelKill,
		killAll: tunnelKillAll
	}
}))

jest.unstable_mockModule('../src/core/tunnel/utils.js', () => ({
	formatAge: jest.fn((ms: number) => {
		const seconds = Math.floor(ms / 1000)
		return `${seconds}s`
	}),
	isProcessAlive: jest.fn(() => true),
	generateId: jest.fn(() => 'abc123')
}))

jest.unstable_mockModule('../src/robo/prepare.js', () => ({
	pluginOptions: {
		prefix: '/api'
	}
}))

jest.unstable_mockModule('node:fs/promises', () => ({
	default: {
		readFile: jest.fn(async () => {
			throw new Error('ENOENT')
		})
	}
}))

// ── Helpers ──────────────────────────────────────────────────────────

interface CtxOutput {
	lines: string[]
	text: string
}

function createCtx(overrides?: { args?: string[]; options?: Record<string, unknown> }): {
	ctx: { write: jest.Mock; args: string[]; options: Record<string, unknown> }
	output: CtxOutput
} {
	const lines: string[] = []
	const output: CtxOutput = { lines, text: '' }
	const write = jest.fn((s: string) => {
		lines.push(s)
	})

	const ctx = {
		write,
		args: overrides?.args ?? [],
		options: overrides?.options ?? {}
	}

	// Lazily compute full text from lines
	Object.defineProperty(output, 'text', {
		get() {
			return lines.join('')
		}
	})

	return { ctx, output }
}

// ── Tests ────────────────────────────────────────────────────────────

describe('Terminal commands: /server', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		delete (globalThis as any).roboServer
	})

	afterEach(() => {
		delete (globalThis as any).roboServer
	})

	describe('/server (root)', () => {
		it('lists available subcommands', async () => {
			const mod = await import('../src/robo/terminal/commands/server.js')
			const { ctx, output } = createCtx()

			await mod.default(ctx as never)

			expect(output.text).toContain('/server status')
			expect(output.text).toContain('/server routes')
			expect(output.text).toContain('/server curl')
			expect(output.text).toContain('/server openapi')
			expect(output.text).toContain('/open')
		})

		it('exports a config with description', async () => {
			const mod = await import('../src/robo/terminal/commands/server.js')
			expect(mod.config).toBeDefined()
			expect(mod.config.description).toBe('Manage and inspect the HTTP server')
		})
	})

	describe('/server status', () => {
		it('reports not running when roboServer is undefined', async () => {
			const mod = await import('../src/robo/terminal/commands/server/status.js')
			const { ctx, output } = createCtx()

			await mod.default(ctx as never)

			expect(output.text).toContain('Server is not running')
		})

		it('reports not running when server.ready is false', async () => {
			globalThis.roboServer = { ready: false } as any
			const mod = await import('../src/robo/terminal/commands/server/status.js')
			const { ctx, output } = createCtx()

			await mod.default(ctx as never)

			expect(output.text).toContain('Server is not running')
		})

		it('shows dashboard when server is running', async () => {
			const fakeEngine = { constructor: { name: 'NodeEngine' } }
			globalThis.roboServer = {
				ready: true,
				port: 8080,
				hostname: '0.0.0.0',
				engine: fakeEngine,
				startedAt: Date.now() - 5000
			} as any

			routeSummariesSync.mockReturnValue([
				{ key: 'hello', path: '/api/hello', exports: { default: true, named: [] }, plugin: null },
				{ key: 'users/:id', path: '/api/users/:id', exports: { default: true, named: [] }, plugin: null }
			] as HandlerSummary[])

			tunnelGetAll.mockResolvedValue([])

			const mod = await import('../src/robo/terminal/commands/server/status.js')
			const { ctx, output } = createCtx()

			await mod.default(ctx as never)

			expect(output.text).toContain('Server Dashboard')
			expect(output.text).toContain('ready')
			expect(output.text).toContain('NodeEngine')
			expect(output.text).toContain('0.0.0.0')
			expect(output.text).toContain('8080')
			expect(output.text).toContain('Routes')
			expect(output.text).toContain('2')
			expect(output.text).toContain('Tunnels')
		})

		it('shows active tunnels when present', async () => {
			globalThis.roboServer = {
				ready: true,
				port: 3000,
				hostname: 'localhost',
				engine: { constructor: { name: 'NodeEngine' } },
				startedAt: Date.now() - 1000
			} as any

			routeSummariesSync.mockReturnValue([])

			tunnelGetAll.mockResolvedValue([
				{
					id: 'abc123',
					pid: 1234,
					port: 3000,
					url: 'https://example.trycloudflare.com',
					startedAt: Date.now() - 60000,
					provider: 'cloudflare'
				}
			])

			const mod = await import('../src/robo/terminal/commands/server/status.js')
			const { ctx, output } = createCtx()

			await mod.default(ctx as never)

			expect(output.text).toContain('Active tunnels')
			expect(output.text).toContain('https://example.trycloudflare.com')
			expect(output.text).toContain('Tunnels')
			expect(output.text).toContain('1')
		})
	})

	describe('/server routes', () => {
		it('shows "no routes" when manifest is empty', async () => {
			routeSummaries.mockResolvedValue([])
			const mod = await import('../src/robo/terminal/commands/server/routes.js')
			const { ctx, output } = createCtx({ options: { filter: '', page: 1, 'per-page': 15 } })

			await mod.default(ctx as never)

			expect(output.text).toContain('No API routes registered')
		})

		it('lists routes with path, source, and plugin columns', async () => {
			routeSummaries.mockResolvedValue([
				{ key: 'hello', path: '/src/api/hello.ts', exports: { default: true, named: [] }, plugin: null },
				{ key: 'users/:id', path: '/src/api/users/[id].ts', exports: { default: true, named: [] }, plugin: '@robojs/mock' }
			] as HandlerSummary[])

			const mod = await import('../src/robo/terminal/commands/server/routes.js')
			const { ctx, output } = createCtx({ options: { filter: '', page: 1, 'per-page': 15 } })

			await mod.default(ctx as never)

			expect(output.text).toContain('PATH')
			expect(output.text).toContain('SOURCE')
			expect(output.text).toContain('PLUGIN')
			expect(output.text).toContain('/api/hello')
			expect(output.text).toContain('/api/users/:id')
			expect(output.text).toContain('@robojs/mock')
			expect(output.text).toContain('Page 1 of 1')
			expect(output.text).toContain('2 total')
		})

		it('filters routes by path pattern', async () => {
			routeSummaries.mockResolvedValue([
				{ key: 'hello', path: '/src/api/hello.ts', exports: { default: true, named: [] }, plugin: null },
				{ key: 'users/:id', path: '/src/api/users/[id].ts', exports: { default: true, named: [] }, plugin: null }
			] as HandlerSummary[])

			const mod = await import('../src/robo/terminal/commands/server/routes.js')
			const { ctx, output } = createCtx({ options: { filter: 'users', page: 1, 'per-page': 15 } })

			await mod.default(ctx as never)

			expect(output.text).toContain('/api/users/:id')
			expect(output.text).not.toContain('/api/hello')
			expect(output.text).toContain('1 total')
		})

		it('shows no match message when filter matches nothing', async () => {
			routeSummaries.mockResolvedValue([
				{ key: 'hello', path: '/src/api/hello.ts', exports: { default: true, named: [] }, plugin: null }
			] as HandlerSummary[])

			const mod = await import('../src/robo/terminal/commands/server/routes.js')
			const { ctx, output } = createCtx({ options: { filter: 'nonexistent', page: 1, 'per-page': 15 } })

			await mod.default(ctx as never)

			expect(output.text).toContain('No routes matching "nonexistent"')
		})

		it('paginates routes correctly', async () => {
			const routes = Array.from({ length: 5 }, (_, i) => ({
				key: `route-${i}`,
				path: `/src/api/route-${i}.ts`,
				exports: { default: true, named: [] },
				plugin: null
			}))
			routeSummaries.mockResolvedValue(routes as HandlerSummary[])

			const mod = await import('../src/robo/terminal/commands/server/routes.js')
			const { ctx, output } = createCtx({ options: { filter: '', page: 2, 'per-page': 2 } })

			await mod.default(ctx as never)

			expect(output.text).toContain('Page 2 of 3')
			expect(output.text).toContain('5 total')
		})
	})

	describe('/server curl', () => {
		const originalFetch = globalThis.fetch

		afterEach(() => {
			globalThis.fetch = originalFetch
		})

		it('prints usage when no args given', async () => {
			const mod = await import('../src/robo/terminal/commands/server/curl.js')
			const { ctx, output } = createCtx({ args: [], options: { body: '', header: '' } })

			await mod.default(ctx as never)

			expect(output.text).toContain('Usage: /server curl')
			expect(output.text).toContain('Examples')
		})

		it('defaults to GET when no method specified', async () => {
			const headers = new Headers({ 'content-type': 'application/json' })
			globalThis.fetch = jest.fn<typeof fetch>().mockResolvedValue(
				new Response('{"ok":true}', { status: 200, statusText: 'OK', headers })
			)

			globalThis.roboServer = { port: 3000, hostname: 'localhost' } as any

			const mod = await import('../src/robo/terminal/commands/server/curl.js')
			const { ctx, output } = createCtx({ args: ['/api/hello'], options: { body: '', header: '' } })

			await mod.default(ctx as never)

			expect(output.text).toContain('GET http://localhost:3000/api/hello')
			expect(output.text).toContain('Status: 200 OK')
		})

		it('uses specified HTTP method', async () => {
			globalThis.fetch = jest.fn<typeof fetch>().mockResolvedValue(
				new Response('', { status: 201, statusText: 'Created' })
			)

			globalThis.roboServer = { port: 3000, hostname: 'localhost' } as any

			const mod = await import('../src/robo/terminal/commands/server/curl.js')
			const { ctx, output } = createCtx({
				args: ['POST', '/api/users'],
				options: { body: '{"name":"test"}', header: '' }
			})

			await mod.default(ctx as never)

			expect(output.text).toContain('POST http://localhost:3000/api/users')
			expect(output.text).toContain('Status: 201 Created')

			const mockFetch = globalThis.fetch as jest.Mock
			const fetchCall = mockFetch.mock.calls[0] as [string, RequestInit]
			expect(fetchCall[1].method).toBe('POST')
			expect(fetchCall[1].body).toBe('{"name":"test"}')
		})

		it('reports fetch errors gracefully', async () => {
			globalThis.fetch = jest.fn<typeof fetch>().mockRejectedValue(new Error('Connection refused'))

			globalThis.roboServer = { port: 3000, hostname: 'localhost' } as any

			const mod = await import('../src/robo/terminal/commands/server/curl.js')
			const { ctx, output } = createCtx({ args: ['/api/broken'], options: { body: '', header: '' } })

			await mod.default(ctx as never)

			expect(output.text).toContain('Error: Connection refused')
		})
	})

	describe('/server openapi', () => {
		it('shows "no spec" when file does not exist', async () => {
			const mod = await import('../src/robo/terminal/commands/server/openapi.js')
			const { ctx, output } = createCtx()

			await mod.default(ctx as never)

			expect(output.text).toContain('No OpenAPI spec found')
		})
	})
})

describe('Terminal commands: /open', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		delete (globalThis as any).roboServer
	})

	afterEach(() => {
		delete (globalThis as any).roboServer
	})

	it('writes "no server URL" when roboServer is undefined', async () => {
		const mod = await import('../src/robo/terminal/commands/open.js')
		const { ctx, output } = createCtx()

		await mod.default(ctx as never)

		expect(output.text).toContain('No server URL available')
	})

	it('writes "no server URL" when server is not ready', async () => {
		globalThis.roboServer = { ready: false } as any
		const mod = await import('../src/robo/terminal/commands/open.js')
		const { ctx, output } = createCtx()

		await mod.default(ctx as never)

		expect(output.text).toContain('No server URL available')
	})
})

describe('Terminal commands: /tunnel', () => {
	beforeEach(() => {
		jest.clearAllMocks()
	})

	describe('/tunnel (root)', () => {
		it('lists available subcommands', async () => {
			const mod = await import('../src/robo/terminal/commands/tunnel.js')
			const { ctx, output } = createCtx()

			await mod.default(ctx as never)

			expect(output.text).toContain('/tunnel start')
			expect(output.text).toContain('/tunnel list')
			expect(output.text).toContain('/tunnel stop')
		})
	})

	describe('/tunnel list', () => {
		it('shows "no tunnels" when none running', async () => {
			tunnelGetAll.mockResolvedValue([])
			const mod = await import('../src/robo/terminal/commands/tunnel/list.js')
			const { ctx, output } = createCtx()

			await mod.default(ctx as never)

			expect(output.text).toContain('No tunnels running')
			expect(output.text).toContain('/tunnel start')
		})

		it('lists active tunnels with table headers', async () => {
			tunnelGetAll.mockResolvedValue([
				{
					id: 'abc123',
					pid: 1234,
					port: 3000,
					url: 'https://test.trycloudflare.com',
					startedAt: Date.now() - 120000,
					provider: 'cloudflare'
				}
			])

			const mod = await import('../src/robo/terminal/commands/tunnel/list.js')
			const { ctx, output } = createCtx()

			await mod.default(ctx as never)

			expect(output.text).toContain('Running tunnels (1)')
			expect(output.text).toContain('ID')
			expect(output.text).toContain('PORT')
			expect(output.text).toContain('AGE')
			expect(output.text).toContain('URL')
			expect(output.text).toContain('abc123')
			expect(output.text).toContain('3000')
			expect(output.text).toContain('https://test.trycloudflare.com')
		})
	})

	describe('/tunnel stop', () => {
		it('prompts for ID when no args and --all is false', async () => {
			const mod = await import('../src/robo/terminal/commands/tunnel/stop.js')
			const { ctx, output } = createCtx({ args: [], options: { all: false } })

			await mod.default(ctx as never)

			expect(output.text).toContain('Please provide a tunnel ID or use --all')
		})

		it('stops all tunnels when --all is set', async () => {
			tunnelGetAll.mockResolvedValue([
				{ id: 'a', pid: 1, port: 3000, url: '', startedAt: 0, provider: 'cloudflare' },
				{ id: 'b', pid: 2, port: 3001, url: '', startedAt: 0, provider: 'cloudflare' }
			])
			tunnelKillAll.mockResolvedValue(2)

			const mod = await import('../src/robo/terminal/commands/tunnel/stop.js')
			const { ctx, output } = createCtx({ args: [], options: { all: true } })

			await mod.default(ctx as never)

			expect(tunnelKillAll).toHaveBeenCalled()
			expect(output.text).toContain('Stopped 2 tunnels')
		})

		it('reports "no tunnels" when --all but none running', async () => {
			tunnelGetAll.mockResolvedValue([])

			const mod = await import('../src/robo/terminal/commands/tunnel/stop.js')
			const { ctx, output } = createCtx({ args: [], options: { all: true } })

			await mod.default(ctx as never)

			expect(output.text).toContain('No tunnels running')
		})

		it('stops specific tunnel by ID', async () => {
			tunnelKill.mockResolvedValue(true)

			const mod = await import('../src/robo/terminal/commands/tunnel/stop.js')
			const { ctx, output } = createCtx({ args: ['abc123'], options: { all: false } })

			await mod.default(ctx as never)

			expect(tunnelKill).toHaveBeenCalledWith('abc123')
			expect(output.text).toContain('Stopped tunnel abc123')
		})

		it('reports when tunnel ID not found', async () => {
			tunnelKill.mockResolvedValue(false)

			const mod = await import('../src/robo/terminal/commands/tunnel/stop.js')
			const { ctx, output } = createCtx({ args: ['missing'], options: { all: false } })

			await mod.default(ctx as never)

			expect(output.text).toContain('Tunnel missing not found or already stopped')
		})
	})
})

import { jest } from '@jest/globals'

// These mocks need to be set up before any engine imports
// Each test file should call setupMocks() before importing engine modules

export interface TestServerOptions {
	cors?: boolean | { origins?: string[] | '*'; credentials?: boolean }
	prefix?: string | false | null
	pluginPrefixes?: Record<string, unknown>
}

export interface TestServer {
	baseUrl: string
	port: number
	engine: unknown // NodeEngine
	fetch: (path: string, init?: RequestInit) => Promise<Response>
	stop: () => Promise<void>
}

/**
 * Set up required mocks for integration tests.
 * Must be called at module scope BEFORE any dynamic imports.
 */
export function createMockPluginOptions(options: TestServerOptions = {}) {
	return {
		cors: options.cors ?? false,
		prefix: options.prefix ?? '/api',
		engine: undefined
	}
}

/**
 * Start a test server on a random available port.
 * Returns a TestServer with fetch helper and cleanup.
 */
export async function startTestServer(
	mockPluginOptions: Record<string, unknown>,
	NodeEngine: new () => any,
	options: { port?: number } = {}
): Promise<TestServer> {
	const engine = new NodeEngine()
	await engine.init({})

	const port = options.port ?? (20000 + Math.floor(Math.random() * 10000))
	await engine.start({ hostname: '127.0.0.1', port })

	const baseUrl = `http://127.0.0.1:${port}`
	const server = engine.getHttpServer()
	if (server) {
		server.unref()
	}

	return {
		baseUrl,
		port,
		engine,
		fetch: (path: string, init?: RequestInit) => fetch(`${baseUrl}${path}`, init),
		stop: async () => {
			await engine.stop()
		}
	}
}

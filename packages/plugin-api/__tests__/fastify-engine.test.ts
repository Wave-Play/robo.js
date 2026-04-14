import { describe, expect, it, jest, beforeEach } from '@jest/globals'

const mockListen = jest.fn((_opts: unknown, cb: () => void) => cb())
const mockClose = jest.fn(() => Promise.resolve())
const mockRoute = jest.fn()
const mockRemoveAllContentTypeParsers = jest.fn()
const mockAddContentTypeParser = jest.fn()
const mockSetErrorHandler = jest.fn()
const mockSetNotFoundHandler = jest.fn()

const mockFastifyServer = {
	listen: mockListen,
	close: mockClose,
	route: mockRoute,
	removeAllContentTypeParsers: mockRemoveAllContentTypeParsers,
	addContentTypeParser: mockAddContentTypeParser,
	setErrorHandler: mockSetErrorHandler,
	setNotFoundHandler: mockSetNotFoundHandler,
	server: { fake: 'http-server' }
}

jest.unstable_mockModule('fastify', () => ({
	fastify: jest.fn(() => mockFastifyServer)
}))

const mockLogger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn() }
jest.unstable_mockModule('../src/core/logger.js', () => ({
	logger: mockLogger
}))

jest.unstable_mockModule('../src/core/handler.js', () => ({
	handlePublicFile: jest.fn(() => Promise.resolve(false))
}))

jest.unstable_mockModule('../src/core/robo-request.js', () => ({
	RoboRequest: { from: jest.fn(() => Promise.resolve({ method: 'GET' })) },
	applyParams: jest.fn()
}))

jest.unstable_mockModule('robo.js', () => ({
	color: { bold: (s: string) => s, blue: (s: string) => s },
	composeColors: (...fns: ((s: string) => string)[]) => (s: string) => fns.reduce((acc, fn) => fn(acc), s),
	Robo: { status: { set: jest.fn() } }
}))

describe('FastifyEngine', () => {
	let FastifyEngine: typeof import('../src/engines/fastify.js').FastifyEngine

	beforeEach(async () => {
		jest.clearAllMocks()
		const mod = await import('../src/engines/fastify.js')
		FastifyEngine = mod.FastifyEngine
	})

	describe('init()', () => {
		it('creates a Fastify instance and configures parsers, error handler, and not-found handler', async () => {
			const engine = new FastifyEngine()
			await engine.init({})

			expect(mockRemoveAllContentTypeParsers).toHaveBeenCalled()
			expect(mockAddContentTypeParser).toHaveBeenCalledWith('*', expect.any(Function))
			expect(mockSetErrorHandler).toHaveBeenCalledWith(expect.any(Function))
			expect(mockSetNotFoundHandler).toHaveBeenCalledWith(expect.any(Function))
		})

		it('stores the vite dev server reference from init options', async () => {
			const engine = new FastifyEngine()
			const fakeVite = { middlewares: jest.fn() }
			await engine.init({ vite: fakeVite as never })

			expect((engine as any)._vite).toBe(fakeVite)
		})
	})

	describe('start() / stop() / isRunning()', () => {
		it('start sets isRunning true and calls fastify.listen with hostname and port', async () => {
			const engine = new FastifyEngine()
			await engine.init({})

			expect(engine.isRunning()).toBe(false)
			await engine.start({ hostname: '0.0.0.0', port: 3000 })

			expect(engine.isRunning()).toBe(true)
			expect(mockListen).toHaveBeenCalledWith(
				expect.objectContaining({ host: '0.0.0.0', port: 3000 }),
				expect.any(Function)
			)
		})

		it('stop sets isRunning false and calls fastify.close', async () => {
			const engine = new FastifyEngine()
			await engine.init({})
			await engine.start({ port: 3000 })

			expect(engine.isRunning()).toBe(true)
			await engine.stop()

			expect(engine.isRunning()).toBe(false)
			expect(mockClose).toHaveBeenCalled()
		})

		it('double-start warns and resolves without calling listen again', async () => {
			const engine = new FastifyEngine()
			await engine.init({})
			await engine.start({ port: 3000 })

			mockListen.mockClear()
			await engine.start({ port: 3000 })

			expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('already up and running'))
			expect(mockListen).not.toHaveBeenCalled()
		})

		it('double-stop reuses the internal stop promise and does not call close twice', async () => {
			const engine = new FastifyEngine()
			await engine.init({})
			await engine.start({ port: 3000 })

			const stopPromise1 = engine.stop()
			const stopPromise2 = engine.stop()

			await Promise.all([stopPromise1, stopPromise2])
			expect(mockClose).toHaveBeenCalledTimes(1)
		})
	})

	describe('getHttpServer()', () => {
		it('returns fastify.server', async () => {
			const engine = new FastifyEngine()
			await engine.init({})

			expect(engine.getHttpServer()).toBe(mockFastifyServer.server)
		})
	})

	describe('registerRoute()', () => {
		it('calls fastify.route() with all HTTP methods and the path', async () => {
			const engine = new FastifyEngine()
			await engine.init({})

			const handler = jest.fn()
			engine.registerRoute('/api/test', handler as never)

			expect(mockRoute).toHaveBeenCalledWith(
				expect.objectContaining({
					method: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
					url: '/api/test',
					handler: expect.any(Function)
				})
			)
		})
	})

	describe('supportsRouteMutation()', () => {
		it('returns false', async () => {
			const engine = new FastifyEngine()
			await engine.init({})

			expect(engine.supportsRouteMutation()).toBe(false)
		})
	})

	describe('unregisterRoute()', () => {
		it('is a no-op that logs a debug message', async () => {
			const engine = new FastifyEngine()
			await engine.init({})

			engine.unregisterRoute('/api/test')

			expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('not supported'))
		})
	})

	describe('replaceRoute()', () => {
		it('is a no-op that logs a debug message', async () => {
			const engine = new FastifyEngine()
			await engine.init({})

			engine.replaceRoute('/api/test', jest.fn() as never)

			expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('not supported'))
		})
	})

	describe('hasRoute()', () => {
		it('always returns false', async () => {
			const engine = new FastifyEngine()
			await engine.init({})

			expect(engine.hasRoute('/api/test')).toBe(false)
			expect(engine.hasRoute('/anything')).toBe(false)
		})
	})

	describe('registerWebsocket()', () => {
		it('logs a warning about unsupported websockets', async () => {
			const engine = new FastifyEngine()
			await engine.init({})

			;(engine as any).registerWebsocket()

			expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('not supported'))
		})
	})

	describe('registerNotFound()', () => {
		it('stores the not-found handler reference', async () => {
			const engine = new FastifyEngine()
			await engine.init({})

			const handler = jest.fn()
			engine.registerNotFound(handler as never)

			expect((engine as any)._notFound).toBe(handler)
		})
	})

	describe('setupVite()', () => {
		it('stores the vite dev server reference', async () => {
			const engine = new FastifyEngine()
			await engine.init({})

			const fakeVite = { middlewares: jest.fn(), close: jest.fn() }
			engine.setupVite(fakeVite as never)

			expect((engine as any)._vite).toBe(fakeVite)
		})
	})
})

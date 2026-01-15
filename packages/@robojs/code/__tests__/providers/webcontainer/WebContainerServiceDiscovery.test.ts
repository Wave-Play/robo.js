/**
 * Unit tests for WebContainerServiceDiscovery
 *
 * Tests service lifecycle, URL discovery, and concurrent service handling
 * using mocked WebContainer API.
 */

import {
	WebContainerServiceDiscovery,
	type WebContainerServiceDiscoveryConfig
} from '../../../src/providers/webcontainer/WebContainerServiceDiscovery.js'
import { CodeAgentError } from '../../../src/errors/index.js'
import {
	createMockContainer,
	createMockProcess,
	createAutoCompletingProcess,
	simulateServerReady,
	simulatePortEvent,
	type MockContainer
} from '../../mocks/webcontainer.js'

/**
 * Helper to assert CodeAgentError with specific code
 */
async function expectCodeAgentError(promise: Promise<unknown>, code: string) {
	try {
		await promise
		fail(`Expected CodeAgentError with code ${code}`)
	} catch (e) {
		expect(CodeAgentError.isCodeAgentError(e)).toBe(true)
		expect((e as CodeAgentError).code).toBe(code)
	}
}

// Helper type to cast mock container
type ContainerType = WebContainerServiceDiscoveryConfig['container']

describe('WebContainerServiceDiscovery', () => {
	let container: MockContainer
	let discovery: WebContainerServiceDiscovery

	beforeEach(() => {
		container = createMockContainer()
		discovery = new WebContainerServiceDiscovery({
			container: container as unknown as ContainerType,
			rootDir: '/',
			defaultTimeout: 5000 // Short timeout for tests
		})
	})

	afterEach(async () => {
		// Suppress ABORT errors during cleanup - these are expected when
		// services are stopped before their URLs are resolved
		try {
			await discovery.stopAll()
		} catch {
			// Ignore cleanup errors
		}
	})

	describe('Constructor & Setup', () => {
		it('should use default service configs', () => {
			expect(discovery).toBeDefined()
			expect(discovery.getActiveServiceCount()).toBe(0)
		})

		it('should merge custom service configs', () => {
			const customDiscovery = new WebContainerServiceDiscovery({
				container: container as unknown as ContainerType,
				services: {
					mock: {
						command: 'custom-robo',
						args: ['mock', '--special'],
						defaultPort: 4000
					}
				}
			})
			expect(customDiscovery).toBeDefined()
		})

		it('should use default timeout (60000)', () => {
			const defaultDiscovery = new WebContainerServiceDiscovery({
				container: container as unknown as ContainerType
			})
			// We can't directly access private fields, but we can verify it was created
			expect(defaultDiscovery).toBeDefined()
		})

		it('should use custom timeout', () => {
			const customDiscovery = new WebContainerServiceDiscovery({
				container: container as unknown as ContainerType,
				defaultTimeout: 30000
			})
			expect(customDiscovery).toBeDefined()
		})

		it('should set rootDir', () => {
			const customDiscovery = new WebContainerServiceDiscovery({
				container: container as unknown as ContainerType,
				rootDir: '/project'
			})
			expect(customDiscovery).toBeDefined()
		})
	})

	describe('Service Lifecycle', () => {
		describe('start', () => {
			it('should spawn process with correct command/args', async () => {
				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))

				await discovery.start('mock')

				expect(container.spawn).toHaveBeenCalledWith('npx', ['robo', 'mock'], expect.objectContaining({ cwd: '/' }))
			})

			it('should return unique serviceId', async () => {
				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))
				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))

				const result1 = await discovery.start('mock')
				const result2 = await discovery.start('dev')

				expect(result1.serviceId).toContain('mock')
				expect(result2.serviceId).toContain('dev')
				expect(result1.serviceId).not.toBe(result2.serviceId)
			})

			it('should register service in internal map', async () => {
				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))

				expect(discovery.getActiveServiceCount()).toBe(0)
				await discovery.start('mock')
				expect(discovery.getActiveServiceCount()).toBe(1)
			})

			it('should setup listeners (idempotent)', async () => {
				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))
				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))

				await discovery.start('mock')
				await discovery.start('dev')

				// 'on' should be called for 'server-ready' and 'port' events
				// But only once due to idempotency
				const onCalls = container.on.mock.calls
				expect(onCalls.filter((c) => c[0] === 'server-ready').length).toBe(1)
				expect(onCalls.filter((c) => c[0] === 'port').length).toBe(1)
			})

			it('should use custom port when provided', async () => {
				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))

				await discovery.start('mock', { port: 5000 })

				expect(container.spawn).toHaveBeenCalledWith('npx', ['robo', 'mock', '--port', '5000'], expect.any(Object))
			})

			it('should use custom env when provided', async () => {
				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))

				await discovery.start('mock', { env: { NODE_ENV: 'test' } })

				expect(container.spawn).toHaveBeenCalledWith(
					'npx',
					['robo', 'mock'],
					expect.objectContaining({ env: expect.objectContaining({ NODE_ENV: 'test' }) })
				)
			})

			it('should throw EXECUTION_FAILED on spawn error', async () => {
				container.spawn.mockRejectedValueOnce(new Error('Cannot spawn'))

				await expectCodeAgentError(discovery.start('mock'), 'EXECUTION_FAILED')
			})
		})

		describe('waitForUrl', () => {
			it('should return url if already resolved', async () => {
				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))

				const { serviceId } = await discovery.start('mock')

				// Simulate server-ready before calling waitForUrl
				simulateServerReady(container, 3000, 'http://localhost:3000')

				const result = await discovery.waitForUrl(serviceId)
				expect(result.url).toBe('http://localhost:3000')
			})

			it('should wait for server-ready event', async () => {
				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))

				const { serviceId } = await discovery.start('mock')

				// Start waiting for URL
				const urlPromise = discovery.waitForUrl(serviceId)

				// Simulate server-ready after a short delay (use setImmediate to ensure it fires)
				await new Promise<void>((resolve) => {
					setImmediate(() => {
						simulateServerReady(container, 3000, 'http://localhost:3000')
						resolve()
					})
				})

				const result = await urlPromise
				expect(result.url).toBe('http://localhost:3000')
			})

			it('should throw INVALID_STATE for unknown service', async () => {
				await expectCodeAgentError(discovery.waitForUrl('nonexistent'), 'INVALID_STATE')
			})

			it('should throw INVALID_STATE for stopped service', async () => {
				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))

				const { serviceId } = await discovery.start('mock')
				await discovery.stop(serviceId)

				await expectCodeAgentError(discovery.waitForUrl(serviceId), 'INVALID_STATE')
			})

			it('should throw TIMEOUT after defaultTimeout', async () => {
				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))

				// Use a very short timeout
				const shortTimeoutDiscovery = new WebContainerServiceDiscovery({
					container: container as unknown as ContainerType,
					defaultTimeout: 50
				})

				const { serviceId } = await shortTimeoutDiscovery.start('mock')

				// Don't simulate server-ready - should timeout
				await expectCodeAgentError(shortTimeoutDiscovery.waitForUrl(serviceId), 'TIMEOUT')

				await shortTimeoutDiscovery.stopAll()
			})

			it('should resolve via port event as well', async () => {
				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))

				const { serviceId } = await discovery.start('mock')

				// Start waiting for URL
				const urlPromise = discovery.waitForUrl(serviceId)

				// Simulate port 'open' event instead of server-ready (use setImmediate to ensure it fires)
				await new Promise<void>((resolve) => {
					setImmediate(() => {
						simulatePortEvent(container, 3000, 'open', 'http://localhost:3000')
						resolve()
					})
				})

				const result = await urlPromise
				expect(result.url).toBe('http://localhost:3000')
			})
		})

		describe('stop', () => {
			it('should kill process', async () => {
				const process = createMockProcess(0, [])
				container.spawn.mockResolvedValueOnce(process)

				const { serviceId } = await discovery.start('mock')
				await discovery.stop(serviceId)

				expect(process.kill).toHaveBeenCalled()
			})

			it('should reject pending URL promise with ABORT', async () => {
				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))

				const { serviceId } = await discovery.start('mock')

				// Start waiting for URL
				const urlPromise = discovery.waitForUrl(serviceId)

				// Stop immediately (before URL is resolved)
				await discovery.stop(serviceId)

				// The URL promise should be rejected
				await expectCodeAgentError(urlPromise, 'ABORT')
			})

			it('should remove service from map', async () => {
				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))

				const { serviceId } = await discovery.start('mock')
				expect(discovery.getActiveServiceCount()).toBe(1)

				await discovery.stop(serviceId)
				expect(discovery.getActiveServiceCount()).toBe(0)
			})

			it('should be idempotent (no error on non-existent)', async () => {
				// Stopping a non-existent service should not throw
				await discovery.stop('nonexistent')
			})

			it('should handle double-stop gracefully', async () => {
				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))

				const { serviceId } = await discovery.start('mock')
				await discovery.stop(serviceId)
				await discovery.stop(serviceId) // Should not throw
			})
		})

		describe('stopAll', () => {
			it('should stop all services', async () => {
				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))
				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))
				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))

				await discovery.start('mock')
				await discovery.start('dev')
				await discovery.start('mcp')

				expect(discovery.getActiveServiceCount()).toBe(3)

				await discovery.stopAll()
				expect(discovery.getActiveServiceCount()).toBe(0)
			})

			it('should set count to 0', async () => {
				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))

				await discovery.start('mock')
				expect(discovery.getActiveServiceCount()).toBe(1)

				await discovery.stopAll()
				expect(discovery.getActiveServiceCount()).toBe(0)
			})
		})
	})

	describe('Event Handling', () => {
		describe('handleServerReady', () => {
			it('should resolve URL for matching port', async () => {
				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))

				const { serviceId } = await discovery.start('mock') // default port 3000

				// Start waiting
				const urlPromise = discovery.waitForUrl(serviceId)

				// Emit server-ready with matching port
				simulateServerReady(container, 3000, 'http://localhost:3000')

				const result = await urlPromise
				expect(result.url).toBe('http://localhost:3000')
			})

			it('should use fallback matching when port not registered', async () => {
				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))

				const { serviceId } = await discovery.start('mock') // expects port 3000

				const urlPromise = discovery.waitForUrl(serviceId)

				// Emit with different port - should still match via fallback
				simulateServerReady(container, 8080, 'http://localhost:8080')

				const result = await urlPromise
				expect(result.url).toBe('http://localhost:8080')
			})

			it('should not resolve already-resolved services', async () => {
				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))

				const { serviceId } = await discovery.start('mock')

				// Emit first server-ready
				simulateServerReady(container, 3000, 'http://localhost:3000')

				const result1 = await discovery.waitForUrl(serviceId)
				expect(result1.url).toBe('http://localhost:3000')

				// Emit second server-ready with different URL
				simulateServerReady(container, 3001, 'http://localhost:3001')

				// URL should still be the first one
				const result2 = await discovery.waitForUrl(serviceId)
				expect(result2.url).toBe('http://localhost:3000')
			})

			it('should not resolve stopped services', async () => {
				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))

				const { serviceId } = await discovery.start('mock')
				await discovery.stop(serviceId)

				// Emit server-ready after stop
				simulateServerReady(container, 3000, 'http://localhost:3000')

				// Service should not be resolved
				await expectCodeAgentError(discovery.waitForUrl(serviceId), 'INVALID_STATE')
			})
		})

		describe('setupListeners', () => {
			it('should be idempotent (only setup once)', async () => {
				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))
				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))
				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))

				await discovery.start('mock')
				await discovery.start('dev')
				await discovery.start('mcp')

				// Should only have 2 'on' calls total (server-ready + port)
				expect(container.on).toHaveBeenCalledTimes(2)
			})

			it('should register server-ready listener', async () => {
				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))

				await discovery.start('mock')

				expect(container.on).toHaveBeenCalledWith('server-ready', expect.any(Function))
			})

			it('should register port listener', async () => {
				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))

				await discovery.start('mock')

				expect(container.on).toHaveBeenCalledWith('port', expect.any(Function))
			})
		})
	})

	describe('Utility Methods', () => {
		describe('getActiveServiceCount', () => {
			it('should return correct count', async () => {
				expect(discovery.getActiveServiceCount()).toBe(0)

				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))
				await discovery.start('mock')
				expect(discovery.getActiveServiceCount()).toBe(1)

				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))
				await discovery.start('dev')
				expect(discovery.getActiveServiceCount()).toBe(2)
			})
		})

		describe('isRunning', () => {
			it('should return true for running service', async () => {
				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))

				const { serviceId } = await discovery.start('mock')
				expect(discovery.isRunning(serviceId)).toBe(true)
			})

			it('should return false for stopped/unknown service', async () => {
				expect(discovery.isRunning('unknown')).toBe(false)

				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))
				const { serviceId } = await discovery.start('mock')

				await discovery.stop(serviceId)
				expect(discovery.isRunning(serviceId)).toBe(false)
			})
		})

		describe('getUrl', () => {
			it('should return url if resolved', async () => {
				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))

				const { serviceId } = await discovery.start('mock')
				simulateServerReady(container, 3000, 'http://localhost:3000')

				// Wait for URL to be resolved
				await discovery.waitForUrl(serviceId)

				expect(discovery.getUrl(serviceId)).toBe('http://localhost:3000')
			})

			it('should return null if not resolved or unknown', async () => {
				expect(discovery.getUrl('unknown')).toBeNull()

				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))
				const { serviceId } = await discovery.start('mock')

				// URL not yet resolved
				expect(discovery.getUrl(serviceId)).toBeNull()
			})
		})
	})

	describe('Concurrent Services', () => {
		it('should handle multiple services on different ports', async () => {
			container.spawn.mockResolvedValueOnce(createMockProcess(0, []))
			container.spawn.mockResolvedValueOnce(createMockProcess(0, []))

			const mock = await discovery.start('mock', { port: 3000 })
			const dev = await discovery.start('dev', { port: 3001 })

			expect(discovery.getActiveServiceCount()).toBe(2)

			// Each should be able to get their URL
			const mockUrlPromise = discovery.waitForUrl(mock.serviceId)
			const devUrlPromise = discovery.waitForUrl(dev.serviceId)

			// Simulate both becoming ready
			simulateServerReady(container, 3000, 'http://localhost:3000')
			simulateServerReady(container, 3001, 'http://localhost:3001')

			const mockResult = await mockUrlPromise
			const devResult = await devUrlPromise

			expect(mockResult.url).toBe('http://localhost:3000')
			expect(devResult.url).toBe('http://localhost:3001')
		})

		it('should not mix up URLs between services', async () => {
			container.spawn.mockResolvedValueOnce(createMockProcess(0, []))
			container.spawn.mockResolvedValueOnce(createMockProcess(0, []))

			const mock = await discovery.start('mock', { port: 3000 })
			const dev = await discovery.start('dev', { port: 3001 })

			// Resolve mock first
			simulateServerReady(container, 3000, 'http://mock:3000')
			const mockUrl = await discovery.waitForUrl(mock.serviceId)

			// Resolve dev second
			simulateServerReady(container, 3001, 'http://dev:3001')
			const devUrl = await discovery.waitForUrl(dev.serviceId)

			expect(mockUrl.url).toBe('http://mock:3000')
			expect(devUrl.url).toBe('http://dev:3001')
		})

		it('should correctly match server-ready events to services', async () => {
			container.spawn.mockResolvedValueOnce(createMockProcess(0, []))
			container.spawn.mockResolvedValueOnce(createMockProcess(0, []))

			const mock = await discovery.start('mock', { port: 4000 })
			const dev = await discovery.start('dev', { port: 5000 })

			// Emit dev first even though mock was started first
			simulateServerReady(container, 5000, 'http://dev:5000')

			const devUrl = await discovery.waitForUrl(dev.serviceId)
			expect(devUrl.url).toBe('http://dev:5000')

			// Mock should still be waiting
			expect(discovery.getUrl(mock.serviceId)).toBeNull()

			// Now resolve mock
			simulateServerReady(container, 4000, 'http://mock:4000')
			const mockUrl = await discovery.waitForUrl(mock.serviceId)
			expect(mockUrl.url).toBe('http://mock:4000')
		})

		it('should cleanup all services independently', async () => {
			container.spawn.mockResolvedValueOnce(createMockProcess(0, []))
			container.spawn.mockResolvedValueOnce(createMockProcess(0, []))
			container.spawn.mockResolvedValueOnce(createMockProcess(0, []))

			const s1 = await discovery.start('mock')
			const s2 = await discovery.start('dev')
			const s3 = await discovery.start('mcp')

			expect(discovery.getActiveServiceCount()).toBe(3)

			// Stop first service
			await discovery.stop(s1.serviceId)
			expect(discovery.getActiveServiceCount()).toBe(2)
			expect(discovery.isRunning(s1.serviceId)).toBe(false)
			expect(discovery.isRunning(s2.serviceId)).toBe(true)
			expect(discovery.isRunning(s3.serviceId)).toBe(true)

			// Stop second service
			await discovery.stop(s2.serviceId)
			expect(discovery.getActiveServiceCount()).toBe(1)
			expect(discovery.isRunning(s2.serviceId)).toBe(false)
			expect(discovery.isRunning(s3.serviceId)).toBe(true)

			// Stop third service
			await discovery.stop(s3.serviceId)
			expect(discovery.getActiveServiceCount()).toBe(0)
		})

		it('should handle race conditions between start and server-ready', async () => {
			// Create a container that emits server-ready immediately during spawn
			const fastContainer = createMockContainer()
			fastContainer.spawn.mockImplementation(async () => {
				const process = createMockProcess(0, [])
				// Emit server-ready synchronously (simulating very fast startup)
				// Use setImmediate to ensure it fires after setup but before waitForUrl resolves
				setImmediate(() => {
					fastContainer.emit('server-ready', 3000, 'http://fast:3000')
				})
				return process
			})

			const fastDiscovery = new WebContainerServiceDiscovery({
				container: fastContainer as unknown as ContainerType
			})

			const { serviceId } = await fastDiscovery.start('mock')

			// Wait for the setImmediate to fire
			await new Promise((resolve) => setImmediate(resolve))

			const result = await fastDiscovery.waitForUrl(serviceId)

			expect(result.url).toBe('http://fast:3000')

			await fastDiscovery.stopAll()
		})
	})

	describe('Process Exit Handling', () => {
		it('should reject URL promise if process exits before ready', async () => {
			const exitingProcess = createMockProcess(1, [])
			// Resolve exit immediately
			setTimeout(() => {
				exitingProcess._resolve!(1)
			}, 10)
			container.spawn.mockResolvedValueOnce(exitingProcess)

			const { serviceId } = await discovery.start('mock')

			// URL promise should be rejected when process exits
			await expectCodeAgentError(discovery.waitForUrl(serviceId), 'EXECUTION_FAILED')
		})
	})
})

/**
 * HMR Test Helpers
 *
 * Utilities for testing HMR lifecycle hooks, subscription API, and related functionality.
 */

import { jest } from '@jest/globals'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { HmrEventContext, HmrEventRouteInfo, HmrSubscribeOptions } from '../../src/core/hmr.js'
import type { HmrRouteInfo, HmrHookConfig } from '../../src/types/lifecycle.js'

/**
 * Creates a temporary directory for test projects.
 */
export function createTempProjectDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'hmr-test-project-'))
}

/**
 * Removes a temporary directory and all its contents.
 */
export function cleanupTempDir(dir: string): void {
	fs.rmSync(dir, { recursive: true, force: true })
}

/**
 * Creates a file in the temp directory with the given content.
 */
export function createFile(baseDir: string, filePath: string, content: string): void {
	const fullPath = path.join(baseDir, filePath)
	const dir = path.dirname(fullPath)
	fs.mkdirSync(dir, { recursive: true })
	fs.writeFileSync(fullPath, content, 'utf-8')
}

/**
 * Creates a project HMR hook file.
 */
export function createProjectHook(
	baseDir: string,
	hookType: string,
	code: string,
	fileExtension: 'ts' | 'js' = 'ts'
): void {
	createFile(baseDir, `src/robo/${hookType}.${fileExtension}`, code)
}

/**
 * Creates a mock plugin HMR hook in the test directory structure.
 */
export function createPluginHook(
	baseDir: string,
	pluginName: string,
	hookType: string,
	code?: string,
	fileExtension: 'ts' | 'js' = 'ts'
): void {
	const defaultCode = `
		export default async (ctx) => {
			console.log('[${pluginName}] HMR hook executed')
		}
	`
	const pluginDir = pluginName.startsWith('@') ? pluginName : `node_modules/${pluginName}`
	createFile(baseDir, `${pluginDir}/dist/robo/${hookType}.${fileExtension}`, code ?? defaultCode)
}

/**
 * Modifies an existing file (appends a comment to trigger change detection).
 */
export function modifyFile(baseDir: string, filePath: string): void {
	const fullPath = path.join(baseDir, filePath)
	const content = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf-8') : ''
	fs.writeFileSync(fullPath, content + `\n// Modified at ${Date.now()}`, 'utf-8')
}

/**
 * Input for creating an HMR event context.
 */
export interface HmrContextInput {
	changeType?: 'change' | 'add' | 'remove'
	files?: string[]
	namespace?: string
	route?: string
	handlers?: Array<{
		key: string
		path: string
		changeType?: 'add' | 'remove' | 'change'
		plugin?: { name: string; version: string }
	}>
	routes?: HmrEventRouteInfo[]
	mode?: string
}

/**
 * Creates an HmrEventContext for testing.
 */
export function createContext(overrides: HmrContextInput = {}): HmrEventContext {
	const defaultHandler = {
		key: 'test-handler',
		path: 'test/handler.js',
		changeType: 'change' as const
	}
	const handlers = overrides.handlers?.map((handler) => ({
		...handler,
		changeType: handler.changeType ?? 'change'
	}))

	const defaultRoute: HmrEventRouteInfo = {
		namespace: overrides.namespace ?? 'server',
		route: overrides.route ?? 'api',
		handlers: handlers ?? [defaultHandler]
	}

	return {
		changeType: overrides.changeType ?? 'change',
		files: overrides.files ?? ['src/test-file.ts'],
		routes: overrides.routes ?? [defaultRoute],
		mode: overrides.mode ?? 'development'
	}
}

/**
 * Creates a full HmrEventContext with multiple routes.
 */
export function createFullContext(routes?: HmrEventRouteInfo[]): HmrEventContext {
	const defaultRoutes: HmrEventRouteInfo[] = [
		{
			namespace: 'server',
			route: 'api',
			handlers: [{ key: 'users', path: 'api/users.js', changeType: 'change' }]
		},
		{
			namespace: 'discordjs',
			route: 'commands',
			handlers: [{ key: 'ping', path: 'commands/ping.js', changeType: 'change' }]
		}
	]

	return {
		changeType: 'change',
		files: ['src/test.ts'],
		routes: routes ?? defaultRoutes,
		mode: 'development'
	}
}

/**
 * Creates an HmrRouteInfo (for lifecycle hooks, not event context).
 */
export function createHmrRouteInfo(overrides: Partial<HmrRouteInfo> = {}): HmrRouteInfo {
	return {
		namespace: overrides.namespace ?? 'server',
		route: overrides.route ?? 'api',
		handlers:
			overrides.handlers?.map((handler) => ({
				...handler,
				changeType: handler.changeType ?? 'change'
			})) ?? [{ key: 'test', path: 'test.js', changeType: 'change' }]
	}
}

/**
 * Creates an HmrHookConfig for testing hook filtering.
 */
export function createHookConfig(overrides: Partial<HmrHookConfig> = {}): HmrHookConfig {
	return {
		namespaces: overrides.namespaces,
		routes: overrides.routes
	}
}

/**
 * Creates HmrSubscribeOptions for testing subscription filtering.
 */
export function createSubscribeOptions(overrides: Partial<HmrSubscribeOptions> = {}): HmrSubscribeOptions {
	return {
		namespaces: overrides.namespaces,
		routes: overrides.routes,
		changeTypes: overrides.changeTypes
	}
}

/**
 * Deferred promise helper for async test coordination.
 */
export interface Deferred<T> {
	promise: Promise<T>
	resolve: (value: T) => void
	reject: (error: Error) => void
}

/**
 * Creates a deferred promise that can be resolved/rejected externally.
 */
export function createDeferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void
	let reject!: (error: Error) => void

	const promise = new Promise<T>((res, rej) => {
		resolve = res
		reject = rej
	})

	return { promise, resolve, reject }
}

/**
 * Waits for a condition to be true, polling at regular intervals.
 */
export async function waitFor<T>(
	fn: () => T | undefined | null,
	options: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<T> {
	const { timeoutMs = 5000, intervalMs = 50 } = options
	const start = Date.now()

	while (Date.now() - start < timeoutMs) {
		const result = fn()
		if (result !== undefined && result !== null) {
			return result
		}
		await new Promise((r) => setTimeout(r, intervalMs))
	}

	throw new Error(`waitFor timed out after ${timeoutMs}ms`)
}

/**
 * Waits for a specified amount of time.
 */
export function delay(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms))
}

/**
 * Mock parent port interface for testing spirit IPC.
 */
export interface MockParentPort {
	messages: Array<{ event: string; payload?: unknown }>
	sendMessage(message: { event: string; payload?: unknown }): Promise<{ success: boolean; error?: string }>
	reset(): void
	setRoboRunning(running: boolean): void
	registerHook(hookType: string, callback: () => void): void
	registerSubscriber(callback: (ctx: HmrEventContext) => void): void
}

/**
 * Creates a mock parent port for testing spirit worker IPC.
 */
export function createMockParentPort(): MockParentPort {
	let roboRunning = true
	const messages: Array<{ event: string; payload?: unknown }> = []
	const hooks: Map<string, Array<() => void>> = new Map()
	const subscribers: Array<(ctx: HmrEventContext) => void> = []

	return {
		messages,

		async sendMessage(message: { event: string; payload?: unknown }): Promise<{ success: boolean; error?: string }> {
			messages.push(message)

			if (!roboRunning) {
				return { success: false, error: 'Robo is not running' }
			}

			// Validate hmr-notify payload
			if (message.event === 'hmr-notify') {
				const payload = message.payload as {
					changeType?: unknown
					files?: unknown
					routes?: unknown
				}

				if (!payload) {
					return { success: false, error: 'Missing payload' }
				}

				const validChangeTypes = ['change', 'add', 'remove']
				if (!validChangeTypes.includes(payload.changeType as string)) {
					return { success: false, error: 'Invalid changeType' }
				}

				if (!Array.isArray(payload.files)) {
					return { success: false, error: 'Invalid files' }
				}

				if (!Array.isArray(payload.routes)) {
					return { success: false, error: 'Invalid routes' }
				}

				// Execute hooks
				const hmrHooks = hooks.get('hmr') ?? []
				for (const hook of hmrHooks) {
					hook()
				}

				// Notify subscribers
				for (const subscriber of subscribers) {
					subscriber(payload as unknown as HmrEventContext)
				}
			}

			return { success: true }
		},

		reset(): void {
			messages.length = 0
			hooks.clear()
			subscribers.length = 0
			roboRunning = true
		},

		setRoboRunning(running: boolean): void {
			roboRunning = running
		},

		registerHook(hookType: string, callback: () => void): void {
			if (!hooks.has(hookType)) {
				hooks.set(hookType, [])
			}
			hooks.get(hookType)!.push(callback)
		},

		registerSubscriber(callback: (ctx: HmrEventContext) => void): void {
			subscribers.push(callback)
		}
	}
}

/**
 * Creates a mock PluginData object for testing.
 */
export function createMockPluginData(
	name: string,
	options?: {
		version?: string
		path?: string
		namespace?: string
		metaOptions?: Record<string, unknown>
		options?: Record<string, unknown>
	}
) {
	return {
		name,
		version: options?.version ?? '1.0.0',
		path: options?.path,
		namespace: options?.namespace,
		metaOptions: options?.metaOptions,
		options: options?.options
	}
}

/**
 * Environment variable helpers for HMR tests.
 */
export class HmrEnvHelper {
	private originalRoboHmr: string | undefined

	/**
	 * Enable HMR mode.
	 */
	enableHmr(): void {
		this.originalRoboHmr = process.env.ROBO_HMR
		process.env.ROBO_HMR = 'true'
	}

	/**
	 * Disable HMR mode.
	 */
	disableHmr(): void {
		this.originalRoboHmr = process.env.ROBO_HMR
		delete process.env.ROBO_HMR
	}

	/**
	 * Restore original HMR environment.
	 */
	restore(): void {
		if (this.originalRoboHmr === undefined) {
			delete process.env.ROBO_HMR
		} else {
			process.env.ROBO_HMR = this.originalRoboHmr
		}
	}
}

/**
 * Clears the global HMR state.
 * Use this between tests to ensure isolation.
 */
export function clearGlobalHmrState(): void {
	delete (globalThis as Record<string, unknown>).__robo_hmr__
}

/**
 * Gets the global HMR state for inspection in tests.
 */
export function getGlobalHmrState(): {
	disposers: Map<string, unknown[]>
	data: Map<string, Record<string, unknown>>
	reloadCount: number
	subscribers: Set<unknown>
} | undefined {
	return (globalThis as { __robo_hmr__?: typeof globalThis.__robo_hmr__ }).__robo_hmr__
}

/**
 * Helper to import hmr module fresh (bypassing cache).
 */
export async function importHmrFresh() {
	jest.resetModules()
	const hmrModule = await import('../../src/core/hmr.js')
	return hmrModule
}

/**
 * Creates a test fixture for HMR hook testing.
 */
export interface HmrTestFixture {
	baseDir: string
	envHelper: HmrEnvHelper
	cleanup(): void
}

/**
 * Sets up a complete HMR test fixture.
 */
export function setupHmrTestFixture(): HmrTestFixture {
	const baseDir = createTempProjectDir()
	const envHelper = new HmrEnvHelper()

	return {
		baseDir,
		envHelper,
		cleanup(): void {
			envHelper.restore()
			cleanupTempDir(baseDir)
			clearGlobalHmrState()
		}
	}
}

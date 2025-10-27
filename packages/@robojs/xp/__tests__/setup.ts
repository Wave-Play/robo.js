/**
 * Jest setup file - runs before all tests
 * Configures global mocks and test environment
 */

import { jest } from '@jest/globals'
import { mockFlashcore, mockClient } from './helpers/mocks.js'

/**
 * ====================
 * GLOBAL MOCKS
 * ====================
 */

// Mock robo.js module completely
jest.mock('robo.js', () => {
	// Bridge robo.js Flashcore to the shared test mock so call assertions work
	const Flashcore = {
		get: (key: string, options?: { namespace?: string | string[]; default?: any }) => mockFlashcore.get(key, options),
		set: (key: string, value: any, options?: { namespace?: string | string[] }) =>
			mockFlashcore.set(key, value, options),
		delete: (key: string, options?: { namespace?: string | string[] }) => mockFlashcore.delete(key, options)
	}

	// Minimal logger stub used by compiled files (logger.fork(...).debug/error...)
	const baseLogger = {
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		trace: jest.fn(),
		wait: jest.fn(),
		log: jest.fn(),
		event: jest.fn(),
		ready: jest.fn()
	}
	const logger = {
		...baseLogger,
		fork: jest.fn(() => ({ ...baseLogger }))
	}

	return {
		Flashcore,
		client: mockClient,
		logger
	}
}, { virtual: true })

/**
 * ====================
 * ENVIRONMENT SETUP
 * ====================
 */

// Set NODE_ENV to test
process.env.NODE_ENV = 'test'

// Increase test timeout for integration tests
jest.setTimeout(10000)

/**
 * ====================
 * CONSOLE SUPPRESSION
 * ====================
 */

// Store original console methods
const originalConsole = {
	log: console.log,
	warn: console.warn,
	error: console.error,
	debug: console.debug,
	info: console.info
}

/**
 * Restores original console methods
 * Use this in individual tests if you need to see console output
 *
 * @example
 * beforeEach(() => {
 *   restoreConsole()
 * })
 */
export function restoreConsole(): void {
	global.console = {
		...console,
		...originalConsole
	}
}

/**
 * Suppresses console output
 * Use this to silence console during specific tests
 *
 * @example
 * beforeEach(() => {
 *   suppressConsole()
 * })
 */
export function suppressConsole(): void {
	global.console = {
		...console,
		log: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
		info: jest.fn()
	} as any
}

/**
 * ====================
 * GLOBAL CLEANUP
 * ====================
 */

// Clear all mocks after each test
afterEach(() => {
	jest.clearAllMocks()
	// Clear Flashcore storage
	if ((global as any).__flashcoreStorage__) {
		(global as any).__flashcoreStorage__.clear()
	}
})

// Restore all mocks after all tests
afterAll(() => {
	jest.restoreAllMocks()
	restoreConsole()
})

/**
 * ====================
 * UNHANDLED REJECTION HANDLING
 * ====================
 */

// Fail tests on unhandled promise rejections
process.on('unhandledRejection', (reason) => {
	console.error('Unhandled Rejection:', reason)
	throw reason
})

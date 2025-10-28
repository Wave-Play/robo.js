import { jest, afterEach, afterAll } from '@jest/globals'
import { mockFlashcore, mockLogger, mockGlobals, clearFlashcoreStorage, mockProcessSend } from './helpers/mocks.js'

// Note: We do NOT mock the built Flashcore module - we test the actual built code
// We only mock its dependencies (Globals, logger) so it uses our test doubles

// Create mock logger factory
const createMockLoggerModule = () => {
	// Create a mock Logger class
	class MockLogger {
		setup: any
		flush: any
		fork: any
		debug: any
		info: any
		warn: any
		error: any
		trace: any
		wait: any
		log: any
		event: any
		ready: any
		custom: any

		constructor() {
			this.setup = jest.fn()
			this.flush = jest.fn(async () => {})
			this.fork = jest.fn(() => new MockLogger())
			this.debug = mockLogger.debug
			this.info = mockLogger.info
			this.warn = mockLogger.warn
			this.error = mockLogger.error
			this.trace = mockLogger.trace
			this.wait = mockLogger.wait
			this.log = mockLogger.log
			this.event = mockLogger.event
			this.ready = mockLogger.ready
			this.custom = mockLogger.custom
		}
	}

	// Create a logger function with attached methods
	const loggerFunction: any = jest.fn(() => mockLogger)
	loggerFunction.flush = mockLogger.flush
	loggerFunction.fork = mockLogger.fork
	loggerFunction.debug = mockLogger.debug
	loggerFunction.info = mockLogger.info
	loggerFunction.warn = mockLogger.warn
	loggerFunction.error = mockLogger.error
	loggerFunction.trace = mockLogger.trace
	loggerFunction.wait = mockLogger.wait
	loggerFunction.log = mockLogger.log
	loggerFunction.event = mockLogger.event
	loggerFunction.ready = mockLogger.ready
	loggerFunction.custom = mockLogger.custom
	loggerFunction.getRecentLogs = jest.fn(() => [])

	return {
		Logger: MockLogger,
		logger: loggerFunction
	}
}

// Mock the logger module (source)
jest.mock('../src/core/logger.js', createMockLoggerModule, { virtual: true })

// Mock the built logger module
jest.mock('../dist/core/logger.js', createMockLoggerModule, { virtual: true })

// Mock the Globals module (source)
jest.mock('../src/core/globals.js', () => ({
	Globals: mockGlobals
}), { virtual: true })

// Mock the built Globals module
jest.mock('../dist/core/globals.js', () => ({
	Globals: mockGlobals
}), { virtual: true })

// Environment configuration
process.env.NODE_ENV = 'test'
jest.setTimeout(10000)

// Mock process.send for State tests
const originalProcessSend = process.send
;(process as any).send = mockProcessSend

// Console suppression
const originalConsole = {
	log: console.log,
	error: console.error,
	warn: console.warn,
	info: console.info,
	debug: console.debug
}

let consoleSuppressed = false

export function suppressConsole() {
	if (!consoleSuppressed) {
		console.log = jest.fn() as any
		console.error = jest.fn() as any
		console.warn = jest.fn() as any
		console.info = jest.fn() as any
		console.debug = jest.fn() as any
		consoleSuppressed = true
	}
}

export function restoreConsole() {
	if (consoleSuppressed) {
		console.log = originalConsole.log
		console.error = originalConsole.error
		console.warn = originalConsole.warn
		console.info = originalConsole.info
		console.debug = originalConsole.debug
		consoleSuppressed = false
	}
}

// Global cleanup hooks
afterEach(() => {
	jest.clearAllMocks()
	// Clear Flashcore mock storage to prevent state bleed across tests
	clearFlashcoreStorage()
})

afterAll(() => {
	jest.restoreAllMocks()
	restoreConsole()
	// Restore original process.send if it existed
	if (originalProcessSend) {
		;(process as any).send = originalProcessSend
	} else {
		delete (process as any).send
	}
})

// Unhandled rejection handling
process.on('unhandledRejection', (reason) => {
	console.error('Unhandled Rejection:', reason)
	throw reason
})

import { resetAllMocks } from './mocks.js'

/**
 * Set up test environment before each test
 */
export function setupTestEnvironment() {
	resetAllMocks()
}

/**
 * Clean up test environment after each test
 */
export function cleanupTestEnvironment() {
	resetAllMocks()
}

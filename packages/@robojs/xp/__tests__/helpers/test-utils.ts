/**
 * Test utilities for setting up and cleaning up test environments
 */

import { resetAllMocks } from './mocks.js'

/**
 * Sets up the test environment before each test
 * Clears all mocks and resets state
 */
export function setupTestEnvironment(): void {
	resetAllMocks()
}

/**
 * Cleans up the test environment after each test
 * Ensures no state leaks between tests
 */
export function cleanupTestEnvironment(): void {
	resetAllMocks()
}

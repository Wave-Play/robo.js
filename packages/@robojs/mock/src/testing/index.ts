/**
 * @robojs/mock/testing
 *
 * Testing utilities for writing integration tests with the mock Discord server.
 *
 * @example
 * ```typescript
 * import {
 *   createTestSession,
 *   dispatchEvent,
 *   expectAction
 * } from '@robojs/mock/testing'
 *
 * describe('my bot', () => {
 *   let session: TestSession
 *
 *   beforeAll(async () => {
 *     session = await createTestSession(__filename, { name: 'my-test' })
 *   })
 *
 *   afterAll(async () => {
 *     await session.destroy()
 *   })
 *
 *   it('should respond to messages', async () => {
 *     await dispatchEvent(session.id, 'MESSAGE_CREATE', {
 *       content: 'Hello'
 *     })
 *
 *     await expectAction(session.id, {
 *       description: 'Bot should reply',
 *       type: 'REST_CREATE_MESSAGE',
 *       expected: { content: expect.stringContaining('Hello') }
 *     })
 *   })
 * })
 * ```
 */

// Types
export type {
	AssertionResult,
	CreateTestSessionConfig,
	DispatchEventData,
	ExpectActionOptions,
	InteractionData,
	MockConfig,
	RecordedAction,
	SessionResponse,
	SessionState,
	TestFileEntry,
	TestResult,
	TestSession,
	TestSessionRegistry,
	WaitForActionOptions
} from './types.js'

export { DEFAULT_MOCK_CONFIG } from './types.js'

// Control API
export {
	configureMock,
	controlAPI,
	createSession,
	createTestSession,
	deleteSession,
	dispatchEvent,
	dispatchInteraction,
	getChannelMessages,
	getSessionActions,
	getSessionState,
	getMockConfig,
	mockRestAPI,
	resetMockConfig,
	resetSession,
	clearSessionActions
} from './control-api.js'

// Helpers
export {
	deepEquals,
	expectAction,
	expectNoAction,
	generateDiff,
	generateSnowflake,
	getHistoricalActions,
	recordAssertion,
	sleep,
	startMockRobo,
	waitForAction,
	waitForAnyAction,
	waitForInteractionResponse,
	waitForMessage,
	waitForMockServer
} from './helpers.js'

// Types for bot lifecycle
export type {
	MockRoboHandle,
	StartMockRoboOptions
} from './helpers.js'

// User utilities
export { TestUsers, TestInteractions, createTestUtils } from './user-utils.js'
export type { TestUtils } from './user-utils.js'

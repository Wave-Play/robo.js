# Testing Infrastructure

## Overview

Comprehensive testing utilities for Discord bot testing with session isolation, action recording, and Jest integration.

## Testing Utilities Export

**Entry:** `@robojs/mock/testing`

### Session Management

```typescript
// Create isolated test session
createTestSession(testFilePath: string, config?: CreateTestSessionConfig): Promise<TestSession>
createSession(config?: CreateSessionOptions): Promise<SessionResponse>
deleteSession(sessionId: string): Promise<void>
resetSession(sessionId: string): Promise<void>

// Get shared session for test file
getSharedSession(testFilePath: string): TestSession | undefined
```

### Event Dispatch

```typescript
// Dispatch Discord events
dispatchEvent(sessionId: string, eventName: string, data: unknown): Promise<void>
dispatchInteraction(sessionId: string, interaction: InteractionData): Promise<void>
```

### Action Assertions

```typescript
// Wait for actions
waitForAction(sessionId: string, options: WaitForActionOptions): Promise<RecordedAction[]>
waitForAnyAction(sessionId: string, filter: (action: RecordedAction) => boolean): Promise<RecordedAction>
waitForMessage(sessionId: string, options?: MessageWaitOptions): Promise<RecordedAction>
waitForInteractionResponse(sessionId: string, options: WaitForInteractionOptions): Promise<RecordedAction>

// Assert actions
expectAction(sessionId: string, options: ExpectActionOptions): Promise<void>
expectNoAction(sessionId: string, options: ExpectActionOptions): Promise<void>
```

### State Inspection

```typescript
// Get session data
getSessionState(sessionId: string): Promise<SessionState>
getSessionActions(sessionId: string, options?: ActionQueryOptions): Promise<RecordedAction[]>
getChannelMessages(sessionId: string, channelId: string): Promise<MockMessage[]>
getHistoricalActions(sessionId: string): Promise<RecordedAction[]>
```

### Bot Lifecycle

```typescript
// Start mock bot
startMockRobo(options?: MockRoboOptions): Promise<MockRoboHandle>
waitForMockServer(options?: WaitOptions): Promise<void>
```

### Utilities

```typescript
sleep(ms: number): Promise<void>
generateSnowflake(): string
deepEquals(actual: unknown, expected: unknown): boolean
generateDiff(expected: unknown, actual: unknown): string
```

## TestSession Interface

```typescript
interface TestSession {
  id: string                          // Session ID
  token: string                       // Bot token (mock:sess_xxx)
  name?: string                       // Display name
  botUser: { id: string, username: string }
  guilds: Array<{ id: string, name: string }>
  channels: Array<{ id: string, name: string, guildId?: string, type: number }>
  guildId: Snowflake                  // First guild ID (convenience)
  testFilePath?: string               // Associated test file
  destroy(): Promise<void>            // Cleanup
}
```

## Action Assertion Pattern

### expectAction

```typescript
interface ExpectActionOptions {
  description: string           // Human-readable description
  type: ActionType              // Action type to match
  expected?: unknown            // Expected data shape
  timeout?: number              // Wait timeout (default: 5000ms)
}

// Usage
await expectAction(session.id, {
  description: 'Bot should reply to message',
  type: 'REST_CREATE_MESSAGE',
  expected: {
    content: expect.stringContaining('Hello')
  }
})
```

### Jest Matcher Support

Works with Jest asymmetric matchers:
- `expect.stringContaining()`
- `expect.objectContaining()`
- `expect.arrayContaining()`
- Custom asymmetric matchers

### Assertion Recording

Assertions are recorded for Stage UI display:
- Pass/fail status
- Expected vs actual values
- Diff generation
- Test file association

## MockRoboHandle

```typescript
interface MockRoboHandle {
  client: Client                      // Discord.js client
  sessionId: string
  token: string
  guildId: string
  channelId: string
  destroy(): Promise<void>
}

// Usage
const handle = await startMockRobo({
  hmr: true,                          // Hot module replacement
  logFile: './test.log',
  logLevel: 'debug'
})

// ... run tests ...

await handle.destroy()
```

## User Testing Utilities

**Phase 8 feature for multi-user scenarios.**

### TestUsers Class

```typescript
class TestUsers {
  create(name: string, options?: UserOptions): MockUser
  createMany(names: string[]): MockUser[]
  byName(username: string): MockUser | undefined
  byId(userId: string): MockUser | undefined
  current(): MockUser
  switchTo(user: MockUser): void
  as<T>(user: MockUser, action: () => T): T  // Execute as user, auto-restore
  allHumans(): MockUser[]
  allBots(): MockUser[]
}
```

### TestInteractions Class

```typescript
class TestInteractions {
  conversation(channelId: string, messages: ConversationMessage[]): Promise<void>
  sendMessage(user: MockUser, channelId: string, content: string): Promise<void>
  invokeCommand(options: CommandOptions): Promise<void>
}
```

### Factory Function

```typescript
function createTestUtils(session: TestSession): {
  users: TestUsers
  interactions: TestInteractions
}
```

## Jest Reporter

**File:** `src/testing/jest-reporter.ts`

Custom reporter syncing test results to Stage UI.

### Activation

Enabled via `ROBO_MOCK_TEST_MODE` environment variable (set by `robo mock test`).

### Registry

Persisted to `.robo/mock/registry.json`:

```typescript
interface TestRegistry {
  runId: string
  startedAt: number
  files: Map<string, TestFileEntry>
}

interface TestFileEntry {
  path: string
  sessionId: string
  status: 'running' | 'passed' | 'failed'
  startedAt: number
  completedAt?: number
  tests: TestResult[]
}
```

### Reporter Events

```typescript
class MockTestReporter {
  onRunStart()              // Initialize registry
  onTestFileStart(test)     // Mark file as running
  onTestFileResult(test, result)  // Merge assertions + Jest results
  onRunComplete()           // Final status
}
```

## Integration Test Structure

### 31 Integration Test Phases

| Phase | Coverage |
|-------|----------|
| 1 | Basic connection, READY event, guild cache |
| 2 | Gateway protocol, HELLO, IDENTIFY, heartbeat, intents |
| 3 | Messages, channels, threads, webhooks |
| 4 | Members, roles, permissions, bans |
| 5 | Interactions: slash commands, buttons, selects, modals |
| 6 | Recording, state inspection, attachments |
| 7 | Lifecycle methods: Message.reply(), Member.voice |
| 8 | User methods: User.send(), Message.react(), collectors |
| 9 | Manager methods: create(), fetch() |
| 12 | Message references, thread members, guild widget |
| 13 | Embeds, partials, integrations, templates |
| 14 | Components V2: buttons, selects, modals, action rows |
| 16 | Voice state, stage instances, presence |
| 17 | Debug events, client events, shard events |
| 20 | Role subscriptions, autocomplete, emojis |
| 21 | Guild settings: AFK, verification, forums |
| 22 | Enforcement: permissions, intents, collections |
| 25 | Advanced clients, sharding prep |
| 26 | ShardingManager, multi-client |
| 27 | Audio player, voice connections |
| 28 | Burst reactions, role connections |
| 29 | Final manager methods, all client events |
| 30 | Gap coverage, edge cases |

### Test Directory Structure

```
__tests__/
├── Unit Tests (29 files, ~18,700 lines)
│   ├── commands.test.ts
│   ├── message-create.test.ts
│   ├── interaction-create.test.ts (3,190 lines)
│   └── ...
│
└── integration/
    ├── global-setup.js
    ├── global-teardown.js
    ├── test-setup.js
    ├── setup/
    │   ├── constants.ts
    │   ├── control-api.ts
    │   └── test-client.ts
    ├── utils/
    │   └── helpers.ts
    └── phase-1/ through phase-30/
        └── *.test.ts
```

### Jest Configuration

**File:** `jest.config.ts`

```typescript
{
  projects: [
    {
      displayName: 'unit',
      testPathIgnorePatterns: ['__tests__/integration/'],
      // Parallel execution
    },
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/__tests__/integration/**/*.test.ts'],
      runInBand: true,  // Sequential
      globalSetup: '__tests__/integration/global-setup.js',
      globalTeardown: '__tests__/integration/global-teardown.js',
      setupFilesAfterEnv: ['__tests__/integration/test-setup.js']
    }
  ],
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true, isolatedModules: true }]
  }
}
```

### Test Commands

```bash
npm test                    # All tests
npm run test:unit          # Unit only (parallel)
npm run test:integration   # Integration only (sequential)
```

## Test Pattern Example

```typescript
describe('Feature X', () => {
  let session: TestSession

  beforeAll(async () => {
    session = await createTestSession(__filename, {
      name: 'feature-x-test',
      config: {
        botUser: { username: 'TestBot' },
        guilds: [{ name: 'Test Server' }]
      }
    })
  })

  afterAll(async () => {
    await session?.destroy()
  })

  it('should respond to command', async () => {
    // Dispatch interaction
    await dispatchInteraction(session.id, {
      type: InteractionType.ApplicationCommand,
      name: 'ping',
      channelId: session.channels[0].id
    })

    // Assert response
    await expectAction(session.id, {
      description: 'Bot should respond with pong',
      type: 'interaction_response',
      expected: {
        data: { content: expect.stringContaining('Pong') }
      }
    })
  })
})
```

## Key Files

| Purpose | Path |
|---------|------|
| Main Export | `src/testing/index.ts` |
| Control API | `src/testing/control-api.ts` |
| Helpers | `src/testing/helpers.ts` |
| Types | `src/testing/types.ts` |
| User Utils | `src/testing/user-utils.ts` |
| Jest Reporter | `src/testing/jest-reporter.ts` |

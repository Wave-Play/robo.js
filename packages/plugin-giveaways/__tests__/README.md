# Plugin-Giveaways Test Infrastructure

Comprehensive test infrastructure for the plugin-giveaways package, including mock implementations, factory functions, and fixture data.

## Overview

This test infrastructure provides everything needed to test the plugin-giveaways package:

- **Mocks**: Complete mock implementations for Flashcore, Discord.js, and other dependencies
- **Factories**: Functions to generate test data with sensible defaults
- **Fixtures**: Pre-configured test data for common scenarios
- **Utilities**: Helper functions for common test operations

All files are configured for ESM and reference the built `.js` files from `.robo/build/`.

## Directory Structure

```
__tests__/
├── helpers/
│   ├── index.ts           # Barrel export for all helpers
│   ├── mocks.ts           # Mock implementations
│   ├── factories.ts       # Data factory functions
│   └── test-utils.ts      # Test utility functions
├── fixtures/
│   ├── index.ts           # Barrel export for fixtures
│   ├── giveaways.json     # Sample giveaway data
│   ├── settings.json      # Sample guild settings
│   └── users.json         # Sample user data
├── setup.ts               # Jest setup file
└── README.md              # This file
```

## Using Mocks

### Flashcore Mock

The Flashcore mock provides in-memory storage:

```typescript
import { mockFlashcore, clearFlashcoreStorage } from '../helpers'

// Mock is automatically configured in setup.ts
// Use it directly in your tests

test('saves giveaway to Flashcore', () => {
  const giveaway = createTestGiveaway()
  mockFlashcore.set(['giveaways', 'active', giveaway.id], giveaway)

  const retrieved = mockFlashcore.get(['giveaways', 'active', giveaway.id])
  expect(retrieved).toEqual(giveaway)
})

// Clear storage between tests
afterEach(() => {
  clearFlashcoreStorage()
})
```

### Discord.js Mocks

Create mock Discord objects for testing interactions:

```typescript
import {
  createMockInteraction,
  createMockButtonInteraction,
  createMockChannel,
  createMockUser
} from '../helpers'

test('handles giveaway command', async () => {
  const interaction = createMockInteraction({
    commandName: 'giveaway',
    user: createMockUser({ id: 'user-123', username: 'TestUser' }),
    channel: createMockChannel({ id: 'channel-456' })
  })

  // Configure command options
  interaction.options.getString = jest.fn((key) => {
    const options = { prize: 'Discord Nitro', duration: '1h' }
    return options[key] || null
  })

  // Test your command handler
  await handleGiveawayCommand(interaction)

  expect(interaction.reply).toHaveBeenCalled()
})
```

### Button Interactions

```typescript
import { createMockButtonInteraction } from '../helpers'

test('handles entry button click', async () => {
  const interaction = createMockButtonInteraction('giveaway_enter_test-id-123', {
    user: createMockUser({ id: 'user-789' })
  })

  await handleButtonInteraction(interaction)

  expect(interaction.reply).toHaveBeenCalledWith(
    expect.objectContaining({
      content: expect.stringContaining('entered')
    })
  )
})
```

### Resetting Mocks

```typescript
import { resetAllMocks } from '../helpers'

afterEach(() => {
  resetAllMocks() // Clears all mocks and storage
})
```

## Using Factories

Factories create test data with sensible defaults:

```typescript
import {
  createTestGiveaway,
  createTestGuildSettings,
  createTestEntries,
  createTestWinners
} from '../helpers'

test('selects winners from entries', () => {
  const giveaway = createTestGiveaway({
    prize: 'Test Prize',
    winnersCount: 3,
    entries: createTestEntries(10) // 10 users
  })

  const winners = selectWinners(giveaway)

  expect(winners).toHaveLength(3)
})
```

### Customizing Factory Output

```typescript
// Partial overrides merge with defaults
const giveaway = createTestGiveaway({
  prize: 'Custom Prize',
  winnersCount: 5,
  endsAt: Date.now() + 7200000, // 2 hours from now
  entries: {
    'user-001': 1,
    'user-002': 1,
    'user-003': 1
  }
})

// Create multiple giveaways at once
const giveaways = createTestGiveaways(5, {
  guildId: 'same-guild-123'
})
```

### Settings Factory

```typescript
const settings = createTestGuildSettings({
  defaults: {
    winners: 2,
    duration: '12h'
  },
  restrictions: {
    minAccountAgeDays: 30,
    allowRoleIds: ['role-123', 'role-456']
  }
})
```

## Using Fixtures

Fixtures provide pre-configured test data:

```typescript
import { giveaways, settings, users } from '../fixtures'

test('processes active giveaway', () => {
  const activeGiveaway = giveaways.activeMultipleEntries
  // activeGiveaway has 8 entries pre-configured

  expect(Object.keys(activeGiveaway.entries)).toHaveLength(8)
})

test('applies guild settings', () => {
  const restrictiveSettings = settings.restrictiveSettings
  // Has maxWinners: 10, maxDurationDays: 7, minAccountAgeDays: 30

  expect(restrictiveSettings.limits.maxWinners).toBe(10)
})

test('checks user eligibility', () => {
  const user = users.find(u => u.username === 'AliceGamer')
  // User has roles and specific creation timestamp

  expect(user?.roles).toContain('777777777777777777')
})
```

### Available Fixtures

**Giveaways:**
- `activeNoEntries` - Active with no participants
- `activeMultipleEntries` - Active with 8 participants
- `activeWithRoleRestrictions` - Role-restricted giveaway
- `activeWithAccountAge` - Account age requirement
- `endedWithWinners` - Completed with winners
- `endedNoWinners` - Completed, insufficient participants
- `endedWithRerolls` - Has reroll history
- `cancelled` - Cancelled giveaway
- `longDuration` - >24.8 days (tests setTimeout limits)
- `expired` - Past end time, not finalized

**Settings:**
- `defaultSettings` - Standard defaults
- `customDefaults` - Modified defaults
- `restrictiveSettings` - Low limits, strict restrictions
- `permissiveSettings` - High limits, relaxed restrictions
- `withAllowedRoles` - Role whitelist
- `withDeniedRoles` - Role blacklist
- `withMinAccountAge` - Account age requirement
- `noDmWinners` - DM notifications disabled

**Users:**
- 30 diverse user profiles with varying roles and account ages
- Includes boundary cases (7, 30, 60, 90 day old accounts)
- Mix of new (<7 days) and old (>2 years) accounts

## Common Patterns

### Basic Test Setup

```typescript
import { setupTestEnvironment, cleanupTestEnvironment } from '../helpers'

describe('Giveaway Command', () => {
  beforeEach(() => {
    setupTestEnvironment()
  })

  afterEach(() => {
    cleanupTestEnvironment()
  })

  test('creates a new giveaway', async () => {
    // Your test here
  })
})
```

### Testing with Fake Timers

```typescript
import { advanceTime, setSystemTime } from '../helpers'

test('ends giveaway after duration', async () => {
  jest.useFakeTimers()

  const giveaway = createTestGiveaway({
    endsAt: Date.now() + 3600000 // 1 hour
  })

  saveGiveaway(giveaway)

  // Advance time by 1 hour
  await advanceTime(3600000)

  // Trigger scheduled job or check
  await processExpiredGiveaways()

  expectGiveawayStatus(giveaway.id, 'ended')

  jest.useRealTimers()
})
```

### Testing Discord Interactions

```typescript
import { simulateCommand, expectInteractionReplied } from '../helpers'

test('responds to giveaway create command', async () => {
  const interaction = simulateCommand('giveaway', {
    prize: 'Discord Nitro',
    winners: 1,
    duration: '1h'
  })

  await handleGiveawayCommand(interaction)

  expectInteractionReplied(interaction)
  expect(interaction.reply).toHaveBeenCalledWith(
    expect.objectContaining({
      content: expect.stringContaining('Giveaway created')
    })
  )
})
```

### Testing Button Interactions

```typescript
import { simulateButtonClick, expectUserEntered } from '../helpers'

test('user enters giveaway', async () => {
  const giveaway = createTestGiveaway({ id: 'giveaway-123' })
  saveGiveaway(giveaway)

  const interaction = simulateButtonClick('giveaway-123', 'enter', {
    user: createMockUser({ id: 'user-456' })
  })

  await handleButtonInteraction(interaction)

  expectUserEntered('giveaway-123', 'user-456')
})
```

### Testing Flashcore Operations

```typescript
import {
  seedFlashcore,
  getFlashcoreValue,
  expectFlashcoreToContain
} from '../helpers'

test('loads giveaway from storage', () => {
  const giveaway = createTestGiveaway()

  // Seed storage
  seedFlashcore({
    'giveaways:active:test-id': giveaway
  })

  // Retrieve and verify
  const loaded = getFlashcoreValue(['giveaways', 'active', 'test-id'])
  expect(loaded).toEqual(giveaway)

  // Check existence
  expect(expectFlashcoreToContain(['giveaways', 'active', 'test-id'])).toBe(true)
})
```

### Testing Scheduled Jobs

```typescript
import { mockCron, clearCronJobs } from '../helpers'

test('schedules giveaway end job', () => {
  const giveaway = createTestGiveaway({
    endsAt: Date.now() + 3600000
  })

  scheduleGiveawayEnd(giveaway)

  expect(mockCron.save).toHaveBeenCalledWith(
    expect.stringContaining(giveaway.id),
    expect.any(String),
    expect.any(Function)
  )
})

afterEach(() => {
  clearCronJobs()
})
```

### Testing Async Functions

```typescript
import { flushPromises, waitFor } from '../helpers'

test('processes async operation', async () => {
  const promise = asyncOperation()

  await flushPromises()

  expect(mockFunction).toHaveBeenCalled()
})

test('waits for condition', async () => {
  startAsyncProcess()

  await waitFor(() => processComplete.mock.calls.length > 0, 5000)

  expect(processComplete).toHaveBeenCalled()
})
```

## Running Tests

### Commands

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test __tests__/commands/giveaway.test.ts

# Run tests in watch mode
pnpm test --watch

# Run with coverage
pnpm test --coverage

# Run verbose output
pnpm test --verbose
```

### Pre-test Build

The test command automatically runs a build step:

```json
{
  "scripts": {
    "pretest": "pnpm build",
    "test": "NODE_OPTIONS='--experimental-vm-modules' jest"
  }
}
```

This ensures `.robo/build/` is up to date before tests run.

### Environment Variables

Tests run with:
- `NODE_ENV=test` (set in setup.ts)
- `NODE_OPTIONS='--experimental-vm-modules'` (for ESM support)

## Troubleshooting

### ESM Import Issues

**Problem:** `Cannot use import statement outside a module`

**Solution:** Ensure jest.config.ts has:
```typescript
export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  }
}
```

### Mock Not Working

**Problem:** Mock returns undefined or doesn't track calls

**Solution:** Verify mock is reset between tests:
```typescript
afterEach(() => {
  resetAllMocks()
})
```

### Fake Timer Issues

**Problem:** Timers don't advance or tests hang

**Solution:**
1. Ensure `jest.useFakeTimers()` is called before test
2. Use `await advanceTime()` to advance timers
3. Remember to call `jest.useRealTimers()` after test

```typescript
beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})
```

### Flashcore State Leaking

**Problem:** Data from one test appears in another

**Solution:** Clear storage in afterEach:
```typescript
afterEach(() => {
  clearFlashcoreStorage()
})
```

Or use the comprehensive cleanup:
```typescript
afterEach(() => {
  cleanupTestEnvironment()
})
```

### Module Resolution Errors

**Problem:** Cannot find module `.robo/build/...`

**Solution:**
1. Run build before tests: `pnpm build`
2. Check jest.config.ts moduleDirectories includes `.robo/build`
3. Verify import paths use `.js` extension

### Type Errors in Tests

**Problem:** TypeScript errors with mock types

**Solution:** Use type assertions when needed:
```typescript
const interaction = createMockInteraction() as CommandInteraction
```

Or import types explicitly:
```typescript
import type { CommandInteraction } from 'discord.js'
```

## Best Practices

1. **Always clean up**: Use `cleanupTestEnvironment()` in afterEach
2. **Use factories for flexibility**: Prefer factories over fixtures for dynamic data
3. **Use fixtures for realism**: Use fixtures for complex, realistic scenarios
4. **Mock at boundaries**: Mock external dependencies, not internal functions
5. **Test behavior, not implementation**: Focus on what functions do, not how
6. **Keep tests isolated**: Each test should be independent
7. **Use descriptive names**: Test names should describe the scenario
8. **Arrange-Act-Assert**: Structure tests clearly

```typescript
test('descriptive test name', () => {
  // Arrange: Set up test data
  const giveaway = createTestGiveaway()

  // Act: Execute the function
  const result = someFunction(giveaway)

  // Assert: Verify the outcome
  expect(result).toBe(expectedValue)
})
```

## Contributing

When adding new test infrastructure:

1. **Mocks**: Add to `helpers/mocks.ts`
2. **Factories**: Add to `helpers/factories.ts`
3. **Utilities**: Add to `helpers/test-utils.ts`
4. **Fixtures**: Add to appropriate JSON file
5. **Document**: Update this README with examples

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Discord.js Bots](https://discordjs.guide/testing/)
- [ESM in Jest](https://jestjs.io/docs/ecmascript-modules)
- [Robo.js Documentation](https://docs.robojs.dev/)

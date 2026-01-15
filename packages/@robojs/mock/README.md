<p align="center">✨ <strong>Generated with <a href="https://robojs.dev/create-robo">create-robo</a> magic!</strong> ✨</p>

---

# @robojs/mock

Discord Gateway mock server for automated testing of Discord.js bots without a real Discord connection. Test your commands, events, and interactions in isolated sessions with full API emulation and a visual debugging UI.

<div align="center">
  <a href="https://github.com/Wave-Play/robo/blob/main/LICENSE"><img alt="GitHub license" src="https://img.shields.io/github/license/Wave-Play/robo" /></a>
  <a href="https://www.npmjs.com/package/@robojs/mock"><img alt="npm" src="https://img.shields.io/npm/v/@robojs/mock" /></a>
  <a href="https://packagephobia.com/result?p=@robojs/mock@latest"><img alt="install size" src="https://packagephobia.com/badge?p=@robojs/mock@latest" /></a>
  <a href="https://roboplay.dev/discord"><img alt="Discord" src="https://img.shields.io/discord/1087134933908193330?color=7289da" /></a>
  <a href="https://github.com/Wave-Play/robo.js/blob/main/CONTRIBUTING.md#contributors"><img alt="All Contributors" src="https://img.shields.io/github/all-contributors/Wave-Play/robo.js?color=cf7cfc" /></a>
</div>

➞ [📚 **Documentation:** Getting started](https://robojs.dev/docs/getting-started)

➞ [🚀 **Community:** Join our Discord server](https://roboplay.dev/discord)

## Installation

```bash
npx robo add @robojs/mock
```

New to **[Robo.js](https://robojs.dev)**? Start your project with this plugin pre-installed:

```bash
npx create-robo <project-name> -p @robojs/mock
```

> **Note:** This plugin requires `@robojs/server` as a peer dependency. It will be installed automatically when you add the plugin.

## Quick Start

Run your bot in mock mode to test without a Discord connection:

```bash
# Start in mock mode
ROBO_MOCK_MODE=true npx robo dev

# Or run tests
npx robo mock test
```

Once running, open the Stage UI in your browser at `http://localhost:3000/mock/stage` to interact with your bot visually.

## Features

- **Zero-Setup Testing** - No Discord credentials required. Test bots instantly in isolated environments.
- **Session Isolation** - Each test gets its own session with independent state for parallel testing.
- **Full API Emulation** - Complete Discord Gateway v10 WebSocket + REST API implementation.
- **Stage UI** - React-based Discord UI replica for visual testing and debugging.
- **Action Recording** - Automatically records all bot actions for assertions and replay.
- **Intent Filtering** - Validates and enforces Discord intents, including privileged intents.
- **Permission Checking** - Full Discord permission system emulation.
- **DevTools Panel** - Built-in debugging tools for events, state, network, and performance.

## Testing API

Import testing utilities from `@robojs/mock/testing`:

```typescript
import {
  startMockRobo,
  dispatchInteraction,
  expectAction,
  waitForMessage,
  getSessionState
} from '@robojs/mock/testing'
```

### Basic Test Example

```typescript
import { fileURLToPath } from 'node:url'
import { describe, it, beforeAll, afterAll } from '@jest/globals'
import { startMockRobo, dispatchInteraction, expectAction } from '@robojs/mock/testing'
import type { MockRoboHandle } from '@robojs/mock/testing'

const __filename = fileURLToPath(import.meta.url)

describe('ping command', () => {
  let bot: MockRoboHandle

  beforeAll(async () => {
    bot = await startMockRobo({
      name: 'ping-tests',
      testFilePath: __filename
    })
  }, 60000)

  afterAll(async () => {
    await bot.stop()
  })

  it('should respond with Pong!', async () => {
    // Trigger the /ping command
    await dispatchInteraction(bot.sessionId, {
      type: 2, // APPLICATION_COMMAND
      data: {
        name: 'ping',
        type: 1 // CHAT_INPUT
      },
      guild_id: bot.guildId,
      channel_id: bot.channels[0].id
    })

    // Verify bot response
    await expectAction(bot.sessionId, {
      description: 'Bot should reply with Pong!',
      type: 'interaction_response',
      expected: {
        response_data: {
          content: 'Pong!'
        }
      },
      timeout: 5000
    })
  })
})
```

### Testing Utilities

| Function | Description |
|----------|-------------|
| `startMockRobo(options)` | Start a bot connected to the mock server |
| `dispatchInteraction(sessionId, data)` | Trigger slash commands, buttons, modals, etc. |
| `dispatchEvent(sessionId, type, data)` | Inject any Discord Gateway event |
| `expectAction(sessionId, options)` | Assert that a specific action occurred |
| `expectNoAction(sessionId, options)` | Assert that no action of a type was recorded |
| `waitForAction(sessionId, options)` | Wait for an action to occur |
| `waitForAnyAction(sessionId, filter)` | Wait for any action matching a filter |
| `waitForMessage(sessionId, options)` | Wait for a bot message |
| `waitForInteractionResponse(sessionId, options)` | Wait for an interaction response |
| `getSessionState(sessionId)` | Get the current session state |
| `getSessionActions(sessionId, filter)` | Get recorded actions |
| `getHistoricalActions(sessionId, options)` | Get all actions including from before test started |
| `getChannelMessages(sessionId, channelId)` | Get messages from a channel |
| `resetSession(sessionId)` | Reset session to initial state |
| `clearSessionActions(sessionId)` | Clear recorded actions |
| `deleteSession(sessionId)` | Clean up a session |

### Interaction Types

```typescript
// Slash command
await dispatchInteraction(sessionId, {
  type: 2,
  data: { name: 'help', type: 1 }
})

// Button click
await dispatchInteraction(sessionId, {
  type: 3,
  data: { custom_id: 'confirm-button', component_type: 2 }
})

// Select menu
await dispatchInteraction(sessionId, {
  type: 3,
  data: { custom_id: 'role-select', component_type: 3, values: ['admin'] }
})

// Modal submit
await dispatchInteraction(sessionId, {
  type: 5,
  data: {
    custom_id: 'feedback-modal',
    components: [{ type: 1, components: [{ type: 4, custom_id: 'input', value: 'Great!' }] }]
  }
})
```

### Test Utilities

```typescript
import { TestUsers, createTestUtils } from '@robojs/mock/testing'

// TestUsers is a class for managing users within a session
const users = new TestUsers(session)
const testUser = users.create('TestUser')
const botUser = users.create('BotHelper', { bot: true })

// Switch between users for multi-user testing
users.switchTo('TestUser')

// createTestUtils provides session-bound helpers (takes Session object)
const utils = createTestUtils(session)
```

### Jest Integration

A custom Jest reporter is available for test result integration:

```javascript
// jest.config.js
module.exports = {
  reporters: [
    'default',
    '@robojs/mock/testing/jest-reporter'
  ]
}
```

## Stage UI

The Stage UI is a React-based Discord interface replica for visual testing and debugging.

### Accessing the Stage UI

When running in mock mode, open your browser to:

```
http://localhost:3000/mock/stage
```

### Features

- **Real-time Messages** - See messages as they're sent and received
- **Command Testing** - Invoke slash commands directly from the UI
- **Interaction Testing** - Click buttons, select menus, and submit modals
- **User Switching** - Test as different users
- **Voice Channels** - Visual representation of voice state

### DevTools Panel

Press `Ctrl+Shift+D` (or `Cmd+Shift+D` on Mac) to open the DevTools panel:

| Tab | Description |
|-----|-------------|
| **Events** | All WebSocket events with filtering and JSON expansion |
| **State** | Current state tree (guilds, channels, messages, users) |
| **Network** | Commands sent and responses received |
| **Performance** | Render times, latency, and memory usage |
| **Tools** | Clear events, export JSON, inject test data |
| **Permissions** | Permission matrix visualization |

## Session Management

Each test or connection gets an isolated session with its own state.

### Session Token Format

Sessions use the token format `mock:<session_id>`. When a bot connects with this token, it's automatically routed to the correct session.

### Creating Sessions Programmatically

```typescript
import { sessionManager } from '@robojs/mock'

// Create a new session
const session = await sessionManager.create({
  name: 'my-test-session',
  config: {
    guilds: [{ name: 'Test Server' }],
    users: [{ username: 'TestUser' }]
  }
})

// Get token for bot connection
const token = session.token // "mock:abc123..."

// Retrieve existing session
const existing = sessionManager.get(session.id)

// Delete session
await sessionManager.delete(session.id)
```

### Session TTL

Sessions automatically expire after 1 hour of inactivity. The cleanup interval runs every 60 seconds.

### Action Recording

All bot actions are automatically recorded for assertions:

```typescript
const actions = await getSessionActions(sessionId)

// Filter by action type
const messages = await getSessionActions(sessionId, { type: 'message_sent' })
const interactions = await getSessionActions(sessionId, { type: 'interaction_response' })
```

## Configuration

### Plugin Options

Configure the mock server in `config/plugins/robojs/mock.ts`:

```typescript
export default {
  // Auto-open Stage UI in browser (default: true)
  autoOpenStage: true,

  // Default session configuration for `robo mock start`
  defaultSessionConfig: {
    guilds: [{ name: 'Test Server' }],
    users: [{ username: 'TestUser' }]
  },

  // Port for standalone mock server (default: 6625)
  standalonePort: 6625,

  // Data directory relative to .robo (default: 'mock')
  dataDirectory: 'mock'
}
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `ROBO_MOCK_MODE` | Set to `true` to enable mock mode |
| `ROBO_MOCK_SESSION_ID` | Pre-generated session ID for the bot |
| `ROBO_MOCK_PORT` | Override the mock server port |
| `ROBO_MOCK_TEST_RUN_ID` | Test run identifier for grouping |

## Control API

The mock server exposes REST endpoints for programmatic control.

### Session Management

```bash
# Create a session
POST /api/control/sessions
{ "name": "my-test", "config": { ... } }

# List all sessions
GET /api/control/sessions

# Get session details
GET /api/control/sessions/:id

# Delete session
DELETE /api/control/sessions/:id

# Reset session state
POST /api/control/sessions/:id/reset
```

### Event Injection

```bash
# Dispatch a Discord event to the bot
POST /api/control/sessions/:id/dispatch
{
  "event": "MESSAGE_CREATE",
  "data": {
    "content": "Hello!",
    "channel_id": "123456789",
    "author": { "id": "987654321", "username": "TestUser" }
  }
}
```

### State & Actions

```bash
# Get current session state
GET /api/control/sessions/:id/state

# Get recorded actions
GET /api/control/sessions/:id/actions
GET /api/control/sessions/:id/actions?type=interaction_response

# Get registered commands
GET /api/control/sessions/:id/commands
```

## Advanced Features

### Loop Protection

The mock server detects message loops (10+ `MESSAGE_CREATE` events in 1 second) and triggers a 5-second circuit breaker to prevent runaway bots.

```typescript
// Disable loop protection for a session
session.loopProtectionEnabled = false
```

### Intent Filtering

Events are filtered based on the intents declared during bot connection:

```typescript
// Without MESSAGE_CONTENT intent, message.content is stripped
// Without GUILD_MEMBERS intent, member events are not dispatched
```

The DevTools panel shows which events were filtered and why.

### Permission Enforcement

Full Discord permission system emulation:

```typescript
// Permissions are computed based on:
// - Role hierarchy
// - Channel overwrites
// - Administrator bypass
// - Owner privileges
```

### Voice Gateway

A separate Voice Gateway runs on port 50001 with TLS for `@discordjs/voice` compatibility:

```typescript
// Voice state updates are handled automatically
// Self-signed certificates are generated at runtime
```

## Package Exports

```typescript
// Main package - core functionality
import {
  Session,
  sessionManager,
  GatewayServer,
  StageServer,
  StageBridge,
  mockLogger
} from '@robojs/mock'

// Testing utilities
import {
  startMockRobo,
  dispatchInteraction,
  dispatchEvent,
  expectAction,
  waitForAction,
  waitForMessage,
  getSessionState,
  getSessionActions,
  createTestUtils,
  TestUsers,        // Class - instantiate with session
  TestInteractions  // Class - instantiate with session
} from '@robojs/mock/testing'

// Session management
import { Session, SessionManager, MockServerState, ActionRecorder } from '@robojs/mock/session'

// TypeScript types
import type {
  MockGuild,
  MockChannel,
  MockUser,
  MockMessage,
  MockRole,
  MockGuildMember,
  MockInteraction,
  MockThread,
  MockWebhook
} from '@robojs/mock/types'

// Jest reporter (CommonJS compatible)
// Add to jest.config.js: reporters: ['@robojs/mock/testing/jest-reporter']
```

## Troubleshooting

### Bot doesn't connect

- Ensure `ROBO_MOCK_MODE=true` is set
- Check that the mock server is running (`http://localhost:3000/mock/stage` should load)
- Verify the token format is `mock:<session_id>`

### Tests are flaky

- Increase timeout values in `expectAction()` and `waitForMessage()`
- Ensure sessions are properly cleaned up in `afterAll()`
- Use `runInBand` for tests that share state

### Stage UI not loading

- Check that `@robojs/server` is properly installed
- Verify no other process is using port 3000
- Clear browser cache and try again

### Actions not recording

- Ensure the session hasn't been reset between action and assertion
- Check that `maxActions` limit hasn't been exceeded
- Verify the action type matches exactly (e.g., `interaction_response` vs `message_sent`)

### Intent errors

- Add required intents to your bot's client options
- For privileged intents, configure `approvedPrivilegedIntents` in the session config when creating sessions

## More Resources

- [📖 **Integration Testing Guide**](./__tests__/integration/INTEGRATION_TESTING_GUIDE.md) - Detailed testing patterns
- [🔧 **AGENTS.md**](./AGENTS.md) - Technical deep-dive for AI agents and contributors

## Got questions?

If you need help, hop into our community Discord. We love to chat!

➞ [🚀 **Community:** Join our Discord server](https://roboplay.dev/discord)

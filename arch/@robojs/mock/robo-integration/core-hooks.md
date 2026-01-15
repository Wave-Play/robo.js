# Robo.js Core Hooks Integration

## Overview

@robojs/mock integrates with Robo.js through four lifecycle hooks that orchestrate mock server initialization. These hooks coordinate with @robojs/server and @robojs/discordjs through priority ordering and module-level state sharing.

## Hook Files

| Hook | File | Purpose |
|------|------|---------|
| init | `src/robo/init.ts` | Mock mode detection, hook prioritization |
| prepare | `src/robo/prepare.ts` | WebSocket handler registration |
| start | `src/robo/start.ts` | Session creation, log drain setup |
| stop | `src/robo/stop.ts` | Graceful cleanup |

## Hook Execution Order

### Required Order

```
@robojs/server start → @robojs/mock start → @robojs/discordjs start
```

**Why This Order:**
1. Server must be listening before Gateway accepts connections
2. Mock session must exist before Discord.js connects
3. Discord.js connects using mock token after session ready

### Priority System

**Function:** `prioritizeHookBefore(hookName, pluginA, pluginB)`

**Location:** `src/robo/init.ts` lines 110-114

```typescript
if (!connectingToExisting) {
  prioritizeHookBefore('start', '@robojs/server', '@robojs/discordjs')
  prioritizeHookBefore('start', '@robojs/mock', '@robojs/discordjs')
}
```

**Condition:** Only applied in embedded mode (not external connection).

## Init Hook

**File:** `src/robo/init.ts` (~120 lines)

### Purpose

Runs BEFORE prepare hooks to detect mock mode and configure execution order.

### Module-Level State

```typescript
interface MockModeState {
  enabled: boolean
  sessionId: string | null
  sessionName: string | null
  connectingToExisting: boolean
  externalServerPort: number | null
  shouldOpenBrowser: boolean
}

let mockModeState: MockModeState = {
  enabled: false,
  sessionId: null,
  sessionName: null,
  connectingToExisting: false,
  externalServerPort: null,
  shouldOpenBrowser: false
}
```

### Exports

| Function | Purpose |
|----------|---------|
| `getMockModeState()` | Returns current mock mode state |
| `resetMockModeState()` | Clears state for cleanup |

### Environment Variables Read

| Variable | Line | Purpose |
|----------|------|---------|
| `ROBO_MOCK_MODE` | 75 | Enable mock mode |
| `ROBO_MOCK_SESSION_ID` | 83 | Pre-generated session ID |
| `ROBO_MOCK_SESSION_NAME` | 84 | Display name |
| `__ROBO_MOCK_CONNECT_EXISTING` | 91 | External server flag |
| `__ROBO_MOCK_SERVER_PORT` | 92-94 | External server port |
| `__ROBO_MOCK_OPEN_BROWSER` | 95 | Browser open flag |

### Logic Flow

```
1. Check ROBO_MOCK_MODE environment variable
2. If not mock mode, return early
3. Read session ID and name from environment
4. Check if connecting to external server
5. Store state in mockModeState
6. If embedded mode, set hook priorities
7. Log initialization status
```

## Prepare Hook

**File:** `src/robo/prepare.ts` (~132 lines)

### Purpose

Registers a callback for when @robojs/server creates its engine.

### globalThis Pattern

```typescript
function registerEngineCallback(): void {
  const globalAny = globalThis as any

  if (!globalAny.__roboServerEngineCallbacks) {
    globalAny.__roboServerEngineCallbacks = []
  }

  globalAny.__roboServerEngineCallbacks.push((engine: BaseEngine) => {
    registerWebSocketHandlers(engine)
    markHandlersRegistered()
  })
}
```

**Why This Pattern:**
- Mock's prepare hook runs BEFORE server's prepare (alphabetically)
- Server engine doesn't exist yet at mock's prepare time
- Callback defers registration until server creates engine

### Exports

| Function | Purpose |
|----------|---------|
| `registerWebSocketHandlers(engine)` | Register handlers on engine |
| `areHandlersRegistered()` | Check registration state |
| `markHandlersRegistered()` | Mark as registered |
| `resetHandlersRegistered()` | Reset for cleanup |

### WebSocket Handlers Registered

| Path | Handler |
|------|---------|
| `/` | Discord Gateway (ws://host/?v=10) |
| `/stage/ws` | Stage UI WebSocket |
| `${prefix}/stage/ws` | Prefixed Stage WebSocket |

### Conditional Execution

| Condition | Action |
|-----------|--------|
| `__ROBO_MOCK_STANDALONE=true` | Register handlers (CLI manages) |
| `ROBO_MOCK_MODE=false` | Skip entirely |
| `__ROBO_MOCK_CONNECT_EXISTING=true` | Skip (external server) |

## Start Hook

**File:** `src/robo/start.ts` (~284 lines)

### Purpose

Main initialization: starts voice gateway, creates session, wires log drain.

### Module-Level State

```typescript
let mockModeSession: Session | null = null
let mockModeLogDrainHandle: DrainHandle | null = null
```

### Exports

| Function | Purpose |
|----------|---------|
| `getMockModeSession()` | Returns current session |
| `clearMockModeSession()` | Clears session reference |

### Plugin Configuration

```typescript
interface MockPluginConfig {
  autoOpenStage?: boolean
  defaultSessionConfig?: SessionConfig
  dataDirectory?: string
  standalonePort?: number
}
```

**Loading (lines 60-61):**
```typescript
const { pluginConfig } = context
const config = { ...DEFAULT_MOCK_PLUGIN_CONFIG, ...pluginConfig }
```

### Initialization Sequence

```
1. Check __ROBO_MOCK_STANDALONE (skip if standalone mode)
2. Get mockModeState from init.ts
3. Check if mock mode enabled (return if not)
4. Check if connecting to existing (return if external)
5. Ensure WebSocket handlers registered (fallback)
6. Initialize Stage bridge
7. Start Voice Gateway on port 50001
8. Resolve bot user (config → Discord API → default)
9. Create session via sessionManager.create()
10. Store session in mockModeSession
11. Override DISCORD_TOKEN and DISCORD_CLIENT_ID
12. Install log drain for Stage UI
13. Log Stage UI URL
14. Open browser if shouldOpenBrowser=true
```

### Environment Variables Modified

| Variable | Line | Value |
|----------|------|-------|
| `DISCORD_TOKEN` | 142 | Mock session token |
| `DISCORD_CLIENT_ID` | 148 | Session application ID |

### Log Drain Setup

```typescript
mockModeLogDrainHandle = createSessionLogDrain({
  sessionId: mockModeSession.id,
  connectionId: 'dev-mode',
  onLog: (entry) => {
    const recorded = mockModeSession.recordLog(entry)
    stageBridge.onLogEntry(recorded)
  }
})

logger.registerDrain(mockModeLogDrainHandle.drain)
```

## Stop Hook

**File:** `src/robo/stop.ts` (~29 lines)

### Purpose

Graceful cleanup of mock infrastructure.

### Cleanup Operations

| Line | Operation |
|------|-----------|
| 16 | Close Stage WebSocket server |
| 17 | Reset Stage bridge |
| 20 | Stop Voice Gateway server |
| 23 | Close Gateway WebSocket server |
| 26 | Destroy all sessions |

## Cross-Hook Communication

### Module-Level State Flow

```
init.ts                     prepare.ts                  start.ts
   │                            │                          │
   │ mockModeState ─────────────│──────────────────────────│
   │                            │                          │
   │                            │ handlersRegistered ──────│
   │                            │                          │
   │                            │              mockModeSession
```

### Data Access Pattern

```typescript
// start.ts reads state from init.ts
const mockModeState = getMockModeState()

// CLI commands read session from start.ts
const session = getMockModeSession()
```

## Complete Lifecycle Flow

```
┌─────────────────────────────────────────────┐
│              Robo.start()                   │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│         INIT HOOKS (plugin order)           │
│                                             │
│  @robojs/mock init.ts:                      │
│  • Detect ROBO_MOCK_MODE                    │
│  • Read session ID from env                 │
│  • Store in mockModeState                   │
│  • Call prioritizeHookBefore()              │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│      PREPARE HOOKS (alphabetical)           │
│                                             │
│  @robojs/mock prepare.ts:                   │
│  • Push callback to globalThis              │
│                                             │
│  @robojs/server prepare.ts:                 │
│  • Create engine                            │
│  • Execute callbacks ← WebSocket handlers   │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│        START HOOKS (prioritized)            │
│                                             │
│  1. @robojs/server:                         │
│     • Start listening on port               │
│                                             │
│  2. @robojs/mock:                           │
│     • Start Voice Gateway                   │
│     • Create session                        │
│     • Set DISCORD_TOKEN                     │
│     • Install log drain                     │
│                                             │
│  3. @robojs/discordjs:                      │
│     • Connect to mock gateway               │
│     • Register commands                     │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│           Bot Ready to Use                  │
└─────────────────────────────────────────────┘
```

## Mode-Specific Behavior

### Embedded Mode (`robo dev --mock`)

All hooks execute with priorities enforced.

### External Mode (`robo dev --mock sess_xxx`)

- init.ts: Skips hook prioritization
- prepare.ts: Skips WebSocket registration
- start.ts: Skips session creation

### Standalone Mode (`robo mock start`)

- init.ts: Normal execution
- prepare.ts: Registers handlers (CLI manages lifecycle)
- start.ts: Skipped entirely

## Logger Instance

**File:** `src/core/logger.ts`

```typescript
import { logger } from 'robo.js'
export const mockLogger = logger.fork('mock')
```

All hooks use `mockLogger` for consistent logging under the 'mock' namespace.

## Key Files

| Purpose | Path |
|---------|------|
| Init Hook | `src/robo/init.ts` |
| Prepare Hook | `src/robo/prepare.ts` |
| Start Hook | `src/robo/start.ts` |
| Stop Hook | `src/robo/stop.ts` |
| Shared Logger | `src/core/logger.ts` |
| Plugin Config Type | `src/types/plugin.ts` |

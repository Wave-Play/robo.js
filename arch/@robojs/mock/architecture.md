# @robojs/mock Architecture

## Overview

Discord Gateway mock server plugin for Robo.js enabling automated bot testing without real Discord connections. Provides complete Discord v10 protocol emulation with session isolation, visual debugging, and recording/replay.

## Two-Layer Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    MOCK SERVER LAYER                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │
│  │   Gateway   │  │  REST API   │  │   Voice Gateway     │   │
│  │  WebSocket  │  │   v10       │  │   WSS:50001         │   │
│  │   (root)    │  │  (100+      │  │   (TLS required)    │   │
│  │             │  │   endpoints)│  │                     │   │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘   │
│         │                │                     │              │
│         └────────────────┼─────────────────────┘              │
│                          ▼                                    │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              SESSION MANAGER (Singleton)                │  │
│  │   • Token routing: mock:<session_id>                   │  │
│  │   • TTL cleanup: 1hr default, 60s interval             │  │
│  │   • Parallel session isolation                         │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
                              │
                              │ Event forwarding via StageBridge
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                    STAGE UI LAYER (React)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │
│  │  Discord    │  │  DevTools   │  │   Playback          │   │
│  │  UI Clone   │  │  (8 tabs)   │  │   Controls          │   │
│  │  (157       │  │             │  │   Record/Replay     │   │
│  │  components)│  │             │  │                     │   │
│  └─────────────┘  └─────────────┘  └─────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

## Mock Server Layer Components

### GatewayServer
**File:** `src/core/gateway.ts`

Discord Gateway v10 WebSocket server handling bot connections.

**Responsibilities:**
- WebSocket upgrade at root path `/`
- Version validation (v10 only)
- IDENTIFY processing with token parsing
- Heartbeat management (41.25s default)
- Event dispatch with intent filtering
- Per-connection sequence tracking

**Key Methods:**
- `handleUpgrade()` - WebSocket upgrade
- `handleIdentify()` - Token validation, session lookup
- `dispatch()` - Event delivery with intent filtering
- `send()` - Raw payload delivery

### VoiceGateway
**File:** `src/core/voice-gateway.ts`

Separate WSS server on port 50001 for voice connections.

**Why separate port:** @discordjs/voice requires secure WebSocket (WSS). Self-signed certificates generated at runtime.

**Opcodes:** Identify, SelectProtocol, Ready, Heartbeat, SessionDescription, Speaking

### StageServer
**File:** `src/core/stage.ts`

WebSocket server for Stage UI connections at `/stage/ws`.

**Features:**
- Event buffering (1000 max per session)
- Reconnect replay via `?last_seq=N`
- Command handling from UI
- Heartbeat every 30s

### StageBridge
**File:** `src/core/stage-bridge.ts`

Observer forwarding session events to Stage UI clients.

**Events forwarded:**
- Discord events (MESSAGE_CREATE, etc.)
- Interaction responses
- Bot ready/disconnect
- Intent filtering warnings
- Loop detection alerts

### SessionManager
**File:** `src/core/manager.ts`

Singleton managing all active sessions.

**Operations:**
- `create(options)` - New session with config
- `get(sessionId)` - Lookup by ID
- `getByToken(token)` - Parse `mock:sess_xxx` format
- `delete(sessionId)` - End session
- TTL cleanup every 60 seconds

## Session Isolation Model

Each test session is completely isolated:

| Aspect | Isolation |
|--------|-----------|
| **State** | Independent guilds, channels, messages, users, roles |
| **Connections** | Per-session gateway connection tracking |
| **Sequence** | Per-connection sequence numbers |
| **Actions** | Per-session recording (10k max, LRU eviction) |
| **Logs** | Per-session log capture (10k max, LRU eviction) |
| **TTL** | Per-session expiration (1hr default) |

## Token Routing System

**Format:** `mock:sess_<session_id>`

**Example:** `mock:sess_abc123xyz789`

**Routing flow:**
1. Discord.js sends token in IDENTIFY payload
2. Gateway parses token via `parseMockToken()`
3. SessionManager looks up session
4. Connection registered to session
5. All subsequent requests routed to that session

**REST routing:** Token extracted from `Authorization: Bot mock:sess_xxx` header

## Safety Mechanisms

### Loop Protection
**File:** `src/core/gateway.ts`

Detects runaway message loops.

**Trigger:** 10+ MESSAGE_CREATE events in 1 second
**Action:** 5-second dispatch cooldown (circuit breaker)
**Notification:** Stage UI receives `loop_detected` event
**Config:** Can be disabled per session

### Rate Limit Simulation
**File:** `src/session/session.ts`

Simulates Discord rate limits for testing.

**Modes:**
- `persistent` - Keeps returning 429 until disabled
- `one-shot` - Auto-disables after first 429

**Scopes:** all, messages, interactions, guilds, channels

### Intent Filtering
**File:** `src/core/intents.ts`

Enforces Discord intent requirements.

**Behavior:**
- 30+ events mapped to required intents
- Per-connection filtering (not per-session)
- MESSAGE_CONTENT stripped without intent
- Stage UI shows filtered events

**Privileged intents:** GuildMembers, GuildPresences, MessageContent

### Permission Enforcement
**File:** `src/core/permissions.ts`

Discord permission system emulation.

**Levels:**
- `none` - All requests allowed
- `basic` - Simple permission checks
- `strict` - Full Discord permission system

**Features:**
- Role hierarchy enforcement
- Channel permission overwrites
- Denial events logged to Stage UI

## Critical Quirks

1. **Gateway v10 only** - Rejects other versions with close code
2. **JSON encoding only** - No ETF or zlib-stream support
3. **Voice on port 50001** - Requires WSS/TLS (self-signed OK)
4. **Loop detection** - 10+ events/sec triggers 5s cooldown
5. **Sessions expire** - 1hr TTL, 60s cleanup interval
6. **LRU eviction** - Oldest 10% removed at 10k capacity
7. **Stage buffer** - 1000 events max, replay via `?last_seq=N`
8. **Reconnection** - Exponential backoff 1s→30s, max 5 attempts
9. **Token format** - `mock:sess_xxx` parsed everywhere
10. **Hook priorities** - server → mock → discordjs order critical

## Key File Paths

| Component | Path |
|-----------|------|
| Gateway Server | `src/core/gateway.ts` |
| Voice Gateway | `src/core/voice-gateway.ts` |
| Stage Server | `src/core/stage.ts` |
| Stage Bridge | `src/core/stage-bridge.ts` |
| Session Manager | `src/core/manager.ts` |
| Intent Filtering | `src/core/intents.ts` |
| Permissions | `src/core/permissions.ts` |
| Logger | `src/core/logger.ts` |

## Entry Points

**Main export:** `src/index.ts`
- Session, SessionManager, sessionManager
- GatewayServer, StageServer, StageBridge
- mockLogger

**Testing export:** `src/testing/index.ts`
- createTestSession, dispatchEvent, expectAction
- waitForMessage, getSessionState

**Session export:** `src/session/index.ts`
- Session, MockServerState, ActionRecorder

**Types export:** `src/types/index.ts`
- All TypeScript type definitions

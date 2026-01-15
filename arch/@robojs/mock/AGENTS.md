# @robojs/mock Architecture Specifications

## Package Purpose

@robojs/mock provides a complete Discord API simulation for testing Robo.js bots. It emulates Discord Gateway v10, REST API v10, and Voice Gateway while providing a visual testing interface (Stage UI) for manual interaction and debugging.

## Two-Layer Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Stage UI Layer                           │
│  React app: Discord-like interface, DevTools, logging panel     │
└─────────────────────────────────────────────────────────────────┘
                              ↕ WebSocket
┌─────────────────────────────────────────────────────────────────┐
│                      Mock Server Layer                          │
│  Gateway, REST API, Voice, Sessions, Action Recording           │
└─────────────────────────────────────────────────────────────────┘
                              ↕ WebSocket
┌─────────────────────────────────────────────────────────────────┐
│                      Discord.js Bot                             │
│  Connects using mock token, thinks it's talking to Discord      │
└─────────────────────────────────────────────────────────────────┘
```

## File Index

### Core Architecture
| File | Purpose |
|------|---------|
| [architecture.md](architecture.md) | Two-layer design, session isolation, safety mechanisms |
| [discord-protocol.md](discord-protocol.md) | Gateway v10, Voice Gateway, opcodes, payloads |
| [session-management.md](session-management.md) | Sessions, state, connection tracking, action recording |
| [storage-persistence.md](storage-persistence.md) | Memory abstractions, hosted instance design |

### Supporting Documentation
| File | Purpose |
|------|---------|
| [testing.md](testing.md) | Testing utilities, Jest integration, test phases |
| [types.md](types.md) | Type system overview (200+ types) |
| [utilities.md](utilities.md) | Utility functions (snowflake, tokens, permissions) |
| [build-system.md](build-system.md) | Two-stage build, Vite, route manifests |

### API Documentation
| File | Purpose |
|------|---------|
| [api/control-api.md](api/control-api.md) | Session CRUD, dispatch, recording, permissions |
| [api/discord-v10.md](api/discord-v10.md) | Discord REST API emulation (~95 endpoints) |

### Stage UI Documentation
| File | Purpose |
|------|---------|
| [stage-ui/architecture.md](stage-ui/architecture.md) | React app structure, providers, WebSocket |
| [stage-ui/components.md](stage-ui/components.md) | ~126 components across 17 directories |
| [stage-ui/state-management.md](stage-ui/state-management.md) | 4 stores: session, playback, selection, logs |
| [stage-ui/devtools.md](stage-ui/devtools.md) | 8-tab DevTools panel |
| [stage-ui/logging.md](stage-ui/logging.md) | Logging pipeline, ANSI rendering, filtering |

### Robo.js Integration
| File | Purpose |
|------|---------|
| [robo-integration/core-hooks.md](robo-integration/core-hooks.md) | Lifecycle hooks, priorities, execution order |
| [robo-integration/discordjs-integration.md](robo-integration/discordjs-integration.md) | Token swap, REST redirect, command registration |
| [robo-integration/server-integration.md](robo-integration/server-integration.md) | Engine callbacks, WebSocket handlers, prefixes |

## Critical Paths

### Entry Points
- **Bot Connection:** `src/core/gateway.ts` → handles WebSocket upgrade, IDENTIFY
- **REST API:** `src/api/v10/` → Discord API emulation
- **Control API:** `src/api/control/` → session management
- **Stage UI:** `src/app/index.tsx` → React application
- **Robo Hooks:** `src/robo/` → init, prepare, start, stop

### Session Lifecycle
```
sessionManager.create() → Session created with ID, token, state
                       → Session stored in manager map
                       → Token format: mock:sess_<id> or Discord-like

Gateway IDENTIFY → parseMockToken() extracts session ID
                → sessionManager.getByToken() retrieves session
                → Connection bound to session

Session cleanup → TTL expiry (default 1hr)
               → Manual deletion via control API
               → Robo stop hook
```

### Token Routing
```
Token: mock:sess_ABC123 or MzAwMDAw.TU9DSw.c2Vzc19BQkMxMjM
                              ↓
parseMockToken() → extracts "sess_ABC123"
                              ↓
sessionManager.getByToken() → returns Session
                              ↓
Connection/Request → routes to session state
```

## Critical Quirks

| # | Quirk | Details |
|---|-------|---------|
| 1 | Gateway v10 only | Rejects v9, ETF, zlib-stream |
| 2 | JSON encoding only | No binary/compressed support |
| 3 | Voice port 50001 | Separate WSS/TLS server |
| 4 | Loop detection | 10+ events/sec triggers 5s cooldown |
| 5 | Session TTL | 1hr default, 60s cleanup interval |
| 6 | LRU eviction | 10k actions max, removes oldest 10% |
| 7 | Stage buffer | 1000 events, replay via ?last_seq=N |
| 8 | Reconnection | Exponential backoff 1s→30s, max 5 attempts |
| 9 | Token format | mock:sess_xxx parsed everywhere |
| 10 | Hook priorities | server → mock → discordjs order critical |

## Memory Abstractions (Hosted Instance)

All storage is memory-only by default for future hosted instance scaling:

| Interface | Default | Purpose |
|-----------|---------|---------|
| `AttachmentStorage` | `MemoryAttachmentStorage` | File storage |
| `SessionStorage` | `InMemoryStorage` | Session persistence |

**Future backends:** FileSystem, S3, Redis (stubs exist).

**Key limits:**
- Actions: 10,000 max per session (LRU eviction)
- Logs: 10,000 max per session (LRU eviction)
- Stage events: 1,000 buffer (replay support)

## Common Agent Tasks

### Understanding Bot Flow
1. Read [discord-protocol.md](discord-protocol.md) for Gateway flow
2. Read [session-management.md](session-management.md) for state handling
3. Read [robo-integration/discordjs-integration.md](robo-integration/discordjs-integration.md) for token swap

### Adding API Endpoints
1. Read [api/discord-v10.md](api/discord-v10.md) for patterns
2. Add file in `src/api/v10/` (file-based routing)
3. Use `getSessionFromRequest()` for session access

### Understanding Stage UI
1. Read [stage-ui/architecture.md](stage-ui/architecture.md) for structure
2. Read [stage-ui/state-management.md](stage-ui/state-management.md) for stores
3. Read [stage-ui/components.md](stage-ui/components.md) for component tree

### Testing Features
1. Read [testing.md](testing.md) for utilities
2. Use `mockSession()` for test sessions
3. Use `dispatchEvent()` for event injection
4. Use `waitForAction()` for assertions

### Understanding DevTools
1. Read [stage-ui/devtools.md](stage-ui/devtools.md) for 8 tabs
2. Components in `src/app/components/devtools/`
3. Uses PlaybackStore, SessionStore, WebSocketStore

## Key Source Directories

| Directory | Purpose |
|-----------|---------|
| `src/core/` | Gateway, Stage bridge, intents |
| `src/session/` | Session management, state, recording |
| `src/api/v10/` | Discord REST API emulation |
| `src/api/control/` | Session control endpoints |
| `src/app/` | Stage UI React application |
| `src/robo/` | Robo.js lifecycle hooks |
| `src/types/` | TypeScript type definitions |
| `src/utils/` | Utility functions |
| `src/testing/` | Test utilities export |

## Logger Instance

All files use shared logger:

```typescript
import { mockLogger } from '../core/logger.js'
// or
import { logger } from 'robo.js'
const mockLogger = logger.fork('mock')
```

Single `mockLogger` instance across entire package (plugin standard).

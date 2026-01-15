# @robojs/server Integration

## Overview

@robojs/mock integrates with @robojs/server through engine callbacks, WebSocket handler registration, plugin prefixes, and static asset serving. This enables the mock server to run within the Robo.js web server infrastructure.

## Engine Callback Pattern

### Problem

Robo.js prepare hooks execute alphabetically. @robojs/mock ('m') runs before @robojs/server ('s'), but needs the server engine to register WebSocket handlers.

### Solution

**File:** `src/robo/prepare.ts` (lines 63-77)

```typescript
type EngineCallbackArray = Array<(engine: BaseEngine) => void>

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

### Execution Flow

```
1. @robojs/mock prepare → push callback to globalThis
2. @robojs/server prepare → create engine, execute callbacks
3. Callbacks register WebSocket handlers on engine
4. @robojs/discordjs start → connect to gateway (handlers ready)
```

### Contract

- @robojs/mock pushes callback to `globalThis.__roboServerEngineCallbacks`
- @robojs/server iterates array and calls each callback with engine
- Callbacks execute before start hooks run

## WebSocket Handler Registration

### Handler Registration

**File:** `src/robo/prepare.ts` (lines 83-114)

```typescript
export function registerWebSocketHandlers(engine: BaseEngine): void {
  const gatewayServer = getGatewayServer()
  const stageServer = getStageServer()
  const pluginPrefix = getMockPluginPrefix()

  // Root path for Discord Gateway
  engine.registerWebsocket('/', (req, socket, head) => {
    gatewayServer.handleUpgrade(req, socket, head)
  })

  // Stage WebSocket path
  const stageWsHandler = (req, socket, head) => {
    stageServer.handleUpgrade(req, socket, head)
  }
  engine.registerWebsocket('/stage/ws', stageWsHandler)

  // Prefixed Stage path
  if (pluginPrefix) {
    engine.registerWebsocket(`${pluginPrefix}/stage/ws`, stageWsHandler)
  }
}
```

### Registered Paths

| Path | Purpose |
|------|---------|
| `/` | Discord Gateway WebSocket |
| `/stage/ws` | Stage UI WebSocket |
| `${prefix}/stage/ws` | Prefixed Stage WebSocket |

### Handler Type

**File:** `@robojs/server/src/core/types.ts`

```typescript
export type WebSocketHandler = (
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer
) => void
```

### Engine Registration

**File:** `@robojs/server/src/engines/node.ts` (lines 69-72)

```typescript
public registerWebsocket(path: string, handler: WebSocketHandler) {
  this._websocketHandlers[path] = handler
}
```

### Upgrade Handling

**File:** `@robojs/server/src/engines/node.ts` (lines 28-54)

```typescript
this._server.on('upgrade', (req, socket, head) => {
  let wsPath = (req.url ?? '').split('?')[0]

  // Strip plugin prefix for transparent routing
  const registry = getPluginRouteRegistry()
  const prefixMatch = registry.matchApiPrefix(wsPath) ?? registry.matchStaticPrefix(wsPath)
  if (prefixMatch) {
    wsPath = registry.stripPrefix(wsPath, prefixMatch.prefix)
  }

  const handler = this._websocketHandlers[wsPath]
  if (handler) {
    handler(req, socket, head)
    return
  }

  // Fall back to default handler
  const defaultHandler = this._websocketHandlers['default']
  if (defaultHandler) {
    defaultHandler(req, socket, head)
  }
})
```

## File-Based Route Auto-Discovery

### Route Files

Mock server routes live in `src/api/`:

```
src/api/
├── v10/               # Discord API emulation
│   ├── gateway.ts
│   ├── channels/
│   ├── guilds/
│   └── applications/
├── control/           # Session management
│   ├── sessions/
│   └── tests/
└── stage/             # Stage UI support
    └── routes.ts
```

### Path Conversion

**File:** `src/api/stage/routes.ts` (lines 66-68)

```typescript
function filePathToRoutePath(filePath: string): string {
  return '/api/' + filePath.replace(/\[(.+?)\]/g, ':$1')
}
```

**Examples:**

| File Path | Route Path |
|-----------|------------|
| `v10/channels/[id]/messages.ts` | `/api/v10/channels/:id/messages` |
| `control/sessions/[id]/state.ts` | `/api/control/sessions/:id/state` |
| `v10/applications/[app_id]/commands.ts` | `/api/v10/applications/:app_id/commands` |

### Route Discovery

**File:** `src/api/stage/routes.ts` (lines 84-102)

- Recursively scans `src/api/` directory
- Filters utility files (`utils` directories)
- Categorizes by prefix (`v10/`, `control/`, etc.)
- Returns sorted list for autocomplete

## Plugin Prefix System

### Default Configuration

**File:** `config/plugins/robojs/server.ts`

```typescript
export default {
  cors: true,
  prefix: '/mock'
}
```

### Prefix Resolution

**File:** `src/utils/server.ts` (lines 70-99)

```typescript
export function getMockPluginPrefix(): string {
  // Priority 1: User's explicit config
  const config = getServerConfig()
  const userPrefix = config.pluginPrefixes?.['@robojs/mock']

  if (userPrefix) {
    if (typeof userPrefix === 'string') {
      return userPrefix.startsWith('/') ? userPrefix : `/${userPrefix}`
    }
    if (userPrefix.static) {
      const prefix = userPrefix.static
      return prefix.startsWith('/') ? prefix : `/${prefix}`
    }
  }

  // Priority 2: Plugin's manifest prefix
  try {
    const mockPlugin = Manifest.plugin('@robojs/mock')
    if (mockPlugin?.prefix) {
      return mockPlugin.prefix.startsWith('/') ? mockPlugin.prefix : `/${mockPlugin.prefix}`
    }
  } catch {
    // Manifest may not be available
  }

  // Priority 3: Default
  return '/mock'
}
```

### Resolution Priority

| Priority | Source | Example |
|----------|--------|---------|
| 1 | User config | `pluginPrefixes: { '@robojs/mock': '/custom' }` |
| 2 | Plugin manifest | Declared in package manifest |
| 3 | Default constant | `/mock` |

## Exclusive vs Additive Modes

### Plugin Prefix Configuration

**File:** `@robojs/server/src/core/plugin-routes.ts` (lines 14-50)

```typescript
export type PluginPrefixConfig =
  | string  // Both API and static under same prefix
  | {
      api?: string | false
      static?: string | false
      exclusive?: boolean  // Default: true
    }
```

### Mode Behavior

**Exclusive (default):**
- Only `/mock/api/*` works
- `/api/*` returns 404

**Additive:**
- Both `/mock/api/*` and `/api/*` work
- Routes accessible at both paths

### Configuration Examples

```typescript
// Exclusive (default)
pluginPrefixes: {
  '@robojs/mock': '/mock'
}

// Additive
pluginPrefixes: {
  '@robojs/mock': {
    api: '/mock-api',
    static: '/mock-static',
    exclusive: false
  }
}

// Granular
pluginPrefixes: {
  '@robojs/mock': {
    api: '/mock',
    static: '/assets',
    exclusive: true
  }
}
```

### Route Registration

**File:** `@robojs/server/src/robo/start.ts` (lines 182-214)

```typescript
const pluginName = record.plugin?.name
const pluginConfig = pluginName ? registry.getPlugin(pluginName) : null
const pluginPrefix = pluginConfig?.apiPrefix ?? ''
const isExclusive = pluginConfig?.exclusive ?? true

const baseKey = prefix + '/' + routeKey.replace(PATH_REGEX, ':$1')

if (isExclusive && pluginPrefix) {
  // Exclusive: Only /mock/api/* works
  const exclusiveKey = pluginPrefix + baseKey
  engine.registerRoute(exclusiveKey, wrappedHandler)
} else if (!isExclusive && pluginPrefix) {
  // Additive: Both paths work
  engine.registerRoute(baseKey, wrappedHandler)
  const prefixedKey = pluginPrefix + baseKey
  engine.registerRoute(prefixedKey, wrappedHandler)
} else {
  engine.registerRoute(baseKey, wrappedHandler)
}
```

## Static Asset Serving

### Stage UI Assets

**Location:** `public/stage/`

```
public/stage/
├── index.html
└── assets/
    ├── index-BJ2NVxWk.css
    ├── index-D80EGq-n.js
    └── ...
```

### Static Asset Flow

**File:** `@robojs/server/src/core/handler.ts` (lines 214-231)

```typescript
const staticMatch = registry.matchStaticPrefix(parsedUrl.pathname ?? '')
if (staticMatch) {
  const strippedPath = registry.stripPrefix(parsedUrl.pathname ?? '', staticMatch.prefix)
  const pluginPublicDir = registry.getPublicDir(staticMatch.plugin)

  if (pluginPublicDir) {
    const result = await handlePluginStaticFile(
      strippedPath,
      pluginPublicDir,
      req.url ?? '',
      fileCallback
    )
    if (result.type === 'served') return
    if (result.type === 'redirect') {
      res.writeHead(301, { Location: result.location })
      res.end()
      return
    }
  }
}
```

### Public Directory Detection

**File:** `@robojs/server/src/core/plugin-routes.ts` (lines 245-266)

```typescript
private _detectPublicDir(pluginName: string): string | null {
  const isProduction = process.env.NODE_ENV === 'production'

  if (isProduction) {
    // Production: .robo/public/{namespace}
    const namespace = this._getPluginNamespace(pluginName)
    const prodPath = path.join(process.cwd(), '.robo', 'public', namespace)
    if (existsSync(prodPath)) return prodPath
  } else {
    // Development: node_modules/{plugin}/public
    const devPath = path.join(process.cwd(), 'node_modules', pluginName, 'public')
    if (existsSync(devPath)) return devPath
  }

  return null
}
```

### Stage UI URL Generation

**File:** `src/utils/server.ts` (lines 113-120)

```typescript
export function getStageUIUrl(sessionToken: string): string {
  const baseUrl = getMockServerUrl()
  const prefix = getMockPluginPrefix()
  const encodedToken = encodeURIComponent(sessionToken)

  // Trailing slash required for relative asset paths
  return `${baseUrl}${prefix}/stage/?token=${encodedToken}`
}
```

**Trailing Slash Importance:**
- Without: `/mock/stage` + `./assets/foo.js` = `/mock/assets/foo.js` (wrong)
- With: `/mock/stage/` + `./assets/foo.js` = `/mock/stage/assets/foo.js` (correct)

## Embedded vs Standalone Modes

### Mode Detection

**File:** `src/robo/prepare.ts` (lines 30-57)

```typescript
export default async () => {
  const isStandalone = process.env.__ROBO_MOCK_STANDALONE === 'true'
  const isMockMode = process.env.ROBO_MOCK_MODE === 'true'

  if (isStandalone) {
    // CLI manages infrastructure
    registerEngineCallback()
    return
  }

  if (!isMockMode) {
    // Not in mock mode
    return
  }

  const connectingToExisting = process.env.__ROBO_MOCK_CONNECT_EXISTING === 'true'
  if (connectingToExisting) {
    // External server handles WebSocket
    return
  }

  registerEngineCallback()
}
```

### Mode Matrix

| Mode | Environment | Behavior |
|------|-------------|----------|
| **Embedded** | `ROBO_MOCK_MODE=true` | Bot + mock in same process |
| **External** | `__ROBO_MOCK_CONNECT_EXISTING=true` | Bot connects to external server |
| **Standalone** | `__ROBO_MOCK_STANDALONE=true` | CLI manages server lifecycle |

### Embedded Mode

```
robo dev --mock

• Bot and mock server run in same Robo process
• WebSocket handlers registered via engine callback
• Routes served under /mock/api/*
• Stage UI at /mock/stage/
```

### Standalone Mode

```
robo mock start

• Mock server runs independently
• No bot process
• CLI command manages lifecycle
• Full Stage UI available
```

### External Connection Mode

```
robo dev --mock sess_xxx

• Bot connects to external mock server
• Skip local WebSocket registration
• REST API points to external server
```

## Server Configuration Access

### Configuration Functions

**File:** `src/utils/server.ts`

| Function | Purpose |
|----------|---------|
| `getServerConfig()` | Returns @robojs/server plugin config |
| `getServerPort()` | Returns configured port (default 3000) |
| `getMockServerUrl()` | Returns full mock server URL |
| `getMockPluginPrefix()` | Returns plugin prefix (default /mock) |
| `getStageUIUrl(token)` | Returns Stage UI URL with token |

### Port Detection

```typescript
export function getServerPort(): number {
  const config = getServerConfig()
  return config.port ?? 3000
}
```

### URL Building

```typescript
export function getMockServerUrl(): string {
  const port = getServerPort()
  const host = 'localhost'
  return `http://${host}:${port}`
}
```

**Note:** Always returns HTTP since mock server runs locally. Production deployments would use a reverse proxy for HTTPS.

## Integration Summary

### Key Integration Points

| Point | Mechanism |
|-------|-----------|
| Engine Callbacks | `globalThis.__roboServerEngineCallbacks` |
| WebSocket Handlers | `engine.registerWebsocket()` |
| Route Registration | File-based with prefix handling |
| Static Assets | `public/` directory detection |
| Plugin Prefixes | Registry with exclusive/additive modes |

### Data Flow

```
@robojs/mock prepare
    │
    └──► globalThis.__roboServerEngineCallbacks.push(callback)
                         │
@robojs/server prepare   │
    │                    │
    └──► engine created ─┘
    │
    └──► callbacks executed
    │
    └──► WebSocket handlers registered
    │
@robojs/server start
    │
    └──► Routes registered with prefixes
    │
    └──► Static assets served from public/
```

## Key Files

| Component | Path |
|-----------|------|
| Prepare Hook | `src/robo/prepare.ts` |
| Server Utils | `src/utils/server.ts` |
| Plugin Config | `config/plugins/robojs/server.ts` |
| Route Discovery | `src/api/stage/routes.ts` |
| Server Engine | `@robojs/server/src/engines/node.ts` |
| Route Registry | `@robojs/server/src/core/plugin-routes.ts` |
| Static Handler | `@robojs/server/src/core/handler.ts` |
| Server Start | `@robojs/server/src/robo/start.ts` |

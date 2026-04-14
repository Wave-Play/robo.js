---
name: robo-core
description: "Reference guide for the Robo.js core framework — lifecycle hooks, Flashcore, State, Logger, Env, Portal, Manifest, HMR, Mode, Config, and plugin utilities."
user-invocable: true
argument-hint: "<question about Robo.js core APIs>"
---

# Robo.js Core Framework Guide

Complete reference for AI agents working with the Robo.js core framework. This covers lifecycle hooks, persistent storage (Flashcore), in-memory state, structured logging, environment variables, portal system, manifest access, HMR, mode-based configuration, and plugin utilities.

## Usage

```
/robo-core                    # Inject this guide as context
/robo-core <question>         # Answer a question about core APIs
```

### Context / Question Mode

Use this guide as the authoritative reference. If the user asks a question, answer it from these patterns. All imports use npm packages (`robo.js`, `robo.js/hmr`, `robo.js/logger.js`) — never monorepo paths. All file paths are relative to the user's project root.

---

## 1. Mental Model

Robo.js orchestrates plugins through lifecycle hooks, file-based routing, and a portal system. The core framework provides:

- **Lifecycle management** — hooks that run at defined stages of the application lifecycle
- **Persistence** — Flashcore key-value storage with adapter support
- **In-memory state** — scoped and forkable state with optional persistence
- **Structured logging** — leveled logger with drains, forks, and custom levels
- **Environment variables** — mode-aware `.env` loading with type-safe schemas
- **Portal** — runtime access to loaded handlers across all namespaces
- **Manifest** — build-time metadata available at runtime
- **HMR** — hot module replacement for development workflows
- **Mode** — development, production, and custom mode switching
- **Config** — project and plugin configuration loading

Everything revolves around the hook lifecycle:

```
init → prepare → start → [running] → stop
```

| Concept | Where it lives | Import from |
|---------|---------------|-------------|
| Lifecycle hooks | `src/robo/{hookType}.ts` | Types from `robo.js` |
| Flashcore | Any file | `robo.js` |
| State | Any file | `robo.js` |
| Logger | Any file | `robo.js` or `robo.js/logger.js` |
| Env | Any file | `robo.js` |
| Portal | After `prepare` phase | `robo.js` |
| Manifest | After build / at runtime | `robo.js` |
| HMR | Development only | `robo.js/hmr` |
| Mode | Any file | `robo.js` |
| Config | Any file | `robo.js` |

---

## 2. Lifecycle Hooks

Hook files live in `src/robo/{hookType}.ts`. They execute in a defined sequence during application startup, shutdown, and error handling.

### Execution Sequence

```
init → prepare → start → [running] → stop
```

- **init** runs before the manifest is loaded. No portal access.
- **prepare** runs after the portal is populated but before the app starts.
- **start** is the main startup hook. Plugins run first, then the project.
- **stop** runs on shutdown with a `reason` field.
- **error** runs on unhandled errors (does not participate in the sequence).
- **setup** runs during `create-robo` or `robo add` (CLI-time only).

### Hook Types

| Hook | File | Context Type | When | Notes |
|------|------|-------------|------|-------|
| `init` | `src/robo/init.ts` | `InitContext` | Before manifest loading | No portal access |
| `prepare` | `src/robo/prepare.ts` | `PrepareContext` | After portal populated, before start | Portal ready |
| `start` | `src/robo/start.ts` | `StartContext` | Main startup hook | Sequential: plugins then project |
| `stop` | `src/robo/stop.ts` | `StopContext` | Shutdown | Has `reason` field |
| `error` | `src/robo/error.ts` | `ErrorContext` | Unhandled errors | type: 'unhandledRejection' \| 'uncaughtException' |
| `setup` | `src/robo/setup.ts` | `SetupContext` | CLI: create-robo or robo add | Has exec(), prompt() |

### Context Fields

| Field | init | prepare | start | stop | error | setup |
|-------|------|---------|-------|------|-------|-------|
| `mode` | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `projectConfig` | ✓ | ✓ | ✓ | ✓ | — | — |
| `pluginConfig` | — | ✓ | ✓ | ✓ | — | — |
| `state` | — | ✓ | ✓ | ✓ | — | — |
| `logger` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `env` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `portal` | — | — | ✓? | ✓? | — | — |
| `meta` | — | ✓ | ✓ | ✓ | — | — |
| `reason` | — | — | — | ✓ | — | — |
| `error` | — | — | — | — | ✓ | — |
| `type` | — | — | — | — | ✓ | — |
| `trigger` | — | — | — | — | — | ✓ |
| `paths` | — | — | — | — | — | ✓ |
| `exec` | — | — | — | — | — | ✓ |
| `prompt` | — | — | — | — | — | ✓ |
| `package` | — | — | — | — | — | ✓ |

**Type notes:** `env`: typeof Env (use `Env.data()` for `Record<string, string>`). `pluginConfig`: generic `TConfig`. `state`: `PluginState`. `portal`: Portal instance (optional, available after prepare). `meta`: `{ name, version }`. `reason`: `'signal' | 'error' | 'restart'`. `error`: `unknown` — narrow before accessing `.message`/`.stack`. `type`: `'unhandledRejection' | 'uncaughtException'`. `trigger`: `'create' | 'add'`. `paths`: `{ root, src, config }`. `package`: `{ name, version, type: 'template' | 'plugin' }`.

### Example

```typescript
// src/robo/start.ts
import type { StartContext } from 'robo.js'
export default async (context: StartContext) => {
  context.logger.info('Starting in', context.mode, 'mode')
  const myConfig = context.pluginConfig as MyPluginOptions
}

// src/robo/stop.ts — context.reason is 'signal' | 'error' | 'restart'
// src/robo/error.ts — context.error is unknown, context.type is the rejection type
```

---

## 3. Build Hooks

Build hooks run during `robo build` and allow plugins to transform entries, aggregate metadata, and inject build steps.

### Files

| Hook | File | Context Type |
|------|------|-------------|
| Build start | `src/robo/build/start.ts` | `BuildContext` |
| Build transform | `src/robo/build/transform.ts` | `BuildTransformContext` |
| Build complete | `src/robo/build/complete.ts` | `BuildCompleteContext` |

### BuildContext

```typescript
{
  mode: string
  env: typeof Env                // The Env class — use Env.data() for Record<string, string>
  logger: Logger
  paths: { root: string, src: string, output: string }
  config: Config
  store: BuildStore
  entries?: EntriesAccessor   // Only guaranteed in transform/complete
}
```

### BuildTransformContext

Extends `BuildContext` with `entries: EntriesAccessor` (always available). **EntriesAccessor** methods: `get(namespace, route)`, `all()`, `handlers(namespace, route)`.

### BuildCompleteContext

Extends `BuildTransformContext` with `registerMetadataAggregator<T>(namespace, aggregator)` and `updateMetadata(namespace, updates)`.

### BuildStore

Persists data between build hooks within a single build. Methods: `get(key)`, `set(key, value)`, `has(key)`, `delete(key)`, `clear()`.

### Example

```typescript
// src/robo/build/transform.ts
import type { BuildTransformContext } from 'robo.js'

export default async (context: BuildTransformContext) => {
  const allEntries = context.entries.all()
  context.logger.info('Processing', allEntries.length, 'entries')
  context.store.set('entryCount', allEntries.length)
}
```

```typescript
// src/robo/build/complete.ts
import type { BuildCompleteContext } from 'robo.js'

export default async (context: BuildCompleteContext) => {
  const count = context.store.get('entryCount')
  context.logger.ready('Build complete with', count, 'entries')

  // Register metadata aggregator for runtime access
  context.registerMetadataAggregator('my-namespace', (handlers) => {
    return handlers.map((h) => ({ path: h.path, method: h.method }))
  })
}
```

---

## 4. Hook Priority

Hook priority controls execution order across plugins and the project. Lower numbers run first. Hooks with the same priority execute in parallel.

### Defaults

| Value | Meaning |
|-------|---------|
| `DEFAULT_HOOK_PRIORITY` (100) | Default for all hooks |
| Lower number | Runs earlier |
| Higher number | Runs later |
| Same priority | Parallel execution |

### API

```typescript
import { setHookPriority, prioritizeHookBefore, prioritizeHookAfter, DEFAULT_HOOK_PRIORITY } from 'robo.js'

// Set explicit priority (lower = earlier)
setHookPriority('start', '@robojs/analytics', 50)

// Relative ordering
prioritizeHookBefore('start', 'my-plugin', '@robojs/discordjs')  // my-plugin runs before discordjs
prioritizeHookAfter('start', 'my-plugin', '@robojs/server')       // my-plugin runs after server
```

### Config-Based Priority

In plugin registration via `metaOptions.hookPriority`:

```typescript
// config/plugins/robojs/my-plugin.ts
export default {
  metaOptions: {
    hookPriority: {
      start: 50,
      stop: 150
    }
  }
}
```

### Practical Example

```typescript
// Ensure database connection is ready before other plugins start
import { setHookPriority } from 'robo.js'

setHookPriority('start', 'my-db-plugin', 10)   // Run very early
setHookPriority('stop', 'my-db-plugin', 200)    // Shut down late (after others)
```

---

## 5. Flashcore

Persistent key-value storage with namespace support, watcher callbacks, and pluggable adapters.

### Core API

```typescript
import { Flashcore } from 'robo.js'

// Basic CRUD
await Flashcore.get<string>('key')                        // Get value (typed)
await Flashcore.set('key', 'value')                       // Set value
await Flashcore.delete('key')                             // Delete value
await Flashcore.has('key')                                // Check existence → boolean
await Flashcore.clear()                                   // Clear all data

// Namespaced operations
await Flashcore.get('key', { namespace: 'users' })
await Flashcore.set('key', value, { namespace: 'users' })
await Flashcore.delete('key', { namespace: 'users' })
await Flashcore.has('key', { namespace: 'users' })

// Updater function (read-modify-write)
await Flashcore.set('counter', (oldValue) => (oldValue ?? 0) + 1)

// Watchers
const callback = (oldValue: unknown, newValue: unknown) => {
  console.log('Changed from', oldValue, 'to', newValue)
}
Flashcore.on('key', callback)
Flashcore.off('key', callback)
```

### Custom Adapter

```typescript
interface FlashcoreAdapter<K = string, V = unknown> {
  clear(): Promise<boolean> | boolean | void
  delete(key: K): Promise<boolean> | boolean
  get(key: K): Promise<V | undefined> | V | undefined
  init(): Promise<void> | void
  set(key: K, value: V): Promise<boolean> | boolean
  has(key: K): Promise<boolean> | boolean
}
```

### Configuration

In `config/robo.ts`:

```typescript
import type { Config } from 'robo.js'

export default {
  flashcore: {
    adapter: myCustomAdapter
  }
} satisfies Config
```

Keyv adapters are also supported as Flashcore adapters.

### Common Patterns

```typescript
// User preferences with namespace
await Flashcore.set('theme', 'dark', { namespace: `user:${userId}` })
const theme = await Flashcore.get<string>('theme', { namespace: `user:${userId}` })

// Atomic counter increment
await Flashcore.set('visits', (old) => (old ?? 0) + 1)

// Watch for changes
Flashcore.on('settings', (oldVal, newVal) => {
  logger.info('Settings updated:', newVal)
})
```

---

## 6. State

In-memory state management with optional persistence, namespace support, updater functions, and forkable scopes.

### Basic API

```typescript
import { State } from 'robo.js'

// Set and get
State.set('key', 'value')
const val = State.get<string>('key')

// Updater function
State.set('count', (old) => (old ?? 0) + 1)

// With options
State.set('key', value, { namespace: 'ns', persist: true })
State.get('key', { namespace: 'ns', default: 'fallback' })
```

### Options

| Option | Type | Description |
|--------|------|-------------|
| `namespace` | `string` | Scope the key to a namespace |
| `persist` | `boolean` | Persist across restarts (uses Flashcore) |
| `default` | `T` | Default value if key is not set (get only) |

### Forked State

Create scoped state instances for isolation:

```typescript
import { State } from 'robo.js'

// Fork creates an isolated state scope
const userState = State.fork('user-123')
userState.setState('score', 100)
userState.getState<number>('score')  // 100

const guildState = State.fork('guild-456')
guildState.setState('score', 200)    // Does not affect user-123

// List all active forks
const forks = State.listForks()      // ['user-123', 'guild-456']
```

### Plugin State

Scoped state for plugin authors, available in lifecycle contexts:

```typescript
import { createPluginState } from 'robo.js'

const state = createPluginState('my-plugin')

state.set('counter', 42)
state.get<number>('counter')    // 42
state.has('counter')            // true
state.delete('counter')         // Remove
state.clear()                   // Clear all plugin state
```

Plugin state is also available via `context.state` in lifecycle hooks:

```typescript
// src/robo/start.ts
import type { StartContext } from 'robo.js'

export default async (context: StartContext) => {
  context.state.set('initialized', true)
  context.state.set('startTime', Date.now())
}
```

---

## 7. Logger

Structured, leveled logging with drain support, forking, and custom levels.

### Log Levels (ordered)

| Level | Usage |
|-------|-------|
| `trace` | Fine-grained debugging |
| `debug` | Development diagnostics |
| `info` | General information |
| `wait` | Waiting/loading indicators |
| `other` | Standard output (`logger.log()` maps to the `other` level internally) |
| `event` | Event-driven messages |
| `ready` | Startup/ready signals |
| `warn` | Warnings |
| `error` | Errors |

### Basic Usage

```typescript
import { logger } from 'robo.js'

logger.info('Hello world')
logger.warn('Something looks off')
logger.error('Failed to process:', error)
logger.debug('Debug details:', data)
logger.ready('Server is ready')
logger.wait('Loading resources...')
logger.event('User logged in:', userId)
logger.trace('Entering function:', fnName)

// Custom level
logger.custom('myLevel', 'Custom message')
```

### Forking

Use `logger.fork()` to create named loggers. Forking is useful for plugins, large features, or any area where scoped log filtering helps.

**Plugin standard:** Each plugin should use a forked logger named after the plugin. For most plugins, one fork is sufficient:

```typescript
// src/core/logger.ts (shared within the plugin)
import { logger } from 'robo.js/logger.js'
export const myLogger = logger.fork('my-plugin')

// All other files import the shared logger
// src/core/engine.ts
import { myLogger } from './logger.js'
myLogger.info('Engine started')   // [my-plugin] Engine started
```

**Large project features:** Fork loggers for distinct areas of a complex project to make log filtering easier:

```typescript
import { logger } from 'robo.js/logger.js'

// Each major feature gets its own fork
export const authLogger = logger.fork('auth')
export const paymentLogger = logger.fork('payments')
export const matchmakingLogger = logger.fork('matchmaking')
```

This makes it easy to filter logs by area (e.g., show only `[payments]` logs during debugging).

### Drain System

Drains are custom log destinations. The default drain writes to the console. `LogDrain` signature: `(logger: Logger, level: string, ...data: unknown[]) => Promise<void>`.

```typescript
import { consoleDrain, createMultiDrain, createLevelFilteredDrain, createFileDrain } from 'robo.js'

const drain = createMultiDrain([
  consoleDrain,
  createLevelFilteredDrain(myErrorDrain, 'error'),
  createFileDrain({ path: './logs/app.log' })
])
```

**Runtime drain management:** `logger.addDrain(myDrain, 'id')` returns `DrainHandle` (`{ id, remove(), flush() }`). Remove by ID with `logger.removeDrain('id')`. Flush all with `await logger.flush()`.

### Logger Config

Configure in `config/robo.ts` under `logger`: `enabled`, `level` (minimum), `maxEntries`, `prefix`, `drain` (custom drain function), `customLevels` (e.g., `{ audit: { priority: 55, label: 'AUDIT' } }`). See Section 13 for full config structure.

---

## 8. Env

Mode-aware environment variable loading with type-safe schema access and variable substitution.

### Static Methods

```typescript
import { Env } from 'robo.js'

// Async load
const vars = await Env.load({ mode: 'production' })

// Sync load
const vars = Env.loadSync()

// Get all loaded variables
const allVars = Env.data()
```

### Load Options

```typescript
interface LoadOptions {
  mode?: string                      // Mode for .env.{mode} files
  path?: string                      // Custom .env file path
  overwrite?: boolean | string[]     // Overwrite existing vars (or specific keys)
}
```

### Type-Safe Schema

```typescript
const myEnv = new Env({
  database: {
    host: 'DB_HOST',
    port: 'DB_PORT',
    name: 'DB_NAME'
  },
  apiKey: 'API_KEY',
  debug: 'DEBUG_MODE'
})

// Dot-path access with type safety
myEnv.get('database.host')    // reads process.env.DB_HOST
myEnv.get('database.port')    // reads process.env.DB_PORT
myEnv.get('apiKey')           // reads process.env.API_KEY
```

### Mode-Specific Files

Environment files are loaded in order, with later files taking precedence:

| File | When Loaded |
|------|-------------|
| `.env` | Always |
| `.env.local` | Always (gitignored) |
| `.env.development` | `mode === 'development'` |
| `.env.production` | `mode === 'production'` |
| `.env.{custom}` | `mode === 'custom'` |

Variable substitution is supported: `DATABASE_URL=postgres://${DB_USER}:${DB_PASS}@${DB_HOST}`.

### Registration for Manifest

Plugins can register env patterns for documentation in the manifest:

```typescript
import { registerEnvPattern } from 'robo.js'

registerEnvPattern('MY_PLUGIN_', {
  description: 'Environment variables for my plugin',
  required: ['MY_PLUGIN_API_KEY'],
  optional: ['MY_PLUGIN_DEBUG']
})
```

---

## 9. Portal

Namespace-based proxy for accessing loaded handlers at runtime. The portal is populated after the `prepare` phase and is NOT available in `init` hooks.

### Namespace Access

```typescript
import { portal } from 'robo.js'

// Access via proxy (namespace.routeType)
portal.discord.commands            // All command handlers as Record
portal.discord.command('ping')     // Singular accessor: CommandController

// Custom namespaces work the same way
portal.myNamespace.routes          // Custom namespace routes
```

### Module Control

```typescript
// Check and toggle modules
portal.module('my-module').isEnabled()       // boolean
portal.module('my-module').setEnabled(false)  // Disable module
portal.module('my-module').setEnabled(true)   // Re-enable module
```

### Query All Handlers

```typescript
// Get all handler records
const allHandlers = portal.all()                          // HandlerRecord[]

// Get handlers by type
const commands = portal.getByType('discord:commands')     // Record<string, HandlerRecord>
const events = portal.getByType('discord:events')         // Record<string, HandlerRecord>
```

### Important Notes

- Portal uses a JavaScript `Proxy` for dynamic namespace access.
- Not available during `init` hooks (manifest not yet loaded).
- Available in `prepare`, `start`, `stop`, and runtime handlers.
- Plugin handlers and project handlers are both accessible.

---

## 10. Manifest

Build-time metadata accessible at runtime. The manifest is generated during `robo build` and contains route definitions, hook entries, plugin info, project metadata, and more.

### API

```typescript
import { Manifest } from 'robo.js'
```

| Method | Returns | Description |
|--------|---------|-------------|
| `routes(ns, route)` | `Promise<HandlerEntry[]>` | Get route handlers |
| `routeSummaries(ns, route)` | `Promise<HandlerSummary[]>` | Get route summaries |
| `routeDefinitions()` | All route definitions | All namespaces |
| `routeDefinitionsForNamespace(ns)` | Route definitions | Namespace-specific |
| `hooks(type)` | `HookEntry[]` | Hook entries by type (e.g., `'start'`) |
| `config()` | `Config` | Resolved project config |
| `env()` | `EnvMetadata` | `{ variables, summary, required }` |
| `plugins()` | `PluginInfo[]` | All registered plugins |
| `plugin(name)` | `PluginInfo \| undefined` | Single plugin by name |
| `project()` | `ProjectInfo` | `{ name, version, language, roboVersion, mode, buildTime, buildHash }` |
| `metadata<T>(ns)` | `T \| undefined` | Aggregated metadata from build hooks |
| `seeds(pluginName)` | `SeedConfig \| undefined` | Plugin seed config |
| `seedsIndex()` | Full seed index | All seeds |

### Manifest Lifecycle

| Member | Description |
|--------|-------------|
| `isInitialized` | `boolean` property |
| `isLoaded(ns, route)` | Check if route loaded |
| `load(ns, route)` | Load route (async) |
| `reload(ns, route)` | Force reload (async) |
| `unload(ns, route)` | Free from memory |
| `clearCache()` | Clear all cached data |

---

## 11. HMR

Hot Module Replacement for development workflows. Import from `robo.js/hmr`. HMR is active in development mode and disabled in production.

### Module-Level HMR

```typescript
import { hmr } from 'robo.js/hmr'

const hot = hmr.module(import.meta.url)

// Persist data across module reloads
hot.data.previousValue = currentValue

// Cleanup before module is replaced
hot.dispose(() => {
  clearInterval(myInterval)
  myConnection.close()
})
```

### HMR Subscriptions

Subscribe to file change events. Subscription callbacks receive `HmrEventContext` (without `logger`/`env`), while hook files receive `HmrContext` (with `logger`/`env`).

```typescript
import { hmr } from 'robo.js/hmr'

const sub = hmr.subscribe((context) => {
  console.log('Change type:', context.changeType)   // 'change' | 'add' | 'remove'
  console.log('Files:', context.files)               // Changed file paths
  console.log('Routes:', context.routes)             // HmrRouteInfo[]
}, {
  namespaces: ['discord'],            // Filter by namespace
  routes: ['commands'],               // Filter by route type
  changeTypes: ['change', 'add']      // Filter by change type
})

// Unsubscribe when done
sub.unsubscribe()
```

### Check HMR Status

```typescript
hmr.enabled   // true in development, false in production
```

### HMR Hook File

The HMR hook runs when files change during development:

```typescript
// src/robo/hmr.ts
import type { HmrContext } from 'robo.js'

export default (context: HmrContext) => {
  // HmrContext has: changeType, files, routes, mode, logger, env
  context.logger.info('Files changed:', context.files)
}

// Optional: filter which changes trigger this hook
export const config = {
  namespaces: ['discord'],
  routes: ['commands']
}
```

### HmrContext

Fields: `changeType` (`'change' | 'add' | 'remove'`), `files` (`string[]`), `routes` (`HmrRouteInfo[]`), `mode`, `logger`, `env` (typeof Env).

**HmrRouteInfo:** `{ namespace, route, handlers: HmrHandlerInfo[] }`. **HmrHandlerInfo:** `{ key, path, changeType, plugin? }`.

### Common Patterns

```typescript
// Preserve resources across reloads
const hot = hmr.module(import.meta.url)
let ws = hot.data.ws ?? new WebSocket('ws://localhost:8080')
hot.data.ws = ws
hot.dispose(() => ws.removeAllListeners?.())

// Clear cache when routes change
hmr.subscribe((ctx) => { routeCache.clear() }, { changeTypes: ['change', 'add', 'remove'] })
```

---

## 12. Mode

Mode determines the runtime environment. Affects config loading, env files, build output, and behavior.

### API

```typescript
import { Mode } from 'robo.js'

Mode.get()         // 'development' | 'production' | custom string
Mode.is('dev')     // true if current mode is 'development'
Mode.isDev()       // Shorthand for Mode.is('development')
Mode.color()       // ANSI color code for the current mode
```

### Mode-Specific Resources

| Resource | Pattern | Example |
|----------|---------|---------|
| Config | `config/robo.{mode}.ts` | `config/robo.production.ts` |
| Env | `.env.{mode}` | `.env.production` |
| Build output | `.robo/build/{mode}/` | `.robo/build/production/` |

### Custom Modes

Pass `--mode` to CLI commands:

```bash
npx robo dev --mode staging
npx robo build --mode staging
npx robo start --mode staging
```

This loads `config/robo.staging.ts` and `.env.staging`.

### Usage in Code

```typescript
import { Mode } from 'robo.js'

if (Mode.isDev()) {
  // Development-only logic
  logger.debug('Verbose debugging enabled')
}

if (Mode.is('staging')) {
  // Staging-specific logic
}
```

---

## 13. Config

Project and plugin configuration loading.

### Project Config

```typescript
import { getConfig } from 'robo.js'

const config = getConfig()   // Config | null
```

### Config Type Fields

| Field | Type | Description |
|-------|------|-------------|
| `type` | `'robo' \| 'plugin'` | Project type |
| `namespace` | `string` | Project namespace |
| `plugins` | `Plugin[]` | Registered plugins |
| `portal` | `PortalConfig` | Portal configuration |
| `flashcore` | `FlashcoreConfig` | Flashcore adapter config |
| `logger` | `LoggerOptions` | Logger configuration |
| `seed` | `SeedConfig` | Seed file configuration |
| `timeouts` | `TimeoutConfig` | Various timeout values |
| `watcher` | `WatcherConfig` | File watcher config |
| `excludePaths` | `string[]` | Paths to exclude from scanning |
| `experimental` | `object` | Experimental features |

### Config File Location

Project config: `config/robo.ts` (or `.mjs`)

```typescript
// config/robo.ts
import type { Config } from 'robo.js'

export default {
  type: 'robo',
  plugins: [],
  logger: {
    level: 'info'
  },
  flashcore: {
    adapter: myAdapter
  },
  timeouts: {
    lifecycle: 10_000,
    command: 30_000
  }
} satisfies Config
```

### Plugin Config

Plugin config location: `config/plugins/{scope}/{name}.ts`

Examples:
- `config/plugins/robojs/server.ts` for `@robojs/server`
- `config/plugins/robojs/analytics.ts` for `@robojs/analytics`
- `config/plugins/my-plugin.ts` for `my-plugin`

### Runtime Plugin Options

```typescript
import { getPluginOptions } from 'robo.js'

const options = getPluginOptions('my-plugin')       // Plugin options or undefined
const serverOpts = getPluginOptions('@robojs/server')
```

---

## 14. Robo

The top-level Robo API for controlling the application lifecycle and status.

### Lifecycle Control

```typescript
import { Robo } from 'robo.js'

await Robo.start()      // Start the application
await Robo.stop()       // Stop the application
await Robo.restart()    // Stop then start
await Robo.build()      // Run the build process
```

### Status API

Display runtime status indicators:

```typescript
import { Robo } from 'robo.js'

// Set a status indicator (key, value, options?)
Robo.status.set('db', 'Database connected', { priority: 5 })

// Remove a status indicator
Robo.status.remove('db')

// Flash a temporary status (auto-removes after duration)
Robo.status.flash('Deployed successfully!', 3000)
```

`StatusOptions` is `{ priority?: number }`.

### Example: Plugin Using Status

```typescript
// src/robo/start.ts
import { Robo } from 'robo.js'
import type { StartContext } from 'robo.js'

export default async (context: StartContext) => {
  Robo.status.set('my-plugin', 'Connecting...')

  try {
    await connectToService()
    Robo.status.set('my-plugin', 'Connected', { priority: 5 })
  } catch (error) {
    Robo.status.set('my-plugin', 'Connection failed')
    throw error
  }
}
```

---

## 15. Common Import Paths

### Runtime Exports

| Source | Exports |
|--------|---------|
| `robo.js` | `Flashcore`, `State`, `createPluginState`, `getConfig`, `getPluginOptions`, `Manifest`, `Mode`, `Robo`, `portal`, `Env`, `registerEnvPattern`, `Logger`, `logger`, `color`, `composeColors` |
| `robo.js` | `consoleDrain`, `createMultiDrain`, `createLevelFilteredDrain`, `createFileDrain` |
| `robo.js` | `DEFAULT_HOOK_PRIORITY`, `setHookPriority`, `prioritizeHookBefore`, `prioritizeHookAfter` |
| `robo.js` | `createCliCommandConfig`, `createTerminalCommandConfig` |
| `robo.js/hmr` | `hmr` |
| `robo.js/logger.js` | `logger` (for forking in plugins) |

### Type Exports (from `robo.js`)

| Types |
|-------|
| `Config`, `InitContext`, `PrepareContext`, `StartContext`, `StopContext`, `ErrorContext`, `SetupContext`, `HmrContext` |
| `BuildContext`, `BuildTransformContext`, `BuildCompleteContext` |
| `HandlerRecord`, `HandlerModule`, `PluginData`, `FlashcoreAdapter`, `LogDrain`, `StatusOptions`, `LifecycleHookType` |

# Lifecycle Hooks

Robo.js provides lifecycle events that allow projects and plugins to execute code at critical moments during the application's runtime. These hooks enable initialization, cleanup, and state management.

## Lifecycle Events Overview

| Event | Trigger | Use Case |
|-------|---------|----------|
| `_start` | Robo starts up | Initialize services, connect to databases |
| `_stop` | Robo shuts down | Cleanup resources, save state |
| `_restart` | Robo restarts (dev mode) | Preserve state, graceful handoff |

## Event Naming Convention

Lifecycle events are prefixed with `_` to distinguish them from Discord events:

```
/src/events/
├── _start.ts           # Lifecycle: startup
├── _stop.ts            # Lifecycle: shutdown
├── _restart.ts         # Lifecycle: restart
├── ready.ts            # Discord: client ready
└── messageCreate.ts    # Discord: message received
```

## Lifecycle Event Flow

### Startup Flow

```
Robo.start()
     ↓
Load Config + Manifest
     ↓
Initialize Flashcore (storage)
     ↓
Load persisted state
     ↓
Load plugin data (options)
     ↓
Create Discord client (unless disableBot)
     ↓
Portal.open() - Load all handlers
     ↓
━━━ executeEventHandler(plugins, '_start', client) ━━━
     ↓
Register Discord event listeners
     ↓
Discord login
```

### Shutdown Flow

```
Robo.stop(exitCode)
     ↓
━━━ executeEventHandler(plugins, '_stop', client) ━━━
     ↓
Destroy Discord client
     ↓
Flush logger
     ↓
process.exit(exitCode)
```

### Restart Flow (Development)

```
File change detected
     ↓
Save current state
     ↓
━━━ executeEventHandler(plugins, '_restart', client) ━━━
     ↓
Destroy Discord client
     ↓
Rebuild project
     ↓
Start new instance
     ↓
Restore state
```

## Implementation Details

### Triggering Lifecycle Events

From `src/core/robo.ts`:

```typescript
async function start(options?: StartOptions) {
  // ... initialization code ...
  
  // Load plugin options
  const plugins = loadPluginData()
  
  // Create the Discord client (unless disabled)
  if (config.experimental?.disableBot !== true) {
    client = optionsClient ?? new Client(config.clientOptions)
  }
  
  // Load the portal (commands, context, events)
  await Portal.open()
  
  // Notify lifecycle event handlers
  await executeEventHandler(plugins, '_start', client)
  
  // ... Discord setup and login ...
}

async function stop(exitCode = 0) {
  // Notify lifecycle handler
  await executeEventHandler(plugins, '_stop', client)
  client?.destroy()
  
  // ... cleanup and exit ...
}

async function restart() {
  // Notify lifecycle handler
  await executeEventHandler(plugins, '_restart', client)
  client?.destroy()
  
  // ... exit for respawn ...
}
```

### Event Handler Execution

From `src/core/handlers.ts`:

```typescript
export async function executeEventHandler(
  plugins: Map<string, PluginData> | null,
  eventName: string,
  ...eventData: unknown[]
) {
  const callbacks = portal.events.get(eventName)
  if (!callbacks?.length) {
    return Promise.resolve()
  }
  
  const config = getConfig()
  const isLifecycleEvent = eventName.startsWith('_')
  
  await Promise.all(
    callbacks.map(async (callback: HandlerRecord<Event>) => {
      try {
        // Check if module is enabled
        if (!portal.module(callback.module).isEnabled) {
          discordLogger.debug(`Tried to execute disabled event from module: ${callback.module}`)
          return
        }
        
        // Execute middleware
        for (const middleware of portal.middleware) {
          const result = await middleware.handler.default({
            payload: eventData,
            record: callback
          })
          
          if (result && result.abort) {
            discordLogger.debug(`Middleware aborted event: ${eventName}`)
            return
          }
        }
        
        // Execute handler with plugin options as last argument
        const handlerPromise = callback.handler.default(
          ...eventData,
          plugins?.get(callback.plugin?.name)?.options
        )
        
        // Lifecycle events have timeouts
        if (!isLifecycleEvent) {
          return await handlerPromise
        }
        
        // Enforce timeout for lifecycle events
        const timeoutPromise = timeout(
          () => TIMEOUT,
          config?.timeouts?.lifecycle || DEFAULT_CONFIG.timeouts.lifecycle
        )
        return await Promise.race([handlerPromise, timeoutPromise])
        
      } catch (error) {
        // Error handling with failSafe support
        const metaOptions = plugins?.get(callback.plugin?.name)?.metaOptions ?? {}
        
        if (error === TIMEOUT) {
          discordLogger.warn(`${eventName} lifecycle event handler timed out`)
        } else if (eventName === '_start' && metaOptions.failSafe) {
          // Plugin can opt into failSafe mode
          discordLogger.warn(`${callback.plugin.name} plugin failed to start`, error)
        } else {
          discordLogger.error(`${callback.plugin?.name} plugin error in event ${eventName}`, error)
        }
      }
    })
  )
}
```

## Handler Signature

### Lifecycle Handler Structure

```typescript
// /src/events/_start.ts
import type { Client } from 'discord.js'

export default async (client: Client, options?: PluginOptions) => {
  // client: Discord.js client instance (may be undefined if disableBot)
  // options: Plugin-specific options (for plugins)
  
  console.log('Starting up...')
  await initializeDatabase()
  await connectToExternalServices()
}

// /src/events/_stop.ts
export default async (client: Client, options?: PluginOptions) => {
  console.log('Shutting down...')
  await saveState()
  await closeConnections()
}

// /src/events/_restart.ts
export default async (client: Client, options?: PluginOptions) => {
  console.log('Restarting...')
  // State is automatically preserved via the State API
}
```

### Plugin Lifecycle Handler

Plugins receive their configured options:

```typescript
// @robojs/server/src/events/_start.ts
import type { Client } from 'discord.js'

interface PluginConfig {
  port?: number
  hostname?: string
  engine?: BaseEngine
}

export default async (client: Client, options: PluginConfig) => {
  const { port = 3000, hostname, engine } = options ?? {}
  
  // Initialize server with provided options
  await engine.start({ hostname, port })
}
```

## Timeout Handling

Lifecycle events have enforced timeouts to prevent hangs:

```typescript
// Default timeout configuration
const DEFAULT_CONFIG = {
  timeouts: {
    lifecycle: 5 * 1000  // 5 seconds
  }
}

// Can be configured in robo config
export default {
  timeouts: {
    lifecycle: 10000  // 10 seconds
  }
}
```

### Timeout Symbol

```typescript
// src/core/constants.ts
export const TIMEOUT = Symbol('TIMEOUT')

// Used in handler execution
const timeoutPromise = timeout(() => TIMEOUT, config?.timeouts?.lifecycle)
const result = await Promise.race([handlerPromise, timeoutPromise])

if (result === TIMEOUT) {
  throw new Error('Lifecycle event handler timed out')
}
```

## FailSafe Mode

Plugins can opt into failSafe mode where startup failures don't crash the entire Robo:

```typescript
// Plugin registration with failSafe
export default {
  plugins: [
    ['@robojs/analytics', { apiKey: '...' }, { failSafe: true }]
    //                                       ^^^^^^^^^^^^^^^^
    //                                       Meta options
  ]
}
```

### FailSafe Behavior

```typescript
if (eventName === '_start' && metaOptions.failSafe) {
  // Log warning instead of throwing
  discordLogger.warn(`${callback.plugin.name} plugin failed to start`, error)
} else {
  // Normal error handling
  discordLogger.error(`Error in event ${eventName}`, error)
}
```

## State Persistence

State is preserved across restarts in development mode.

### State API

```typescript
import { getState, setState, State } from 'robo.js'

// Simple key-value state
setState('counter', 42)
const counter = getState<number>('counter')

// Persisted state (survives restarts)
setState('importantData', data, { persist: true })

// Forked state (namespaced)
const myState = State.fork('my-plugin')
myState.setState('value', 123)
```

### State Flow During Restart

```typescript
// In src/cli/commands/dev.ts
async function rebuildRobo(spiritId, config, verbose, changes) {
  // 1. Get state dump before restarting
  const savedState = await spirits.exec(roboSpirit, { event: 'get-state' })
  
  // 2. Stop the current spirit
  spirits.send(roboSpirit, { event: 'restart', verbose })
  
  // 3. Rebuild
  await buildAsync(null, config, verbose, changes)
  
  // 4. Start new spirit
  const newSpiritId = await spirits.newTask({ event: 'start' })
  
  // 5. Restore state
  spirits.send(newSpiritId, { event: 'set-state', state: savedState })
}
```

### Persisted State with Flashcore

State marked as `persist: true` is saved to Flashcore (disk):

```typescript
// In src/core/state.ts
export function setState<T>(key: string, value: T, options?: SetStateOptions): T {
  const { persist } = options ?? {}
  
  // Apply to in-memory state
  state[key] = value
  
  // Persist to disk if requested
  if (persist) {
    const persistState = async () => {
      const persistedState = await Flashcore.get<Record<string, unknown>>(FLASHCORE_KEYS.state) ?? {}
      persistedState[key] = value
      Flashcore.set(FLASHCORE_KEYS.state, persistedState)
    }
    persistState()
  }
  
  return value
}
```

## Multiple Handlers

Multiple handlers can listen to the same lifecycle event:

```typescript
// Project handler
// /src/events/_start.ts
export default async (client) => {
  console.log('Project startup')
}

// Plugin A handler
// @plugin-a/src/events/_start.ts
export default async (client, options) => {
  console.log('Plugin A startup')
}

// Plugin B handler
// @plugin-b/src/events/_start.ts
export default async (client, options) => {
  console.log('Plugin B startup')
}
```

All handlers execute in parallel via `Promise.all()`:

```typescript
await Promise.all(
  callbacks.map(async (callback) => {
    await callback.handler.default(...eventData, pluginOptions)
  })
)
```

## Middleware Integration

Middleware can intercept lifecycle events:

```typescript
// /src/middleware/logger.ts
export default async (data: MiddlewareData) => {
  const { payload, record } = data
  
  if (record.type === 'event' && record.key.startsWith('_')) {
    console.log(`Lifecycle event: ${record.key}`)
  }
  
  // Allow event to proceed
  return { abort: false }
}
```

## Default Lifecycle Handlers

Robo.js provides a default `ready` event handler:

```typescript
// src/default/events/ready.ts
export default async (client: Client) => {
  discordLogger.ready(`On standby as ${client.user.tag}`)
  checkIntents(client)
  
  // Handle restart notification
  const restartData = getState<{ channelId: string; startTime: number }>(STATE_KEYS.restart)
  if (restartData) {
    const channel = client.channels.cache.get(restartData.channelId)
    channel?.send(`Successfully restarted in ${Date.now() - restartData.startTime}ms`)
    setState(STATE_KEYS.restart, undefined)
  }
}
```

## Key Observations for Decoupling

1. **Lifecycle events are generic** - The `_start`, `_stop`, `_restart` pattern doesn't require Discord.js

2. **Client is passed but optional** - Handlers receive `client` but it could be `undefined` with `disableBot: true`

3. **Plugin options flow is clean** - Options are passed as the last argument, enabling plugin customization

4. **Timeout handling is centralized** - All lifecycle events use the same timeout mechanism

5. **State preservation is built-in** - The state system handles restart scenarios automatically

6. **Parallel execution model** - All handlers for an event run in parallel, not sequentially

7. **Middleware applies to lifecycle** - The same middleware chain processes lifecycle events

8. **FailSafe is plugin-specific** - Individual plugins can opt into graceful failure handling

9. **No startup ordering** - Currently no way to specify handler execution order

10. **Discord-specific in default handlers** - The default `ready` handler contains Discord-specific logic


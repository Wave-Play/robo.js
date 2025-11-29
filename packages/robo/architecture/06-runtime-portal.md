# Runtime Portal System

The Portal is Robo.js's runtime registry that provides access to all loaded handlers. It bridges the manifest (static handler metadata) with runtime execution by dynamically importing handlers and organizing them into collections.

## Portal Architecture

### Class Definition

From `src/core/portal.ts`:

```typescript
import { Collection } from 'discord.js'

export default class Portal {
  private _enabledModules: Record<string, boolean> = {}
  private _modules: Record<string, Module> = {}
  
  constructor() {}
  
  // Handler collections (from Globals)
  get apis(): Collection<string, HandlerRecord<Api>> {
    return Globals.getPortalValues().apis
  }
  
  get commands(): Collection<string, HandlerRecord<Command>> {
    return Globals.getPortalValues().commands
  }
  
  get context(): Collection<string, HandlerRecord<Context>> {
    return Globals.getPortalValues().context
  }
  
  get events(): Collection<string, HandlerRecord<Event>[]> {
    return Globals.getPortalValues().events
  }
  
  get middleware(): HandlerRecord<Middleware>[] {
    return Globals.getPortalValues().middleware
  }
  
  get moduleKeys() {
    return Globals.getPortalValues().moduleKeys
  }
  
  // Module access
  module(moduleName: string) {
    let moduleInstance = this._modules[moduleName]
    if (!moduleInstance) {
      moduleInstance = new Module(moduleName, this._enabledModules)
      this._modules[moduleName] = moduleInstance
    }
    return moduleInstance
  }
  
  // Static open method to populate portal
  public static async open() {
    const apis = await loadHandlerRecords<HandlerRecord<Api>>('api')
    const commands = await loadHandlerRecords<HandlerRecord<Command>>('commands')
    const context = await loadHandlerRecords<HandlerRecord<Context>>('context')
    const events = await loadHandlerRecords<HandlerRecord<Event>[]>('events')
    const middleware = [...(await loadHandlerRecords<HandlerRecord<Middleware>>('middleware')).values()]
    
    Globals.registerPortal(apis, commands, context, events, middleware)
  }
}
```

### Portal Singleton

The portal is exported as a singleton from `src/core/robo.ts`:

```typescript
export const portal = new Portal()
```

Users and plugins access handlers via this singleton:

```typescript
import { portal } from 'robo.js'

portal.commands.get('ping')     // Get a specific command
portal.events.get('ready')      // Get event handlers
portal.apis.forEach((api) => {  // Iterate all APIs
  console.log(api.key)
})
```

## Globals Registry

The actual handler collections are stored in `globalThis.robo` via the Globals system:

### Globals Definition

From `src/core/globals.ts`:

```typescript
const instanceId = Math.random().toString(36).slice(2)

export const Globals = {
  getConfig: () => {
    if (!globalThis.robo) Globals.init()
    return globalThis.robo.config
  },
  
  getPortalValues: () => {
    if (!globalThis.robo) Globals.init()
    return {
      apis: globalThis.robo.portal.apis,
      commands: globalThis.robo.portal.commands,
      context: globalThis.robo.portal.context,
      events: globalThis.robo.portal.events,
      middleware: globalThis.robo.portal.middleware,
      moduleKeys: globalThis.robo.portal.moduleKeys
    }
  },
  
  init: () => {
    globalThis.robo = {
      config: null,
      flashcore: { _adapter: null },
      portal: {
        apis: null,
        commands: null,
        context: null,
        events: null,
        middleware: [],
        moduleKeys: new Set()
      }
    }
  },
  
  instanceId,
  
  registerConfig: (config: Config) => {
    if (!globalThis.robo) Globals.init()
    globalThis.robo.config = config
  },
  
  registerPortal: (apis, commands, context, events, middleware) => {
    if (!globalThis.robo) Globals.init()
    
    globalThis.robo.portal.apis = apis
    globalThis.robo.portal.commands = commands
    globalThis.robo.portal.context = context
    globalThis.robo.portal.events = events
    globalThis.robo.portal.middleware = middleware
    
    // Generate module keys from entries
    const moduleKeys = new Set<string>()
    apis.forEach((api) => api.module && moduleKeys.add(api.module))
    commands.forEach((cmd) => cmd.module && moduleKeys.add(cmd.module))
    context.forEach((ctx) => ctx.module && moduleKeys.add(ctx.module))
    events.forEach((handlers) => {
      handlers.forEach((h) => h.module && moduleKeys.add(h.module))
    })
    middleware.forEach((mw) => mw.module && moduleKeys.add(mw.module))
    
    globalThis.robo.portal.moduleKeys = new Set([...moduleKeys].sort())
  }
}
```

### Global Structure

```typescript
declare global {
  var robo: {
    config: Config | null
    flashcore: {
      _adapter: FlashcoreAdapter | Keyv | null
    }
    portal: {
      apis: Collection<string, HandlerRecord<Api>> | null
      commands: Collection<string, HandlerRecord<Command>> | null
      context: Collection<string, HandlerRecord<Context>> | null
      events: Collection<string, HandlerRecord<Event>[]> | null
      middleware: HandlerRecord<Middleware>[]
      moduleKeys: Set<string>
    }
  }
}
```

## Handler Loading

### The `loadHandlerRecords` Function

This function reads the manifest and dynamically imports handlers:

```typescript
async function loadHandlerRecords<T extends HandlerRecord | HandlerRecord[]>(
  type: 'api' | 'commands' | 'context' | 'events' | 'middleware'
) {
  const collection = new Collection<string, T>()
  const manifest = Compiler.getManifest()
  
  // Log handlers being loaded
  const handlers = Object.keys(manifest[type]).map(formatter)
  logger.debug(`Loading ${type}: ${handlers.join(', ')}`)
  
  const scanPredicate: ScanPredicate = async (entry: BaseConfig, entryKeys) => {
    // Skip entries without path (parent entries)
    if (!entry.__path) return
    
    // Compute import path
    const basePath = path.join(process.cwd(), entry.__plugin?.path ?? '.')
    const importPath = pathToFileURL(path.join(basePath, entry.__path)).toString()
    
    // Create handler record
    const handler: HandlerRecord = {
      auto: entry.__auto,
      description: entry.description,
      handler: await import(importPath),  // Dynamic import!
      key: entryKeys.join('/'),
      module: entry.__module,
      path: entry.__path,
      plugin: entry.__plugin,
      type: type === 'events' ? 'event' : type === 'commands' ? 'command' : type
    }
    
    // Add to collection based on type
    if (type === 'events') {
      const eventKey = entryKeys[0]
      if (!collection.has(eventKey)) {
        collection.set(eventKey, [] as T)
      }
      (collection.get(eventKey) as HandlerRecord[]).push(handler)
    } else if (type === 'commands') {
      const commandKey = entryKeys.join(' ')  // "admin ban"
      collection.set(commandKey, handler as T)
    } else if (type === 'context') {
      const contextKey = entryKeys[0]
      collection.set(contextKey, handler as T)
    } else if (type === 'middleware') {
      collection.set(entryKeys[0], handler as T)
    } else if (type === 'api') {
      collection.set(entryKeys.join('/'), handler as T)  // "users/[id]"
    }
  }
  
  // Scan context differently (message and user nested)
  if (type === 'context') {
    await scanEntries(scanPredicate, { manifestEntries: manifest.context.message, type })
    await scanEntries(scanPredicate, { manifestEntries: manifest.context.user, type })
  } else {
    await scanEntries(scanPredicate, { manifestEntries: manifest[type], type })
  }
  
  return collection
}
```

### Scanning Manifest Entries

```typescript
async function scanEntries<T>(predicate: ScanPredicate, options: ScanOptions<T>) {
  const { manifestEntries, parentEntry = {}, recursionKeys = [], type } = options
  const promises: Promise<unknown>[] = []
  
  for (const entryName in manifestEntries) {
    const entryItem = manifestEntries[entryName]
    const entries = Array.isArray(entryItem) ? entryItem : [entryItem]
    
    entries.forEach((entry) => {
      const entryKeys = [...recursionKeys, entryName]
      const mergedEntry = { ...parentEntry, ...entry }
      
      // Process this entry
      promises.push(predicate(mergedEntry, entryKeys))
      
      // Recurse into subcommands
      if (entry.subcommands) {
        promises.push(scanEntries(predicate, {
          manifestEntries: entry.subcommands,
          parentEntry: mergedEntry,
          recursionKeys: entryKeys,
          type
        }))
      }
      
      // Recurse into subroutes (API)
      if (entry.subroutes) {
        promises.push(scanEntries(predicate, {
          manifestEntries: entry.subroutes,
          parentEntry: mergedEntry,
          recursionKeys: entryKeys,
          type
        }))
      }
    })
  }
  
  return Promise.all(promises)
}
```

## Handler Record Structure

### Definition

```typescript
interface HandlerRecord<T = unknown> {
  auto?: boolean           // Auto-generated by Robo (default handlers)
  description?: string     // Handler description (from config)
  handler: T               // The actual module with default export
  key: string              // Lookup key (e.g., "admin ban", "users/[id]")
  module?: string          // Module name (from /modules)
  path: string             // File path relative to build
  plugin?: {               // Plugin info (for plugin handlers)
    name: string           // Plugin package name
    path: string           // Plugin package path
  }
  type: 'api' | 'command' | 'context' | 'event' | 'middleware'
}
```

### Handler Module Structure

The `handler` property contains the imported module:

```typescript
// For commands
handler: {
  default: (interaction, options) => { ... },
  config: CommandConfig,
  autocomplete?: (interaction) => { ... }
}

// For events
handler: {
  default: (...eventData, pluginOptions?) => { ... },
  config?: EventConfig
}

// For API
handler: {
  default: (req, res) => { ... }
}

// For middleware
handler: {
  default: (data: MiddlewareData) => MiddlewareResult
}
```

## Module System

### Module Class

```typescript
class Module {
  constructor(
    private _moduleName: string,
    private _enabledModules: Record<string, boolean>
  ) {}
  
  get isEnabled(): boolean {
    return this._enabledModules[this._moduleName] ?? true  // Default: enabled
  }
  
  setEnabled(value: boolean) {
    this._enabledModules[this._moduleName] = value
  }
}
```

### Module Usage

```typescript
// Access module state
const analyticsModule = portal.module('analytics')
console.log(analyticsModule.isEnabled)

// Disable a module at runtime
portal.module('analytics').setEnabled(false)

// Module check in handler execution
if (!portal.module(command.module).isEnabled) {
  return  // Skip disabled module handlers
}
```

### Module Keys

All unique module names are tracked:

```typescript
portal.moduleKeys  // Set<string> of module names
```

## Collection Type (Discord.js)

The Portal uses Discord.js Collection for handler storage:

```typescript
import { Collection } from 'discord.js'

// Collection is an extended Map with additional methods
const commands = new Collection<string, HandlerRecord<Command>>()

// Standard Map operations
commands.get('ping')
commands.set('ping', handler)
commands.has('ping')
commands.delete('ping')

// Discord.js Collection additions
commands.find((cmd) => cmd.description.includes('admin'))
commands.filter((cmd) => cmd.plugin !== undefined)
commands.map((cmd) => cmd.key)
commands.first()
commands.last()
commands.random()
```

## Plugin Options Access

The `getPluginOptions` function provides runtime access to plugin configuration:

```typescript
export function getPluginOptions(packageName: string): unknown | null {
  const config = getConfig()
  const pluginOptions = config?.plugins?.find((plugin) => {
    return (typeof plugin === 'string' ? plugin : plugin[0]) === packageName
  })
  const options = typeof pluginOptions === 'string' ? null : pluginOptions?.[1]
  
  return options ?? null
}
```

Usage:

```typescript
import { getPluginOptions } from 'robo.js'

// In plugin code
const options = getPluginOptions('@robojs/analytics')
if (options?.trackCommands) {
  // Enable command tracking
}
```

## Handler Lookup Patterns

### Commands

```typescript
// Slash command lookup
// File: /src/commands/ping.ts → Key: "ping"
portal.commands.get('ping')

// Subcommand lookup
// File: /src/commands/admin/ban.ts → Key: "admin ban"
portal.commands.get('admin ban')

// Subcommand group lookup
// File: /src/commands/settings/notifications/enable.ts → Key: "settings notifications enable"
portal.commands.get('settings notifications enable')
```

### Events

```typescript
// Event handlers (array)
const readyHandlers = portal.events.get('ready')
// Returns: HandlerRecord<Event>[]

// Lifecycle events
const startHandlers = portal.events.get('_start')
```

### API Routes

```typescript
// Simple route
// File: /src/api/health.ts → Key: "health"
portal.apis.get('health')

// Nested route
// File: /src/api/users/[id].ts → Key: "users/[id]"
portal.apis.get('users/[id]')
```

### Context Menus

```typescript
// Context menu lookup by name
portal.context.get('Report Message')
portal.context.get('View Profile')
```

## Initialization Flow

```
Robo.start()
     ↓
loadConfig()                    → globalThis.robo.config
     ↓
Compiler.useManifest()          → Cached manifest loaded
     ↓
Portal.open()
     ↓
├── loadHandlerRecords('api')
├── loadHandlerRecords('commands')
├── loadHandlerRecords('context')
├── loadHandlerRecords('events')
└── loadHandlerRecords('middleware')
     ↓
Globals.registerPortal(...)     → globalThis.robo.portal populated
     ↓
portal.* now accessible
```

## Key Observations for Decoupling

1. **Collection dependency on Discord.js** - Uses Discord.js Collection class, could be replaced with standard Map + helpers

2. **Handler types are fixed** - Only five types: api, commands, context, events, middleware

3. **Dynamic imports at startup** - Handlers are imported when Portal opens, enabling hot reload

4. **Module system is generic** - Enable/disable logic applies to any handler type

5. **Plugin handlers merge seamlessly** - No distinction at runtime between project and plugin handlers

6. **Keys differ by type** - Commands use space-separated, APIs use slash-separated paths

7. **Events are arrays** - Multiple handlers per event name, executed in parallel

8. **Context is nested** - Separate collections for message and user context menus

9. **Globals enable cross-module access** - Any code can access portal via globalThis

10. **Plugin options flow through config** - getPluginOptions reads from loaded config


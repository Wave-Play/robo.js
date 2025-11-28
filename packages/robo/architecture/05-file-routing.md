# File-Based Routing System

Robo.js uses a file-based routing convention where the location and name of files in the `/src` directory automatically determine their runtime behavior. This "convention over configuration" approach enables zero-config handler registration.

## Directory Conventions

### Standard Directories

| Directory | Purpose | Handler Type | Manifest Key |
|-----------|---------|--------------|--------------|
| `/src/commands/` | Discord slash commands | Command | `commands` |
| `/src/events/` | Event handlers (Discord + lifecycle) | Event | `events` |
| `/src/api/` | HTTP API routes | Api | `api` |
| `/src/context/` | Discord context menu commands | Context | `context` |
| `/src/middleware/` | Request/event middleware | Middleware | `middleware` |
| `/src/modules/` | Grouped handlers | All types | (nested) |

### File Naming Conventions

```
/src/
├── commands/
│   ├── ping.ts                    → /ping
│   ├── admin/
│   │   ├── ban.ts                 → /admin ban
│   │   └── kick.ts                → /admin kick
│   └── settings/
│       └── notifications/
│           └── enable.ts          → /settings notifications enable
├── events/
│   ├── ready.ts                   → ready event
│   ├── messageCreate.ts           → messageCreate event
│   ├── _start.ts                  → lifecycle: start
│   └── messageCreate/
│       ├── logger.ts              → messageCreate (multiple handlers)
│       └── filter.ts              → messageCreate (multiple handlers)
├── api/
│   ├── health.ts                  → /api/health
│   ├── users/
│   │   ├── index.ts               → /api/users
│   │   └── [id].ts                → /api/users/:id
│   └── posts/
│       └── [id]/
│           └── comments.ts        → /api/posts/:id/comments
├── context/
│   ├── message/
│   │   └── Report Message.ts      → Message context menu
│   └── user/
│       └── View Profile.ts        → User context menu
└── middleware/
    ├── auth.ts                    → Applied to all handlers
    └── logging.ts                 → Applied to all handlers
```

## Slash Commands (`/src/commands/`)

### Basic Command

```typescript
// /src/commands/ping.ts
// Results in: /ping

export default () => {
  return 'Pong!'
}
```

### Command with Config

```typescript
// /src/commands/greet.ts
import type { CommandConfig } from 'robo.js'

export const config: CommandConfig = {
  description: 'Greet someone',
  options: [
    {
      name: 'user',
      type: 'user',
      description: 'User to greet',
      required: true
    }
  ]
}

export default (interaction, options: { user: User }) => {
  return `Hello, ${options.user.username}!`
}
```

### Subcommands via Folders

```
/src/commands/
└── admin/
    ├── ban.ts        → /admin ban
    ├── kick.ts       → /admin kick
    └── mute.ts       → /admin mute
```

Discord does not allow calling parent commands directly when subcommands exist.

### Subcommand Groups (3 levels)

```
/src/commands/
└── settings/
    └── notifications/
        ├── enable.ts    → /settings notifications enable
        └── disable.ts   → /settings notifications disable
```

### Handler Execution Flow

```typescript
// In handlers.ts
export async function executeCommandHandler(
  interaction: ChatInputCommandInteraction,
  commandKey: string
) {
  // 1. Find command in portal
  const command = portal.commands.get(commandKey)
  
  // 2. Check module enabled
  if (!portal.module(command.module).isEnabled) return
  
  // 3. Execute middleware chain
  for (const middleware of portal.middleware) {
    const result = await middleware.handler.default({ payload: [interaction], record: command })
    if (result?.abort) return
  }
  
  // 4. Execute command handler
  const options = extractCommandOptions(interaction, commandConfig?.options)
  const result = command.handler.default(interaction, options)
  
  // 5. Sage handles async response
  if (sage.defer && result instanceof Promise) {
    // Auto-defer if taking too long
    const raceResult = await Promise.race([result, timeout(sage.deferBuffer)])
    if (raceResult === BUFFER && !interaction.replied) {
      await interaction.deferReply()
    }
  }
  
  // 6. Send reply
  if (response !== undefined) {
    const reply = typeof response === 'string' ? { content: response } : response
    await interaction.reply(reply)
  }
}
```

## Events (`/src/events/`)

### Basic Event Handler

```typescript
// /src/events/messageCreate.ts
import type { Message } from 'discord.js'

export default (message: Message) => {
  console.log(`Message received: ${message.content}`)
}
```

### Multiple Handlers Per Event

Create a folder with the event name:

```
/src/events/
└── messageCreate/
    ├── logger.ts      → Logs all messages
    ├── filter.ts      → Filters spam
    └── respond.ts     → Auto-responds
```

All handlers execute in parallel via `Promise.all()`.

### Event Config

```typescript
// /src/events/guildMemberAdd.ts
import type { EventConfig } from 'robo.js'

export const config: EventConfig = {
  frequency: 'once'  // Only fire once, then remove
}

export default (member) => {
  // Welcome first member
}
```

### Lifecycle Events

Prefixed with `_`:

```typescript
// /src/events/_start.ts
export default async (client) => {
  await connectToDatabase()
}

// /src/events/_stop.ts
export default async (client) => {
  await closeConnections()
}
```

## API Routes (`/src/api/`)

### Basic Route

```typescript
// /src/api/health.ts
// Results in: GET /api/health

export default (req, res) => {
  return { status: 'ok' }
}
```

### Nested Routes

```
/src/api/
├── users/
│   ├── index.ts        → /api/users
│   └── [id].ts         → /api/users/:id
└── posts/
    └── [id]/
        └── comments.ts → /api/posts/:id/comments
```

### Dynamic Parameters

Square brackets denote dynamic segments:

```typescript
// /src/api/users/[id].ts
export default (req, res) => {
  const { id } = req.params  // From URL
  return { userId: id }
}
```

### Request/Response Types

```typescript
import type { RoboRequest, RoboReply } from '@robojs/server'

export default (req: RoboRequest, res: RoboReply) => {
  const { query, params, body, method } = req
  
  res.code(200)
  res.header('Content-Type', 'application/json')
  return { data: 'value' }
}
```

## Context Menus (`/src/context/`)

### Message Context Menu

```typescript
// /src/context/message/Report Message.ts
import type { ContextConfig } from 'robo.js'

export const config: ContextConfig = {
  description: 'Report this message'
}

export default (interaction, message) => {
  // message is the targeted message
  return `Reported message from ${message.author.username}`
}
```

### User Context Menu

```typescript
// /src/context/user/View Profile.ts
export default (interaction, user) => {
  // user is the targeted user
  return `Viewing profile of ${user.username}`
}
```

### Structure

```
/src/context/
├── message/           # Message context menus
│   └── Report.ts
└── user/              # User context menus
    └── Profile.ts
```

## Middleware (`/src/middleware/`)

### Middleware Structure

```typescript
// /src/middleware/logger.ts
import type { MiddlewareData, MiddlewareResult } from 'robo.js'

export default (data: MiddlewareData): MiddlewareResult => {
  const { payload, record } = data
  
  console.log(`Handler called: ${record.type} - ${record.key}`)
  
  // Continue to handler
  return { abort: false }
  
  // Or abort
  // return { abort: true }
}
```

### Middleware Data

```typescript
interface MiddlewareData {
  payload: unknown[]    // Event/command arguments
  record: HandlerRecord // Handler metadata
}

interface HandlerRecord {
  type: 'api' | 'command' | 'context' | 'event' | 'middleware'
  key: string
  path: string
  plugin?: { name: string; path: string }
  module?: string
}
```

### Execution Order

Middleware executes in file order before every handler.

## Modules (`/src/modules/`)

### Module Structure

Modules group related handlers and can be enabled/disabled at runtime:

```
/src/modules/
└── analytics/
    ├── commands/
    │   └── stats.ts
    ├── events/
    │   └── messageCreate.ts
    └── api/
        └── metrics.ts
```

### Module in Manifest

```json
{
  "commands": {
    "stats": {
      "__path": "/.robo/build/modules/analytics/commands/stats.js",
      "__module": "analytics"
    }
  }
}
```

### Mode-Specific Modules

```
/src/modules/
├── analytics/           # Always active
├── analytics.development/  # Only in development
└── analytics.production/   # Only in production
```

## Build-Time Scanning

### The `scanDir` Function

From `src/cli/utils/manifest.ts`:

```typescript
async function scanDir(predicate: ScanDirPredicate, options: ScanDirOptions) {
  const { recursionKeys = [], recursionModuleKeys = [], type } = options
  
  // Build directory path
  let directoryPath = path.join(process.cwd(), '.robo', 'build', type)
  
  // Read directory
  const directory = await fs.readdir(directoryPath)
  
  // Separate files and directories
  const files: string[] = []
  const directories: string[] = []
  
  await Promise.all(directory.map(async (file) => {
    const fullPath = path.resolve(directoryPath, file)
    const stats = await fs.stat(fullPath)
    
    // Only include allowed extensions
    if (stats.isFile() && ALLOWED_EXTENSIONS.includes(path.extname(file))) {
      files.push(file)
    } else if (stats.isDirectory()) {
      directories.push(file)
    }
  }))
  
  // Process files first (parent entries before children)
  await Promise.all(files.map(async (file) => {
    const fileKeys = [...recursionKeys, path.basename(file, path.extname(file))]
    await predicate(fileKeys, path.resolve(directoryPath, file), recursionModuleKeys)
  }))
  
  // Then recurse into directories
  await Promise.all(directories.map(async (childDir) => {
    return scanDir(predicate, {
      recursionKeys: [...recursionKeys, childDir],
      recursionPath: path.resolve(directoryPath, childDir),
      type
    })
  }))
  
  // Also scan /modules directory
  await scanModulesDirectory()
}
```

### Allowed Extensions

```typescript
// In Bun runtime
const ALLOWED_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx']

// In Node.js runtime (after compilation)
const ALLOWED_EXTENSIONS = ['.js', '.jsx']
```

## Default Handlers Generation

### Default Commands

Robo.js provides built-in commands that are automatically generated:

```typescript
// In src/cli/utils/generate-defaults.ts
async function generateCommands(distDir, config) {
  const defaultCommandsDir = path.join(__DIRNAME, '..', '..', 'default', 'commands')
  
  await recursiveDirScan(defaultCommandsDir, async (file, fullPath) => {
    const commandKey = path.relative(defaultCommandsDir, fullPath).replace(ext, '')
    
    // Skip dev commands if not in debug mode
    if (devCommands.includes(commandKey) && !DEBUG_MODE) {
      return
    }
    
    // Skip if user has their own implementation
    const fileExists = await checkFileExistence(srcPathBase)
    if (!fileExists) {
      await fs.copyFile(fullPath, distPath)
      generated[commandKey] = true
    }
  })
}
```

### Default Events

```typescript
async function generateEvents(distDir) {
  // Use special prefix to prevent collisions
  const distFile = '__robo_' + file
  
  // Always copy (don't check for existence)
  await fs.copyFile(fullPath, distPath)
}
```

## Handler Record Structure

At runtime, handlers are wrapped in `HandlerRecord`:

```typescript
interface HandlerRecord<T = unknown> {
  auto?: boolean           // Auto-generated by Robo
  description?: string     // Handler description
  handler: T               // The imported module
  key: string              // Unique identifier
  module?: string          // Module name
  path: string             // File path
  plugin?: {               // Plugin info
    name: string
    path: string
  }
  type: 'api' | 'command' | 'context' | 'event' | 'middleware'
}
```

## Key Observations for Decoupling

1. **Directory names are hardcoded** - The five directories (commands, events, api, context, middleware) are fixed in the core

2. **Handler types are tightly coupled** - Each directory type has specific manifest structure and execution logic

3. **Modules provide namespacing** - The module system adds a layer of organization without changing handler types

4. **Plugins inherit same structure** - Plugins use the same directory conventions

5. **No plugin-defined directories** - Currently, plugins cannot define their own handler directories

6. **Context is Discord-specific** - The `/context` directory only makes sense for Discord

7. **API routes are platform-agnostic** - Could apply to any HTTP server

8. **Event naming follows Discord** - Event names like `messageCreate`, `guildMemberAdd` are Discord events

9. **Scanning is parallel** - File operations use `Promise.all()` for performance

10. **Dynamic imports at runtime** - Handlers are imported when portal opens, not at build time


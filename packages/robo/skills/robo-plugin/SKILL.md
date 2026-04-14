---
name: robo-plugin
description: "Reference guide for creating, developing, and publishing Robo.js plugins — project structure, lifecycle hooks, route definitions, seed files, terminal commands, and npm publishing."
user-invocable: true
argument-hint: "<question, or 'create <type> [name]'>"
---

# Robo.js Plugin Development Guide

Complete reference for AI agents creating and developing Robo.js plugins. Plugins are npm packages that extend Robo with route definitions, lifecycle hooks, seed files, terminal commands, and CLI extensions. They are built with `robo build plugin` and installed via `npx robo add`.

## Usage

```
/robo-plugin                                # Inject this guide as context
/robo-plugin create my-plugin               # Generate full plugin skeleton
/robo-plugin create route commands          # Generate a route definition
/robo-plugin create hook start              # Generate a lifecycle hook
/robo-plugin create seed command ping       # Generate a seed command
/robo-plugin create terminal status         # Generate a terminal command
/robo-plugin create cli deploy              # Generate a CLI command
/robo-plugin <question>                     # Answer a question
```

### Create Mode

When `$ARGUMENTS` starts with `create`, generate files based on the subcommand:

- **`create <name>`** — Full plugin skeleton: `package.json`, `config/robo.ts`, `src/index.ts`, `src/core/logger.ts`, `src/robo/start.ts`, `tsconfig.json`. Use the name for namespace and logger fork.
- **`create route <name>`** — Route definition file at `src/robo/routes/<name>.ts` with `RouteConfig` export and processor function.
- **`create hook <type>`** — Lifecycle hook at `src/robo/<type>.ts` with the correct context type (`StartContext`, `StopContext`, `PrepareContext`, `HmrContext`, `SetupContext`, `ErrorContext`, `BuildContext`, `BuildTransformContext`, `BuildCompleteContext`). Note: build hooks must specify the phase — use `create hook build/start`, `create hook build/transform`, or `create hook build/complete` to generate files under `src/robo/build/`. The bare `create hook build` is ambiguous and should generate all three build phase hooks.
- **`create seed command <name>`** — Seed command at `seed/commands/<name>.ts` with default export handler.
- **`create terminal <name>`** — Terminal command at `src/robo/terminal/commands/<name>.ts` with `createTerminalCommandConfig` and typed `TerminalContext`.
- **`create cli <name>`** — CLI command at `src/robo/cli/commands/<name>.ts` with `createCliCommandConfig` and typed `CliContext`.

Follow the patterns in this guide exactly. All imports use npm packages (`robo.js`, `robo.js/hmr`, `robo.js/logger.js`), never monorepo paths. File paths are relative to the plugin project root.

### Context / Question Mode

For all other invocations, use this guide as authoritative reference. If the user asks a question, answer it from these patterns.

---

## 1. Mental Model

Plugins are npm packages built with `robo build plugin`. They teach Robo how to handle new file patterns via **route definitions**. A plugin can provide any combination of:

- **Route definitions** — scan directories and process files into manifest entries
- **Lifecycle hooks** — run code at init, prepare, start, stop, hmr, and build phases
- **Seed files** — starter templates copied to the user's project on install
- **Terminal commands** — interactive commands in the Robo dev terminal
- **CLI extensions** — extend or add `npx robo` subcommands

```
my-plugin/
├── config/
│   └── robo.ts            # Plugin config (type: 'plugin')
├── seed/                  # Template files for user projects
│   ├── commands/          # Seed commands → user's src/commands/
│   └── _root/             # Root seeds → user's project root
├── src/
│   ├── core/
│   │   └── logger.ts      # Shared logger instance (ONE fork)
│   ├── robo/
│   │   ├── routes/        # Route definitions
│   │   ├── terminal/      # Terminal commands
│   │   │   └── commands/
│   │   ├── cli/           # CLI extensions
│   │   │   ├── commands/  # New CLI commands
│   │   │   └── extensions/# Extend existing commands
│   │   ├── build/         # Build hooks (start, transform, complete)
│   │   ├── init.ts        # Init hook
│   │   ├── prepare.ts     # Prepare hook
│   │   ├── start.ts       # Start hook
│   │   ├── stop.ts        # Stop hook
│   │   └── hmr.ts         # HMR hook
│   └── index.ts           # Public API exports
├── package.json
└── tsconfig.json
```

The route filename determines which directory is scanned:
```
src/robo/routes/commands.ts  → scans src/commands/
src/robo/routes/events.ts    → scans src/events/
src/robo/routes/api.ts       → scans src/api/
src/robo/routes/greetings.ts → scans src/greetings/
```

---

## 2. Package Structure

### package.json

```json
{
  "name": "@scope/my-plugin",
  "version": "0.1.0",
  "description": "Description of my plugin",
  "type": "module",
  "main": ".robo/build/index.js",
  "files": [".robo/", "src/", "seed/", "LICENSE", "README.md"],
  "keywords": ["robo", "robo.js", "plugin"],
  "scripts": {
    "build": "robo build plugin",
    "dev": "robo build plugin --watch",
    "prepublishOnly": "robo build plugin"
  },
  "peerDependencies": {
    "robo.js": "^0.11.0"
  },
  "devDependencies": {
    "robo.js": "^0.11.0",
    "typescript": "^5.5.0",
    "@swc/core": "^1.6.0",
    "@types/node": "^20.0.0"
  }
}
```

| Field | Required | Purpose |
|-------|----------|---------|
| `main` | Yes | Must point to `.robo/build/index.js` |
| `files` | Yes | Must include `.robo/` for compiled output |
| `type` | Yes | Must be `"module"` (ESM) |
| `peerDependencies.robo.js` | Yes | Declares compatibility range. The `^0.11.0` range assumes the v0.11 release; adjust if targeting a different version. |
| `prepublishOnly` | Recommended | Ensures build before publish |

### config/robo.ts

```typescript
import type { Config } from 'robo.js'

export default {
  type: 'plugin',
  namespace: 'my-plugin'
} satisfies Config
```

- **`type: 'plugin'`** — Required. Tells the build system this is a plugin.
- **`namespace`** — Required. Determines how the plugin's routes appear in the portal (e.g., `portal['my-plugin'].commands`). Use kebab-case.

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": ".robo/build",
    "rootDir": "src",
    "declaration": true,
    "declarationDir": ".robo/build"
  },
  "include": ["src"]
}
```

---

## 3. Lifecycle Hooks

All hooks are placed under `src/robo/` and export a default function. They receive a typed context object.

| Hook | File | Context | When |
|------|------|---------|------|
| `init` | `src/robo/init.ts` | `InitContext` | Before manifest load. No portal. |
| `prepare` | `src/robo/prepare.ts` | `PrepareContext<TConfig>` | After portal populated, before start. |
| `start` | `src/robo/start.ts` | `StartContext<TConfig>` | Main startup. Sequential: plugins then project. |
| `stop` | `src/robo/stop.ts` | `StopContext<TConfig>` | Shutdown. Has `reason` field. |
| `hmr` | `src/robo/hmr.ts` | `HmrContext` | File changes in dev mode. Runs in parallel with 5s timeout. |
| `setup` | `src/robo/setup.ts` | `SetupContext` | Runs during `create-robo` or `robo add`. Has `trigger`, `paths`, `exec`, `prompt`. |
| `error` | `src/robo/error.ts` | `ErrorContext` | Fires on unhandled errors. Has `error: unknown`, `type: 'unhandledRejection' \| 'uncaughtException'`. |
| `build/start` | `src/robo/build/start.ts` | `BuildContext` | Build begins. `entries` is undefined. |
| `build/transform` | `src/robo/build/transform.ts` | `BuildTransformContext` | After scanning, before output. Can filter/transform entries. |
| `build/complete` | `src/robo/build/complete.ts` | `BuildCompleteContext` | Build finished. Can register metadata aggregators. |

### Execution Order

- **Start phase**: Plugins run sequentially in registration order, then the project's hook.
- **Stop phase**: Project's hook runs first, then plugins in REVERSE registration order.
- **HMR**: All hooks run in parallel with a 5-second timeout.
- **Build**: Sequential in registration order.

### Hook Examples

```typescript
// src/robo/start.ts — typed pluginConfig via generic
import type { StartContext } from 'robo.js'
interface MyPluginOptions { apiKey: string; verbose?: boolean }
export default async (context: StartContext<MyPluginOptions>) => {
  const { apiKey } = context.pluginConfig
  context.state.set('initialized', true)
}

// src/robo/stop.ts — reason: 'signal' | 'error' | 'restart'
import type { StopContext } from 'robo.js'
export default async (context: StopContext) => { myLogger.info('Stopping:', context.reason) }

// src/robo/prepare.ts — portal populated, good for initializing resources
import type { PrepareContext } from 'robo.js'
export default async (context: PrepareContext) => { myLogger.info('Mode:', context.mode) }

// src/robo/init.ts — earliest hook, no portal, use for log drains
import type { InitContext } from 'robo.js'
export default async (context: InitContext) => { context.logger.info('Initializing') }
```

```typescript
// src/robo/hmr.ts — optional config filters which events trigger the hook
import type { HmrContext, HmrHookConfig } from 'robo.js'
export const config: HmrHookConfig = { namespaces: ['my-plugin'], routes: ['commands'] }
export default async (context: HmrContext) => {
  myLogger.info(`HMR: ${context.changeType} - ${context.files.join(', ')}`)
  for (const route of context.routes) {
    myLogger.debug(`Route ${route.namespace}:${route.route} - ${route.handlers.length} handlers`)
  }
}
```

```typescript
// src/robo/build/complete.ts
import type { BuildCompleteContext } from 'robo.js'
export default async (context: BuildCompleteContext) => {
  const entries = context.entries.get('my-plugin', 'commands')
  context.registerMetadataAggregator('my-plugin', (entries, pluginDefaults) => ({
    namespace: 'my-plugin', commandCount: entries.length
  }))
}
```

### Context Fields Reference

**All hooks**: `mode`, `logger` (Logger), `env` (Env)
**init, prepare, start, stop**: `projectConfig` (Config)
**prepare, start, stop**: `pluginConfig` (TConfig), `state` (PluginState), `meta` ({ name, version })
**start, stop**: `portal` (unknown, reserved)
**stop only**: `reason` (`'signal'` | `'error'` | `'restart'`)
**hmr only**: `changeType` (`'change'` | `'add'` | `'remove'`), `files` (string[]), `routes` (HmrRouteInfo[])
**build/***: `store` (BuildStore), `paths` ({ root, src, output })
**build/transform, build/complete**: `entries` (EntriesAccessor)

---

## 4. Route Definitions

The core of plugin development. Route definitions tell Robo how to scan directories and process files into manifest entries.

**File location**: `src/robo/routes/<name>.ts`
**Scanned directory**: The route filename determines the directory (e.g., `commands.ts` scans `src/commands/`).

### RouteConfig Reference

```typescript
import type { RouteConfig, ScannedEntry, ProcessedEntry } from 'robo.js'

export const config: RouteConfig = {
  // Key generation
  key: {
    style: 'filepath',           // 'filename' | 'filepath' | 'parentOrFilename'
    separator: '/',              // Key segment separator (default: '/')
    nested: 'camelCase',         // 'camelCase' | 'dotNotation' (optional)
    transform: (key, segments) => key  // Custom key transform (optional)
  },

  // Nesting rules
  nesting: {
    maxDepth: 10,                // Max directory depth
    allowIndex: true,            // Allow index.ts files (default: true)
    dynamicSegment: /^\[([^\]]+)\]$/,        // [param] pattern
    catchAllSegment: /^\[\.\.\.([^\]]+)\]$/,  // [...param] pattern
    optionalCatchAll: /^\[\[\.\.\.([^\]]+)\]\]$/ // [[...param]] pattern
  },

  // Export requirements
  exports: {
    default: 'required',         // 'required' | 'optional' | 'forbidden'
    config: 'optional',          // 'required' | 'optional' | 'forbidden'
    named: ['GET', 'POST']       // Additional named exports to capture
  },

  multiple: false,               // Allow multiple handlers per key (events = true)
  singular: 'command',           // Singular accessor name (plural inferred from route name)
  filter: /^(?!_)/,              // File filter regex (skip _ prefixed files)
  description: 'My custom routes'
}
```

### Key Style Reference

| Style | Input Path | Output Key |
|-------|-----------|------------|
| `'filename'` | `admin/ban.ts` | `ban` |
| `'filepath'` (sep: `/`) | `admin/ban.ts` | `admin/ban` |
| `'filepath'` (sep: ` `) | `admin/ban.ts` | `admin ban` |
| `'parentOrFilename'` | `ready.ts` | `ready` |
| `'parentOrFilename'` | `messageCreate/chat.ts` | `messageCreate` |

### Nested Key Modes

| Mode | Input Segments | Output Key |
|------|---------------|------------|
| `'camelCase'` | `['guild', 'memberAdd']` | `guildMemberAdd` |
| `'dotNotation'` | `['guild', 'memberAdd']` | `guild.memberAdd` |
| (default separator) | `['guild', 'memberAdd']` | `guild/memberAdd` |

### Processor Function

The default export transforms `ScannedEntry` into `ProcessedEntry`:

```typescript
export default function (entry: ScannedEntry): ProcessedEntry {
  const configExport = entry.exports.config as Record<string, unknown> | undefined
  return {
    key: entry.key,
    path: entry.filePath,
    exports: { default: !!entry.exports.default, config: !!configExport, named: [] },
    metadata: { description: configExport?.description },
    // extra: { ... }     // Optional route-specific data
    // module: 'modName'  // Set if from /src/modules/
    // auto: false        // Whether auto-generated
  }
}
```

**ScannedEntry fields**: `key` (string), `type` (e.g. `'myplugin:commands'`), `filePath` (relative to /src), `relativePath` (within scanned dir), `exports` (Record<string, unknown>), `dynamicSegments?` (extracted [param] info).

**ProcessedEntry fields**: `key`, `path`, `exports` ({ default, config, named }), `metadata` (Record), `extra?` (Record), `module?` (string), `auto?` (boolean).

### Example Configs (config export only — processor pattern is the same)

```typescript
// Commands: src/robo/routes/commands.ts
export const config: RouteConfig = {
  key: { style: 'filepath', separator: ' ' },
  nesting: { maxDepth: 3, allowIndex: false },
  exports: { named: ['autocomplete'], default: 'required', config: 'optional' },
  singular: 'command',
  description: 'Slash commands'
}

// API: src/robo/routes/api.ts
export const config: RouteConfig = {
  key: { style: 'filepath', separator: '/' },
  nesting: { maxDepth: 10, allowIndex: true,
    dynamicSegment: /^\[([^\]]+)\]$/, catchAllSegment: /^\[\.\.\.([^\]]+)\]$/,
    optionalCatchAll: /^\[\[\.\.\.([^\]]+)\]\]$/ },
  exports: { named: ['GET','POST','PUT','DELETE','PATCH','OPTIONS','HEAD'], default: 'optional', config: 'optional' },
  description: 'HTTP API endpoints'
}

// Events: src/robo/routes/events.ts (multiple handlers per key)
export const config: RouteConfig = {
  key: { style: 'parentOrFilename', nested: 'camelCase' },
  nesting: { maxDepth: 2, allowIndex: false },
  exports: { default: 'required', config: 'optional' },
  multiple: true,
  description: 'Event listeners'
}
```

---

## 5. Plugin Configuration

Users configure your plugin by creating a file at `config/plugins/{scope}/{name}.ts` (or `config/plugins/{name}.ts` for unscoped packages).

### User's Config File

```typescript
// User's config/plugins/myscope/my-plugin.ts
export default {
  apiKey: 'abc123',
  verbose: true,
  channels: ['general', 'bot-spam']
}
```

### Runtime Access

**In lifecycle hooks** — via `context.pluginConfig` (typed with generic):
```typescript
import type { StartContext } from 'robo.js'

interface MyOptions { apiKey: string; verbose?: boolean }

export default async (context: StartContext<MyOptions>) => {
  const { apiKey, verbose } = context.pluginConfig
}
```

**Anywhere** — via `getPluginOptions()`:
```typescript
import { getPluginOptions } from 'robo.js'

const options = getPluginOptions('my-plugin') as MyOptions
```

### Plugin State (Scoped Storage)

Each plugin gets isolated state storage. Available via `context.state` in hooks or via `createPluginState(pluginName)`:

```typescript
import { createPluginState } from 'robo.js'

const state = createPluginState('my-plugin')
state.set('key', value)
state.get<MyType>('key')
state.has('key')
state.delete('key')
state.clear()
```

### Meta Options (User-Side)

Users can pass meta options when registering a plugin in their config:

```typescript
// User's config/robo.ts
export default {
  plugins: [
    ['@scope/my-plugin', { apiKey: 'abc' }, {
      failSafe: true,                // Don't crash on plugin errors
      hookPriority: { start: 50 }    // Run start hook early (lower = earlier)
    }]
  ]
}
```

### Hook Priority Helpers

```typescript
import { setHookPriority, prioritizeHookBefore, prioritizeHookAfter, DEFAULT_HOOK_PRIORITY } from 'robo.js'

// Set absolute priority (lower runs first, default is 100)
setHookPriority('start', 50)

// Run before a specific plugin
prioritizeHookBefore('start', '@robojs/server')

// Run after a specific plugin
prioritizeHookAfter('start', '@robojs/discordjs')
```

---

## 6. Seed Files

The `seed/` directory contains template files that get copied to the user's project when they run `npx robo add your-plugin`.

### Directory Mapping

| Seed Path | User's Project Path |
|-----------|-------------------|
| `seed/commands/hello.ts` | `src/commands/hello.ts` |
| `seed/events/ready.ts` | `src/events/ready.ts` |
| `seed/api/health.ts` | `src/api/health.ts` |
| `seed/_root/.env.example` | `.env.example` |
| `seed/_root/config/custom.ts` | `config/custom.ts` |

- `seed/` maps to the user's `src/` directory.
- `seed/_root/` maps to the user's project root.
- Existing files are NOT overwritten.

### Seed Configuration

Declare environment variables and descriptions in `config/robo.ts`:

```typescript
import type { Config } from 'robo.js'

export default {
  type: 'plugin',
  namespace: 'my-plugin',
  seed: {
    description: 'Sets up hello command and required environment variables',
    env: {
      description: 'Required API credentials',
      variables: {
        MY_API_KEY: { description: 'Your API key from the dashboard' },
        MY_SECRET: { description: 'Webhook secret for verification' }
      }
    }
  }
} satisfies Config
```

### Example Seed Command

```typescript
// seed/commands/hello.ts
export default function () {
  return 'Hello from my-plugin!'
}
```

---

## 7. Terminal Commands

Interactive commands available in the Robo dev terminal (when running `robo dev` or `robo start` in TTY mode). Users type `/command-name` in the terminal.

**Location**: `src/robo/terminal/commands/{name}.ts`
**Subcommands**: `src/robo/terminal/commands/{name}/{sub}.ts`

```typescript
import { createTerminalCommandConfig } from 'robo.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
  description: 'Show plugin status',
  options: [
    { alias: '-v', name: '--verbose', description: 'Show detailed info', type: 'boolean' },
    { alias: '-f', name: '--format', description: 'Output format', type: 'string' }
  ]
} as const)

export default async (context: TerminalContext<typeof config>) => {
  const { verbose, format } = context.options  // Fully typed from config

  context.write('Plugin status: active')

  if (verbose) {
    context.write('Detailed information...')
  }

  // Drawer for persistent UI below the input prompt
  context.drawer?.show([
    'Active connections: 42',
    'Uptime: 3h 15m'
  ])

  // Later: context.drawer?.hide()
}
```

### TerminalContext Fields

| Field | Type | Description |
|-------|------|-------------|
| `args` | `string[]` | Positional arguments |
| `options` | Typed from config | Parsed options (flags) |
| `config` | `Config` | Project configuration |
| `runtime` | `RuntimeProvider?` | Runtime provider for state/flashcore access |
| `write` | `(text: string) => void` | Write output to terminal |
| `drawer` | `object?` | Persistent drawer UI (`show`, `hide`, `isOpen`) |

### Subcommands

Create subdirectories for nested commands:

```
src/robo/terminal/commands/
├── status.ts             # /status
└── db/
    ├── migrate.ts        # /db migrate
    └── seed.ts           # /db seed
```

---

## 8. CLI Extensions

Plugins can add new `npx robo` subcommands or extend existing ones.

### New Commands (`src/robo/cli/commands/{name}.ts`)

```typescript
import { createCliCommandConfig } from 'robo.js'
import type { CliContext } from 'robo.js'
export const config = createCliCommandConfig({
  description: 'Generate database migrations',
  options: [
    { alias: '-o', name: '--output', description: 'Output directory', type: 'string' },
    { alias: '-d', name: '--dry-run', description: 'Preview without writing', type: 'boolean' }
  ]
} as const)
export default async (context: CliContext<typeof config>) => {
  const { output, dryRun } = context.options
  context.logger.info('Generating migrations...', { output, dryRun })
}
```

### Extend Existing Commands (`src/robo/cli/extensions/{command}.ts`)

Filename must match the command (e.g., `dev.ts` extends `npx robo dev`).

```typescript
import type { CliExtendConfig, CliContext } from 'robo.js'
export const config: CliExtendConfig = {
  options: [{ alias: '-t', name: '--tunnel', description: 'Enable tunnel', type: 'boolean' }],
  priority: 0
}
export async function before(context: CliContext): Promise<boolean | void> { /* return false to abort */ }
export async function after(context: CliContext): Promise<void> { /* runs after original command */ }
```

### CliContext Fields

| Field | Type | Description |
|-------|------|-------------|
| `args` | `string[]` | Positional arguments |
| `options` | Typed from config | Parsed options (flags) |
| `logger` | `Logger` | Logger instance (forked for plugins) |
| `cwd` | `string` | Project working directory |
| `argv` | `string[]` | Raw argv after command name |
| `result` | `unknown?` | Result from handler (available in `after` hooks) |

---

## 9. Logging Standard

Most plugins should use a single forked logger named after the plugin. All files import and use this shared instance from a central location.

### Setup

```typescript
// src/core/logger.ts
import { logger } from 'robo.js/logger.js'
export const myLogger = logger.fork('my-plugin')
```

### Usage

```typescript
// src/robo/start.ts
import { myLogger } from '../core/logger.js'
myLogger.info('Plugin started')

// src/core/engine.ts
import { myLogger } from './logger.js'
myLogger.debug('Processing request')

// src/robo/routes/api.ts
import { myLogger } from '../../core/logger.js'
myLogger.warn('Unexpected entry')
```

### Multiple Forks for Large Plugins

Plugins with several massive, distinct features may use multiple forks to make log filtering practical. Each fork should represent a top-level feature area:

```typescript
// src/core/logger.ts
import { logger } from 'robo.js/logger.js'

export const aiLogger = logger.fork('ai')
export const voiceLogger = logger.fork('ai:voice')
export const searchLogger = logger.fork('ai:search')
```

Use this sparingly — most plugins should stick to a single fork. Multiple forks are appropriate when the plugin has clearly separate subsystems that benefit from independent log filtering.

### Do NOT

```typescript
// DON'T: Direct console
console.log('something')                              // Wrong

// DON'T: Unnamed fork
const log = logger.fork('')                           // Wrong

// DON'T: Forks for small utilities or individual files
const helperLogger = logger.fork('my-plugin:utils')   // Wrong — too granular
```

**Rationale**: Forking by plugin (or major feature) enables easy log filtering, consistent namespacing, and simpler log level configuration.

---

## 10. Build & Publish

### Development Workflow

```bash
# Watch mode — rebuilds on source changes
robo build plugin --watch

# One-time build
robo build plugin
```

The build compiles `src/` to `.robo/build/` using SWC. Route definitions, hooks, seeds, terminal commands, and CLI extensions are all indexed during build.

### files Field Checklist

| Path | Required | Purpose |
|------|----------|---------|
| `.robo/` | Yes | Compiled output (manifest, build files) |
| `src/` | Recommended | Source for debugging and editor navigation |
| `seed/` | If applicable | Seed files copied to user's project |
| `LICENSE` | Recommended | License file |
| `README.md` | Recommended | Documentation |

### Pre-Publish Checklist

1. `type: 'plugin'` in `config/robo.ts`
2. `namespace` set in `config/robo.ts`
3. `robo.js` in `peerDependencies`
4. `.robo/` in `files` array
5. `prepublishOnly` script runs `robo build plugin`
6. All public exports work from `.robo/build/index.js`
7. Seeds tested with `npx robo add` in a test project
8. Single logger fork in `src/core/logger.ts`
9. No monorepo-relative imports (use `robo.js`, not `../../packages/robo/...`)

### Publishing

```bash
# Build and publish
robo build plugin
npm publish

# Or just publish (prepublishOnly runs the build)
npm publish
```

---

## 11. Common Mistakes

| Mistake | Fix |
|---------|-----|
| Old event pattern `src/events/_start.ts` | Use `src/robo/start.ts` lifecycle hook |
| Multiple logger forks per plugin | ONE `logger.fork('name')` in `src/core/logger.ts` |
| Missing `type: 'plugin'` in config | Add `type: 'plugin'` to `config/robo.ts` |
| Missing `namespace` in config | Add `namespace: 'my-plugin'` to `config/robo.ts` |
| Seed files in wrong directory | `seed/` maps to `src/`, `seed/_root/` maps to project root |
| Missing `.robo/` in files array | Add `.robo/` to `package.json` `files` field |
| Direct `console.log` usage | Use the shared logger fork from `src/core/logger.ts` |
| Importing from monorepo paths | Use `robo.js`, `robo.js/logger.js`, not `../../packages/...` |
| `main` pointing to `src/index.ts` | Must point to `.robo/build/index.js` |
| Route config missing `key.style` | `key.style` is required in every `RouteConfig` |
| Returning wrong shape from processor | Processor must return `ProcessedEntry` with `key`, `path`, `exports`, `metadata` |
| Async init hook accessing portal | `init` runs before manifest/portal — use `prepare` or `start` instead |
| Stop hook assuming state exists | Check `context.state.has()` before `get()` — plugin may have failed to start |
| Missing `as const` on config | Use `as const` with `createTerminalCommandConfig` / `createCliCommandConfig` for type inference |

---

## 12. Complete Example

A minimal plugin: config, logger, types, public exports, hooks, route, terminal command, and seed.

```typescript
// config/robo.ts
import type { Config } from 'robo.js'
export default { type: 'plugin', namespace: 'greeter' } satisfies Config

// src/core/logger.ts
import { logger } from 'robo.js/logger.js'
export const greeterLogger = logger.fork('greeter')

// src/types.ts
export interface GreeterConfig { greeting?: string; channels?: string[] }

// src/index.ts
export { greeterLogger as logger } from './core/logger.js'
export type { GreeterConfig } from './types.js'
```

```typescript
// src/robo/start.ts
import type { StartContext } from 'robo.js'
import type { GreeterConfig } from '../types.js'
import { greeterLogger } from '../core/logger.js'
export default async (context: StartContext<GreeterConfig>) => {
  const { greeting = 'Hello!' } = context.pluginConfig
  greeterLogger.info('Started with:', greeting)
  context.state.set('greeting', greeting)
}

// src/robo/stop.ts
import type { StopContext } from 'robo.js'
import { greeterLogger } from '../core/logger.js'
export default async (context: StopContext) => { greeterLogger.info('Stopping:', context.reason) }
```

```typescript
// src/robo/routes/greetings.ts
import type { RouteConfig, ScannedEntry, ProcessedEntry } from 'robo.js'
export const config: RouteConfig = {
  key: { style: 'filename' }, nesting: { maxDepth: 2, allowIndex: false },
  exports: { default: 'required', config: 'optional' }, singular: 'greeting',
  description: 'Custom greeting handlers'
}
export default function (entry: ScannedEntry): ProcessedEntry {
  const cfg = entry.exports.config as Record<string, unknown> | undefined
  return { key: entry.key, path: entry.filePath,
    exports: { default: !!entry.exports.default, config: !!cfg, named: [] },
    metadata: { description: cfg?.description } }
}
```

```typescript
// src/robo/terminal/commands/greet.ts
import { createTerminalCommandConfig, createPluginState } from 'robo.js'
import type { TerminalContext } from 'robo.js'
import { greeterLogger } from '../../../core/logger.js'
export const config = createTerminalCommandConfig({
  description: 'Send a greeting',
  options: [{ alias: '-n', name: '--name', description: 'Name to greet', type: 'string' }]
} as const)
export default async (context: TerminalContext<typeof config>) => {
  const greeting = createPluginState('greeter').get<string>('greeting') ?? 'Hello'
  context.write(`${greeting}, ${context.options.name ?? 'World'}!`)
}

// seed/commands/hello.ts
export default function () { return 'Hello from the greeter plugin!' }
```

```json
// package.json
{
  "name": "@example/greeter", "version": "0.1.0",
  "description": "A greeting plugin for Robo.js",
  "type": "module", "main": ".robo/build/index.js",
  "files": [".robo/", "src/", "seed/", "LICENSE", "README.md"],
  "keywords": ["robo", "robo.js", "plugin", "greeter"],
  "scripts": { "build": "robo build plugin", "dev": "robo build plugin --watch", "prepublishOnly": "robo build plugin" },
  "peerDependencies": { "robo.js": "^0.11.0" },
  "devDependencies": { "robo.js": "^0.11.0", "typescript": "^5.5.0", "@swc/core": "^1.6.0", "@types/node": "^20.0.0" }
}
```

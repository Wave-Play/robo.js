---
name: robo-update
description: "Migration assistant for upgrading Robo.js projects between versions. Analyzes codebase for breaking changes, generates migration checklist, and helps apply changes with user confirmation."
user-invocable: true
argument-hint: "<target version or 'analyze'>"
---

# Robo Update Skill

Migration assistant for upgrading Robo.js projects between versions. Scans the user's project (package.json, src/, config/) for breaking changes and helps apply fixes with confirmation at every step.

## 1. Usage

Three invocation modes:

```
/robo-update              # Auto-detect current version, suggest upgrade path
/robo-update 0.11         # Migrate to specific version
/robo-update analyze      # Report only, don't apply changes
```

| Mode | Behavior |
|------|----------|
| No argument | Read `package.json`, detect current version, suggest the next upgrade |
| Version target | Detect current version, build migration checklist for that target |
| `analyze` | Full analysis report only — never modify files |

**Core rule:** Never auto-apply changes. Always analyze first, present findings, then ask the user before modifying any file. Every destructive operation (file deletion, import rewrite) requires explicit confirmation.

---

## 2. Detect Current State

### Step 1: Read package.json

Find the `robo.js` version in `dependencies` or `devDependencies`. Also check for `@robojs/discordjs` and other plugin packages.

### Step 2: Scan for v0.10 patterns

These indicate the project is on v0.10 or earlier:

| Pattern | Where to check |
|---------|----------------|
| `src/events/_start.ts` exists | File system |
| `src/events/_stop.ts` exists | File system |
| `src/events/_restart.ts` exists | File system |
| `clientOptions` in root config | `config/robo.ts` or `config/robo.mjs` |
| `import { client } from 'robo.js'` | All `.ts`/`.tsx`/`.js`/`.mjs`/`.jsx` files in `src/` |
| `import { getManifest } from 'robo.js'` | All `.ts`/`.tsx`/`.js`/`.mjs`/`.jsx` files in `src/` |
| `import { createCommandConfig } from 'robo.js'` | All `.ts`/`.tsx`/`.js`/`.mjs`/`.jsx` files in `src/` |
| `import { createContextConfig } from 'robo.js'` | All `.ts`/`.tsx`/`.js`/`.mjs`/`.jsx` files in `src/` |
| No `@robojs/discordjs` in dependencies | `package.json` |

### Step 3: Scan for v0.11 patterns

These indicate the project is already on v0.11:

| Pattern | Where to check |
|---------|----------------|
| `src/robo/start.ts` exists | File system |
| `@robojs/discordjs` in dependencies | `package.json` |
| Plugin config at `config/plugins/robojs/discordjs.ts` | File system |
| Imports from `@robojs/discordjs` | All `.ts`/`.tsx`/`.js`/`.mjs`/`.jsx` files in `src/` |

### Step 4: Determine migration path

Based on findings, determine whether the project needs v0.10 to v0.11 migration, is already migrated, or is partially migrated. Report which patterns were found and which migration sections apply.

---

## 3. v0.10 to v0.11: Lifecycle Hooks

The largest breaking change. Event-based lifecycle files are replaced with hook files under `src/robo/`.

### Before (v0.10)

```typescript title="src/events/_start.ts"
export default async () => {
  console.log('Bot started!')
}
```

```typescript title="src/events/_stop.ts"
export default async () => {
  console.log('Bot stopping')
}
```

```typescript title="src/events/_restart.ts"
export default async () => {
  console.log('Bot restarting')
}
```

### After (v0.11)

```typescript title="src/robo/start.ts"
import type { StartContext } from 'robo.js'

export default async (context: StartContext) => {
  context.logger.info('Bot started!')
  // Available context fields:
  // mode, projectConfig, pluginConfig, state, logger, env, portal, meta
  // Note: portal is reserved/optional (portal?: unknown) and not fully active yet
}
```

```typescript title="src/robo/stop.ts"
import type { StopContext } from 'robo.js'

export default async (context: StopContext) => {
  context.logger.info('Bot stopping, reason:', context.reason)
  // reason: 'signal' | 'error' | 'restart'
}
```

### Key changes

| v0.10 | v0.11 | Notes |
|-------|-------|-------|
| `src/events/_start.ts` | `src/robo/start.ts` | Handler receives `StartContext`, not bare args |
| `src/events/_stop.ts` | `src/robo/stop.ts` | Handler receives `StopContext` with `reason` field |
| `src/events/_restart.ts` | Merged into `src/robo/stop.ts` | Check `context.reason === 'restart'` |
| Plugin options as 2nd argument | `context.pluginConfig` | Typed to the plugin's config interface |
| No context object | Full context object | Includes `mode`, `logger`, `env`, `state`, `meta` |

### New Lifecycle Hooks (v0.11)

These hooks are new in v0.11 and have no v0.10 equivalents. They are optional capabilities, not migration targets.

| Hook File | Context Type | Purpose |
|-----------|-------------|---------|
| `src/robo/init.ts` | `InitContext` | Runs before manifest loading. No portal access is available at this stage. |
| `src/robo/prepare.ts` | `PrepareContext` | Runs after the portal is populated but before `start`. Use for setup that depends on registered commands/events. |
| `src/robo/error.ts` | `ErrorContext` | Fires on unhandled errors. Context includes `error: unknown` and `type: 'unhandledRejection' | 'uncaughtException'`. |
| `src/robo/hmr.ts` | `HmrContext` | HMR file change notifications in dev mode. |
| `src/robo/build/start.ts` | Build hook | Runs at the start of the build pipeline. |
| `src/robo/build/transform.ts` | Build hook | Runs during the build transform phase. |
| `src/robo/build/complete.ts` | Build hook | Runs after the build pipeline completes. |

### For plugins

The same pattern applies to plugin packages. A plugin's `src/events/_start.ts` moves to `src/robo/start.ts`. The context object includes `pluginConfig` typed to the plugin's configuration interface.

---

## 4. v0.10 to v0.11: Discord.js Decoupling

Discord.js is no longer bundled in core. It ships as the `@robojs/discordjs` plugin.

### Import changes

| v0.10 | v0.11 |
|-------|-------|
| `import { client } from 'robo.js'` | `import { getClient } from '@robojs/discordjs'` then `const client = getClient()`. For conditional checks, use `hasClient()` from `@robojs/discordjs`. |
| `import { createCommandConfig } from 'robo.js'` | `import { createCommandConfig } from '@robojs/discordjs'` |
| `import { createContextConfig } from 'robo.js'` | `import { createContextConfig } from '@robojs/discordjs'` |
| `import { registerCommands } from 'robo.js'` | `import { registerCommands } from '@robojs/discordjs'` |

### Before

```typescript
import { client, createCommandConfig } from 'robo.js'

export const config = createCommandConfig({
  description: 'Ping the bot'
})

export default () => {
  return `Latency: ${client.ws.ping}ms`
}
```

### After

```typescript
import { getClient, createCommandConfig } from '@robojs/discordjs'

export const config = createCommandConfig({
  description: 'Ping the bot'
})

export default () => {
  const client = getClient()
  return `Latency: ${client.ws.ping}ms`
}
```

### Dependency changes

1. Add `@robojs/discordjs` to `dependencies` in `package.json`
2. Discord.js types (`Client`, `Guild`, `GuildMember`, etc.) are re-exported from `@robojs/discordjs`
3. Move any `clientOptions` from root config to the plugin config file

---

## 5. v0.10 to v0.11: Config Changes

### Fields removed from root config

| Removed Field | New Location | Notes |
|---------------|-------------|-------|
| `clientOptions` | `config/plugins/robojs/discordjs.ts` | Discord.js client options |
| `defaults` | `config/plugins/robojs/discordjs.ts` | Command defaults |
| `invite` | Removed | No replacement |
| `sage` | `config/plugins/robojs/discordjs.ts` | Sage error handling config |
| `autoRegisterCommands` | `config/plugins/robojs/discordjs.ts` | Command registration toggle |
| `experimental.disableBot` | Conditional `@robojs/discordjs` | Omit the plugin entirely |

### New fields in root config

| Field | Type | Purpose |
|-------|------|---------|
| `namespace` | `string` | Project namespace for portal |
| `portal` | `object` | Portal configuration |
| `watcher` | `object` | File watcher configuration |

### Plugin config file pattern

Plugin configs live at `config/plugins/{scope}/{name}.ts`. For example:

```typescript title="config/plugins/robojs/discordjs.ts"
import type { DiscordConfig } from '@robojs/discordjs'

export default {
  clientOptions: {
    intents: ['Guilds', 'GuildMessages', 'MessageContent']
  },
  sage: {
    defer: true,
    ephemeral: false
  }
} satisfies DiscordConfig
```

### Logger updates

New drain composition APIs available:

- `createMultiDrain()` — combine multiple log drains
- `createLevelFilteredDrain()` — filter logs by level before draining
- `createFileDrain()` — write logs to a file

### Timeout changes

Discord-specific timeouts moved to `@robojs/discordjs` plugin config. Only framework-level timeouts remain in root config.

---

## 6. v0.10 to v0.11: New APIs

These APIs become available after migrating. Include them in the "Optional" section of the checklist.

| API | Import | Purpose |
|-----|--------|---------|
| `createCliCommandConfig` | `robo.js` | Type-safe CLI command configuration |
| `createTerminalCommandConfig` | `robo.js` | Type-safe terminal command configuration |
| `setHookPriority()` | `robo.js` | Control hook execution order |
| `prioritizeHookBefore()` | `robo.js` | Run a hook before another |
| `prioritizeHookAfter()` | `robo.js` | Run a hook after another |
| `createMultiDrain()` | `robo.js` | Combine multiple log drains |
| `createLevelFilteredDrain()` | `robo.js` | Filter logs by level |
| `createFileDrain()` | `robo.js` | Write logs to file |
| `Manifest` | `robo.js` | Singleton replacing `getManifest()`, async route loading |
| `Env` | `robo.js` | Typed env access with schema |
| `Robo.status` | `robo.js` | Runtime status management (set, remove, flash) |
| `portal` | `robo.js` | Namespace proxy for handler access |
| `createPluginState(name)` | `robo.js` | Scoped plugin state |
| `hmr` | `robo.js/hmr` | HMR subscriptions and module cleanup |
| `Mode` | `robo.js` | Runtime mode utilities |

---

## 7. Analysis Output

Present findings as a categorized checklist. Every item includes: the file path, the current pattern found, the required change, and a before/after code snippet.

### Critical (must fix for v0.11 to work)

These block compilation or runtime. Example items:

- [ ] `src/events/_start.ts` found — move to `src/robo/start.ts` with `StartContext` parameter
- [ ] `src/events/_stop.ts` found — move to `src/robo/stop.ts` with `StopContext` parameter
- [ ] `src/events/_restart.ts` found — merge into `src/robo/stop.ts` (check `context.reason === 'restart'`)
- [ ] `import { client } from 'robo.js'` in `src/commands/ping.ts` — change to `import { getClient } from '@robojs/discordjs'`
- [ ] `import { createCommandConfig } from 'robo.js'` in N files — change to import from `@robojs/discordjs`
- [ ] `@robojs/discordjs` missing from `package.json` — add to dependencies
- [ ] `clientOptions` in `config/robo.ts` — move to `config/plugins/robojs/discordjs.ts`

### Recommended (improve correctness and maintainability)

- [ ] Update logger usage to use forked loggers per plugin
- [ ] Move Discord-specific config fields (`sage`, `defaults`) to plugin config
- [ ] Replace `getManifest()` calls with `Manifest` singleton
- [ ] Add TypeScript types for lifecycle context parameters

### Optional (new features available after migration)

- [ ] Add hook priority for startup ordering with `setHookPriority()`
- [ ] Use `Robo.status` for runtime status display
- [ ] Set up log drains for production monitoring
- [ ] Use `Env` class for typed environment variable access
- [ ] Use `createPluginState('name')` for scoped state management

### Format

For each item found in the user's project, include:

```
- [ ] **File:** `src/events/_start.ts`
  **Current:** Event-based lifecycle hook (v0.10 pattern)
  **Required:** Move to `src/robo/start.ts` with StartContext
  **Before:**
  ```typescript
  export default async () => { ... }
  ```
  **After:**
  ```typescript
  import type { StartContext } from 'robo.js'
  export default async (context: StartContext) => { ... }
  ```
```

---

## 8. Applying Changes

Follow this workflow after presenting the analysis from section 7.

### Step 1: Ask the user

Present three options:

1. **Apply all changes** — apply every critical and recommended item
2. **Select specific changes** — let the user pick which items to apply
3. **Just show the report** — no modifications, analysis only

If the argument was `analyze`, skip this step and only show the report.

### Step 2: Apply changes in safe order

For each selected change:

1. **Show the diff** before applying. Display the exact edit that will be made.
2. **Create new files first.** When moving `src/events/_start.ts` to `src/robo/start.ts`, create the new file before touching the old one.
3. **Update imports** in all affected files. Search `src/` for each import pattern and rewrite.
4. **Update config files.** Extract fields from root config, create plugin config files.
5. **Delete old files last.** Only delete `src/events/_start.ts` after confirming `src/robo/start.ts` exists and contains the migrated code.

### Step 3: Safe ordering rules

| Order | Action | Example |
|-------|--------|---------|
| 1 | Create new directories | `src/robo/`, `config/plugins/robojs/` |
| 2 | Create new files | `src/robo/start.ts`, `config/plugins/robojs/discordjs.ts` |
| 3 | Rewrite imports | `import { client }` to `import { getClient }` across all files |
| 4 | Update config files | Remove `clientOptions` from root config |
| 5 | Delete old files | Remove `src/events/_start.ts`, `src/events/_stop.ts` |

### Step 4: Post-migration

After applying changes, remind the user to:

1. Run `pnpm install` (or `npm install` / `yarn install`) to install `@robojs/discordjs`
2. Run `robo build` to recompile with the new structure
3. Test with `robo dev` to verify everything works
4. Check for any runtime errors in the console

### Important safeguards

- **Warning:** If both `src/events/_start.ts` and `src/robo/start.ts` exist, startup logic may execute twice. Delete old lifecycle event files before building.
- **Never delete a file before its replacement is created and verified.**
- **Never rewrite an import without showing the before/after diff.**
- **Never modify `package.json` dependencies directly** — remind the user to run `robo add @robojs/discordjs` or manually add and install.
- **Always ask before destructive operations** (file deletion, bulk import rewrites).
- **If a file has custom logic beyond the lifecycle boilerplate**, preserve that logic in the migration and flag it for the user to review.

# Discord.js Coupling Points Summary

This document provides a comprehensive summary of all Discord.js coupling points in the Robo.js core, organized by file and responsibility. This serves as a reference for understanding what would need to change to extract Discord functionality into a plugin.

## Files with Direct Discord.js Imports

### Critical Files (Must Change)

| File | Import Count | Dependencies |
|------|-------------|--------------|
| `src/core/robo.ts` | 3 | `Client`, `Events`, interaction types |
| `src/core/handlers.ts` | 5 | `CommandInteraction`, `ContextMenuCommandInteraction`, `AutocompleteInteraction`, `InteractionDeferReplyOptions`, `Message` |
| `src/core/portal.ts` | 1 | `Collection` |
| `src/core/globals.ts` | 1 | `Collection` (type only) |
| `src/core/intents.ts` | 2 | `Client`, `GatewayIntentBits` |
| `src/cli/utils/manifest.ts` | 2 | `PermissionsString`, command helpers |
| `src/cli/utils/commands.ts` | 8 | All command building and REST types |

### Type Definition Files

| File | Dependencies |
|------|--------------|
| `src/types/commands.ts` | 15+ Discord types |
| `src/types/config.ts` | `ClientOptions`, `PermissionsString`, `ShardingManagerOptions` |
| `src/types/manifest.ts` | `PermissionsString` |
| `src/types/common.ts` | None (generic types) |

### Default Handler Files

| File | Dependencies |
|------|--------------|
| `src/default/events/ready.ts` | `Client`, `ChannelType` |
| `src/default/events/interactionCreate/*.ts` | Various Discord types |
| `src/default/commands/help.ts` | Discord interaction types |
| `src/default/commands/dev/*.ts` | Discord interaction types |

## Coupling by Responsibility

### 1. Client Management

**Location:** `src/core/robo.ts`

```typescript
// Imports
import { Client, Events } from 'discord.js'

// Usage
export let client: Client
client = new Client(config.clientOptions)
await client.login(env.get('discord.token'))
client.destroy()
```

**Responsibilities:**
- Client instantiation
- Client lifecycle (login, destroy)
- Client options from config
- Global client export

### 2. Event Registration

**Location:** `src/core/robo.ts`

```typescript
// Register event listeners
for (const key of portal.events.keys()) {
  client.on(key, async (...args) => {
    executeEventHandler(plugins, key, ...args)
  })
}

// Special interaction handling
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) { ... }
  else if (interaction.isAutocomplete()) { ... }
  else if (interaction.isContextMenuCommand()) { ... }
})
```

**Responsibilities:**
- Map manifest events to Discord client listeners
- Route interactions to appropriate handlers

### 3. Interaction Handling

**Location:** `src/core/handlers.ts`

```typescript
// Command execution
export async function executeCommandHandler(
  interaction: ChatInputCommandInteraction,
  commandKey: string
) {
  // Interaction methods used:
  interaction.replied
  interaction.deferred
  interaction.deferReply(options)
  interaction.editReply(reply)
  interaction.reply(options)
}

// Option extraction
export function extractCommandOptions(
  interaction: ChatInputCommandInteraction,
  commandOptions: CommandConfig['options']
) {
  interaction.options.getString(...)
  interaction.options.getUser(...)
  interaction.options.getChannel(...)
  interaction.options.getInteger(...)
  interaction.options.getBoolean(...)
  interaction.options.getAttachment(...)
  interaction.options.getMember(...)
  interaction.options.getRole(...)
  interaction.options.getMentionable(...)
  interaction.options.getNumber(...)
}
```

**Responsibilities:**
- Execute command/context/autocomplete handlers
- Extract typed options from interactions
- Handle replies (defer, reply, edit)
- Sage auto-reply logic

### 4. Intent Management

**Location:** `src/core/intents.ts`

```typescript
import { Client, GatewayIntentBits } from 'discord.js'

export const REQUIRED_INTENTS: Record<string, GatewayIntentBits> = {
  messageCreate: [GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages],
  guildMemberAdd: GatewayIntentBits.GuildMembers,
  // ... all Discord events
}

export function checkIntents(client: Client): void {
  // Validate intents match registered events
}
```

**Responsibilities:**
- Map events to required intents
- Validate client has necessary intents
- Warn about missing intents

### 5. Command Building

**Location:** `src/cli/utils/commands.ts`

```typescript
import {
  ContextMenuCommandBuilder,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
  REST,
  Routes
} from 'discord.js'

export function buildSlashCommands(dev, commands, config): SlashCommandBuilder[] {
  return Object.entries(commands).map(([key, entry]) => {
    return new SlashCommandBuilder()
      .setName(key)
      .setDescription(entry.description)
      .setContexts(...)
      .setIntegrationTypes(...)
      .addStringOption(...)
      // ... build full command structure
  })
}

export async function registerCommands(...) {
  const rest = new REST({ version: '9' }).setToken(token)
  await rest.put(Routes.applicationCommands(clientId), { body: commandData })
}
```

**Responsibilities:**
- Build Discord command structures
- Register commands via REST API
- Handle guild vs global registration

### 6. Collection Usage

**Location:** `src/core/portal.ts`, `src/core/globals.ts`

```typescript
import { Collection } from 'discord.js'

const collection = new Collection<string, HandlerRecord>()
collection.get(key)
collection.set(key, value)
collection.has(key)
collection.forEach(...)
```

**Responsibilities:**
- Store handler records
- Provide enhanced Map functionality

### 7. Type Definitions

**Location:** `src/types/commands.ts`

```typescript
import type {
  ApplicationCommandOptionAllowedChannelTypes,
  ApplicationCommandOptionChoiceData,
  ApplicationIntegrationType,
  Attachment,
  AutocompleteInteraction,
  CommandInteraction,
  GuildBasedChannel,
  GuildMember,
  InteractionContextType,
  InteractionReplyOptions,
  MessagePayload,
  Role,
  User
} from 'discord.js'

export interface Command {
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<...>
  default: (interaction: CommandInteraction, options: unknown) => ...
}

export type CommandOptionTypes = {
  user: User
  channel: GuildBasedChannel
  member: GuildMember | null
  role: Role
  attachment: Attachment
  // ...
}
```

**Responsibilities:**
- Define handler interfaces
- Define option types
- Define interaction contexts

### 8. Configuration Types

**Location:** `src/types/config.ts`

```typescript
import type { ClientOptions, PermissionsString, ShardingManagerOptions } from 'discord.js'

export interface Config {
  clientOptions?: ClientOptions
  invite?: {
    permissions?: PermissionsString[]
    scopes?: Scope[]
  }
  experimental?: {
    shard?: boolean | ShardingManagerOptions
  }
}
```

**Responsibilities:**
- Accept Discord.js client configuration
- Define Discord-specific config options

## Dependency Matrix

```
┌─────────────────────────┬───────┬─────────┬────────┬───────┬───────┐
│ Component               │ Types │ Runtime │ Build  │ CLI   │ Easy  │
│                         │       │         │        │       │ Swap  │
├─────────────────────────┼───────┼─────────┼────────┼───────┼───────┤
│ Client Management       │ ✓     │ ✓       │        │       │ ✗     │
│ Event Registration      │ ✓     │ ✓       │        │       │ ✗     │
│ Interaction Handling    │ ✓     │ ✓       │        │       │ ✗     │
│ Intent Checking         │ ✓     │ ✓       │        │       │ ✗     │
│ Command Building        │ ✓     │         │ ✓      │ ✓     │ △     │
│ Command Registration    │ ✓     │         │ ✓      │ ✓     │ △     │
│ Collection Class        │ ✓     │ ✓       │ ✓      │       │ ✓     │
│ Permission Types        │ ✓     │         │ ✓      │       │ △     │
│ Config Types            │ ✓     │ ✓       │        │       │ △     │
│ Default Handlers        │ ✓     │ ✓       │        │       │ ✗     │
└─────────────────────────┴───────┴─────────┴────────┴───────┴───────┘

Legend: ✓ = Present, ✗ = Difficult, △ = Possible with abstraction
```

## What Could Be Generic

These components have minimal Discord-specific logic:

1. **Portal class** - Just needs a generic Collection replacement
2. **Globals registry** - Framework-agnostic state storage
3. **Handler execution pattern** - Middleware → handler → response
4. **Manifest structure (core)** - Entries with paths, keys, metadata
5. **Lifecycle events** - `_start`, `_stop`, `_restart` pattern
6. **State management** - Key-value with persistence
7. **Logger** - No Discord dependency
8. **Flashcore** - Generic storage adapter
9. **Mode system** - Environment-based modes

## What Must Stay Discord-Specific

These components are inherently Discord concepts:

1. **Slash commands** - Discord's interaction model
2. **Context menus** - Discord's context menu system
3. **Intents** - Discord Gateway concept
4. **Permissions** - Discord permission system
5. **OAuth2 scopes** - Discord authorization
6. **Client options** - Discord.js configuration
7. **Sharding** - Discord's scaling model
8. **Guild/Channel/User types** - Discord entities

## Potential Abstraction Layers

### Platform Client Interface

```typescript
interface PlatformClient {
  connect(): Promise<void>
  disconnect(): void
  on(event: string, handler: (...args: unknown[]) => void): void
  off(event: string, handler: (...args: unknown[]) => void): void
}
```

### Command Interface

```typescript
interface PlatformCommand {
  name: string
  description?: string
  options?: PlatformCommandOption[]
  execute(context: unknown, options: Record<string, unknown>): unknown
}
```

### Handler Interface

```typescript
interface PlatformHandler<TContext = unknown, TResult = unknown> {
  default: (context: TContext, ...args: unknown[]) => TResult | Promise<TResult>
  config?: Record<string, unknown>
}
```

## Migration Approach Summary

### Phase 1: Collection Replacement
- Replace Discord.js Collection with standard Map or custom Collection
- Low risk, high compatibility

### Phase 2: Type Extraction
- Move Discord types to optional peer dependency
- Create generic base types
- Plugin provides Discord-specific types

### Phase 3: Client Abstraction
- Create platform client interface
- Discord plugin implements for Discord.js
- Core only uses interface

### Phase 4: Handler Generalization
- Abstract command/event patterns
- Allow plugins to define handler types
- Directory scanning delegated to plugins

### Phase 5: Build Decoupling
- Plugin hooks for build process
- Discord registration moves to plugin
- Manifest structure becomes extensible

## Risk Assessment

| Change | Risk Level | Impact | Notes |
|--------|------------|--------|-------|
| Collection swap | Low | Low | Pure refactor |
| Type extraction | Medium | High | User code depends on types |
| Client abstraction | High | High | Core functionality change |
| Handler generalization | High | Very High | Plugin architecture redesign |
| Build decoupling | Medium | Medium | CLI changes needed |

## Current @robojs/server Pattern

The server plugin demonstrates partial decoupling:

```typescript
// Plugin hooks into lifecycle
export default async (_client, options) => {
  // Accesses portal.apis (defined in core manifest)
  portal.apis.forEach((api) => {
    engine.registerRoute(api.key, api.handler.default)
  })
  
  await engine.start({ hostname, port })
}
```

However:
- API routes are still in core manifest structure
- No plugin hooks for build-time integration
- Cannot define custom directories

## Conclusion

Discord.js is deeply integrated into Robo.js core across:
- **16+ source files**
- **50+ Discord type imports**
- **Runtime, build-time, and CLI concerns**

Decoupling requires significant architectural changes, but the existing plugin system and lifecycle hooks provide a foundation to build upon. The `@robojs/server` plugin shows that platform-specific functionality can live in plugins, but the current design doesn't fully support plugin-defined directories or build hooks needed for complete Discord extraction.


# Discord.js Integration Analysis

This document analyzes how Discord.js is currently integrated into the Robo.js core, identifying coupling points and dependencies that would need to be addressed to extract Discord functionality into a plugin.

## Direct Discord.js Imports in Core

### Core Runtime Files

#### `src/core/robo.ts`
Primary Discord.js coupling point:

```typescript
import { Client, Events } from 'discord.js'
import type { AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js'

// Client is exported globally
export let client: Client

async function start(options?: StartOptions) {
  // Client instantiation
  if (config.experimental?.disableBot !== true) {
    client = optionsClient ?? new Client(config.clientOptions)
  }
  
  // Event listener registration
  for (const key of portal.events.keys()) {
    client.on(key, async (...args) => {
      executeEventHandler(plugins, key, ...args)
    })
  }
  
  // Interaction handling
  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand()) {
      await executeCommandHandler(interaction, commandKey)
    } else if (interaction.isAutocomplete()) {
      await executeAutocompleteHandler(interaction, commandKey)
    } else if (interaction.isContextMenuCommand()) {
      await executeContextHandler(interaction, interaction.commandName)
    }
  })
  
  // Discord login
  await client.login(env.get('discord.token'))
}
```

#### `src/core/handlers.ts`
Command and interaction handling:

```typescript
import { CommandInteraction, ContextMenuCommandInteraction } from 'discord.js'
import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  InteractionDeferReplyOptions,
  Message
} from 'discord.js'

export async function executeCommandHandler(
  interaction: ChatInputCommandInteraction,
  commandKey: string
) {
  // Discord-specific interaction handling
  await interaction.deferReply(...)
  await interaction.editReply(reply)
  await interaction.reply(...)
}

export function extractCommandOptions(
  interaction: ChatInputCommandInteraction,
  commandOptions: CommandConfig['options']
) {
  // Discord.js option extraction
  interaction.options.getString(...)
  interaction.options.getUser(...)
  interaction.options.getChannel(...)
  // ... all Discord option types
}

function patchDeferReply(interaction: CommandInteraction) {
  // Discord-specific defer patching
}
```

#### `src/core/portal.ts`
Uses Discord.js Collection:

```typescript
import { Collection } from 'discord.js'

export default class Portal {
  get apis(): Collection<string, HandlerRecord<Api>> { ... }
  get commands(): Collection<string, HandlerRecord<Command>> { ... }
  get context(): Collection<string, HandlerRecord<Context>> { ... }
  get events(): Collection<string, HandlerRecord<Event>[]> { ... }
}

async function loadHandlerRecords<T>(type) {
  const collection = new Collection<string, T>()
  // ...
}
```

#### `src/core/globals.ts`
Discord Collection in global types:

```typescript
import type { Collection } from 'discord.js'

// Global portal values include Discord Collections
interface PortalValues {
  apis: Collection<string, HandlerRecord<Api>>
  commands: Collection<string, HandlerRecord<Command>>
  // ...
}
```

#### `src/core/intents.ts`
Intent checking and validation:

```typescript
import { Client, GatewayIntentBits } from 'discord.js'

export const REQUIRED_INTENTS: Record<string, GatewayIntentBits | GatewayIntentBits[]> = {
  guildCreate: GatewayIntentBits.Guilds,
  messageCreate: [GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages],
  // ... all Discord events mapped to intents
}

export function checkIntents(client: Client): void {
  const intents = Number(client.options.intents.bitfield)
  // Check if required intents are present
}
```

#### `src/core/constants.ts`
Discord-specific logger:

```typescript
export const discordLogger = logger.fork('discord')
```

### CLI Files

#### `src/cli/utils/manifest.ts`
Discord-specific manifest generation:

```typescript
import { PermissionsString } from 'discord.js'
import { getContextType, getIntegrationType } from './commands.js'

// Intent to permission mapping
const INTENT_PERMISSIONS: Record<string, PermissionsString[]> = {
  Guilds: ['ViewChannel'],
  GuildBans: ['BanMembers', 'ViewAuditLog'],
  // ...
}

async function generatePermissions(config: Config): Promise<PermissionsString[]> {
  // Discord permission calculation
}

function generateScopes(config: Config, manifest: Manifest): Scope[] {
  // Discord OAuth2 scopes
  const scopes: Scope[] = ['bot']
  if (Object.keys(manifest.commands).length) {
    scopes.push('applications.commands')
  }
  // ...
}
```

#### `src/cli/utils/commands.ts`
Discord command registration:

```typescript
import {
  ApplicationIntegrationType,
  ContextMenuCommandBuilder,
  InteractionContextType,
  REST,
  Routes,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder
} from 'discord.js'

export function buildSlashCommands(dev, commands, config): SlashCommandBuilder[] {
  // Build Discord slash command structures
  return Object.entries(commands).map(([key, entry]) => {
    const commandBuilder = new SlashCommandBuilder()
      .setName(key)
      .setDescription(entry.description)
      .setContexts(...)
      .setIntegrationTypes(...)
    // ...
  })
}

export async function registerCommands(...) {
  const rest = new REST({ version: '9' }).setToken(token)
  await rest.put(Routes.applicationCommands(clientId), { body: commandData })
}
```

#### `src/cli/compiler/manifest.ts`
Discord-specific JSON handling:

```typescript
// BigInt handling for Discord permissions
function jsonReviver(key: string, value: unknown) {
  if (key === 'defaultMemberPermissions' && typeof value === 'string' && value.slice(-1) === 'n') {
    return BigInt(value.slice(0, -1))
  }
  return value
}
```

### Type Definitions

#### `src/types/commands.ts`
Heavily Discord-dependent:

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
  RestOrArray,
  Role,
  User
} from 'discord.js'

export interface Command {
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<...>
  default: (interaction: CommandInteraction, options: unknown) => unknown | Promise<unknown>
}

export type CommandContext = 'BotDM' | 'Guild' | 'PrivateChannel' | InteractionContextType
export type CommandIntegrationType = 'GuildInstall' | 'UserInstall' | ApplicationIntegrationType

export type CommandOptionTypes = {
  user: User
  channel: GuildBasedChannel
  member: GuildMember | null
  role: Role
  attachment: Attachment
  // ...
}
```

#### `src/types/config.ts`
Discord client options in config:

```typescript
import type { ClientOptions, PermissionsString, ShardingManagerOptions } from 'discord.js'

export interface Config {
  clientOptions?: ClientOptions           // Discord.js ClientOptions
  invite?: {
    permissions?: PermissionsString[]     // Discord permissions
    scopes?: Scope[]                      // Discord OAuth2 scopes
  }
  experimental?: {
    shard?: boolean | ShardingManagerOptions
  }
}

// Discord OAuth2 scopes
export type Scope = 'bot' | 'applications.commands' | 'guilds' | ...
```

#### `src/types/manifest.ts`
Discord permissions in manifest:

```typescript
import type { PermissionsString } from 'discord.js'

export interface Manifest {
  permissions?: PermissionsString[] | number
  scopes?: Scope[]
  // ...
}
```

### Default Handlers

#### `src/default/events/ready.ts`
Discord-specific ready handler:

```typescript
import { ChannelType } from 'discord.js'
import type { Client } from 'discord.js'

export default async (client: Client) => {
  discordLogger.ready(`On standby as ${client.user.tag}`)
  checkIntents(client)
  // Handle restart notification via Discord channel
}
```

#### `src/default/events/interactionCreate/`
Discord interaction handlers:

```typescript
// debugging.ts - Error display in Discord
// helpMenu.ts - Help menu rendering in Discord
```

#### `src/default/commands/`
Discord slash commands:

```typescript
// help.ts - Help command
// dev/logs.ts, dev/restart.ts, dev/status.ts - Dev commands
```

## Coupling Analysis Summary

### Tight Coupling Points

| Area | Coupling Level | Description |
|------|---------------|-------------|
| `src/core/robo.ts` | **Critical** | Client instantiation, event registration, interaction routing |
| `src/core/handlers.ts` | **Critical** | All command/interaction execution logic |
| `src/types/commands.ts` | **Critical** | Command types depend entirely on Discord types |
| `src/core/intents.ts` | **High** | Intent checking logic |
| `src/cli/utils/commands.ts` | **High** | Command registration with Discord API |
| `src/core/portal.ts` | **Medium** | Uses Discord.js Collection class |
| `src/types/config.ts` | **Medium** | ClientOptions, permissions |
| `src/types/manifest.ts` | **Medium** | Permissions, scopes |
| `src/default/*` | **Medium** | Default Discord handlers |

### Discord-Specific Functionality

1. **Client Management**
   - Client instantiation with ClientOptions
   - Client login with token
   - Client destroy on shutdown
   - Sharding support

2. **Interaction Handling**
   - Slash command routing
   - Context menu routing
   - Autocomplete handling
   - Button/select menu (via events)

3. **Command Registration**
   - Building SlashCommandBuilder objects
   - REST API calls to Discord
   - Permission and scope management

4. **Intent Management**
   - Intent validation
   - Required intent calculation
   - Missing intent warnings

5. **Type System**
   - CommandInteraction types
   - Guild/Channel/User types
   - Permission types
   - Option extraction types

## Current Abstraction Attempt: `disableBot`

The `experimental.disableBot` flag provides partial decoupling:

```typescript
// In robo.ts
if (config.experimental?.disableBot !== true) {
  client = optionsClient ?? new Client(config.clientOptions)
}

// Skip Discord login
if (config.experimental?.disableBot !== true) {
  await client.login(env.get('discord.token'))
}
```

However, this only skips Discord functionality - it doesn't remove the Discord.js dependency.

## Data Flow: Discord Interactions

```
Discord Gateway
      ↓
Discord.js Client
      ↓
InteractionCreate Event
      ↓
robo.ts: Determine interaction type
      ↓
handlers.ts: executeCommandHandler()
      ↓
Middleware chain
      ↓
User handler (from manifest)
      ↓
Sage auto-reply handling
      ↓
interaction.reply() / interaction.editReply()
```

## What Would Need to Change for Plugin Extraction

### Core Changes Required

1. **Abstract Client Interface**
   ```typescript
   interface PlatformClient {
     login(): Promise<void>
     destroy(): void
     on(event: string, handler: Function): void
   }
   ```

2. **Handler Abstraction**
   ```typescript
   interface PlatformInteraction {
     type: 'command' | 'context' | 'autocomplete'
     reply(content: unknown): Promise<void>
     defer(): Promise<void>
   }
   ```

3. **Type Decoupling**
   - Remove Discord types from core type definitions
   - Create generic command/event types
   - Plugin provides platform-specific types

4. **Collection Replacement**
   - Use standard Map instead of Discord.js Collection
   - Or create a generic Collection interface

5. **Permission System**
   - Abstract permission concept
   - Plugin defines platform-specific permissions

### Plugin Responsibilities

A `@robojs/discord` plugin would need to:

1. **Provide Client**
   - Instantiate and manage Discord.js Client
   - Handle login/logout
   - Manage sharding

2. **Handle Interactions**
   - Register InteractionCreate listener
   - Route to appropriate handlers
   - Manage Sage functionality

3. **Define Directory Conventions**
   - `/src/commands/` for slash commands
   - `/src/context/` for context menus
   - Discord-specific event handling

4. **Build-Time Integration**
   - Generate Discord-specific manifest entries
   - Build SlashCommandBuilder objects
   - Register commands with Discord API

5. **Type Exports**
   - Export Discord.js types for user code
   - Provide command option types
   - Provide interaction types

## Existing Pattern: @robojs/server

The `@robojs/server` plugin demonstrates how platform-specific functionality can live in a plugin:

```typescript
// Plugin _start handler
export default async (client, options) => {
  const { port, hostname, engine } = options
  
  // Access portal.apis for API routes
  portal.apis.forEach((api) => {
    engine.registerRoute(api.key, api.handler.default)
  })
  
  await engine.start({ hostname, port })
}
```

However, API routes (`/src/api/`) are still defined in the core manifest structure, not by the plugin.

## Key Observations

1. **Discord is deeply embedded** - Not a surface-level integration, affects types, runtime, and build

2. **Collection is reusable** - Discord.js Collection could be replaced with standard Map + helpers

3. **Handler execution is platform-agnostic** - The middleware/handler pattern works for any platform

4. **Command registration is build-time** - Could be a build hook for plugins

5. **Types are the biggest challenge** - User code depends on Discord types (CommandInteraction, etc.)

6. **Sage is Discord-specific** - Auto-defer/reply logic tied to Discord interaction model

7. **Default handlers need migration** - `/dev/*` commands, help, ready are Discord-specific

8. **intents.ts is fully Discord** - No abstraction possible, pure Discord concept

9. **Portal structure could generalize** - Commands/events concept applies beyond Discord

10. **Config needs refactoring** - `clientOptions`, `invite.permissions` are Discord-specific


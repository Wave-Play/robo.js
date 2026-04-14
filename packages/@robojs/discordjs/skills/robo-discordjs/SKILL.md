---
name: robo-discordjs
description: "Reference guide for building Discord apps with @robojs/discordjs — commands, events, context menus, middleware, Sage auto-defer, and plugin configuration."
user-invocable: true
argument-hint: "<question, or 'create <type> <name>'>"
---

# @robojs/discordjs Development Guide

Complete reference for AI agents building Discord apps with `@robojs/discordjs`. This plugin provides file-based routing for Discord slash commands, events, context menus, and middleware on top of Discord.js.

## Usage

```
/robo-discordjs                                  # Inject this guide as context
/robo-discordjs create command admin/ban          # Generate a command file
/robo-discordjs create event messageCreate        # Generate an event handler
/robo-discordjs create context user Report        # Generate a context menu
/robo-discordjs create middleware logger           # Generate middleware
/robo-discordjs <question>                        # Answer a question
```

### Create Mode

When `$ARGUMENTS` starts with `create`, generate a handler file based on the type:

- `create command <name>` -- Create `src/commands/<name>.ts`. Supports nested paths like `admin/ban` (maps to `/admin ban` subcommand). Include `createCommandConfig()` with `as const`, typed options, and a default export handler.
- `create event <eventName>` -- Create `src/events/<eventName>.ts`. Default export receives Discord.js event args directly. Include `EventConfig` if useful.
- `create context user <Name>` -- Create `src/context/user/<Name>.ts`. Handler receives `(interaction: UserContextMenuCommandInteraction, user: User)`. File name = display name in Discord.
- `create context message <Name>` -- Create `src/context/message/<Name>.ts`. Handler receives `(interaction: MessageContextMenuCommandInteraction, message: Message)`. File name = display name in Discord.
- `create middleware <name>` -- Create `src/middleware/<name>.ts`. Handler receives `MiddlewareData`, can return `{ abort: true }` or `{ payload: [...] }`.

Follow the patterns in this guide exactly. Use imports from `@robojs/discordjs` and `robo.js`, never monorepo paths.

### Context / Question Mode

For all other invocations, use this guide as authoritative reference. If the user asks a question, answer it from these patterns.

---

## 1. Mental Model

Files are handlers. The directory structure defines what they handle. Everything is auto-discovered at build time.

```
src/commands/ping.ts              -> /ping
src/commands/admin/ban.ts         -> /admin ban
src/commands/admin/role/add.ts    -> /admin role add
src/events/messageCreate.ts       -> messageCreate event
src/events/messageCreate/log.ts   -> messageCreate event (additional handler)
src/context/user/Report.ts        -> "Report" user context menu
src/context/message/Bookmark.ts   -> "Bookmark" message context menu
src/middleware/logger.ts           -> runs before all handlers
```

Key principles:
- **No registration code.** Files in the right directories are auto-registered.
- **Named exports for config**, default exports for handlers.
- **String returns auto-reply.** Return a string from a command and it replies automatically.
- **Sage auto-defers.** Long-running commands are deferred automatically so Discord doesn't timeout.
- **Lifecycle hooks use `src/robo/`**, not `src/events/`. The `_start`, `_stop`, `_restart` hooks belong in `src/robo/start.ts`, `src/robo/stop.ts`, etc.

---

## 2. Commands

### File Structure

```
src/commands/
  ping.ts                  -> /ping
  hello.ts                 -> /hello
  admin/
    ban.ts                 -> /admin ban       (subcommand)
    kick.ts                -> /admin kick      (subcommand)
    role/
      add.ts               -> /admin role add  (subcommand group)
      remove.ts            -> /admin role remove
```

Discord allows a maximum of **3 nesting levels**: command / group / subcommand. A file at `src/commands/a/b/c.ts` maps to `/a b c`. Deeper nesting will fail at registration.

### Handler Signature

```typescript
import type { ChatInputCommandInteraction } from '@robojs/discordjs'

export default function (interaction: ChatInputCommandInteraction, options: Record<string, unknown>) {
  // Return a string to auto-reply
  return 'Pong!'
}
```

**CommandResult** = `string | InteractionReplyOptions | MessagePayload | void`

| Return Type | Behavior |
|-------------|----------|
| `string` | Auto-replies with the string as message content |
| `InteractionReplyOptions` | Auto-replies with full options (embeds, components, etc.) |
| `MessagePayload` | Auto-replies with the message payload |
| `void` / `undefined` | Handler manages its own reply via `interaction.reply()` |

If you return a value, Sage handles the reply. If you call `interaction.reply()` yourself, return `void` (do not also return a string).

---

## 3. Command Config

Use `createCommandConfig()` for type-safe command configuration. Adding `as const` is recommended for maximum type inference on options.

### CommandConfig Fields

| Field | Type | Description |
|-------|------|-------------|
| `description` | `string` | Command description shown in Discord (auto-generated if omitted) |
| `contexts` | `CommandContext[]` | Where command can be used: `'BotDM'`, `'Guild'`, `'PrivateChannel'` |
| `defaultMemberPermissions` | `string \| number \| bigint` | Required Discord permissions to use the command |
| `integrationTypes` | `CommandIntegrationType[]` | Installation contexts: `'GuildInstall'` \| `'UserInstall'` |
| `nameLocalizations` | `Record<string, string>` | Localized command names by locale code |
| `descriptionLocalizations` | `Record<string, string>` | Localized descriptions by locale code |
| `nsfw` | `boolean` | Mark as age-restricted |
| `options` | `readonly CommandOption[]` | Command parameters (see section 4) |
| `sage` | `SageOptions \| false` | Per-command Sage config (see section 9) |
| `timeout` | `number` | Execution timeout in milliseconds |
| `disabled` | `boolean` | Disable the command without deleting the file |
| `serverOnly` | `string \| string[]` | Restrict to specific server ID(s) |

> **Note:** The `dmPermission` field is deprecated by Discord in favor of `contexts`. Use `contexts: ['BotDM']` instead of `dmPermission: true`.

### Example with Typed Options

```typescript
import { createCommandConfig, type CommandOptions } from '@robojs/discordjs'
import type { ChatInputCommandInteraction } from '@robojs/discordjs'

export const config = createCommandConfig({
  description: 'Ban a user from the server',
  defaultMemberPermissions: 'BanMembers',
  contexts: ['Guild'],
  options: [
    { name: 'user', type: 'user', description: 'The user to ban', required: true },
    { name: 'reason', type: 'string', description: 'Ban reason' },
    { name: 'days', type: 'integer', description: 'Days of messages to delete', min: 0, max: 7 }
  ]
} as const)

export default async (interaction: ChatInputCommandInteraction, options: CommandOptions<typeof config>) => {
  const user = options.user       // typed as User (required)
  const reason = options.reason   // typed as string | undefined
  const days = options.days       // typed as number | undefined

  await interaction.guild?.members.ban(user, { reason: reason ?? undefined, deleteMessageDays: days ?? 0 })
  return `Banned ${user.username}${reason ? ` for: ${reason}` : ''}`
}
```

The `as const` assertion on the config object is **recommended for maximum type inference**. The generic `createCommandConfig()` function handles basic inference without it, but `as const` enables TypeScript to infer literal option names, literal choice values, and required vs optional distinctions. Without it, `CommandOptions<typeof config>` may fall back to broader types.

---

## 4. Command Options

### CommandOption Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Option name (lowercase, no spaces, alphanumeric + hyphens) |
| `type` | `'string' \| 'integer' \| 'number' \| 'boolean' \| 'user' \| 'channel' \| 'member' \| 'role' \| 'attachment' \| 'mention'` | The option type (see table below). Defaults to `'string'` if omitted |
| `description` | `string` | Option description shown in Discord |
| `required` | `boolean` | Whether the option is required. Default: `false` |
| `choices` | `readonly { name: string, value: string \| number }[]` | Static choices (max 25). Restricts input to these values |
| `min` | `number` | Minimum value (number/integer) or minimum length (string) |
| `max` | `number` | Maximum value (number/integer) or maximum length (string) |
| `channelTypes` | `ApplicationCommandOptionAllowedChannelTypes \| ApplicationCommandOptionAllowedChannelTypes[]` | Restrict channel option to specific channel types |
| `autocomplete` | `boolean` | Enable dynamic autocomplete (see section 5). Mutually exclusive with `choices` |
| `nameLocalizations` | `Record<string, string>` | Localized option names |
| `descriptionLocalizations` | `Record<string, string>` | Localized option descriptions |

### Option Types

| Type | TypeScript Type | Discord Type | Notes |
|------|----------------|--------------|-------|
| `'string'` | `string` | STRING | Default if `type` is omitted |
| `'integer'` | `number` | INTEGER | Whole numbers only |
| `'number'` | `number` | NUMBER | Allows decimals |
| `'boolean'` | `boolean` | BOOLEAN | True/false toggle |
| `'user'` | `User` | USER | Discord user object |
| `'channel'` | `GuildBasedChannel` | CHANNEL | Server channel. Use `channelTypes` to restrict |
| `'member'` | `GuildMember \| null` | USER (resolved) | Resolved guild member. Null if not in guild |
| `'role'` | `Role` | ROLE | Server role |
| `'attachment'` | `Attachment` | ATTACHMENT | File upload |
| `'mention'` | `GuildMember \| Role` | MENTIONABLE | Any mentionable entity |

### Type Inference with `CommandOptions<typeof config>`

When using `createCommandConfig()` with `as const`, TypeScript infers the most precise types. Both `createCommandConfig()` and `createContextConfig()` support type inference without `as const`, but adding it yields narrower literal types:

```typescript
export const config = createCommandConfig({
  description: 'Pick a color',
  options: [
    {
      name: 'color',
      type: 'string',
      required: true,
      choices: [
        { name: 'Red', value: 'red' },
        { name: 'Blue', value: 'blue' },
        { name: 'Green', value: 'green' }
      ]
    }
  ]
} as const)

export default (interaction: ChatInputCommandInteraction, options: CommandOptions<typeof config>) => {
  options.color  // typed as 'red' | 'blue' | 'green' (literal union from choices)
}
```

Without `choices`, string options resolve to `string`. With `choices`, they resolve to the literal union of choice values.

---

## 5. Autocomplete

Export a named `autocomplete` function alongside the default handler. This function is called as the user types in Discord.

```typescript
import { createCommandConfig, type CommandOptions } from '@robojs/discordjs'
import type { AutocompleteInteraction, ChatInputCommandInteraction } from '@robojs/discordjs'

const FRUITS = ['Apple', 'Banana', 'Cherry', 'Date', 'Elderberry', 'Fig', 'Grape']

export const config = createCommandConfig({
  description: 'Pick a fruit',
  options: [
    { name: 'fruit', type: 'string', description: 'Choose a fruit', required: true, autocomplete: true }
  ]
} as const)

export async function autocomplete(interaction: AutocompleteInteraction) {
  const focused = interaction.options.getFocused()
  const filtered = FRUITS
    .filter((fruit) => fruit.toLowerCase().startsWith(focused.toLowerCase()))
    .slice(0, 25)

  return filtered.map((fruit) => ({ name: fruit, value: fruit.toLowerCase() }))
}

export default (interaction: ChatInputCommandInteraction, options: CommandOptions<typeof config>) => {
  return `You picked: ${options.fruit}`
}
```

**Rules:**
- The `autocomplete` export must return `Promise<ApplicationCommandOptionChoiceData[]>`.
- Maximum 25 choices per autocomplete response (Discord limit).
- `autocomplete: true` on the option and `choices` are mutually exclusive.
- The autocomplete handler runs on every keystroke, so keep it fast.

---

## 6. Events

### File Structure

```
src/events/
  messageCreate.ts                -> handles messageCreate
  messageCreate/
    logger.ts                     -> additional messageCreate handler
    counter.ts                    -> another messageCreate handler
  guildMemberAdd.ts               -> handles guildMemberAdd
  ready.ts                        -> handles ready event
```

A single file handles one event. A directory with multiple files registers multiple handlers for the same event. All handlers for the same event run when it fires.

### Handler Signature

The default export receives the Discord.js event arguments directly:

```typescript
import type { Message } from '@robojs/discordjs'

export default function (message: Message) {
  if (message.author.bot) return
  console.log(`${message.author.username}: ${message.content}`)
}
```

Event arguments match the Discord.js `ClientEvents` type. For example:
- `messageCreate` -> `(message: Message)`
- `guildMemberAdd` -> `(member: GuildMember)`
- `ready` -> `(client: Client<true>)`
- `interactionCreate` -> `(interaction: Interaction)`
- `messageReactionAdd` -> `(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser)`

### EventConfig

```typescript
import type { EventConfig } from '@robojs/discordjs'

export const config: EventConfig = {
  frequency: 'once',   // 'always' (default) | 'once' (run only on first occurrence)
  priority: 10,         // Lower numbers run first (default: 0)
  description: 'Log the first message after startup',
  disabled: false,
  timeout: 5000
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `frequency` | `'always' \| 'once'` | `'always'` | Run on every event or only the first time |
| `priority` | `number` | `0` | Execution order (lower runs first) |
| `description` | `string` | - | Handler description |
| `disabled` | `boolean` | `false` | Disable without deleting |
| `timeout` | `number` | - | Execution timeout in ms |
| `serverOnly` | `string \| string[]` | - | Restrict to specific server(s) |

### Important: Lifecycle Events

**Do NOT put lifecycle hooks in `src/events/`.** The `_start`, `_stop`, and `_restart` hooks belong in the `src/robo/` directory:

```
src/robo/start.ts     -> runs when the Robo starts
src/robo/stop.ts      -> runs when the Robo stops
src/robo/restart.ts   -> runs on restart
```

These are Robo.js framework lifecycle hooks, not Discord events.

---

## 7. Context Menus

Context menus appear when a user right-clicks on a user or message in Discord.

### File Structure

```
src/context/
  user/
    Report.ts           -> "Report" in user right-click menu
    ViewProfile.ts      -> "View Profile" in user right-click menu
  message/
    Bookmark.ts         -> "Bookmark" in message right-click menu
    Translate.ts        -> "Translate" in message right-click menu
```

The **file name** becomes the display name in Discord. Use PascalCase or Title Case for readable names.

### User Context Menu Handler

```typescript
import type { UserContextMenuCommandInteraction, User } from '@robojs/discordjs'

export default (interaction: UserContextMenuCommandInteraction, user: User) => {
  return `User: ${user.username} (ID: ${user.id})\nCreated: ${user.createdAt.toDateString()}`
}
```

Handler signature: `(interaction: UserContextMenuCommandInteraction, user: User) => unknown`

### Message Context Menu Handler

```typescript
import type { MessageContextMenuCommandInteraction, Message } from '@robojs/discordjs'

export default async (interaction: MessageContextMenuCommandInteraction, message: Message) => {
  if (!message.content) {
    return 'This message has no text content.'
  }
  return `Bookmarked message from ${message.author.username}: "${message.content.slice(0, 100)}"`
}
```

Handler signature: `(interaction: MessageContextMenuCommandInteraction, message: Message) => unknown`

### ContextConfig

```typescript
import { createContextConfig } from '@robojs/discordjs'

export const config = createContextConfig({
  description: 'Report a user to moderators',
  defaultMemberPermissions: 'ModerateMembers',
  contexts: ['Guild'],
  integrationTypes: ['GuildInstall'],
  sage: { ephemeral: true }
})
```

| Field | Type | Description |
|-------|------|-------------|
| `description` | `string` | Internal description (not shown in Discord) |
| `contexts` | `CommandContext[]` | Where the menu appears: `'BotDM'`, `'Guild'`, `'PrivateChannel'` |
| `defaultMemberPermissions` | `string \| number \| bigint` | Required Discord permissions |
| `integrationTypes` | `CommandIntegrationType[]` | `'GuildInstall'` \| `'UserInstall'` |
| `nameLocalizations` | `Record<string, string>` | Localized display names |
| `sage` | `SageOptions \| false` | Per-menu Sage config |
| `timeout` | `number` | Execution timeout in ms |
| `disabled` | `boolean` | Disable without deleting |
| `serverOnly` | `string \| string[]` | Restrict to specific server(s) |

---

## 8. Middleware

Middleware runs **before** all command, event, and context menu handlers. Use it for logging, permission checks, rate limiting, or argument transformation.

### File Structure

```
src/middleware/
  logger.ts             -> logs all handler invocations
  permissions.ts        -> checks custom permissions
  rateLimit.ts          -> rate limiting
```

### Handler Signature

```typescript
import type { MiddlewareData, MiddlewareResult } from '@robojs/discordjs'

export default function (data: MiddlewareData): MiddlewareResult | void {
  // data.record.key   -> handler key (e.g., 'commands/ping')
  // data.record.type  -> handler type (e.g., 'commands', 'events', 'context', 'middleware')
  // data.payload      -> arguments array (first element is usually the interaction)

  console.log(`[${data.record.type}] ${data.record.key}`)
}
```

### MiddlewareData Interface

```typescript
interface MiddlewareData {
  record: {
    key: string                        // Handler key, e.g. 'commands/admin/ban'
    type: string                       // Common values: 'commands', 'events', 'context', 'middleware' (matches route directory names)
    metadata: Record<string, unknown>  // Handler metadata from config
  }
  payload: unknown[]                   // Original arguments to the handler
}
```

### Return Values

| Return | Effect |
|--------|--------|
| `void` / `undefined` | Continue to next middleware and handler |
| `{ abort: true }` | Stop execution. Handler does not run |
| `{ payload: [...] }` | Replace handler arguments with new payload |
| `{ abort: true, payload: [...] }` | Both abort and provide modified payload |

### Aborting Execution

```typescript
import type { MiddlewareData } from '@robojs/discordjs'

export default function (data: MiddlewareData) {
  const interaction = data.payload[0] as { reply?: (msg: string) => void }

  if (data.record.type === 'commands' && isBlacklisted(data.record.key)) {
    interaction.reply?.('This command is currently disabled.')
    return { abort: true }
  }
}
```

### Modifying Arguments

```typescript
import type { MiddlewareData } from '@robojs/discordjs'

export default function (data: MiddlewareData) {
  // Add a timestamp to the payload
  return {
    payload: [...data.payload, { timestamp: Date.now() }]
  }
}
```

### MiddlewareConfig

```typescript
import type { MiddlewareConfig } from '@robojs/discordjs'

export const config: MiddlewareConfig = {
  order: -10,        // Lower numbers run first (default: 0)
  enabled: true,     // Set false to disable
  description: 'Logs all handler invocations'
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `order` | `number` | `0` | Execution order. Lower runs first |
| `enabled` | `boolean` | `true` | Whether middleware is active |
| `description` | `string` | - | Description |
| `disabled` | `boolean` | `false` | Disable without deleting |

---

## 9. Sage Mode

Sage is the auto-defer system that prevents Discord's 3-second interaction timeout. When a command or context menu takes too long, Sage automatically defers the interaction so Discord shows a "thinking..." indicator.

### How It Works

1. Command is invoked.
2. Sage starts a timer (default: 2000ms).
3. If the handler returns before the timer, Sage replies directly.
4. If the timer fires first, Sage defers the interaction, then edits the reply when the handler finishes.

### SageOptions

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `defer` | `boolean` | `true` | Enable auto-deferral |
| `deferBuffer` | `number` | `2000` | Milliseconds to wait before deferring |
| `ephemeral` | `boolean` | `false` | Whether deferred/replied messages are ephemeral (only visible to user) |
| `errorReplies` | `boolean` | `true` | Whether to auto-reply with error details on failure |

### Per-Command Configuration

```typescript
export const config = createCommandConfig({
  description: 'A fast command',
  sage: {
    defer: false  // Disable auto-defer for this command (you handle replies manually)
  }
} as const)
```

```typescript
export const config = createCommandConfig({
  description: 'A secret command',
  sage: {
    ephemeral: true,     // Replies only visible to the user
    deferBuffer: 500     // Defer sooner (500ms instead of default 2000ms)
  }
} as const)
```

### Disable Sage Entirely for a Command

```typescript
export const config = createCommandConfig({
  description: 'Manual reply command',
  sage: false  // Completely disable Sage for this command
} as const)
```

### Global Configuration

Set Sage defaults for all commands in your plugin config (see section 10).

---

## 10. Plugin Configuration

Config file location: `config/plugins/robojs/discordjs.ts` (or `.mjs`)

### DiscordConfig Type

| Field | Type | Description |
|-------|------|-------------|
| `clientOptions` | `ClientOptions` | Discord.js Client options (intents, partials, presence, etc.) |
| `sage` | `SageOptions \| false` | Global Sage defaults. Set `false` to disable globally |
| `autoRegisterCommands` | `boolean \| string[]` | Auto-register commands during builds. `true` (default), `false`, or array of mode strings like `['production']` to restrict registration to specific modes |
| `testServers` | `string[]` | Guild IDs for dev-mode command registration (faster updates) |
| `defaults` | `CommandDefaults` | Default `contexts`, `integrationTypes`, `defaultMemberPermissions` for all commands |
| `timeouts` | `TimeoutConfig` | Timeout config for `autocomplete` (3000ms), `commandDeferral` (250ms), `commandRegistration` (30000ms) |

### Full Example

```typescript
import type { DiscordConfig } from '@robojs/discordjs'

export default {
  clientOptions: {
    intents: ['Guilds', 'GuildMessages', 'GuildMembers', 'MessageContent'],
    partials: ['Message', 'Channel', 'Reaction']
  },
  sage: {
    defer: true,
    deferBuffer: 3000,
    ephemeral: false,
    errorReplies: true
  },
  autoRegisterCommands: true,
  testServers: ['123456789012345678'],
  defaults: {
    contexts: ['Guild'],
    integrationTypes: ['GuildInstall']
  },
  timeouts: {
    autocomplete: 3000,
    commandDeferral: 250,
    commandRegistration: 30000
  }
} satisfies DiscordConfig
```

### Intents

Intents control which events your bot receives from Discord. Common intents:

| Intent | Required For |
|--------|-------------|
| `'Guilds'` | Guild events, channel events, role events |
| `'GuildMessages'` | Message events in guilds |
| `'GuildMembers'` | Member join/leave/update events |
| `'MessageContent'` | Reading message content (privileged) |
| `'GuildVoiceStates'` | Voice state events |
| `'GuildPresences'` | Presence/status events (privileged) |
| `'DirectMessages'` | DM events |
| `'GuildMessageReactions'` | Reaction events |

The plugin attempts to auto-infer required intents from your event handlers, but you should explicitly declare them in `clientOptions.intents` to be safe.

---

## 11. Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | Yes | Bot token from Discord Developer Portal |
| `DISCORD_CLIENT_ID` | Yes | Application client ID |
| `DISCORD_CLIENT_SECRET` | No | OAuth2 client secret (for activities/web features) |
| `DISCORD_GUILD_ID` | No | Dev server for testing (used with `testServers`) |
| `DISCORD_FORCE_REGISTER` | No | Set to `true` to force re-register commands on next start |

Place these in a `.env` file at your project root:

```env
DISCORD_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-client-id
```

---

## 12. Key Imports

### From `@robojs/discordjs`

| Import | Purpose |
|--------|---------|
| `createCommandConfig` | Type-safe command config helper |
| `createContextConfig` | Type-safe context menu config helper |
| `CommandConfig` | Command configuration type |
| `CommandOptions` | Infer typed options from config (`CommandOptions<typeof config>`) |
| `CommandResult` | Command return type |
| `ContextConfig` | Context menu configuration type |
| `ContextType` | Context type enum (`ContextType.User`, `ContextType.Message`) |
| `EventConfig` | Event configuration type |
| `MiddlewareConfig` | Middleware configuration type |
| `MiddlewareData` | Middleware handler argument type |
| `MiddlewareResult` | Middleware return type |
| `SageOptions` | Sage auto-defer configuration type |
| `DiscordConfig` | Plugin configuration type |
| `BaseConfig` | Base config shared by all handler types |
| `getClient` | Get the Discord.js Client instance (throws if not initialized) |
| `hasClient` | Check if the client is initialized (returns boolean) |
| `commands` | Namespace controller: `commands.list()`, `commands.get(name)`, `commands.execute(name, interaction)` |
| `events` | Namespace controller: `events.list()`, `events.get(name)` (returns `Promise<EventHandler[]>`, an array since multiple handlers can exist per event), `events.emit(name, ...args)` |
| `context` | Namespace controller: `context.list()`, `context.get(name)` |
| `middleware` | Namespace controller: `middleware.list()`, `middleware.chain()` |
| `discordLogger` | Plugin logger instance (forked as `'discordjs'`) |

### Re-exported Discord.js Types

These are re-exported from `@robojs/discordjs` for convenience so you do not need to install `discord.js` as a direct dependency:

| Type |
|------|
| `AutocompleteInteraction` |
| `ChatInputCommandInteraction` |
| `Client` |
| `ClientEvents` |
| `ClientOptions` |
| `ContextMenuCommandInteraction` |
| `Guild` |
| `GuildMember` |
| `Interaction` |
| `Message` |
| `MessageContextMenuCommandInteraction` |
| `Role` |
| `TextChannel` |
| `User` |
| `UserContextMenuCommandInteraction` |
| `VoiceChannel` |

### From `robo.js`

| Import | Purpose |
|--------|---------|
| `Flashcore` | Persistent key-value storage |
| `logger` | Framework logger (use `discordLogger` from `@robojs/discordjs` in plugin code instead) |
| `setState` / `getState` | State management across restarts |

---

## 13. Common Mistakes

| Mistake | Fix |
|---------|-----|
| Lifecycle events in `src/events/_start.ts` | Use `src/robo/start.ts` hook instead. Lifecycle hooks go in `src/robo/`, not `src/events/` |
| Missing `as const` on config | Add `as const` after the config object for maximum `CommandOptions` type inference (literal names, choice unions, required vs optional) |
| Importing `client` directly | Use `getClient()` from `@robojs/discordjs`. There is no direct `client` export |
| Nesting commands deeper than 3 levels | Discord limits to 3 levels: command / group / subcommand. `a/b/c/d.ts` will not work |
| Using `interaction.reply()` AND returning a string | Pick one: return a string for auto-reply OR call `interaction.reply()` manually (not both) |
| Event handler not receiving args | Ensure you export a default function. Args match the Discord.js event signature exactly |
| Context menu in wrong directory | User context = `src/context/user/`, Message context = `src/context/message/`. Swapping them causes type errors |
| Importing from `discord.js` directly | Prefer importing from `@robojs/discordjs` which re-exports common Discord.js types |
| Using `choices` and `autocomplete` together | They are mutually exclusive. Use `choices` for static options, `autocomplete` for dynamic |
| Forgetting required intents | Events like `messageCreate` need `GuildMessages` + `MessageContent` intents in plugin config |
| Sage deferring when not wanted | Set `sage: false` in config to disable, or `sage: { defer: false }` to keep error handling |
| Middleware returning wrong shape | Return `{ abort: true }` (object), not just `true`. Return `{ payload: [...] }` to modify args |
| Forgetting `await` on async Discord operations | Ensure `ban()`, `kick()`, `send()` etc. are awaited -- command may return before the action completes otherwise |

---

## 14. Complete Examples

### Command with Typed Options and Autocomplete

File: `src/commands/tag.ts`

```typescript
import { createCommandConfig, type CommandOptions } from '@robojs/discordjs'
import type { AutocompleteInteraction, ChatInputCommandInteraction } from '@robojs/discordjs'
import { Flashcore } from 'robo.js'

export const config = createCommandConfig({
  description: 'Manage and display server tags',
  options: [
    {
      name: 'action',
      type: 'string',
      description: 'What to do',
      required: true,
      choices: [
        { name: 'Get', value: 'get' },
        { name: 'Set', value: 'set' },
        { name: 'Delete', value: 'delete' }
      ]
    },
    {
      name: 'name',
      type: 'string',
      description: 'Tag name',
      required: true,
      autocomplete: true
    },
    {
      name: 'content',
      type: 'string',
      description: 'Tag content (for set action)'
    }
  ]
} as const)

export async function autocomplete(interaction: AutocompleteInteraction) {
  const focused = interaction.options.getFocused()
  const guildId = interaction.guildId ?? 'global'
  const tags = await Flashcore.get<Record<string, string>>(`tags:${guildId}`) ?? {}

  return Object.keys(tags)
    .filter((tag) => tag.toLowerCase().includes(focused.toLowerCase()))
    .slice(0, 25)
    .map((tag) => ({ name: tag, value: tag }))
}

export default async (interaction: ChatInputCommandInteraction, options: CommandOptions<typeof config>) => {
  const guildId = interaction.guildId ?? 'global'
  const tags = await Flashcore.get<Record<string, string>>(`tags:${guildId}`) ?? {}

  switch (options.action) {
    case 'get': {
      const content = tags[options.name]
      if (!content) return `Tag \`${options.name}\` not found.`
      return content
    }
    case 'set': {
      if (!options.content) return 'You must provide content when setting a tag.'
      tags[options.name] = options.content
      await Flashcore.set(`tags:${guildId}`, tags)
      return `Tag \`${options.name}\` saved.`
    }
    case 'delete': {
      if (!(options.name in tags)) return `Tag \`${options.name}\` not found.`
      delete tags[options.name]
      await Flashcore.set(`tags:${guildId}`, tags)
      return `Tag \`${options.name}\` deleted.`
    }
  }
}
```

### Event Handler with Config

File: `src/events/guildMemberAdd.ts`

```typescript
import type { EventConfig } from '@robojs/discordjs'
import type { GuildMember, TextChannel } from '@robojs/discordjs'

export const config: EventConfig = {
  description: 'Welcome new members to the server',
  priority: 0
}

export default async (member: GuildMember) => {
  const channel = member.guild.channels.cache.find(
    (ch) => ch.name === 'welcome'
  ) as TextChannel | undefined

  if (!channel) return

  await channel.send({
    content: `Welcome to the server, ${member}! You are member #${member.guild.memberCount}.`,
    allowedMentions: { users: [member.id] }
  })
}
```

### User Context Menu

File: `src/context/user/Whois.ts`

```typescript
import { createContextConfig } from '@robojs/discordjs'
import type { UserContextMenuCommandInteraction, User } from '@robojs/discordjs'

export const config = createContextConfig({
  description: 'Show detailed user information',
  contexts: ['Guild']
})

export default async (interaction: UserContextMenuCommandInteraction, user: User) => {
  const member = await interaction.guild?.members.fetch(user.id)
  const roles = member?.roles.cache
    .filter((r) => r.id !== interaction.guildId)
    .map((r) => r.name)
    .join(', ') || 'None'

  return {
    embeds: [{
      title: user.username,
      thumbnail: { url: user.displayAvatarURL() },
      fields: [
        { name: 'ID', value: user.id, inline: true },
        { name: 'Joined Server', value: member?.joinedAt?.toDateString() ?? 'Unknown', inline: true },
        { name: 'Account Created', value: user.createdAt.toDateString(), inline: true },
        { name: 'Roles', value: roles }
      ]
    }]
  }
}
```

### Message Context Menu

File: `src/context/message/Pin.ts`

```typescript
import { createContextConfig } from '@robojs/discordjs'
import type { MessageContextMenuCommandInteraction, Message } from '@robojs/discordjs'

export const config = createContextConfig({
  description: 'Pin or unpin a message',
  defaultMemberPermissions: 'ManageMessages',
  contexts: ['Guild'],
  sage: { ephemeral: true }
})

export default async (interaction: MessageContextMenuCommandInteraction, message: Message) => {
  if (message.pinned) {
    await message.unpin()
    return 'Message unpinned.'
  }

  await message.pin()
  return 'Message pinned!'
}
```

### Middleware: Command Logger

File: `src/middleware/logger.ts`

```typescript
import type { MiddlewareConfig, MiddlewareData } from '@robojs/discordjs'

export const config: MiddlewareConfig = {
  order: -100,
  description: 'Logs all handler invocations'
}

export default function (data: MiddlewareData) {
  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] [${data.record.type}] ${data.record.key}`)
}
```

### Middleware: Guild-Only Gate

File: `src/middleware/guildOnly.ts`

```typescript
import type { MiddlewareData } from '@robojs/discordjs'
import type { Interaction } from '@robojs/discordjs'

export default function (data: MiddlewareData) {
  if (data.record.type !== 'commands') return

  const interaction = data.payload[0] as Interaction
  if (!interaction.inGuild()) {
    if ('reply' in interaction && typeof interaction.reply === 'function') {
      interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true })
    }
    return { abort: true }
  }
}
```

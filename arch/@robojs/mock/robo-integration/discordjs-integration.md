# Discord.js Integration

## Overview

@robojs/mock integrates with Discord.js (via @robojs/discordjs) through token swapping, REST API redirection, and runtime command registration. This enables Discord.js to connect to the mock server without code changes.

## Token Swap Mechanism

### Token Formats

**File:** `src/utils/id.ts`

Two token formats are supported:

**Format 1: Discord-Like**
```
<24 chars>.<6 chars MOCK>.<27+ chars session>
Example: MzAwMDAwMDAwMDAwMDAwMDAw.TU9DSw.c2Vzc19ZZUFBYWFBYWFHQUFBQ
```

**Format 2: Simple Prefix**
```
mock:sess_<session_id>
Example: mock:sess_ABC123XYZ
```

### Token Generation

```typescript
function createMockToken(sessionId: string): string {
  const fakeBotId = '000000000000000000'
  const part1 = Buffer.from(fakeBotId).toString('base64').replace(/=+$/, '')
  const part2 = 'TU9DSw'  // Base64 of 'MOCK'
  const sessionEncoded = Buffer.from(sessionId).toString('base64url')
  const part3 = sessionEncoded.padEnd(27, '_')
  return `${part1}.${part2}.${part3}`
}
```

**MOCK Marker:** `TU9DSw` (6 chars) is base64("MOCK"), differentiating mock from real tokens.

### Token Parsing

**File:** `src/utils/id.ts` (lines 76-109)

```typescript
export function parseMockToken(token: string): string | null {
  // Step 1: Remove "Bot " prefix (Discord.js REST adds this)
  let normalized = token.replace(/^Bot\s+/i, '').trim()

  // Step 2: Remove "mock:" prefix if present
  if (normalized.startsWith('mock:')) {
    normalized = normalized.slice(5)
  }

  // Step 3: Check Discord-like format
  const parts = normalized.split('.')
  if (parts.length === 3 && parts[1] === 'TU9DSw') {
    const sessionPart = parts[2].replace(/[_/]+$/, '')
    return Buffer.from(sessionPart, 'base64url').toString('utf-8')
  }

  // Step 4: Fallback to plain session ID
  if (normalized.startsWith('sess_')) {
    return normalized
  }

  return null
}
```

### Token Environment Flow

```
CLI Extension (dev.ts)
    │
    ├─► DISCORD_TOKEN = mock:sess_xxx
    │
    ▼
@robojs/discordjs prepare hook
    │
    ├─► Creates Client with DISCORD_TOKEN
    │
    ▼
@robojs/discordjs start hook
    │
    ├─► client.login(process.env.DISCORD_TOKEN)
    │
    ▼
Mock Gateway
    │
    ├─► parseMockToken(token) extracts session ID
    └─► Routes connection to correct session
```

## REST API Redirection

### Environment Variable

**`DISCORD_REST_API`** redirects all Discord.js REST calls to mock server.

### CLI Extension Setup

**File:** `src/robo/cli/extend/dev.ts`

**Embedded Mode (lines 125):**
```typescript
const port = getServerPort()
const prefix = getMockPluginPrefix()
process.env.DISCORD_REST_API = `http://localhost:${port}${prefix}/api`
```

**External Mode (lines 200):**
```typescript
process.env.DISCORD_REST_API = `${baseUrl}${prefix}/api`
```

### Discord.js Client Configuration

**File:** `@robojs/discordjs/src/robo/prepare.ts` (lines 29-37)

```typescript
if (process.env.DISCORD_REST_API) {
  clientOptions.rest = {
    ...clientOptions.rest,
    api: process.env.DISCORD_REST_API
  }
}

const client = new Client(clientOptions)
```

### REST Instance Creation

**File:** `@robojs/discordjs/src/core/commands.ts` (lines 761-765)

```typescript
export function createConfiguredRest(token: string): REST {
  const options: { version: '10'; api?: string } = { version: '10' }
  if (process.env.DISCORD_REST_API) {
    options.api = process.env.DISCORD_REST_API
  }
  return new REST(options).setToken(token)
}
```

**Effect:** All REST calls go to `/mock/api/v10/*` instead of Discord's servers.

## Bot User Resolution

### Resolution Chain

**File:** `src/robo/start.ts` (lines 119-130)

```typescript
const resolvedBotUser = await resolveBotUser(
  config.defaultSessionConfig?.botUser
)
```

**Three-Tier Chain:**

| Priority | Source | Condition |
|----------|--------|-----------|
| 1 | explicit | `defaultSessionConfig.botUser` provided |
| 2 | discord-api | `ROBO_MOCK_REAL_TOKEN` set, fetch actual bot |
| 3 | default | Create "MockBot" user |

### Bot User Resolver

**File:** `src/utils/bot-user-resolver.ts`

```typescript
interface ResolvedBotUser {
  config: MockUserInit
  source: 'explicit' | 'discord-api' | 'default'
}

async function resolveBotUser(configUser?: MockUserInit): Promise<ResolvedBotUser>
```

## Gateway Connection Flow

### Connection Sequence

```
1. Discord.js calls client.login(DISCORD_TOKEN)
2. Client opens WebSocket to localhost:3000/?v=10&encoding=json
3. Gateway sends HELLO with heartbeat interval
4. Client sends IDENTIFY with mock token
5. Gateway extracts session ID via parseMockToken()
6. Gateway validates session exists and not expired
7. Gateway validates privileged intents (if enforceIntents enabled)
8. Gateway sends READY with guilds, user, session_id
9. Client enters heartbeat loop
```

### Gateway Validation

**File:** `src/core/gateway.ts` (lines 89-114)

```typescript
// API version validation
const version = url.searchParams.get('v')
if (version !== '10') {
  socket.destroy()  // Reject non-v10
}

// Encoding validation
const encoding = url.searchParams.get('encoding')
if (encoding && encoding !== 'json') {
  socket.destroy()  // Only JSON supported
}

// Privileged intent validation
if (session.config?.enforceIntents) {
  const approvedPrivileged = session.config.approvedPrivilegedIntents
  if (!hasApprovedPrivilegedIntents(data.intents, approvedPrivileged)) {
    ws.close(4014, 'Disallowed intents')
  }
}
```

## Command Registration

### Two-Stage Process

**Stage 1: Build Time (Skipped in Mock Mode)**

**File:** `@robojs/discordjs/src/robo/build/complete.ts` (lines 136-140)

```typescript
if (process.env.ROBO_MOCK_MODE === 'true') {
  discordLogger.debug('Mock mode - deferring registration to start hook')
  return  // Skip build-time registration
}
```

**Stage 2: Runtime**

**File:** `@robojs/discordjs/src/robo/start.ts` (lines 46-53)

```typescript
if (process.env.ROBO_MOCK_MODE === 'true') {
  const { registerCommandsAtRuntime } = await import('../core/commands.js')
  await registerCommandsAtRuntime({ force: false })
}
```

### Runtime Registration Flow

**File:** `@robojs/discordjs/src/core/commands.ts` (lines 851-907)

```typescript
export async function registerCommandsAtRuntime(options?: RuntimeRegistrationOptions) {
  const clientId = process.env.DISCORD_CLIENT_ID
  const token = process.env.DISCORD_TOKEN

  // Build commands from portal
  const slashCommands = buildSlashCommands(commands, config, true)
  const userContextCommands = buildContextCommands(userContext, 'user', config, true)
  const messageContextCommands = buildContextCommands(messageContext, 'message', config, true)

  const commandData = [
    ...slashCommands.map((cmd) => cmd.toJSON()),
    ...userContextCommands.map((cmd) => cmd.toJSON()),
    ...messageContextCommands.map((cmd) => cmd.toJSON())
  ]

  // Create REST configured with mock API URL
  const rest = createConfiguredRest(token)

  // PUT to mock server
  await registerCommandsToDiscord(rest, clientId, guildId, commandData, force)
}
```

**Mock Server Storage:** Commands stored in session's `MockServerState.commands` Map.

## Intent Validation

### Event-to-Intent Mapping

**File:** `src/core/intents.ts` (lines 1-210)

```typescript
export const EVENT_INTENTS: Record<string, number | null> = {
  READY: null,                  // Always sent
  INTERACTION_CREATE: null,     // Always sent
  MESSAGE_CREATE: GatewayIntentBits.GuildMessages,
  GUILD_MEMBER_ADD: GatewayIntentBits.GuildMembers,
  PRESENCE_UPDATE: GatewayIntentBits.GuildPresences,
  // ... 27 more events
}
```

### Dispatch Filtering

```typescript
export function shouldDispatchEvent(
  eventName: string,
  eventData: unknown,
  connectionIntents: number
): boolean {
  const requiredIntent = EVENT_INTENTS[eventName]

  if (requiredIntent === null) return true
  if (requiredIntent === undefined) return true

  return (connectionIntents & requiredIntent) !== 0
}
```

### MESSAGE_CONTENT Stripping

**File:** `src/core/intents.ts` (lines 225-258)

```typescript
export function stripMessageContent<T>(
  message: T,
  connectionIntents: number,
  botId: string
): T {
  const hasMessageContent = (connectionIntents & GatewayIntentBits.MessageContent) !== 0
  if (hasMessageContent) return message

  // Exempt: DM, from bot, or mentions bot
  const isDM = !message.guild_id
  const isFromBot = message.author?.id === botId
  const mentionsBot = message.mentions?.some((u) => u.id === botId)

  if (isDM || isFromBot || mentionsBot) return message

  return {
    ...message,
    content: '',
    embeds: [],
    attachments: [],
    components: [],
    poll: undefined
  }
}
```

## ROBO_MOCK_MODE Behavior Changes

### Lifecycle Hook Prioritization

**File:** `src/robo/init.ts` (lines 107-114)

```typescript
if (!connectingToExisting) {
  prioritizeHookBefore('start', '@robojs/server', '@robojs/discordjs')
  prioritizeHookBefore('start', '@robojs/mock', '@robojs/discordjs')
}
```

### Deferred Handler Loading

**File:** `@robojs/discordjs/src/robo/prepare.ts` (lines 55-60)

```typescript
if (!Mode.isDev() && process.env.ROBO_MOCK_MODE !== 'true') {
  await eagerLoadHandlers()
}
// In mock mode, handlers are loaded on-demand (Jest ESM compatibility)
```

### Environment Override

**File:** `src/robo/start.ts` (lines 139-149)

```typescript
// Override DISCORD_TOKEN with mock session token
process.env.DISCORD_TOKEN = mockModeSession.token

// Override DISCORD_CLIENT_ID to match session
process.env.DISCORD_CLIENT_ID = mockModeSession.state.applicationId
```

## Complete Integration Sequence

### Embedded Mode

```
1. CLI Extension (dev.ts)
   • Generate session ID: sess_<random>
   • Create mock token
   • Set ROBO_MOCK_MODE=true
   • Set DISCORD_TOKEN=<mock_token>
   • Set DISCORD_REST_API=http://localhost:3000/mock/api

2. Init Hook (@robojs/mock)
   • Detect ROBO_MOCK_MODE=true
   • Prioritize hook execution order

3. Prepare Hook (@robojs/mock)
   • Register WebSocket handlers

4. Prepare Hook (@robojs/discordjs)
   • Create Client with REST API override

5. Start Hook (@robojs/server)
   • Start listening on port 3000

6. Start Hook (@robojs/mock)
   • Create session
   • Override DISCORD_TOKEN and DISCORD_CLIENT_ID
   • Install log drain

7. Start Hook (@robojs/discordjs)
   • client.login(DISCORD_TOKEN)
   • Connect to ws://localhost:3000/?v=10
   • Send IDENTIFY with mock token
   • Receive READY
   • Register commands via REST

8. Runtime
   • Gateway events filtered by intents
   • REST calls go to mock server
   • Actions recorded for debugging
```

### External Mode

```
1. CLI Extension
   • Parse session ID from argument
   • Set DISCORD_REST_API to external server
   • Set __ROBO_MOCK_CONNECT_EXISTING=true

2. Init Hook
   • Skip hook prioritization

3. Prepare Hook (@robojs/mock)
   • Skip WebSocket registration

4. Start Hook (@robojs/discordjs)
   • Connect to external mock gateway
   • Register commands to external server
```

## Key Files

| Component | Path |
|-----------|------|
| Token Utilities | `src/utils/id.ts` |
| Gateway Server | `src/core/gateway.ts` |
| Intent Handling | `src/core/intents.ts` |
| Bot User Resolver | `src/utils/bot-user-resolver.ts` |
| CLI Extension | `src/robo/cli/extend/dev.ts` |
| Discord.js Prepare | `@robojs/discordjs/src/robo/prepare.ts` |
| Discord.js Start | `@robojs/discordjs/src/robo/start.ts` |
| Command Registration | `@robojs/discordjs/src/core/commands.ts` |

## Design Insights

1. **Token as Router:** Session ID encoded in token enables stateless routing.

2. **Environment Bridging:** DISCORD_REST_API and DISCORD_TOKEN set by CLI before Robo.start().

3. **Hook Ordering Critical:** Server must listen before Discord.js connects.

4. **Deferred Registration:** Build-time command registration skipped because session ID unknown until runtime.

5. **Intent Filtering Per-Connection:** Each Gateway connection has its own intent set.

6. **MESSAGE_CONTENT Exemptions:** Content stripping respects DMs, bot's messages, and mentions to bot.

7. **Stateless REST:** Authorization header contains session ID for request routing.

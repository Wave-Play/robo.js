# Session Management

## Overview

Sessions provide isolated test environments. Each session has independent state, connections, and recording.

## Session Class

**File:** `src/session/session.ts`

### Properties

```typescript
class Session {
  readonly id: string                           // Unique session ID (sess_xxx)
  readonly token: string                        // Full token (mock:sess_xxx)
  readonly name?: string                        // Display name
  readonly createdAt: number                    // Unix timestamp
  readonly expiresAt: number                    // TTL expiration
  readonly state: MockServerState               // Entity storage
  readonly connections: Map<string, ConnectionState>  // Gateway connections
  readonly voiceServers: Map<string, VoiceServerState>  // Voice per guild
  readonly recorder: ActionRecorder             // Action recording
  readonly logRecorder: LogRecorder             // Log recording

  // Configuration
  heartbeatInterval: number | null              // Custom interval
  loopProtectionEnabled: boolean                // Circuit breaker
  enforceIntents: boolean                       // Privileged intent check
  approvedPrivilegedIntents: bigint             // Approved intents
  permissionEnforcementLevel: PermissionEnforcementLevel
}
```

### Key Methods

```typescript
// Event dispatch
dispatch(event: string, data: unknown, options?: DispatchOptions): void

// Bot user resolution
getBotUser(): MockUser
setBotUser(user: MockUser): void

// Recording
recordAction(action: RecordedAction): void
recordLog(entry: SessionLogEntry): void

// Loop protection
isLoopDetected(): boolean
resetLoopDetection(): void

// Rate limiting
setRateLimitSimulation(enabled: boolean, options?: RateLimitOptions): void
checkRateLimit(endpoint: string): Response | null
```

## MockServerState

**File:** `src/session/state.ts`

Centralized entity storage using Maps.

### Entity Maps

```typescript
class MockServerState {
  // Core entities
  guilds: Map<Snowflake, MockGuild>
  channels: Map<Snowflake, MockChannel>
  dmChannels: Map<Snowflake, MockChannel>
  users: Map<Snowflake, MockUser>
  messages: Map<Snowflake, MockMessage>
  roles: Map<Snowflake, MockRole>

  // Composite key maps (guildId:userId, etc.)
  guildMembers: Map<string, MockGuildMember>
  voiceStates: Map<string, MockVoiceState>
  bans: Map<string, MockBan>

  // Nested maps
  threadMembers: Map<Snowflake, Map<Snowflake, MockThreadMember>>
  pollVotes: Map<Snowflake, Map<Snowflake, number[]>>
  auditLogs: Map<string, MockAuditLogEntry[]>

  // Other entities
  interactions: Map<Snowflake, MockInteraction>
  webhooks: Map<Snowflake, MockWebhook>
  emojis: Map<Snowflake, MockEmoji>
  stickers: Map<Snowflake, MockSticker>
  scheduledEvents: Map<string, MockScheduledEvent>
  autoModRules: Map<string, MockAutoModRule>
  commandPermissions: Map<string, MockCommandPermission[]>
  stageInstances: Map<Snowflake, MockStageInstance>
  applicationEmojis: Map<Snowflake, MockEmoji>

  // Bot identity
  botUser: MockUser
  applicationId: Snowflake

  // Attachment storage (pluggable)
  attachmentStorage: AttachmentStorage

  // Sequence tracking
  sequence: number
}
```

### Factory Methods

```typescript
// Entity creation
createMockUser(config?: MockUserConfig): MockUser
createMockGuild(config?: MockGuildConfig): MockGuild
createMockChannel(config?: MockChannelConfig): MockChannel
createMockRole(config?: MockRoleConfig): MockRole
createMockMessage(options: MessageCreateOptions): MockMessage
createMockGuildMember(config?: MockGuildMemberConfig): MockGuildMember

// Convenience factory
createDefaultGuildWithChannel(guildName: string, channelName: string): {
  guild: MockGuild
  channel: MockChannel
}
```

### State Helpers

```typescript
// Lookup
getGuild(guildId: Snowflake): MockGuild | undefined
getChannel(channelId: Snowflake): MockChannel | undefined
getMessage(messageId: Snowflake): MockMessage | undefined
getUser(userId: Snowflake): MockUser | undefined
getGuildMember(guildId: Snowflake, userId: Snowflake): MockGuildMember | undefined

// Mutation
addGuild(guild: MockGuild): void
addChannelToGuild(guildId: Snowflake, channel: MockChannel): void
updateMessage(messageId: Snowflake, updates: Partial<MockMessage>): void
deleteMessage(messageId: Snowflake): boolean
```

## ConnectionState

Per-gateway connection tracking.

```typescript
interface ConnectionState {
  id: string                    // Connection ID (gateway session)
  sessionId: string             // Mock session ID
  identified: boolean           // IDENTIFY received
  token: string | null          // Bot token
  realToken: string | null      // Original token before parsing
  intents: number               // Declared intents bitfield
  sequence: number              // Last sent sequence
  lastAckSequence: number | null // Last acknowledged
  lastHeartbeat: number         // Timestamp of last heartbeat
  heartbeatInterval: number     // Interval for this connection
  missedHeartbeats: number      // Missed ACK count
  botUser?: MockUser            // Connection-specific bot user
}
```

## Action Recording

**File:** `src/session/recorder.ts`

### ActionRecorder Class

```typescript
class ActionRecorder implements IActionRecorder {
  private actions: RecordedAction[] = []
  private maxActions: number = 10000
  private idCounter = 0

  record(action: Omit<RecordedAction, 'id'>): RecordedAction
  getAll(): RecordedAction[]
  getSince(timestamp: number): RecordedAction[]
  getByType(type: ActionType): RecordedAction[]
  getByTypes(types: ActionType[]): RecordedAction[]
  clear(): void
}
```

### LRU Eviction

When actions exceed `maxActions`:
1. Calculate 10% of capacity
2. Remove oldest 10% of actions
3. New actions continue to record

**Default:** 10,000 actions max

### Action Types (~68 types)

```typescript
type ActionType =
  // Gateway actions
  | 'gateway_identify'
  | 'gateway_heartbeat'
  | 'gateway_presence_update'
  | 'gateway_voice_state_update'
  | 'gateway_resume'
  | 'gateway_request_guild_members'
  | 'gateway_message'

  // REST actions (categorized by resource)
  | 'REST_CREATE_MESSAGE'
  | 'REST_EDIT_MESSAGE'
  | 'REST_DELETE_MESSAGE'
  | 'REST_GET_CHANNEL'
  | 'REST_CREATE_CHANNEL'
  | 'REST_EDIT_CHANNEL'
  | 'REST_DELETE_CHANNEL'
  | 'REST_GET_GUILD'
  | 'REST_GET_GUILD_MEMBER'
  | 'REST_ADD_GUILD_MEMBER_ROLE'
  | 'REST_REMOVE_GUILD_MEMBER_ROLE'
  | 'REST_BAN_MEMBER'
  | 'REST_UNBAN_MEMBER'
  | 'REST_KICK_MEMBER'
  | 'REST_CREATE_ROLE'
  | 'REST_EDIT_ROLE'
  | 'REST_DELETE_ROLE'
  | 'REST_CREATE_REACTION'
  | 'REST_DELETE_REACTION'
  | 'REST_CREATE_WEBHOOK'
  | 'REST_EXECUTE_WEBHOOK'
  // ... and 40+ more REST action types

  // Event dispatch
  | 'dispatch'

  // Interaction handling
  | 'interaction_response'
  | 'interaction_followup'
  | 'interaction_edit'
  | 'interaction_delete'
```

### RecordedAction Structure

```typescript
interface RecordedAction {
  id: string                    // Unique action ID (act_{counter})
  timestamp: number             // Unix ms
  type: ActionType              // Action classification
  data: unknown                 // Action payload
  request?: {                   // REST request details (if applicable)
    method: string
    path: string
    body?: unknown
  }
  response?: {                  // REST response details (if applicable)
    status: number
    body?: unknown
  }
}
```

## TTL and Cleanup

### Session TTL

**Default:** 1 hour (3,600,000 ms)
**Configurable:** Via `CreateSessionOptions.ttl`

### Cleanup Process

SessionManager runs cleanup every 60 seconds:

```typescript
private cleanupExpired(): void {
  const now = Date.now()
  for (const [id, session] of this.sessions) {
    if (session.expiresAt <= now) {
      this.delete(id)
    }
  }
}
```

## Multi-Session Isolation

Each session is completely independent:

| Aspect | Isolation Level |
|--------|-----------------|
| State | Separate MockServerState instance |
| Connections | Separate connection map |
| Actions | Separate ActionRecorder |
| Logs | Separate LogRecorder |
| Voice | Separate voice server map |
| Bot User | Can differ per session |
| Intents | Per-session enforcement config |
| Permissions | Per-session enforcement level |

**Parallel testing:** Multiple tests can run simultaneously using different sessions without interference.

## Bot User Resolution

**File:** `src/utils/bot-user-resolver.ts`

Three-tier fallback chain:

```
1. Explicit config (pluginConfig.defaultSessionConfig.botUser)
   ↓ if not provided
2. Fetch from Discord API (using ROBO_MOCK_REAL_TOKEN)
   ↓ if fails or no token
3. Default MockBot user:
   {
     id: generated snowflake,
     username: "MockBot",
     discriminator: "0000",
     bot: true
   }
```

### Resolution Function

```typescript
async function resolveBotUser(
  explicitConfig?: MockUserConfig
): Promise<ResolvedBotUser> {
  // Returns { config: MockUserConfig, source: 'explicit' | 'discord-api' | 'default' }
}
```

## Session Configuration

```typescript
interface SessionConfig {
  botUser?: MockUserConfig              // Bot identity
  applicationId?: Snowflake             // App ID
  guilds?: MockGuildConfig[]            // Pre-seeded guilds
  users?: MockUserConfig[]              // Pre-seeded users
  enforceIntents?: boolean              // Check privileged intents
  approvedPrivilegedIntents?: bigint    // Allowed privileged intents
  maxActions?: number                   // Recording limit
}

interface CreateSessionOptions {
  id?: string                           // Specific ID (or generated)
  name?: string                         // Display name
  ttl?: number                          // Time-to-live in ms
  config?: SessionConfig                // Initial state config
}
```

## Key Files

| Purpose | Path |
|---------|------|
| Session Class | `src/session/session.ts` |
| State Management | `src/session/state.ts` |
| Session Manager | `src/core/manager.ts` |
| Action Recorder | `src/session/recorder.ts` |
| Log Recorder | `src/session/log-recorder.ts` |
| Bot User Resolver | `src/utils/bot-user-resolver.ts` |
| Storage Interface | `src/session/storage.ts` |

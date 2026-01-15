# Type System

## Overview

Comprehensive TypeScript type system with 200+ type definitions across 4 files, supporting Discord API v10 emulation, session management, and Stage UI protocol.

## File Structure

```
src/types/
├── index.ts     # Main type hub (~3,800 lines)
├── stage.ts     # Stage UI WebSocket protocol (~694 lines)
├── plugin.ts    # Plugin configuration (~72 lines)
└── css.d.ts     # CSS module declarations (~13 lines)
```

## Core Session Types

### Session Interface

```typescript
interface Session {
  id: string
  token: string                              // "mock:sess_xxx" format
  name?: string
  createdAt: number
  expiresAt: number
  state: SessionState                        // Centralized entity storage
  connections: Map<string, ConnectionState>  // WebSocket connections
  config?: SessionConfig
  readonly isExpired: boolean
  readonly isEnding: boolean
  readonly recorder: IActionRecorder

  // Methods
  dispatch(event: string, data: unknown): Promise<void>
  recordAction(type: ActionType, data: unknown, options?: RecordActionOptions): RecordedAction
  getActions(): RecordedAction[]
  getActionsSince(timestamp: number): RecordedAction[]
  reset(): void
}
```

### SessionConfig

```typescript
interface SessionConfig {
  guilds?: MockGuildConfig[]
  users?: MockUserConfig[]
  botUser?: MockUserConfig
  applicationId?: Snowflake
  commands?: MockApplicationCommandConfig[]
  maxActions?: number                     // Default: 10,000 (LRU eviction)
  maxLogs?: number                        // Default: 10,000 (LRU eviction)
  enforceIntents?: boolean                // Filter by intents
  approvedPrivilegedIntents?: bigint      // GuildMembers, GuildPresences, MessageContent
  permissionEnforcement?: 'none' | 'basic' | 'strict'
}
```

### CreateSessionOptions

```typescript
interface CreateSessionOptions {
  id?: string
  name?: string
  ttl?: number
  config?: SessionConfig
  token?: string                          // Auto-generated if not provided
}
```

### ConnectionState

```typescript
interface ConnectionState {
  id: string
  sessionId: string
  identified: boolean
  token: string | null
  intents: number
  sequence: number
  lastAckSequence: number | null
  lastHeartbeat: number
  heartbeatInterval: number
  missedHeartbeats: number
  botUser?: MockUser                      // Per-connection bot identity
  realToken?: string                      // For Discord API token resolution
}
```

## Mock Entity Types

### Core Entities

```typescript
// Guild
interface MockGuild {
  id: Snowflake
  name: string
  ownerId: Snowflake
  channels: Snowflake[]
  members: Snowflake[]
  roles: Snowflake[]
  emojis: Snowflake[]
  stickers: Snowflake[]
  icon?: string | null
  banner?: string | null
  verificationLevel?: number
  premiumTier?: number
  features?: string[]
  preferredLocale?: string
  welcomeScreen?: MockWelcomeScreen
}

// Channel
interface MockChannel {
  id: Snowflake
  guildId?: Snowflake
  name: string
  type: number                            // 0=TEXT, 1=DM, 2=VOICE, etc.
  position?: number
  parentId?: Snowflake | null
  permissionOverwrites?: MockChannelOverwrite[]
  topic?: string | null
  nsfw?: boolean
}

// Message
interface MockMessage {
  id: Snowflake
  channelId: Snowflake
  guildId?: Snowflake
  authorId: Snowflake
  content: string
  timestamp: string
  editedTimestamp: string | null
  mentions: Snowflake[]
  attachments: MockAttachment[]
  embeds: unknown[]
  reactions?: MockReaction[]
  components?: unknown[]
  poll?: MockPoll
}

// User
interface MockUser {
  id: Snowflake
  username: string
  discriminator: string
  globalName: string | null
  avatar: string | null
  bot: boolean
  status?: 'online' | 'offline' | 'idle' | 'dnd'
}

// Role
interface MockRole {
  id: Snowflake
  guildId: Snowflake
  name: string
  color: number
  hoist: boolean
  position: number
  permissions: string                     // Bitfield as string
  managed: boolean
  mentionable: boolean
}

// Guild Member
interface MockGuildMember {
  userId: Snowflake
  guildId: Snowflake
  roles: Snowflake[]
  nick?: string | null
  joinedAt: string
  deaf: boolean
  mute: boolean
  pending: boolean
  communicationDisabledUntil?: string | null
}
```

### Advanced Entities

```typescript
// Thread
interface MockThread extends MockChannel {
  type: 10 | 11 | 12                      // Thread types
  parentId: Snowflake
  ownerId: Snowflake
  threadMetadata: MockThreadMetadata
  memberCount: number
  messageCount: number
}

// Forum Channel
interface MockForumChannel extends MockChannel {
  type: 15 | 16
  available_tags: MockForumTag[]
  default_forum_layout?: ForumLayoutType
}

// Voice State
interface MockVoiceState {
  guild_id: Snowflake
  channel_id: Snowflake | null
  user_id: Snowflake
  session_id?: string
  deaf?: boolean
  mute?: boolean
  self_deaf?: boolean
  self_mute?: boolean
}

// Interaction
interface MockInteraction {
  id: Snowflake
  applicationId: Snowflake
  type: number
  token: string
  channelId: Snowflake
  guildId?: Snowflake
  member?: MockGuildMember
  user?: MockUser
  data?: MockInteractionData
}
```

## Action Recording Types

### ActionType

50+ action classifications:

```typescript
type ActionType =
  // REST actions
  | 'message_sent' | 'message_edited' | 'message_deleted'
  | 'reaction_added' | 'reaction_removed'
  | 'interaction_response' | 'interaction_followup'
  | 'typing_started' | 'rest_request'
  // Channel actions
  | 'channel_created' | 'channel_updated' | 'channel_deleted'
  // Thread actions
  | 'thread_created' | 'thread_updated' | 'thread_deleted'
  // Gateway actions
  | 'gateway_message' | 'gateway_identify' | 'gateway_heartbeat'
  | 'gateway_presence_update' | 'gateway_voice_state_update'
  // And more...
```

### RecordedAction

```typescript
interface RecordedAction {
  id: string
  timestamp: number                       // Unix timestamp in milliseconds
  type: ActionType
  data: unknown
  endpoint?: string                       // e.g., "POST /channels/123/messages"
  method?: string                         // HTTP method
  interactionId?: string
  triggeredBy?: string                    // Event that triggered this action
}
```

### SessionRecording

```typescript
interface SessionRecording {
  version: 1
  metadata: RecordingMetadata
  initialConfig: SessionConfig
  actions: RecordedAction[]
  logs?: SessionLogEntry[]
}

interface RecordingMetadata {
  sessionId: string
  sessionName?: string
  startTime: number
  endTime: number
  duration: number
  actionCount: number
  botUser: { id: string; username: string }
}
```

## Stage Protocol Types

### Event Types

```typescript
type StageEventType =
  // Connection lifecycle
  | 'connected' | 'state_sync' | 'current_user_update'
  // Message events
  | 'message_create' | 'message_update' | 'message_delete'
  | 'message_reaction_add' | 'message_reaction_remove'
  // Interaction events
  | 'interaction_create' | 'interaction_response'
  // System events
  | 'bot_ready' | 'bot_disconnected' | 'heartbeat'
  // Diagnostics
  | 'event_filtered' | 'loop_detected' | 'permission_denied'
```

### Command Types

```typescript
type StageCommandType =
  | 'send_message'
  | 'invoke_command'
  | 'click_button'
  | 'select_option'
  | 'submit_modal'
  | 'add_reaction'
  | 'start_typing'
  | 'join_voice'
  | 'leave_voice'
```

### Protocol Envelopes

```typescript
interface StageEvent {
  seq: number                              // For reconnection replay
  timestamp: number
  type: StageEventType
  data: unknown
}

interface StageCommand {
  id: string                               // For response correlation
  type: StageCommandType
  data: unknown
}
```

## Dispatch Options Pattern

Options for injecting events via Control API:

```typescript
interface DispatchSlashCommandOptions {
  commandName: string
  options?: Record<string, string | number | boolean>
  user?: MockUserConfig
  channelId?: string
  guildId?: string
}

interface DispatchButtonClickOptions {
  customId: string
  messageId: Snowflake
  user?: MockUserConfig
  channelId?: string
}

interface DispatchModalSubmitOptions {
  customId: string
  fields: Record<string, string>
  messageId?: Snowflake
  user?: MockUserConfig
}
```

## Serialization Types

Converting internal state to API responses:

```typescript
interface SerializedSessionState {
  guilds: SerializedMockGuild[]
  channels: SerializedMockChannel[]
  users: SerializedMockUser[]
  messages: SerializedMockMessage[]
  attachments: SerializedStoredAttachment[]
  botUser: SerializedMockUser
  applicationId: string
  sequence: number
}

// Snowflakes become strings for JSON
interface SerializedMockUser {
  id: string                              // Snowflake → string
  username: string
  discriminator: string
  globalName: string | null
  avatar: string | null
  bot: boolean
}
```

## Validation Constants

Discord API limits enforced:

```typescript
const CommandLimits = {
  MAX_GLOBAL_COMMANDS: 100,
  MAX_GUILD_COMMANDS: 100,
  MAX_NAME_LENGTH: 32,
  MAX_DESCRIPTION_LENGTH: 100,
  MAX_OPTIONS: 25,
  MAX_CHOICES: 25
}

const StickerLimits = {
  MAX_GUILD_STICKERS: 60,
  MAX_NAME_LENGTH: 30
}

const RoleLimits = {
  MAX_ROLES_PER_GUILD: 250,
  MAX_NAME_LENGTH: 100
}

const ComponentLimits = {
  MAX_ACTION_ROWS: 5,
  MAX_BUTTONS_PER_ROW: 5,
  MAX_SELECT_OPTIONS: 25
}

const AttachmentLimits = {
  MAX_FILES_PER_MESSAGE: 10,
  MAX_TOTAL_SIZE: 25 * 1024 * 1024        // 25MB
}
```

## Bitfield Constants

```typescript
const MessageFlags = {
  Crossposted: 1 << 0,
  SuppressEmbeds: 1 << 2,
  Ephemeral: 1 << 6,
  Loading: 1 << 7,
  SuppressNotifications: 1 << 12,
  IsComponentsV2: 1 << 15                 // 32768
}

const AttachmentFlags = {
  IS_REMIX: 1 << 2                        // 4
}
```

## Enum Types

```typescript
enum ForumSortOrderType { LatestActivity = 0, CreationDate = 1 }
enum ForumLayoutType { NotSet = 0, ListView = 1, GalleryView = 2 }
enum StickerType { Standard = 1, Guild = 2 }
enum WebhookType { Incoming = 1, ChannelFollower = 2, Application = 3 }
enum ApplicationCommandType { ChatInput = 1, User = 2, Message = 3 }
enum VoiceOpcode { Identify = 0, Ready = 2, Heartbeat = 3 }
```

## Components V2 Types

New display components:

```typescript
const ComponentTypeV2 = {
  ActionRow: 1,
  Button: 2,
  StringSelect: 3,
  TextInput: 4,
  // V2 Display Components
  Section: 9,
  TextDisplay: 10,
  Thumbnail: 11,
  MediaGallery: 12,
  File: 13,
  Separator: 14,
  Container: 17
}

interface SectionComponent {
  type: 9
  components: TextDisplayComponent[]
  accessory?: ThumbnailComponent | ButtonComponentV2
}

interface MediaGalleryComponent {
  type: 12
  items: MediaGalleryItem[]
}
```

## Logging Types

```typescript
type SessionLogLevel = 'trace' | 'debug' | 'info' | 'wait' | 'event' | 'ready' | 'warn' | 'error'

interface SessionLogEntry {
  id: string
  timestamp: number
  level: SessionLogLevel
  message: string
  data?: unknown[]
  prefix?: string                         // Logger prefix (e.g., 'mock')
  source: LogSource
}

interface LogSource {
  connectionId: string
  sessionId: string
  botUserId?: string
  botUsername?: string
}
```

## Plugin Configuration

```typescript
interface MockPluginConfig {
  port?: number
  hostname?: string
  defaultSessionConfig?: SessionConfig
  enableStageUI?: boolean
  voicePort?: number
}

const DEFAULT_MOCK_PLUGIN_CONFIG = {
  enableStageUI: true,
  voicePort: 50001
}
```

## Storage Interfaces

```typescript
interface SessionStorage {
  get(id: string): Session | undefined
  set(id: string, session: Session): void
  delete(id: string): boolean
  values(): IterableIterator<Session>
  clear(): void
  readonly size: number
}

interface IActionRecorder {
  record(action: Omit<RecordedAction, 'id'>): RecordedAction
  getAll(): RecordedAction[]
  getSince(timestamp: number): RecordedAction[]
  getByType(type: ActionType): RecordedAction[]
  clear(): void
}
```

## Import Patterns

```typescript
// Main types
import type { Session, SessionState, MockMessage, RecordedAction } from '@robojs/mock'

// Stage UI types
import type { StageEvent, StageCommand, StageUser } from '@robojs/mock'

// Plugin config
import type { MockPluginConfig } from '@robojs/mock'
```

## Key Files

| Purpose | Path |
|---------|------|
| Main Type Hub | `src/types/index.ts` |
| Stage Protocol | `src/types/stage.ts` |
| Plugin Config | `src/types/plugin.ts` |
| CSS Modules | `src/types/css.d.ts` |

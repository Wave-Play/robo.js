# Control API

## Overview

Session management, event dispatch, state inspection, and debugging endpoints. All routes prefixed with `/api/control/`.

## Session CRUD

### Create Session

`POST /api/control/sessions`

```typescript
// Request
{
  name?: string,           // Display name for debugging
  ttl?: number,            // Time-to-live ms (default: 1 hour)
  config?: {
    guilds?: MockGuildConfig[],
    users?: MockUserConfig[],
    botUser?: MockUserConfig,
    applicationId?: string,
    enforceIntents?: boolean,
    approvedPrivilegedIntents?: string  // bigint as string
  }
}

// Response
{
  session_id: string,
  token: "mock:<session_id>",
  expires_at: number,
  state: SerializedSessionState
}
```

### Get Session

`GET /api/control/sessions/:id`

```typescript
// Response
{
  session_id: string,
  token: string,
  name?: string,
  created_at: number,
  expires_at: number,
  connections: number,
  state: {
    botUser: { id, username },
    guilds: [{ id, name }],
    channels: [{ id, name, guildId?, type }]
  }
}
```

### Delete Session

`DELETE /api/control/sessions/:id`

```typescript
// Response
{ success: true }
```

### Reset Session

`POST /api/control/sessions/:id/reset`

```typescript
// Request
{ clear_actions?: boolean }  // default: true

// Response
{ success: boolean, message: string, sequence: number }
```

## Event Dispatch

`POST /api/control/sessions/:id/dispatch`

### MESSAGE_CREATE

```typescript
{
  event: "MESSAGE_CREATE",
  data: {
    channel_id: string,         // required
    id?: string,
    content?: string,
    author?: { id?, username?, bot? },
    embeds?: unknown[],
    attachments?: unknown[],
    components?: unknown[],
    mentions?: [{ id?, username? }],
    mention_roles?: string[],
    mention_everyone?: boolean,
    reactions?: [{ emoji: { id, name }, count, me }],
    type?: number,              // 0=DEFAULT, 7=USER_JOIN
    poll?: MockPollConfig
  }
}
```

### Slash Command Interaction

```typescript
{
  event: "INTERACTION_CREATE",
  data: {
    command_name: string,       // required
    options?: Record<string, string | number | boolean>,
    user?: { id?, username?, bot? },
    channel_id?: string,
    guild_id?: string
  }
}
```

### Button Click Interaction

```typescript
{
  event: "INTERACTION_CREATE",
  data: {
    custom_id: string,          // required
    message_id: string,         // required
    user?: { id?, username?, bot? },
    channel_id?: string,
    guild_id?: string
  }
}
```

### Select Menu Interaction

```typescript
{
  event: "INTERACTION_CREATE",
  data: {
    custom_id: string,          // required
    message_id: string,         // required
    values: string[],           // required
    component_type?: number,
    user?: { ... },
    channel_id?: string,
    guild_id?: string
  }
}
```

### Modal Submit Interaction

```typescript
{
  event: "INTERACTION_CREATE",
  data: {
    custom_id: string,          // required
    fields: Record<string, string>,  // required
    message_id?: string,
    user?: { ... },
    channel_id?: string,
    guild_id?: string
  }
}
```

### Autocomplete Interaction

```typescript
{
  event: "INTERACTION_CREATE",
  data: {
    command_name: string,       // required
    focused_option: {
      name: string,             // required
      value: string,            // required
      type?: number
    },
    options?: Record<string, ...>,
    user?: { ... }
  }
}
```

### Context Menu Interaction

```typescript
{
  event: "INTERACTION_CREATE",
  data: {
    command_name: string,       // required
    target_id: string,          // required
    context_menu_type: 2 | 3,   // 2=USER, 3=MESSAGE
    user?: { ... }
  }
}
```

### Thread Events

```typescript
// THREAD_CREATE
{
  event: "THREAD_CREATE",
  data: {
    name: string,               // required
    parent_channel_id: string,  // required
    type?: 10 | 11 | 12,
    auto_archive_duration?: 60 | 1440 | 4320 | 10080,
    invitable?: boolean,
    user?: { ... }
  }
}

// THREAD_UPDATE
{
  event: "THREAD_UPDATE",
  data: {
    thread_id: string,          // required
    name?: string,
    archived?: boolean,
    locked?: boolean
  }
}

// THREAD_DELETE
{
  event: "THREAD_DELETE",
  data: { thread_id: string }
}

// THREAD_MEMBER_UPDATE
{
  event: "THREAD_MEMBER_UPDATE",
  data: {
    thread_id: string,          // required
    action: "join" | "leave",   // required
    user_id?: string
  }
}
```

### Voice State Update

```typescript
{
  event: "VOICE_STATE_UPDATE",
  data: {
    guild_id: string,           // required
    channel_id: string | null,  // required
    user_id: string,            // required
    session_id?: string,
    self_mute?: boolean,
    self_deaf?: boolean,
    mute?: boolean,
    deaf?: boolean,
    speaking?: boolean,
    member?: { user, nick?, roles? }
  }
}
```

### Reaction Events

```typescript
// MESSAGE_REACTION_ADD
{
  event: "MESSAGE_REACTION_ADD",
  data: {
    message_id: string,         // required
    channel_id: string,         // required
    user_id: string,            // required
    emoji: { id: string | null, name: string }  // required
  }
}

// MESSAGE_REACTION_REMOVE
{
  event: "MESSAGE_REACTION_REMOVE",
  data: { /* same as above */ }
}
```

### Poll Vote Events

```typescript
// MESSAGE_POLL_VOTE_ADD / MESSAGE_POLL_VOTE_REMOVE
{
  event: "MESSAGE_POLL_VOTE_ADD",
  data: {
    user_id: string,            // required
    message_id: string,         // required
    answer_id: number           // required (1-indexed)
  }
}
```

### Guild Events

```typescript
// GUILD_CREATE
{
  event: "GUILD_CREATE",
  data: {
    id: string,                 // required
    name: string,               // required
    icon?: string | null,
    owner_id?: string,
    channels?: [{ id, type, name }],
    roles?: [{ id, name, color? }],
    members?: [{ user: { id, username }, roles? }]
  }
}

// GUILD_MEMBER_ADD
{
  event: "GUILD_MEMBER_ADD",
  data: {
    guild_id: string,           // required
    user: { id, username?, discriminator?, bot? },
    roles?: string[],
    joined_at?: string,
    nick?: string | null
  }
}
```

### Dispatch Response

```typescript
{
  success: true,
  dispatched: number,           // connections event sent to
  message_id?: string,
  interaction_id?: string,
  interaction_token?: string,
  thread_id?: string
}
```

## State Inspection

### Get Full State

`GET /api/control/sessions/:id/state`

```typescript
// Response
{
  guilds: [{ id, name, ... }],
  channels: [{ id, name, ... }],
  users: [{ id, username, ... }],
  botUser: { id, username, ... },
  applicationId: string,
  sequence: number
}
```

### Get Status Summary

`GET /api/control/sessions/:id/status`

```typescript
// Response
{
  session_id: string,
  name?: string,
  connected: boolean,
  connection_count: number,
  guild_count: number,
  channel_count: number,
  user_count: number,
  message_count: number,
  interaction_count: number,
  action_count: number,
  sequence: number,
  is_expired: boolean,
  created_at: string,           // ISO 8601
  expires_at: string
}
```

## Action Recording

### Get Actions

`GET /api/control/sessions/:id/actions`

**Query Parameters:**
- `type`: Filter by action type
- `since`: Filter after timestamp (ms)
- `limit`: Max results (default: 100)
- `offset`: Pagination offset

```typescript
// Response
{
  actions: RecordedAction[],
  total: number,
  limit: number,
  offset: number
}
```

### Get Logs

`GET /api/control/sessions/:id/logs`

**Query Parameters:**
- `level`: Filter by log level
- `since`: Filter after timestamp (ms)
- `search`: Search in message content
- `connectionId`: Filter by connection
- `limit`: Max results (default: 100)
- `offset`: Pagination offset

```typescript
// Response
{
  logs: SessionLogEntry[],
  total: number,
  limit: number,
  offset: number
}
```

### Record Log Entry

`POST /api/control/sessions/:id/logs`

```typescript
// Request
{
  timestamp: number,            // required
  level: string,                // required
  message: string,              // required
  prefix?: string,
  data?: unknown[],
  source: {
    connectionId: string,       // required
    botUserId?: string,
    botUsername?: string
  }
}

// Response
{ success: true, logId: string }
```

## Intent Configuration

### Get/Set Intents (Session ID)

`GET /api/control/sessions/:id/intents`
`POST /api/control/sessions/:id/intents`

```typescript
// GET Response / POST Request
{
  enforceIntents?: boolean,
  approvedPrivilegedIntents?: string,  // bigint as string
  connectionIntents?: string | null,
  privilegedIntentBits?: {
    GuildMembers: string,
    GuildPresences: string,
    MessageContent: string,
    all: string
  }
}
```

### Get/Set Intents (Token-Based)

`GET /api/control/intents`
`POST /api/control/intents`

**Headers:** `Authorization: mock:session_id`

## Permission Configuration

### Get Bot Permissions

`GET /api/control/sessions/:id/permissions?guild_id=<guildId>`

```typescript
// Response
{
  guild_id: string,
  user_id: string,
  roles: string[],
  permissions: string,          // bitfield
  permission_names: string[]
}
```

### Set Bot Permissions

`POST /api/control/sessions/:id/permissions`

```typescript
// Request
{
  guild_id: string,             // required
  channel_id?: string,
  permissions?: string,         // bitfield to set
  deny?: string,                // bitfield to deny
  role_id?: string              // defaults to @everyone
}

// Response
{
  success: true,
  channel_id?: string,
  overwrite?: { id, type, allow, deny },
  role?: { id, name, permissions, permission_names }
}
```

### Reset Permissions

`DELETE /api/control/sessions/:id/permissions?guild_id=<guildId>&channel_id=<channelId>`

### Permission Overrides

`GET /api/control/sessions/:id/permissions/overrides`
`POST /api/control/sessions/:id/permissions/overrides`
`DELETE /api/control/sessions/:id/permissions/overrides`

```typescript
// POST Request
{
  user_id: string,              // required (* for all users)
  channel_id?: string,
  guild_id?: string,
  permissions: Record<string, 'grant' | 'deny' | 'inherit'>,
  expires_in?: number,          // TTL in seconds
  reason?: string
}

// Response
{
  success: true,
  override: {
    id: string,
    user_id: string,
    channel_id: string | null,
    guild_id: string | null,
    permissions: Record<string, 'grant' | 'deny' | 'inherit'>,
    expires_at: number | null,
    created_at: number,
    reason?: string
  }
}
```

## Loop Protection

`GET /api/control/sessions/:id/loop-protection`
`POST /api/control/sessions/:id/loop-protection`

```typescript
// GET Response
{ enabled: boolean, isLoopDetected: boolean }

// POST Request/Response
{ enabled: boolean }
```

## Command Management

### List Commands

`GET /api/control/sessions/:id/commands`

```typescript
// Response
{
  success: true,
  commands: [{ id, name, type, ... }]
}
```

### Add Commands

`POST /api/control/sessions/:id/commands`

```typescript
// Request
{
  commands: [{
    name: string,               // required
    description?: string,
    type?: number,              // 1=ChatInput, 2=User, 3=Message
    options?: []
  }]
}

// Response
{ success: boolean, created: [{ id, name, type }], errors?: string[] }
```

### Delete All Commands

`DELETE /api/control/sessions/:id/commands`

```typescript
// Response
{ success: true, deleted: number }
```

## Recording & Playback

### Export Recording

`GET /api/control/sessions/:id/recording`

```typescript
// Response
{
  version: 1,
  metadata: {
    sessionId: string,
    sessionName?: string,
    startTime: number,
    endTime: number,
    duration: number,
    actionCount: number,
    botUser: { id, username },
    applicationId: string,
    recordedAt: string          // ISO 8601
  },
  initialConfig: SessionConfig,
  actions: RecordedAction[]
}
```

### Save Recording

`POST /api/control/sessions/:id/recording`

```typescript
// Response
{ success: true, path: string }
```

### Replay Recording

`POST /api/control/sessions/:id/replay`

```typescript
// Request
{
  recording?: SessionRecording,
  recordingPath?: string,
  options?: {
    speed?: number,             // 1 = real-time, 0 = instant
    validate?: boolean,
    validationMode?: 'strict' | 'flexible' | 'type-only',
    responseTimeout?: number    // default: 5000 ms
  }
}

// Response
{
  success: true,
  actionsReplayed: number,
  duration: number,
  validation?: {
    passed: boolean,
    matched: number,
    mismatched: number,
    extra: number,
    missing: number,
    mismatches: [{ expected, actual, reason }]
  }
}
```

## Test Registry

### Get Registry

`GET /api/control/tests/registry`

```typescript
// Response
{
  registry: {
    testFiles: [{ path, sessionId, status }]
  } | null
}
```

### List Recordings

`GET /api/control/tests/recordings`

```typescript
// Response
{
  recordings: [{
    sessionId: string,
    testFile?: string,
    status?: 'passed' | 'failed',
    metadata: RecordingMetadata
  }]
}
```

### List/Get Test Logs

`GET /api/control/tests/logs`
`GET /api/control/tests/logs?file=<filename>`

```typescript
// List Response
{ logs: [{ name, path, size }] }

// Get Response
{ name, path, content, exists, error? }
```

## Other Endpoints

### Add Audit Log Entries

`POST /api/control/sessions/:id/audit-log`

```typescript
// Request
{
  guild_id: string,             // required
  entries: [{
    id?: string,
    action_type: number,        // required (AuditLogEvent)
    user_id?: string,
    target_id?: string,
    reason?: string,
    changes?: [{ key, old_value?, new_value? }],
    options?: Record<string, string>
  }]
}

// Response
{ success: true, added: number, entry_ids: string[] }
```

### Dispatch Interaction

`POST /api/control/sessions/:id/interaction`

```typescript
// Request
{
  type: number,                 // required
  data: {
    name?: string,
    type?: number,
    custom_id?: string,
    values?: string[],
    options?: [{ name, type, value }]
  },
  guild_id?: string,
  channel_id?: string,
  user?: { id?, username? }
}

// Response
{ success: true, interaction_id: string, interaction_token: string }
```

## Error Handling

All errors return JSON:

```typescript
{ error: string }
```

**Status Codes:**
- 400: Bad Request (validation)
- 404: Not Found
- 405: Method Not Allowed
- 500: Internal Server Error

## Key Files

| Purpose | Path |
|---------|------|
| Session CRUD | `src/api/control/sessions.ts` |
| Session Operations | `src/api/control/sessions/[id].ts` |
| Event Dispatch | `src/api/control/sessions/[id]/dispatch.ts` |
| State Inspection | `src/api/control/sessions/[id]/state.ts` |
| Action Recording | `src/api/control/sessions/[id]/actions.ts` |
| Intent Config | `src/api/control/sessions/[id]/intents.ts` |
| Permission Config | `src/api/control/sessions/[id]/permissions.ts` |
| Loop Protection | `src/api/control/sessions/[id]/loop-protection.ts` |
| Recording | `src/api/control/sessions/[id]/recording.ts` |
| Replay | `src/api/control/sessions/[id]/replay.ts` |
| Test Registry | `src/api/control/tests/registry.ts` |

# Discord REST API v10

## Overview

Complete Discord REST API v10 emulation with ~95 endpoints. All routes prefixed with `/api/v10/`. Session routing via `Authorization: Bot mock:<session_id>` header.

## Gateway Endpoint

`GET /api/v10/gateway/bot`

```typescript
// Response
{
  url: "ws://localhost:3000",   // WebSocket URL
  shards: 1,
  session_start_limit: {
    total: 1000,
    remaining: 1000,
    reset_after: 0,
    max_concurrency: 1
  }
}
```

**Protocol:** `ws://` for localhost, `wss://` for remote hosts.

## Channel Endpoints

### Channel CRUD

```
GET    /api/v10/channels/[id]
PATCH  /api/v10/channels/[id]
DELETE /api/v10/channels/[id]
```

**PATCH Fields:**
- `name`, `topic`, `nsfw`, `position`, `parent_id`
- Threads: `archived`, `auto_archive_duration`, `locked`, `invitable`
- Voice: `bitrate`, `user_limit`, `rtc_region`
- `permission_overwrites[]`

**Events:** `CHANNEL_UPDATE`, `CHANNEL_DELETE`, `THREAD_UPDATE`, `THREAD_DELETE`

### Messages

```
GET    /api/v10/channels/[id]/messages
POST   /api/v10/channels/[id]/messages
GET    /api/v10/channels/[id]/messages/[messageId]
PATCH  /api/v10/channels/[id]/messages/[messageId]
DELETE /api/v10/channels/[id]/messages/[messageId]
POST   /api/v10/channels/[id]/messages/[messageId]/crosspost
POST   /api/v10/channels/[id]/messages/bulk-delete
```

**GET Query Parameters:**
- `limit`: 1-100 (default: 50)
- `before`, `after`, `around`: Pagination cursors

**POST Body:**
```typescript
{
  content?: string,             // max 2000 chars
  embeds?: object[],
  components?: object[],
  flags?: number,
  tts?: boolean,
  message_reference?: { message_id },
  nonce?: string | number,
  poll?: MockPollConfig,
  sticker_ids?: string[],       // max 3
  attachments?: AttachmentPayload[]
}
```

**Multipart Support:** `payload_json` + `files[0]`, `files[1]`, etc.

**Events:** `MESSAGE_CREATE`, `MESSAGE_UPDATE`, `MESSAGE_DELETE`

### Reactions

```
GET    /api/v10/channels/[id]/messages/[messageId]/reactions
DELETE /api/v10/channels/[id]/messages/[messageId]/reactions
GET    /api/v10/channels/[id]/messages/[messageId]/reactions/[emoji]
PUT    /api/v10/channels/[id]/messages/[messageId]/reactions/[emoji]/@me
DELETE /api/v10/channels/[id]/messages/[messageId]/reactions/[emoji]/@me
DELETE /api/v10/channels/[id]/messages/[messageId]/reactions/[emoji]/[userId]
```

**Emoji Parameter:** URL-encoded (name or `name:id` for custom)

**Events:** `MESSAGE_REACTION_ADD`, `MESSAGE_REACTION_REMOVE`

### Threads

```
POST   /api/v10/channels/[id]/messages/[messageId]/threads
POST   /api/v10/channels/[id]/threads
GET    /api/v10/channels/[id]/threads/archived/public
GET    /api/v10/channels/[id]/threads/archived/private
GET    /api/v10/channels/[id]/users/@me/threads/archived/private
GET    /api/v10/channels/[id]/thread-members
PUT    /api/v10/channels/[id]/thread-members/@me
DELETE /api/v10/channels/[id]/thread-members/@me
DELETE /api/v10/channels/[id]/thread-members/[userId]
```

**Thread Types:** 10 (PUBLIC), 11 (PRIVATE), 12 (NEWS)

**Thread Fields:**
- `name`: 1-100 chars
- `auto_archive_duration`: 60, 1440, 4320, 10080 minutes
- `archived`, `locked`, `invitable`
- `rate_limit_per_user`: 0-21600 seconds

**Events:** `THREAD_CREATE`, `THREAD_UPDATE`, `THREAD_DELETE`, `THREAD_MEMBER_UPDATE`, `THREAD_MEMBERS_UPDATE`

### Pins

```
GET    /api/v10/channels/[id]/pins
PUT    /api/v10/channels/[id]/pins/[messageId]
DELETE /api/v10/channels/[id]/pins/[messageId]
```

**Event:** `CHANNEL_PINS_UPDATE`

### Polls

```
GET    /api/v10/channels/[id]/polls/[messageId]/answers/[answerId]
POST   /api/v10/channels/[id]/polls/[messageId]/expire
```

**Events:** `MESSAGE_POLL_VOTE_ADD`, `MESSAGE_POLL_VOTE_REMOVE`

### Permission Overwrites

```
PUT    /api/v10/channels/[id]/permissions/[overwriteId]
DELETE /api/v10/channels/[id]/permissions/[overwriteId]
```

### Channel Webhooks

```
GET    /api/v10/channels/[id]/webhooks
POST   /api/v10/channels/[id]/webhooks
```

### Other Channel Routes

```
GET    /api/v10/channels/[id]/invites
PUT    /api/v10/channels/[id]/voice-status
DELETE /api/v10/channels/[id]/voice-status
```

## Guild Endpoints

### Guild CRUD

```
GET    /api/v10/guilds/[id]
PATCH  /api/v10/guilds/[id]
DELETE /api/v10/guilds/[id]
```

**PATCH Fields:** `name`, `icon`, `owner_id`, `region`, `afk_channel_id`, `afk_timeout`, `verification_level`, `mfa_level`, `system_channel_id`, `preferred_locale`

**Events:** `GUILD_UPDATE`, `GUILD_DELETE`

### Guild Channels

```
GET    /api/v10/guilds/[id]/channels
POST   /api/v10/guilds/[id]/channels
PATCH  /api/v10/guilds/[id]/channels
```

**POST Body:**
```typescript
{
  name: string,                 // 1-100 chars
  type?: number,                // 0-15
  topic?: string,
  nsfw?: boolean,
  position?: number,
  permission_overwrites?: object[],
  parent_id?: string,
  bitrate?: number,             // voice
  user_limit?: number           // voice
}
```

**Events:** `CHANNEL_CREATE`, `CHANNEL_UPDATE`

### Guild Members

```
GET    /api/v10/guilds/[id]/members
POST   /api/v10/guilds/[id]/members
GET    /api/v10/guilds/[id]/members/[userId]
PATCH  /api/v10/guilds/[id]/members/[userId]
DELETE /api/v10/guilds/[id]/members/[userId]
GET    /api/v10/guilds/[id]/members/search
PUT    /api/v10/guilds/[id]/members/[userId]/roles/[roleId]
DELETE /api/v10/guilds/[id]/members/[userId]/roles/[roleId]
```

**GET List Parameters:**
- `limit`: 1-1000 (default: 1)
- `after`: Pagination cursor

**PATCH Body:**
```typescript
{
  nick?: string | null,         // max 32 chars
  roles?: string[],
  mute?: boolean,
  deaf?: boolean,
  channel_id?: string | null,   // move to voice channel
  communication_disabled_until?: string | null  // timeout (max 28 days)
}
```

**Events:** `GUILD_MEMBER_ADD`, `GUILD_MEMBER_UPDATE`, `GUILD_MEMBER_REMOVE`, `VOICE_STATE_UPDATE`

### Guild Roles

```
GET    /api/v10/guilds/[id]/roles
POST   /api/v10/guilds/[id]/roles
PATCH  /api/v10/guilds/[id]/roles
GET    /api/v10/guilds/[id]/roles/[roleId]
PATCH  /api/v10/guilds/[id]/roles/[roleId]
DELETE /api/v10/guilds/[id]/roles/[roleId]
```

**POST Body:**
```typescript
{
  name?: string,                // 1-100 chars
  permissions?: string,         // bitfield
  color?: number,               // 0-16777215
  hoist?: boolean,
  icon?: string | null,
  unicode_emoji?: string | null,
  mentionable?: boolean
}
```

**Limits:** Max 250 roles per guild

**Events:** `GUILD_ROLE_CREATE`, `GUILD_ROLE_UPDATE`, `GUILD_ROLE_DELETE`

### Guild Bans

```
GET    /api/v10/guilds/[id]/bans
GET    /api/v10/guilds/[id]/bans/[userId]
POST   /api/v10/guilds/[id]/bans
DELETE /api/v10/guilds/[id]/bans/[userId]
POST   /api/v10/guilds/[id]/bulk-ban
```

**POST Body:**
```typescript
{
  delete_message_days?: number, // 0-7
  delete_message_seconds?: number,  // 0-604800
  reason?: string
}
```

**Events:** `GUILD_BAN_ADD`, `GUILD_BAN_REMOVE`

### Guild Emojis & Stickers

```
GET    /api/v10/guilds/[id]/emojis
POST   /api/v10/guilds/[id]/emojis
PATCH  /api/v10/guilds/[id]/emojis/[emojiId]
DELETE /api/v10/guilds/[id]/emojis/[emojiId]
GET    /api/v10/guilds/[id]/stickers
POST   /api/v10/guilds/[id]/stickers
PATCH  /api/v10/guilds/[id]/stickers/[stickerId]
DELETE /api/v10/guilds/[id]/stickers/[stickerId]
```

**Events:** `GUILD_EMOJIS_UPDATE`, `GUILD_STICKERS_UPDATE`

### Guild Templates

```
GET    /api/v10/guilds/[id]/templates
POST   /api/v10/guilds/[id]/templates
PATCH  /api/v10/guilds/[id]/templates/[code]
DELETE /api/v10/guilds/[id]/templates/[code]
GET    /api/v10/guilds/templates/[code]
POST   /api/v10/guilds/templates/[code]
```

### Scheduled Events

```
GET    /api/v10/guilds/[id]/scheduled-events
POST   /api/v10/guilds/[id]/scheduled-events
GET    /api/v10/guilds/[id]/scheduled-events/[eventId]
PATCH  /api/v10/guilds/[id]/scheduled-events/[eventId]
DELETE /api/v10/guilds/[id]/scheduled-events/[eventId]
GET    /api/v10/guilds/[id]/scheduled-events/[eventId]/users
```

**Entity Types:** 1 (STAGE), 2 (VOICE), 3 (EXTERNAL)

**Events:** `GUILD_SCHEDULED_EVENT_CREATE`, `GUILD_SCHEDULED_EVENT_UPDATE`, `GUILD_SCHEDULED_EVENT_DELETE`

### Auto-Moderation

```
GET    /api/v10/guilds/[id]/auto-moderation/rules
POST   /api/v10/guilds/[id]/auto-moderation/rules
GET    /api/v10/guilds/[id]/auto-moderation/rules/[ruleId]
PATCH  /api/v10/guilds/[id]/auto-moderation/rules/[ruleId]
DELETE /api/v10/guilds/[id]/auto-moderation/rules/[ruleId]
```

**Trigger Types:** KEYWORD, HARMFUL_LINK, SPAM, KEYWORD_PRESET, USER_PROFILE

**Action Types:** BLOCK_MESSAGE, SEND_ALERT_MESSAGE, TIMEOUT

**Events:** `AUTO_MODERATION_RULE_CREATE`, `AUTO_MODERATION_RULE_UPDATE`, `AUTO_MODERATION_RULE_DELETE`

### Other Guild Routes

```
GET    /api/v10/guilds/[id]/audit-logs
GET    /api/v10/guilds/[id]/welcome-screen
PATCH  /api/v10/guilds/[id]/welcome-screen
GET    /api/v10/guilds/[id]/onboarding
PATCH  /api/v10/guilds/[id]/onboarding
GET    /api/v10/guilds/[id]/regions
GET    /api/v10/guilds/[id]/vanity-url
PATCH  /api/v10/guilds/[id]/vanity-url
GET    /api/v10/guilds/[id]/integrations
GET    /api/v10/guilds/[id]/invites
GET    /api/v10/guilds/[id]/webhooks
GET    /api/v10/guilds/[id]/threads/active
PATCH  /api/v10/guilds/[id]/voice-states/[userId]
```

## Application/Command Endpoints

### Global Commands

```
GET    /api/v10/applications/[app_id]/commands
POST   /api/v10/applications/[app_id]/commands
PUT    /api/v10/applications/[app_id]/commands
GET    /api/v10/applications/[app_id]/commands/[command_id]
PATCH  /api/v10/applications/[app_id]/commands/[command_id]
DELETE /api/v10/applications/[app_id]/commands/[command_id]
```

### Guild Commands

```
GET    /api/v10/applications/[app_id]/guilds/[guild_id]/commands
POST   /api/v10/applications/[app_id]/guilds/[guild_id]/commands
PUT    /api/v10/applications/[app_id]/guilds/[guild_id]/commands
GET    /api/v10/applications/[app_id]/guilds/[guild_id]/commands/[command_id]
PATCH  /api/v10/applications/[app_id]/guilds/[guild_id]/commands/[command_id]
DELETE /api/v10/applications/[app_id]/guilds/[guild_id]/commands/[command_id]
GET    /api/v10/applications/[app_id]/guilds/[guild_id]/commands/[command_id]/permissions
PUT    /api/v10/applications/[app_id]/guilds/[guild_id]/commands/[command_id]/permissions
```

**Command Body:**
```typescript
{
  name: string,                 // 1-32 chars
  type?: number,                // 1=CHAT_INPUT, 2=USER, 3=MESSAGE
  description: string,          // 1-100 chars
  options?: CommandOption[],
  default_member_permissions?: string,
  dm_permission?: boolean
}
```

**Limits:** Max 200 global, 200 per guild, 25 options per command

### Application Emojis

```
GET    /api/v10/applications/[app_id]/emojis
POST   /api/v10/applications/[app_id]/emojis
GET    /api/v10/applications/[app_id]/emojis/[emoji_id]
PATCH  /api/v10/applications/[app_id]/emojis/[emoji_id]
DELETE /api/v10/applications/[app_id]/emojis/[emoji_id]
```

### Other Application Routes

```
GET    /api/v10/applications/[app_id]
GET    /api/v10/applications/[app_id]/entitlements
GET    /api/v10/applications/[app_id]/entitlements/[entitlement_id]
GET    /api/v10/applications/[app_id]/skus
```

## Interaction Endpoints

### Interaction Callback

`POST /api/v10/interactions/[id]/[token]/callback`

**Session Routing:** Via interaction token lookup, not Authorization header

**Request Body:**
```typescript
{
  type: number,                 // Response type
  data?: InteractionResponseData
}
```

**Response Types:**
- 1: PONG
- 4: CHANNEL_MESSAGE_WITH_SOURCE (reply)
- 5: DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE ("Bot is thinking...")
- 6: DEFERRED_UPDATE_MESSAGE
- 7: UPDATE_MESSAGE
- 8: APPLICATION_COMMAND_AUTOCOMPLETE_RESULT
- 9: MODAL

**Response Data:**
```typescript
{
  content?: string,
  embeds?: object[],
  components?: object[],
  flags?: number,               // EPHEMERAL = 64
  tts?: boolean,
  attachments?: AttachmentPayload[],
  // Autocomplete (type 8):
  choices?: [{ name, value }],  // max 25
  // Modal (type 9):
  custom_id: string,
  title: string,
  components: object[]
}
```

**Events:** `MESSAGE_CREATE` (type 4), `MESSAGE_UPDATE` (type 7)

## Webhook Endpoints

```
GET    /api/v10/webhooks/[app_id]/[token]
PATCH  /api/v10/webhooks/[app_id]/[token]
DELETE /api/v10/webhooks/[app_id]/[token]
POST   /api/v10/webhooks/[app_id]/[token]
PATCH  /api/v10/webhooks/[app_id]/[token]/messages/[messageId]
DELETE /api/v10/webhooks/[app_id]/[token]/messages/[messageId]
```

**Execute Webhook (POST) Query Parameters:**
- `wait`: Return message object
- `thread_id`: Send to thread
- `with_components`: Allow interactive components (non-app webhooks)

**Execute Webhook Body:**
```typescript
{
  content?: string,
  username?: string,            // override name
  avatar_url?: string,          // override avatar
  tts?: boolean,
  embeds?: object[],
  components?: object[],
  flags?: number,
  attachments?: AttachmentPayload[],
  poll?: MockPollConfig,
  thread_name?: string,         // forum post
  applied_tags?: string[]       // forum tags
}
```

## User Endpoints

```
GET    /api/v10/users/@me
PATCH  /api/v10/users/@me
GET    /api/v10/users/[id]
GET    /api/v10/users/@me/channels
POST   /api/v10/users/@me/channels
GET    /api/v10/users/@me/guilds
```

**PATCH @me Body:**
```typescript
{
  username?: string,
  avatar?: string | null        // base64 or null
}
```

## Other Endpoints

```
GET    /api/v10/invites/[code]
GET    /api/v10/stickers/[stickerId]
GET    /api/v10/sticker-packs
GET    /api/v10/voice/regions
```

## Session Routing

All protected endpoints:

```typescript
// 1. Extract token from Authorization header
const authHeader = request.headers.get('Authorization')
const sessionId = parseMockToken(authHeader)

// 2. Lookup session
const session = sessionManager.get(sessionId)
if (!session) return 401

// 3. Use session.state for operations
const channel = session.state.getChannel(channelId)
```

**Token Formats:**
- Simple: `mock:sess_xxx`
- Discord-like: `<base64_id>.<MOCK_marker>.<base64_session>`

## Response Compatibility

### Status Codes

- 200: Successful GET/PATCH
- 201: Successful POST
- 204: Successful DELETE or async POST
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 405: Method Not Allowed
- 429: Rate Limited

### Error Format

```typescript
{
  error: string,
  code: number                  // Discord error code
}
```

**Common Codes:** 10003 (Unknown Channel), 10008 (Unknown Message), 50035 (Invalid Request)

### Payload Transformation

Internal mock objects converted via:
- `mockMessageToAPIMessage()`
- `mockUserToAPIUser()`
- `mockGuildMemberToAPIMember()`
- `mockChannelToAPIChannel()`
- `mockRoleToAPIRole()`
- `mockWebhookToAPIWebhook()`

### CDN URLs

```
http://localhost:53596/cdn/attachments/[channelId]/[attachmentId]/[filename]
```

## Key Files

| Purpose | Path |
|---------|------|
| Gateway | `src/api/v10/gateway/bot.ts` |
| Channels | `src/api/v10/channels/[id].ts` |
| Messages | `src/api/v10/channels/[id]/messages.ts` |
| Guilds | `src/api/v10/guilds/[id].ts` |
| Members | `src/api/v10/guilds/[id]/members.ts` |
| Roles | `src/api/v10/guilds/[id]/roles.ts` |
| Commands | `src/api/v10/applications/[app_id]/commands.ts` |
| Interactions | `src/api/v10/interactions/[id]/[token]/callback.ts` |
| Webhooks | `src/api/v10/webhooks/[app_id]/[token].ts` |
| Users | `src/api/v10/users/@me.ts` |

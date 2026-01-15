# Discord Protocol Implementation

## Overview

Complete Discord Gateway v10 and Voice Gateway implementation for bot testing. JSON encoding only, no ETF or zlib-stream.

## Gateway v10 WebSocket

### Connection URL
```
ws://localhost:<port>/?v=10&encoding=json
```

**Validation:**
- `v=10` required - other versions rejected
- `encoding=json` required - ETF not supported

### Opcodes

| Op | Name | Direction | Purpose |
|----|------|-----------|---------|
| 0 | DISPATCH | S→C | Event delivery (MESSAGE_CREATE, READY, etc.) |
| 1 | HEARTBEAT | C→S | Keep-alive with last sequence |
| 2 | IDENTIFY | C→S | Auth with token, intents, properties |
| 3 | PRESENCE_UPDATE | C→S | Update bot presence/status |
| 4 | VOICE_STATE_UPDATE | C→S | Join/leave voice channels |
| 6 | RESUME | C→S | Reconnect with session ID |
| 8 | REQUEST_GUILD_MEMBERS | C→S | Fetch guild member list |
| 10 | HELLO | S→C | Initial handshake with heartbeat interval |
| 11 | HEARTBEAT_ACK | S→C | Acknowledgment of heartbeat |

### Close Codes

| Code | Name | Meaning |
|------|------|---------|
| 1000 | NORMAL | Intentional disconnect |
| 4001 | UNKNOWN_ERROR | Unknown error |
| 4004 | AUTHENTICATION_FAILED | Invalid token |
| 4014 | DISALLOWED_INTENTS | Privileged intents not approved |

### Connection Lifecycle

```
1. Client connects: ws://localhost:3000/?v=10&encoding=json
2. Server validates version and encoding
3. Server sends HELLO (op 10):
   { "op": 10, "d": { "heartbeat_interval": 41250 } }
4. Client sends IDENTIFY (op 2):
   { "op": 2, "d": { "token": "mock:sess_xxx", "intents": 65535, ... } }
5. Server validates token, looks up session
6. Server sends READY (op 0, t: "READY"):
   { "op": 0, "t": "READY", "s": 1, "d": { "user": {...}, "guilds": [...], ... } }
7. Server sends GUILD_CREATE for each guild (sequences 2, 3, ...)
8. Client/Server exchange HEARTBEAT/HEARTBEAT_ACK every 41.25s
9. Server dispatches events as they occur
```

### Token Format

**Primary format:** `mock:<session_id>`
- Example: `mock:sess_abc123xyz789`

**Discord-like format:** `<base64_id>.<MOCK_marker>.<base64_session>`
- Part 1: Base64 of fake bot ID
- Part 2: Base64 of "MOCK" (exactly 6 chars: `TU9DSw`)
- Part 3: Base64url of session ID

**Parsing:** `parseMockToken()` in `src/utils/id.ts`

## Payload Builders

**File:** `src/discord/payloads.ts` (~3000 lines)

### Connection Events
- `buildHelloPayload()` - HELLO with heartbeat interval
- `buildReadyPayload()` - READY with bot user, guilds, session_id
- `buildHeartbeatAckPayload()` - HEARTBEAT_ACK

### Guild Events
- `buildGuildCreatePayload()` - Full guild with members, roles, channels
- `buildGuildRoleCreatePayload()` / `UpdatePayload()` / `DeletePayload()`
- `buildGuildMemberAddPayload()` / `UpdatePayload()` / `RemovePayload()`
- `buildGuildBanAddPayload()` / `RemovePayload()`
- `buildGuildStickersUpdatePayload()`
- `buildGuildEmojisUpdatePayload()`
- `buildWebhooksUpdatePayload()`

### Message Events
- `buildMessageCreatePayload()` - Full message with embeds, components
- `buildMessageUpdatePayload()` - Edited message
- `buildMessageDeletePayload()` - Deleted message ID
- `buildMessagePollVoteAddPayload()` / `RemovePayload()`

### Reaction Events
- `buildMessageReactionAddPayload()` - Reaction added with user, emoji, message context
- `buildMessageReactionRemovePayload()` - Reaction removed

### Interaction Events
- `buildInteractionCreatePayload()` - Slash commands with options
- `buildButtonInteractionPayload()` - Button clicks with source message
- `buildSelectMenuInteractionPayload()` - Select menu with resolved data
- `buildModalSubmitInteractionPayload()` - Modal form submissions
- `buildAutocompleteInteractionPayload()` - Autocomplete with focused flag
- `buildContextMenuInteractionPayload()` - User/message context menus

### Thread Events
- `buildThreadCreatePayload()` - Thread with `newly_created` flag
- `buildThreadUpdatePayload()` - Thread metadata changes
- `buildThreadDeletePayload()` - Thread deletion
- `buildThreadListSyncPayload()` - Bulk thread sync
- `buildThreadMemberUpdatePayload()` - Current user's membership
- `buildThreadMembersUpdatePayload()` - Members added/removed

### Advanced Events
- `buildInviteCreatePayload()` / `DeletePayload()`
- `buildGuildScheduledEventCreatePayload()` / `UpdatePayload()` / `DeletePayload()`
- `buildGuildScheduledEventUserAddPayload()` / `RemovePayload()`
- `buildAutoModerationRuleCreatePayload()` / `UpdatePayload()` / `DeletePayload()`
- `buildAutoModerationActionExecutionPayload()`

### Type Converters
- `mockUserToAPIUser()` - User object formatting
- `mockRoleToAPIRole()` - Role with tags, icons
- `mockGuildMemberToAPIMember()` - Member with roles, timeout
- `mockChannelToAPIChannel()` - Channel type handling
- `mockThreadToAPIChannel()` - Thread with metadata
- `mockMessageToAPIMessage()` - Full message with reactions, poll
- `mockEmojiToAPIEmoji()` - Custom emoji
- `mockStickerToAPISticker()` - Sticker format
- `mockWebhookToAPIWebhook()` - Webhook with token
- `mockInviteToAPIInvite()` - Invite conversion

## Voice Gateway

### Architecture

**Port:** 50001 (separate from main gateway)
**Protocol:** WSS (secure WebSocket)
**Certificates:** Self-signed, generated at runtime

**Why separate port:** @discordjs/voice requires secure connections. Main gateway uses plain WS.

### Voice Opcodes

| Op | Name | Direction |
|----|------|-----------|
| 0 | Identify | C→S |
| 1 | SelectProtocol | C→S |
| 2 | Ready | S→C |
| 3 | Heartbeat | C→S |
| 4 | SessionDescription | S→C |
| 5 | Speaking | Both |
| 6 | HeartbeatAck | S→C |
| 7 | Resume | C→S |
| 8 | Hello | S→C |
| 13 | ClientDisconnect | S→C |

### Voice Connection Flow

```
1. Client sends VOICE_STATE_UPDATE to main gateway
2. Gateway sends VOICE_STATE_UPDATE + VOICE_SERVER_UPDATE events
3. Client opens WSS to voice gateway on port 50001
4. Voice gateway sends HELLO with heartbeat interval
5. Client sends Identify with server_id, user_id, session_id, token
6. Server sends Ready with SSRC, IP, port, encryption modes
7. Client sends SelectProtocol with protocol=udp, mode, address
8. Server sends SessionDescription with mode, secret_key
9. Heartbeat exchange every 41.25s
```

### Encryption Modes
- `xsalsa20_poly1305`
- `xsalsa20_poly1305_lite`
- `xsalsa20_poly1305_suffix`

**Note:** Actual voice data transmission not implemented (tests don't send audio).

## Intent Filtering

**File:** `src/core/intents.ts`

### Event to Intent Mapping

30+ events mapped to required intents:

| Event | Guild Intent | DM Intent |
|-------|-------------|-----------|
| MESSAGE_CREATE | GuildMessages | DirectMessages |
| TYPING_START | GuildMessageTyping | DirectMessageTyping |
| MESSAGE_POLL_VOTE_* | GuildMessagePolls | DirectMessagePolls |
| GUILD_MEMBER_* | GuildMembers | - |
| PRESENCE_UPDATE | GuildPresences | - |

### Privileged Intents

| Intent | Bit | Requires Approval |
|--------|-----|-------------------|
| GuildMembers | 1 << 1 | Yes |
| GuildPresences | 1 << 8 | Yes |
| MessageContent | 1 << 15 | Yes |

### MESSAGE_CONTENT Behavior

Without MESSAGE_CONTENT intent:
- `content` becomes empty string
- `embeds` stripped
- `attachments` stripped
- `components` stripped
- `poll` stripped

**Exemptions:**
- DM messages
- Messages from the bot itself
- Messages mentioning the bot

### Filtering Flow

```
1. Event ready to dispatch
2. Check connection's declared intents
3. If required intent missing:
   - Event filtered (not sent)
   - Stage UI receives event_filtered notification
   - DevTools shows filtered event
4. If intent present:
   - Apply MESSAGE_CONTENT stripping if needed
   - Dispatch event normally
```

## Protocol Constants

**File:** `src/discord/opcodes.ts`

```typescript
DEFAULT_HEARTBEAT_INTERVAL = 41250  // ms
GATEWAY_VERSION = "10"
VOICE_GATEWAY_PORT = 50001
```

## Key Files

| Purpose | Path |
|---------|------|
| Opcodes | `src/discord/opcodes.ts` |
| Payload Builders | `src/discord/payloads.ts` |
| Gateway Server | `src/core/gateway.ts` |
| Voice Gateway | `src/core/voice-gateway.ts` |
| Intent Filtering | `src/core/intents.ts` |
| Token Parsing | `src/utils/id.ts` |

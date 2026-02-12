# Integration Testing Guide for @robojs/mock

This guide provides comprehensive documentation for implementing and maintaining Discord.js integration tests for the @robojs/mock Discord Mock Server. It is designed for AI agents implementing additional test suites.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Running Tests](#running-tests)
4. [Test Structure](#test-structure)
5. [Test Utilities Reference](#test-utilities-reference)
6. [Control API Reference](#control-api-reference)
7. [Writing New Tests](#writing-new-tests)
8. [Adding New Test Suites](#adding-new-test-suites)
9. [Troubleshooting](#troubleshooting)
10. [Best Practices](#best-practices)

---

## Overview

### Purpose

These integration tests verify that the @robojs/mock Discord Mock Server works correctly with real Discord.js clients. The tests ensure:

- Gateway WebSocket connections work properly
- REST API endpoints return correct responses
- Events are dispatched and filtered correctly
- Intent enforcement works as expected
- Session management functions correctly

### Technology Stack

- **Test Framework:** Jest with ts-jest
- **Client Library:** Discord.js v14
- **Language:** TypeScript
- **Runtime:** Node.js with ESM

### Test Organization

Tests are organized into suites by feature area:

| Suite | Description | File |
|-------|-------------|------|
| Connection | Basic Connection | `01-connection/connection.test.ts` |
| Gateway | Gateway Connection | `02-gateway/gateway.test.ts` |
| Gateway | Heartbeat | `02-gateway/heartbeat.test.ts` |
| Gateway | Reconnection | `02-gateway/reconnection.test.ts` |
| Gateway | REST API | `02-gateway/rest-api.test.ts` |
| Gateway | Intents | `02-gateway/intents.test.ts` |
| Messaging | Messages, Channels, Threads, Webhooks | `03-messaging/*.test.ts` |
| Guild Entities | Members, Roles, Bans, Permissions | `04-guild-entities/*.test.ts` |
| Discord Features | Interactions, AutoMod, Stickers, etc. | `05-discord-features/*.test.ts` |
| Recording & State | Recording Export | `06-recording-state/recording-export.test.ts` |
| Recording & State | Recording Replay | `06-recording-state/recording-replay.test.ts` |
| Recording & State | State Inspection API | `06-recording-state/state-api.test.ts` |
| Recording & State | File Uploads & Attachments | `06-recording-state/attachments.test.ts` |
| Recording & State | Components V2 | `06-recording-state/components-v2.test.ts` |
| Recording & State | Forum Channels Deep | `06-recording-state/forum-channels.test.ts` |
| Recording & State | Guild Settings | `06-recording-state/guild-settings.test.ts` |
| Recording & State | Message Completeness | `06-recording-state/message-completeness.test.ts` |
| Helper Methods | Interaction Response Lifecycle | `07-helper-methods/interaction-lifecycle.test.ts` |
| Helper Methods | Channel Helper Methods | `07-helper-methods/channel-helpers.test.ts` |
| Helper Methods | Message Helper Methods | `07-helper-methods/message-helpers.test.ts` |
| Helper Methods | Member Voice Methods | `07-helper-methods/member-voice.test.ts` |
| Helper Methods | Guild Asset Methods | `07-helper-methods/guild-assets.test.ts` |
| Helper Methods | Webhook Thread Operations | `07-helper-methods/webhook-threads.test.ts` |
| Entity Methods | User Methods (send, fetch, DM) | `08-entity-methods/user-methods.test.ts` |
| Entity Methods | GuildMember Shortcut Methods | `08-entity-methods/member-shortcuts.test.ts` |
| Entity Methods | Message Methods (reply, react, etc.) | `08-entity-methods/message-methods.test.ts` |
| Entity Methods | Reaction Methods | `08-entity-methods/reaction-methods.test.ts` |
| Entity Methods | Thread Methods | `08-entity-methods/thread-methods.test.ts` |
| Entity Methods | Role Methods | `08-entity-methods/role-methods.test.ts` |
| Entity Methods | Guild Methods | `08-entity-methods/guild-methods.test.ts` |
| Entity Methods | Collector Methods | `08-entity-methods/collectors.test.ts` |
| Managers | Client-Level Methods | `09-managers/client-methods.test.ts` |
| Managers | GuildMemberManager Methods | `09-managers/member-manager.test.ts` |
| Managers | GuildChannelManager Methods | `09-managers/channel-manager.test.ts` |
| Managers | Permission Overwrites | `09-managers/permission-overwrites.test.ts` |
| Managers | Sticker Methods | `09-managers/stickers.test.ts` |
| Managers | Discord.js Utilities | `09-managers/utilities.test.ts` |
| Channel Types | Message Reference & Reply Chain | `12-channel-types/message-references.test.ts` |
| Channel Types | Thread Member Management | `12-channel-types/thread-members.test.ts` |
| Channel Types | Channel Position & Category Sync | `12-channel-types/channel-sync.test.ts` |
| Channel Types | Guild Preview & Widget | `12-channel-types/guild-widget.test.ts` |
| Channel Types | Invite Properties | `12-channel-types/invite-properties.test.ts` |
| Channel Types | TextChannel-Specific Methods | `12-channel-types/text-channel-methods.test.ts` |
| Channel Types | VoiceChannel-Specific Methods | `12-channel-types/voice-channel-methods.test.ts` |
| Channel Types | AnnouncementChannel Methods | `12-channel-types/announcement-channel.test.ts` |
| Channel Types | Client Caching & Sweepers | `12-channel-types/client-caching.test.ts` |
| Channel Types | ForumChannel-Specific Methods | `12-channel-types/forum-channel-methods.test.ts` |
| Extended Entities | CategoryChannel Children | `13-extended-entities/category-children.test.ts` |
| Extended Entities | Role Position Comparison | `13-extended-entities/role-positions.test.ts` |
| Extended Entities | Channel Comparisons | `13-extended-entities/channel-comparisons.test.ts` |
| Extended Entities | Extended Embeds | `13-extended-entities/embeds.test.ts` |
| Extended Entities | Application & Bot User | `13-extended-entities/application-bot.test.ts` |
| Extended Entities | Fetch Options | `13-extended-entities/fetch-options.test.ts` |
| Extended Entities | Message Nonce & System Messages | `13-extended-entities/message-nonce.test.ts` |
| Extended Entities | Partial Structures | `13-extended-entities/partials.test.ts` |
| Extended Entities | Voice Regions | `13-extended-entities/voice-regions.test.ts` |
| Extended Entities | Guild Integrations & Vanity | `13-extended-entities/guild-integrations.test.ts` |
| Extended Entities | Guild Templates | `13-extended-entities/guild-templates.test.ts` |
| Extended Entities | Error Classes & Handling | `13-extended-entities/error-handling.test.ts` |
| Components | Button Variations | `14-components/buttons.test.ts` |
| Components | Select Menu Variations | `14-components/select-menus.test.ts` |
| Components | Modal & TextInput | `14-components/modals.test.ts` |
| Components | Multiple Action Rows | `14-components/action-rows.test.ts` |
| Components | Thread Archive/Unarchive | `14-components/thread-archive.test.ts` |
| Components | Audit Log Details | `14-components/audit-logs.test.ts` |
| Components | Scheduled Event Subscribers | `14-components/scheduled-event-subscribers.test.ts` |
| Voice & Presence | VoiceState Properties | `16-voice-presence/voice-state-properties.test.ts` |
| Voice & Presence | Stage Channel & Instance | `16-voice-presence/stage-instance.test.ts` |
| Voice & Presence | VoiceChannel Members Collection | `16-voice-presence/voice-channel-members.test.ts` |
| Voice & Presence | Presence & Activity Details | `16-voice-presence/presence-activity.test.ts` |
| Voice & Presence | User Properties | `16-voice-presence/user-properties.test.ts` |
| Voice & Presence | Attachment Properties | `16-voice-presence/attachment-properties.test.ts` |
| Entity Properties | Client Debug Events | `17-entity-properties/client-events.test.ts` |
| Entity Properties | Shard Events | `17-entity-properties/shard-events.test.ts` |
| Entity Properties | GuildMember Communication Disabled | `17-entity-properties/member-communication.test.ts` |
| Entity Properties | Webhook Types & Properties | `17-entity-properties/webhook-types.test.ts` |
| Entity Properties | ThreadMember Properties | `17-entity-properties/thread-member-properties.test.ts` |
| Entity Properties | GuildBan Properties | `17-entity-properties/guild-ban-properties.test.ts` |
| Entity Properties | Invite Targeting | `17-entity-properties/invite-targeting.test.ts` |
| Entity Properties | Emoji fetchAuthor | `17-entity-properties/emoji-author.test.ts` |
| Entity Properties | Scheduled Event Status Methods | `17-entity-properties/scheduled-event-status.test.ts` |
| Interaction Extras | Message roleSubscriptionData | `20-interaction-extras/role-subscription.test.ts` |
| Interaction Extras | Interaction Response States | `20-interaction-extras/interaction-response-states.test.ts` |
| Interaction Extras | Button Interaction Properties | `20-interaction-extras/button-interaction.test.ts` |
| Interaction Extras | Autocomplete Interaction | `20-interaction-extras/autocomplete.test.ts` |
| Interaction Extras | Message Position | `20-interaction-extras/message-position.test.ts` |
| Interaction Extras | Application Emojis | `20-interaction-extras/application-emojis.test.ts` |
| Interaction Extras | EntryPoint Command | `20-interaction-extras/entrypoint-command.test.ts` |
| Interaction Extras | Interaction Entitlements | `20-interaction-extras/interaction-entitlements.test.ts` |
| Interaction Extras | GuildMember Boost Info | `20-interaction-extras/member-boost.test.ts` |
| Interaction Extras | Client Statistics | `20-interaction-extras/client-statistics.test.ts` |
| Guild Settings | Guild AFK Settings | `21-guild-settings/guild-afk-settings.test.ts` |
| Guild Settings | Guild System Channel | `21-guild-settings/guild-system-channel.test.ts` |
| Guild Settings | Guild Verification & Content Filter | `21-guild-settings/guild-verification.test.ts` |
| Guild Settings | Guild Splash & Banner | `21-guild-settings/guild-splash-banner.test.ts` |
| Guild Settings | Guild Approximate Counts | `21-guild-settings/guild-counts.test.ts` |
| Guild Settings | Guild Max Properties | `21-guild-settings/guild-max-properties.test.ts` |
| Guild Settings | Guild Preview | `21-guild-settings/guild-preview.test.ts` |
| Guild Settings | Guild Widget | `21-guild-settings/guild-widget.test.ts` |
| Guild Settings | Channel Default Settings | `21-guild-settings/channel-defaults.test.ts` |
| Guild Settings | Forum Channel Settings | `21-guild-settings/forum-settings.test.ts` |
| Permissions & Collections | Permission & Intent Enforcement | `22-permissions-collections/permissions-intents.test.ts` |
| Permissions & Collections | Collection Methods on Mock Data | `22-permissions-collections/collection-methods.test.ts` |
| Permissions & Collections | Formatters & Embeds Round-Trip | `22-permissions-collections/formatters-embeds.test.ts` |
| Client Permissions | Client Options | `25-client-permissions/client-options.test.ts` |
| Client Permissions | Interaction Webhook | `25-client-permissions/interaction-webhook.test.ts` |
| Client Permissions | Permission Overwrites Manager | `25-client-permissions/permission-overwrites-manager.test.ts` |
| Client Permissions | GuildMember Permissions | `25-client-permissions/member-permissions.test.ts` |
| Client Permissions | Role Permissions | `25-client-permissions/role-permissions.test.ts` |
| Client Permissions | Message Mentions | `25-client-permissions/message-mentions.test.ts` |
| Client Permissions | Final Client Properties | `25-client-permissions/client-properties.test.ts` |
| Sharding | Sharding (Shard Calc, Config, Events, Multi-Client) | `26-sharding/sharding.test.ts` |
| Sharding | ShardingManager (Creation, Properties, Spawn*) | `26-sharding/sharding-manager.test.ts` |
| Voice | Voice Connection Basics | `27-voice/voice-connections.test.ts` |
| Voice | Audio Player | `27-voice/audio-player.test.ts` |
| Voice | Audio Resource | `27-voice/audio-resource.test.ts` |
| Voice | Voice Connection Events | `27-voice/voice-events.test.ts` |
| Voice | Voice Adapter Creator | `27-voice/voice-adapter.test.ts` |
| Advanced Features | Burst Reactions (Super Reactions) | `28-advanced-features/burst-reactions.test.ts` |
| Advanced Features | Role Connection Metadata | `28-advanced-features/role-connections.test.ts` |
| Advanced Features | Interaction Context Types | `28-advanced-features/interaction-contexts.test.ts` |
| Advanced Features | Message Snapshot Details | `28-advanced-features/message-snapshots.test.ts` |
| Advanced Features | Command Permissions V2 | `28-advanced-features/command-permissions-v2.test.ts` |
| Advanced Features | Guild Member Search Extended | `28-advanced-features/member-search.test.ts` |
| Advanced Features | Webhooks in Threads Extended | `28-advanced-features/webhooks-threads-extended.test.ts` |
| Manager Methods | ChannelManager Methods | `29-manager-methods/channel-manager.test.ts` |
| Manager Methods | GuildManager Methods | `29-manager-methods/guild-manager.test.ts` |
| Manager Methods | UserManager Methods | `29-manager-methods/user-manager.test.ts` |
| Manager Methods | All Client Events | `29-manager-methods/all-client-events.test.ts` |
| Manager Methods | Premium Required Responses | `29-manager-methods/premium-responses.test.ts` |
| Manager Methods | MessageManager Additional Methods | `29-manager-methods/message-manager.test.ts` |
| Gap Coverage | Final Gap Coverage | `30-gap-coverage/final-gap-coverage.test.ts` |

---

## Architecture

### Directory Structure

```
__tests__/integration/
├── INTEGRATION_TESTING_GUIDE.md    # This guide
├── global-setup.js                 # Starts mock server before all tests
├── global-teardown.js              # Stops mock server after all tests
├── setup/
│   ├── constants.ts                # Configuration values
│   ├── control-api.ts              # Control API helpers
│   └── test-client.ts              # Discord.js client factory
├── utils/
│   └── helpers.ts                  # Test utility functions
├── 01-connection/
│   └── connection.test.ts          # Basic connection tests
├── 02-gateway/
│   ├── gateway.test.ts             # Gateway tests
│   ├── heartbeat.test.ts           # Heartbeat tests
│   ├── reconnection.test.ts        # Reconnection tests
│   ├── rest-api.test.ts            # REST API tests
│   └── intents.test.ts             # Intent filtering tests
├── 03-messaging/
│   ├── channels.test.ts            # Channel CRUD tests
│   ├── messages.test.ts            # Message tests
│   ├── threads.test.ts             # Thread tests
│   └── webhooks.test.ts            # Webhook tests
├── 04-guild-entities/
│   ├── members.test.ts             # Member operations
│   ├── roles.test.ts               # Role CRUD tests
│   ├── bans.test.ts                # Ban management tests
│   └── permissions.test.ts         # Permission tests
├── 05-discord-features/
│   ├── interactions.test.ts        # Interaction tests
│   ├── automod.test.ts             # Auto moderation tests
│   ├── stickers.test.ts            # Sticker tests
│   ├── emojis.test.ts              # Emoji tests
│   ├── invites.test.ts             # Invite tests
│   ├── scheduled-events.test.ts    # Scheduled events
│   └── ... (additional tests)
├── 06-recording-state/
│   ├── recording-export.test.ts    # Recording export tests
│   ├── recording-replay.test.ts    # Recording replay tests
│   ├── state-api.test.ts           # State inspection API tests
│   ├── attachments.test.ts         # File upload tests
│   ├── components-v2.test.ts       # Components V2 tests
│   ├── forum-channels.test.ts      # Forum channel tests
│   ├── guild-settings.test.ts      # Guild CRUD tests
│   └── message-completeness.test.ts # Message validation tests
├── 07-helper-methods/
│   ├── interaction-lifecycle.test.ts # Interaction response lifecycle
│   ├── channel-helpers.test.ts      # Channel helper methods
│   ├── message-helpers.test.ts      # Message helper methods
│   ├── member-voice.test.ts         # Member voice state methods
│   ├── guild-assets.test.ts         # Guild asset methods
│   └── webhook-threads.test.ts      # Webhook thread operations
├── 08-entity-methods/
│   ├── user-methods.test.ts         # User methods (send, fetch, DM)
│   ├── member-shortcuts.test.ts     # GuildMember shortcut methods
│   ├── message-methods.test.ts      # Message methods (reply, react, etc.)
│   ├── reaction-methods.test.ts     # Reaction methods
│   ├── thread-methods.test.ts       # Thread methods
│   ├── role-methods.test.ts         # Role methods
│   ├── guild-methods.test.ts        # Guild methods
│   └── collectors.test.ts           # Collector methods
├── 09-managers/
│   ├── client-methods.test.ts       # Client-level methods
│   ├── member-manager.test.ts       # GuildMemberManager methods
│   ├── channel-manager.test.ts      # GuildChannelManager methods
│   ├── permission-overwrites.test.ts # Permission overwrites
│   ├── stickers.test.ts             # Sticker methods
│   └── utilities.test.ts            # Discord.js utilities
├── 12-channel-types/
│   ├── message-references.test.ts   # Message reference & reply chain
│   ├── thread-members.test.ts       # Thread member management
│   ├── channel-sync.test.ts         # Channel position & category sync
│   ├── guild-widget.test.ts         # Guild preview & widget
│   ├── invite-properties.test.ts    # Invite properties
│   ├── text-channel-methods.test.ts # TextChannel-specific methods
│   ├── voice-channel-methods.test.ts # VoiceChannel-specific methods
│   ├── announcement-channel.test.ts # AnnouncementChannel methods
│   ├── client-caching.test.ts       # Client caching & sweepers
│   └── forum-channel-methods.test.ts # ForumChannel-specific methods
├── 13-extended-entities/
│   ├── category-children.test.ts    # CategoryChannel children
│   ├── role-positions.test.ts       # Role position comparison
│   ├── channel-comparisons.test.ts  # Channel type checks
│   ├── embeds.test.ts               # Extended embed features
│   ├── application-bot.test.ts      # Application & bot user
│   ├── fetch-options.test.ts        # Fetch method options
│   ├── message-nonce.test.ts        # Message nonce & system messages
│   ├── partials.test.ts             # Partial structures
│   ├── voice-regions.test.ts        # Voice regions
│   ├── guild-integrations.test.ts   # Guild integrations & vanity
│   ├── guild-templates.test.ts      # Guild templates
│   └── error-handling.test.ts       # Error classes & handling
├── 14-components/
│   ├── buttons.test.ts              # Button style variations
│   ├── select-menus.test.ts         # Select menu types & options
│   ├── modals.test.ts               # Modal & TextInput variations
│   ├── action-rows.test.ts          # Action row limits & mixing
│   ├── thread-archive.test.ts       # Thread archive/unarchive edge cases
│   ├── audit-logs.test.ts           # Audit log entry details
│   └── scheduled-event-subscribers.test.ts # Scheduled event subscribers
├── 16-voice-presence/
│   ├── voice-state-properties.test.ts # VoiceState flags & properties
│   ├── stage-instance.test.ts        # Stage channel & instance ops
│   ├── voice-channel-members.test.ts # Voice channel member tracking
│   ├── presence-activity.test.ts     # Presence & activity details
│   ├── user-properties.test.ts       # User extended properties
│   └── attachment-properties.test.ts # Attachment metadata
├── 17-entity-properties/
│   ├── client-events.test.ts         # Client debug, warn, error, invalidated
│   ├── shard-events.test.ts          # Shard lifecycle events
│   ├── member-communication.test.ts  # Communication disabled & member flags
│   ├── webhook-types.test.ts         # Webhook type checks & properties
│   ├── thread-member-properties.test.ts # ThreadMember properties
│   ├── guild-ban-properties.test.ts  # GuildBan properties
│   ├── invite-targeting.test.ts      # Invite targeting & date properties
│   ├── emoji-author.test.ts          # Emoji fetchAuthor method
│   └── scheduled-event-status.test.ts # Scheduled event status methods
├── 20-interaction-extras/
│   ├── role-subscription.test.ts     # Message roleSubscriptionData
│   ├── interaction-response-states.test.ts # Interaction state tracking
│   ├── button-interaction.test.ts    # Button interaction properties
│   ├── autocomplete.test.ts          # Autocomplete interactions
│   ├── message-position.test.ts      # Message position property
│   ├── application-emojis.test.ts    # Application emoji management
│   ├── entrypoint-command.test.ts    # PrimaryEntryPoint command type
│   ├── interaction-entitlements.test.ts # Interaction entitlements
│   ├── member-boost.test.ts          # GuildMember boost info
│   └── client-statistics.test.ts     # Client cache statistics
├── 21-guild-settings/
│   ├── guild-afk-settings.test.ts    # Guild AFK channel & timeout settings
│   ├── guild-system-channel.test.ts  # Guild system channel & flags
│   ├── guild-verification.test.ts    # Verification level & content filter
│   ├── guild-splash-banner.test.ts   # Guild splash, banner, discovery splash
│   ├── guild-counts.test.ts          # Guild member & presence counts (read-only)
│   ├── guild-max-properties.test.ts  # Guild max limits (read-only)
│   ├── guild-preview.test.ts         # Guild preview (discoverable guilds)
│   ├── guild-widget.test.ts          # Guild widget settings & data
│   ├── channel-defaults.test.ts      # Channel default settings & slowmode
│   └── forum-settings.test.ts        # Forum channel settings & tags
├── 22-permissions-collections/
│   ├── permissions-intents.test.ts   # Permission & intent enforcement
│   ├── collection-methods.test.ts    # Collection methods on mock data
│   └── formatters-embeds.test.ts     # Formatters & embeds round-trip
├── 25-client-permissions/
│   ├── client-options.test.ts        # Client configuration options
│   ├── interaction-webhook.test.ts   # Interaction webhook property & methods
│   ├── permission-overwrites-manager.test.ts # PermissionOverwriteManager methods
│   ├── member-permissions.test.ts    # GuildMember permission methods
│   ├── role-permissions.test.ts      # Role permission methods
│   ├── message-mentions.test.ts      # Message mentions properties
│   └── client-properties.test.ts     # Final client properties
├── 26-sharding/
│   ├── sharding.test.ts              # Sharding configuration & multi-client tests
│   ├── sharding-manager.test.ts      # ShardingManager creation & properties
│   └── fixtures/
│       └── shard-bot.js              # Bot script for ShardingManager tests
├── 27-voice/
│   ├── voice-connections.test.ts     # Voice connection basics
│   ├── audio-player.test.ts          # Audio player functionality
│   ├── audio-resource.test.ts        # Audio resource handling
│   ├── voice-events.test.ts          # Voice connection events
│   └── voice-adapter.test.ts         # Voice adapter creator
├── 28-advanced-features/
│   ├── burst-reactions.test.ts       # Burst/super reactions
│   ├── role-connections.test.ts      # Role connection metadata
│   ├── interaction-contexts.test.ts  # Interaction context types
│   ├── message-snapshots.test.ts     # Message snapshot details
│   ├── command-permissions-v2.test.ts # Command permissions V2
│   ├── member-search.test.ts         # Guild member search extended
│   └── webhooks-threads-extended.test.ts # Webhooks in threads extended
├── 29-manager-methods/
│   ├── channel-manager.test.ts       # ChannelManager methods
│   ├── guild-manager.test.ts         # GuildManager methods
│   ├── user-manager.test.ts          # UserManager methods
│   ├── all-client-events.test.ts     # All client events
│   ├── premium-responses.test.ts     # Premium required responses
│   └── message-manager.test.ts       # MessageManager additional methods
└── 30-gap-coverage/
    └── final-gap-coverage.test.ts    # Final gap coverage tests
```

### Server Lifecycle

1. **Global Setup** (`global-setup.js`):
   - Starts the mock server via `npx robo start`
   - Waits for "Gateway WebSocket server ready" message
   - Stores process reference in `globalThis.__MOCK_SERVER_PROCESS__`

2. **Test Execution**:
   - All test files share the same server instance
   - Each test creates its own session via Control API
   - Sessions are isolated from each other

3. **Global Teardown** (`global-teardown.js`):
   - Sends SIGTERM to gracefully stop the server
   - Falls back to SIGKILL if needed

### Key Concepts

#### Sessions

Each test should create its own session using `createSession()`. Sessions provide:
- Isolated state (guilds, channels, users)
- Unique token for authentication
- Independent configuration (intents, permissions)

```typescript
const session = await createSession({
  name: 'my-test',
  config: {
    botUser: { username: 'TestBot' },
    guilds: [{ name: 'Test Guild' }],
    enforceIntents: true
  }
})
```

#### Control API

The Control API (`/api/control/...`) allows tests to:
- Create and manage sessions
- Dispatch events to clients
- Control server behavior (stop heartbeats, disconnect, etc.)
- Query session state

---

## Running Tests

### All Tests (Unit + Integration)

```bash
pnpm test
```

### Unit Tests Only

```bash
pnpm test:unit
```

### Integration Tests Only

```bash
pnpm test:integration
```

### Specific Test File

```bash
pnpm test:integration -- --testPathPattern=gateway
```

### Specific Test Suite

```bash
pnpm test:integration -- --testPathPattern=02-gateway
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MOCK_REST_URL` | `http://localhost:3000/api` | REST API base URL |
| `MOCK_WS_URL` | `ws://localhost:3000` | WebSocket URL |
| `MOCK_CONTROL_URL` | `http://localhost:3000/api/control` | Control API URL |
| `MOCK_PORT` | `3000` | Server port |
| `MOCK_TIMEOUT` | `10000` | Default timeout (ms) |

---

## Test Structure

### Basic Test Pattern

```typescript
import { Client } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('My Test Suite', () => {
  let client: Client | null = null

  afterEach(async () => {
    await destroyClient(client)
    client = null
  })

  it('should do something', async () => {
    // 1. Create session
    const session = await createSession({
      name: 'test-name',
      config: {
        guilds: [{ name: 'Test Guild' }]
      }
    })

    // 2. Create and connect client
    client = createTestClient()
    await client.login(session.token)
    await waitForReady(client)

    // 3. Test assertions
    expect(client.isReady()).toBe(true)
  })
})
```

### Test with Event Dispatch

```typescript
it('should receive dispatched event', async () => {
  const session = await createSession({ /* ... */ })
  client = createTestClient()
  await client.login(session.token)
  await waitForReady(client)

  const channel = client.channels.cache.first()!

  // Set up event listener BEFORE dispatching
  const messagePromise = waitForEvent(client, Events.MessageCreate, 5000)

  // Dispatch event via Control API
  await dispatchEvent(session.id, 'MESSAGE_CREATE', {
    channel_id: channel.id,
    content: 'Test message'
  })

  // Wait for and verify event
  const message = await messagePromise
  expect(message.content).toBe('Test message')
})
```

---

## Test Utilities Reference

### `setup/constants.ts`

```typescript
// Configuration
MOCK_CONFIG.REST_URL      // REST API URL
MOCK_CONFIG.WS_URL        // WebSocket URL
MOCK_CONFIG.CONTROL_URL   // Control API URL
MOCK_CONFIG.TIMEOUT       // Default timeout

// Intents
ALL_INTENTS               // All intents combined
PRIVILEGED_INTENTS        // { GUILD_MEMBERS, GUILD_PRESENCES, MESSAGE_CONTENT }

// Close Codes
GATEWAY_CLOSE_CODES       // { NORMAL, UNKNOWN_ERROR, AUTH_FAILED, ... }
```

### `setup/control-api.ts`

```typescript
// Session Management
createSession(config)           // Create new test session
resetSession(sessionId)         // Reset session to initial state
deleteSession(sessionId)        // Delete a session
getSessionStatus(sessionId)     // Get session info and connection count

// Event Dispatch
dispatchEvent(sessionId, event, data)  // Dispatch event to clients

// Intent Control
sessionIntents(sessionId, options?)    // Get/set intent configuration

// Gateway Control
stopHeartbeatAcks(sessionId, stop)     // Stop/resume heartbeat ACKs
disconnectSession(sessionId, code)      // Force disconnect with close code
invalidateSession(sessionId)            // Invalidate session for fresh READY

// Action Recording
getSessionActions(sessionId, options?)  // Get recorded actions

// Recording & Replay
getSessionRecording(sessionId)          // Export session recording
replayRecording(sessionId, recording, options?)  // Replay a recording
getFullSessionState(sessionId)          // Get full session state
getDetailedSessionStatus(sessionId)     // Get detailed status with counts

// Direct REST API
mockRestAPI(token, endpoint, options?)  // Make direct REST API requests
```

### `setup/test-client.ts`

```typescript
// Client Creation
createTestClient(options?)        // Create client with default intents
createFullAccessClient()          // Client with ALL intents
createMinimalClient()             // Client with only GUILDS intent
createClientWithIntents(intents)  // Client with specific intents

// Client Lifecycle
destroyClient(client)             // Safely destroy client
connectClient(client, token)      // Connect and wait for ready
```

### `utils/helpers.ts`

```typescript
// Event Waiting
waitForEvent(client, event, timeout, predicate?)  // Wait for specific event
waitForReady(client, timeout)                      // Wait for client ready
waitForAllEvents(client, events, timeout)         // Wait for multiple events

// Utilities
delay(ms)                         // Promise-based delay
retry(fn, options)                // Retry with exponential backoff
generateSnowflake()               // Generate Discord snowflake ID
expectError(fn, matcher?)         // Assert function throws
createDeferred()                  // Create externally-controlled promise
```

---

## Control API Reference

### Session Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/sessions` | Create new session |
| GET | `/sessions/:id` | Get session info |
| DELETE | `/sessions/:id` | Delete session |
| GET | `/sessions/:id/state` | Get full session state |
| POST | `/sessions/:id/reset` | Reset to initial state |
| GET | `/sessions/:id/status` | Get status with connection count |

### Event Dispatch

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/sessions/:id/dispatch` | Dispatch event to clients |

**Request Body:**
```json
{
  "event": "MESSAGE_CREATE",
  "data": {
    "channel_id": "123456789",
    "content": "Hello!"
  }
}
```

### Gateway Control

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/sessions/:id/heartbeat/stop-acks` | Stop heartbeat ACKs |
| POST | `/sessions/:id/gateway/disconnect` | Force disconnect |
| POST | `/sessions/:id/gateway/invalidate-session` | Invalidate session |

### Intent Control

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/sessions/:id/intents` | Get intent configuration |
| POST | `/sessions/:id/intents` | Update intent configuration |

### Voice Control

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/sessions/:id/voice-server` | Get all voice server states |
| GET | `/sessions/:id/voice-server?guild_id=xxx` | Get voice server state for guild |
| POST | `/sessions/:id/voice-server` | Trigger VOICE_SERVER_UPDATE |
| DELETE | `/sessions/:id/voice-server?guild_id=xxx` | Clear voice server state |
| POST | `/sessions/:id/voice-error` | Simulate voice connection error |

**Voice Server Request Body:**
```json
{
  "guild_id": "123456789",
  "channel_id": "987654321",
  "endpoint": "localhost:50001"
}
```

**Voice Error Request Body:**
```json
{
  "guild_id": "123456789",
  "message": "Voice connection error",
  "code": 4000,
  "recoverable": false
}
```

**Note:** The mock server runs a separate Voice Gateway WebSocket server on port 50001 with TLS (wss://). When bots join voice channels via VOICE_STATE_UPDATE dispatch, the server automatically sends VOICE_SERVER_UPDATE with the mock voice gateway endpoint.

**TLS Limitation:** The voice gateway uses self-signed certificates. @discordjs/voice always connects via `wss://` with no option to disable TLS verification. In test environments, TLS handshake issues may occur even with `NODE_TLS_REJECT_UNAUTHORIZED=0`. Tests that require actual voice connections (voice-connections.test.ts, voice-events.test.ts, and some audio-player tests) are skipped by default. Tests that don't require voice connections (audio-resource.test.ts, voice-adapter.test.ts, basic audio-player tests) work correctly.

---

## Writing New Tests

### Step 1: Choose the Right Test Directory

- Use existing test directory if test fits the category
- Create new test directory for new feature areas

### Step 2: Follow the Pattern

```typescript
// 1. Import from setup utilities, not directly from source
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady, waitForEvent, delay } from '../utils/helpers.js'

// 2. Use describe blocks for organization
describe('Feature Name', () => {
  // 3. Always clean up clients
  let client: Client | null = null

  afterEach(async () => {
    await destroyClient(client)
    client = null
  })

  // 4. Use descriptive test names
  it('should [expected behavior] when [condition]', async () => {
    // 5. Create isolated session for each test
    const session = await createSession({
      name: 'descriptive-test-name',
      config: { /* minimal config needed */ }
    })

    // 6. Test implementation
    client = createTestClient()
    await client.login(session.token)
    await waitForReady(client)

    // 7. Clear assertions
    expect(result).toBe(expected)
  })
})
```

### Step 3: Consider Edge Cases

- What happens with invalid input?
- What happens when features are disabled?
- What happens with race conditions?

---

## Adding New Test Suites

### Step 1: Create Test Directory

```bash
mkdir __tests__/integration/NN-descriptive-name
```

### Step 2: Create Test Files

Follow naming convention: `feature.test.ts`

### Step 3: Update This Guide

Add new suite to the [Test Organization](#test-organization) table.

### Step 4: Update Plan File (if applicable)

If working from a plan file, update it to reflect completion.

---

## Troubleshooting

### Server Fails to Start

**Symptom:** Tests hang or timeout at startup

**Solution:**
1. Check if port 3000 is available: `lsof -i :3000`
2. Kill any existing processes: `pkill -f "robo start"`
3. Check server logs in test output

### Tests Timeout

**Symptom:** Tests fail with "Timeout waiting for..."

**Solutions:**
1. Increase timeout in specific test: `it('...', async () => {...}, 30000)`
2. Check if event is being dispatched correctly
3. Verify client has correct intents for the event

### Client Authentication Fails

**Symptom:** "Invalid session token" errors

**Solutions:**
1. Ensure session was created successfully
2. Use `session.token` not `session.id` for login
3. Check session hasn't expired (default TTL: 1 hour)

### Events Not Received

**Symptom:** Event listener never fires

**Solutions:**
1. Verify client has required intents
2. Check `enforceIntents` session config
3. Set up listener BEFORE dispatching event
4. Use `waitForEvent()` helper with proper timeout

### Import Errors

**Symptom:** Module resolution failures

**Solutions:**
1. Use `.js` extension in imports (ESM requirement)
2. Ensure paths are relative to test file location
3. Check that ts-jest is configured correctly

---

## Best Practices

### Session Naming

Use descriptive session names for debugging:
```typescript
// Good
createSession({ name: 'message-content-intent-test' })

// Bad
createSession({ name: 'test1' })
```

### Isolation

Each test should be independent:
- Create new session per test
- Don't share state between tests
- Clean up clients in afterEach

### Timeouts

Be mindful of timeouts:
- Default Jest timeout: 30000ms (configured in jest.config.ts)
- Use explicit timeouts for slow operations
- Heartbeat tests may need 60000ms+

### Error Messages

Use clear assertions:
```typescript
// Good - clear failure message
expect(message.content).toBe('Expected content')

// Better - with context
expect(message.content, 'Message content should not be stripped').toBe('Expected')
```

### Event Handling

Always set up listeners before triggering events:
```typescript
// Correct order
const eventPromise = waitForEvent(client, Events.MessageCreate)
await dispatchEvent(session.id, 'MESSAGE_CREATE', data)
const result = await eventPromise

// Wrong order - race condition!
await dispatchEvent(session.id, 'MESSAGE_CREATE', data)
const result = await waitForEvent(client, Events.MessageCreate) // May miss event
```

---

## Additional Test Coverage

This infrastructure supports adding tests for additional Discord.js functionality:

- Interaction handling (slash commands, buttons, modals)
- Voice state, presence, typing events
- Threads, forums, polls
- Additional Discord features as they are added

When implementing new test suites:
1. Read the corresponding test specification document
2. Create new test directories as needed
3. Follow existing patterns and utilities
4. Update this guide with new endpoints/utilities

---

## Lessons Learned & Debugging Techniques

This section documents key insights and techniques discovered while implementing and debugging the integration tests. These patterns will help you solve similar issues.

### 1. BigInt Serialization

**Problem:** Session configuration uses BigInt for `approvedPrivilegedIntents`, but JSON doesn't support BigInt.

**Symptom:** Tests timing out or intent filtering not working correctly.

**Solution:** The control API helpers serialize BigInt to string, and the server converts string back to BigInt:

```typescript
// Client-side: control-api.ts
function serializeBody(body: unknown): string {
  return JSON.stringify(body, (_key, value) => {
    if (typeof value === 'bigint') {
      return value.toString()
    }
    return value
  })
}

// Server-side: sessions.ts
if (body.config?.approvedPrivilegedIntents !== undefined) {
  const intentsValue = body.config.approvedPrivilegedIntents
  if (typeof intentsValue === 'string') {
    body.config.approvedPrivilegedIntents = BigInt(intentsValue)
  }
}
```

**Key Insight:** Always trace data through the entire flow (client → HTTP → server → state) when debugging serialization issues.

### 2. Configurable Heartbeat Interval

**Problem:** Default Discord heartbeat interval is 41.25 seconds, making heartbeat tests extremely slow.

**Symptom:** Heartbeat tests timing out or `client.ws.ping` staying at -1.

**Solution:** Add a control API endpoint to configure the gateway's heartbeat interval:

```typescript
// Set short heartbeat interval for testing (1 second)
await setHeartbeatInterval(1000)

// In test's beforeAll
beforeAll(async () => {
  await setHeartbeatInterval(1000)
})

afterAll(async () => {
  await setHeartbeatInterval(41250) // Restore default
})
```

**Key Insight:** When testing time-dependent behavior, make the timing configurable. Don't hard-code production values.

### 3. Discord.js Event Names

**Problem:** Discord.js doesn't always emit `shardDisconnect` when expected. It may emit `shardReconnecting` instead.

**Symptom:** Tests waiting for `shardDisconnect` timing out.

**Solution:** Listen for multiple possible events:

```typescript
const eventPromise = new Promise<string>((resolve) => {
  const onDisconnect = () => { cleanup(); resolve('shardDisconnect') }
  const onReconnecting = () => { cleanup(); resolve('shardReconnecting') }

  const cleanup = () => {
    client?.off('shardDisconnect', onDisconnect)
    client?.off('shardReconnecting', onReconnecting)
  }

  client?.on('shardDisconnect', onDisconnect)
  client?.on('shardReconnecting', onReconnecting)

  setTimeout(() => { cleanup(); resolve('timeout') }, 10000)
})

const result = await eventPromise
expect(['shardDisconnect', 'shardReconnecting']).toContain(result)
```

**Key Insight:** Discord.js behavior may differ from raw Discord API. Test for observable outcomes, not specific implementation details.

### 4. Message Mentions Flow

**Problem:** Bot mention exception for MessageContent intent not working.

**Symptom:** Message content stripped even when bot is mentioned.

**Root Cause:** Mentions weren't being passed through the dispatch flow:
1. Dispatch endpoint didn't extract mentions from request
2. `dispatchMessage` didn't accept mentions parameter
3. `MockMessageConfig` didn't have mentions field
4. `createMockMessage` always set mentions to empty array

**Solution:** Trace the entire data flow and add mentions support at each layer:

```typescript
// 1. Dispatch endpoint extracts mention IDs
const mentionIds = data.mentions?.map((m) => m.id).filter((id): id is string => !!id) ?? []

// 2. Pass to dispatchMessage
await session.dispatchMessage({
  channelId: data.channel_id,
  content: data.content,
  mentions: mentionIds
})

// 3. createMessage uses mentions
const message = this.state.createMessage({
  mentions: options.mentions ?? []
})

// 4. createMockMessage uses config.mentions
mentions: config.mentions ?? [],
```

**Key Insight:** When a feature doesn't work, trace the data through every transformation. Draw the flow diagram mentally:
```
Test → dispatch endpoint → session.dispatchMessage → state.createMessage →
createMockMessage → buildMessageCreatePayload → stripMessageContent → client
```

### 5. Explicit Test Timeouts

**Problem:** Jest default timeout (5000ms) too short for some tests.

**Symptom:** Tests failing with "Exceeded timeout" errors.

**Solution:** Add explicit timeouts to slow tests:

```typescript
it('should complete slowly', async () => {
  // test code
}, 15000)  // 15 second timeout

// Or using the callback pattern
it(
  'should complete slowly',
  async () => {
    // test code
  },
  15000
)
```

**Key Insight:** Always add explicit timeouts to tests that:
- Wait for heartbeat cycles
- Wait for reconnection attempts
- Involve network delays
- Use `delay()` calls

### 6. Client Cleanup

**Problem:** Jest warning about open handles after tests complete.

**Solution:** Improve `destroyClient` to fully clean up:

```typescript
export async function destroyClient(client: Client | null): Promise<void> {
  if (!client) return
  try {
    client.removeAllListeners()  // Prevent memory leaks
    client.destroy()
    await new Promise((resolve) => setTimeout(resolve, 100))  // Allow WebSocket cleanup
  } catch {
    // Ignore errors during cleanup
  }
}
```

**Key Insight:** WebSocket connections need time to close. Add small delays in cleanup code.

### 7. Debugging Test Failures

When tests fail, use this debugging checklist:

1. **Check the error message carefully** - It often points to exactly what's wrong
2. **Run the failing test in isolation** - `pnpm test:integration -- --testPathPattern=<test-name>`
3. **Add console.log at key points** - Temporarily log values at each transformation
4. **Check the mock server logs** - They show what's being dispatched
5. **Verify the session config** - Intent settings, approved privileged intents
6. **Check if it's a timing issue** - Add delays or increase timeouts
7. **Trace the data flow** - From test input to client output

### 8. Creating Missing REST Endpoints

**Problem:** Tests fail with "API Route not found" errors.

**Symptom:** `TypeError: fetch failed` or 404 errors.

**Solution:** Create the missing endpoint in the mock server:

```typescript
// Example: /api/v10/users/[id].ts
export default async (request: RoboRequest) => {
  const { id } = request.params as { id: string }

  // Handle @me alias
  if (id === '@me') {
    return buildUserResponse(session.state.botUser)
  }

  // Look up user in session state
  const user = session.state.users.get(id)
  if (!user) {
    return new Response(JSON.stringify({ message: 'Unknown User', code: 10013 }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  return buildUserResponse(user)
}
```

**Key Insight:** Discord.js makes many REST API calls. When adding tests, you may need to implement missing endpoints first.

### 9. Intent Filtering Debug Approach

When intent filtering doesn't work as expected:

1. **Check enforceIntents is set:**
   ```typescript
   config: {
     enforceIntents: true,  // Must be true!
     approvedPrivilegedIntents: BigInt(...)
   }
   ```

2. **Verify client intents:**
   ```typescript
   const client = createClientWithIntents([
     GatewayIntentBits.Guilds,
     GatewayIntentBits.GuildMessages
   ])
   ```

3. **Check the EVENT_INTENTS mapping** in `src/core/intents.ts`

4. **Check shouldDispatchEvent()** - Add logging to see what's being checked

5. **Check stripMessageContent()** - For MESSAGE_CONTENT intent issues

---

## Quick Reference

### Create Test Session
```typescript
const session = await createSession({
  name: 'test-name',
  config: {
    botUser: { username: 'Bot' },
    guilds: [{ name: 'Guild' }],
    enforceIntents: true,
    approvedPrivilegedIntents: BigInt(1 << 15)
  }
})
```

### Connect Client
```typescript
client = createTestClient()
await client.login(session.token)
await waitForReady(client)
```

### Dispatch Event
```typescript
await dispatchEvent(session.id, 'MESSAGE_CREATE', {
  channel_id: channel.id,
  content: 'Hello'
})
```

### Wait for Event
```typescript
const message = await waitForEvent(client, Events.MessageCreate, 5000)
```

### Control Gateway
```typescript
await stopHeartbeatAcks(session.id, true)
await disconnectSession(session.id, 4000)
await invalidateSession(session.id)
```

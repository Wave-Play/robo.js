# @robojs/giveaways

🎉 One-click Discord giveaways plugin for Robo.js - Makes running giveaways effortless with automatic winner selection, persistent storage, and rich moderation tools.

[![npm version](https://badge.fury.io/js/%40robojs%2Fgiveaways.svg)](https://www.npmjs.com/package/@robojs/giveaways)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

✨ **Zero-Friction Entry** - Users click a button to enter giveaways  
🎯 **Fair Winner Selection** - Random selection with no duplicates  
💾 **Persistent Storage** - All giveaway data survives bot restarts via Flashcore with automatic recovery  
⏰ **Automatic Scheduling** - Giveaways end automatically at configured time  
🔒 **Role Restrictions** - Allow/deny specific roles from entering  
📅 **Account Age Limits** - Require minimum account age  
🔄 **Reroll Winners** - Select new winners from remaining entrants  
⚙️ **Per-Guild Settings** - Customize defaults for each server  
🌐 **Optional Web API** - REST endpoints for dashboards (requires @robojs/server)  
🛡️ **Permission Checks** - Manage Server permission for admin commands

## Installation

npx robo add @robojs/giveaways

## Quick Start

### 1. Start a Giveaway

/giveaway start prize: Discord Nitro duration: 1h winners: 1

### 2. Users Click "Enter Giveaway"

Members click the button on the giveaway message to enter.

### 3. Automatic Winner Selection

When time expires, the bot automatically:

- Selects random winner(s)
- Updates the message
- Announces winners in channel
- Sends DMs to winners (optional)

## Commands

### `/giveaway start`

Start a new giveaway with customizable options.

**Required Options:**

- `prize` - The prize description
- `duration` - Time until end (e.g., `10m`, `1h`, `2d`)

**Optional Options:**

- `winners` - Number of winners (default: 1)
- `channel` - Channel to post in (default: current)
- `allow_roles` - Comma-separated role IDs that can enter
- `deny_roles` - Comma-separated role IDs that cannot enter
- `min_account_age_days` - Minimum account age in days

**Example:**
/giveaway start prize: 3x Nitro duration: 24h winners: 3 min_account_age_days: 30

### `/giveaway end`

Manually end an active giveaway and select winners immediately.

**Options:**

- `message_id` - The giveaway message ID

### `/giveaway cancel`

Cancel a giveaway without selecting winners.

**Options:**

- `message_id` - The giveaway message ID

### `/giveaway reroll`

Reroll winners from remaining eligible entrants.

**Options:**

- `message_id` - The giveaway message ID
- `count` - Number of new winners (default: original winner count)

### `/giveaway list`

View all active and recent giveaways in the server.

### `/giveaway info`

Get detailed information about a specific giveaway.

**Options:**

- `message_id` - The giveaway message ID

### `/giveaway settings get`

View current giveaway settings for the server.

### `/giveaway settings set`

Update server giveaway settings.

**Options:**

- `default_winners` - Default number of winners
- `default_duration` - Default duration
- `button_label` - Custom button text
- `dm_winners` - Send DMs to winners (true/false)
- `max_winners` - Maximum winners allowed

### `/giveaway settings reset`

Reset all settings to defaults.

## Required Permissions

**For the Bot:**

- Send Messages
- Embed Links
- Read Message History
- Use Slash Commands
- Manage Messages

**For Admin Commands** (`end`, `cancel`, `reroll`, `settings`):

- Manage Server permission

## Configuration

### Declarative Config (Optional)

Create `config/plugins/robojs/giveaways.mjs`:

export default {
defaults: {
winners: 1,
duration: '1h',
buttonLabel: 'Enter Giveaway',
dmWinners: true
},
limits: {
maxWinners: 20,
maxDurationDays: 30
},
restrictions: {
allowRoleIds: [],
denyRoleIds: [],
minAccountAgeDays: null
}
}

### Imperative API (Optional)

For dashboard integrations:

import { getGuildSettings, setGuildSettings } from '@robojs/giveaways'
import type { GuildSettings } from '@robojs/giveaways/types'

// Get settings
const settings = await getGuildSettings('guild_id_here')

// Update settings
await setGuildSettings('guild_id_here', {
defaults: {
winners: 2,
duration: '2h',
buttonLabel: 'Join Now!',
dmWinners: true
},
limits: {
maxWinners: 10,
maxDurationDays: 7
},
restrictions: {
allowRoleIds: [],
denyRoleIds: [],
minAccountAgeDays: 7
}
})

## Optional Integrations

### Web API (@robojs/server)

Install the server plugin to enable REST API endpoints:

npx robo add @robojs/server

**Endpoints:**

- `GET /api/giveaways/:guildId` - List active/recent giveaways
- `GET /api/giveaways/:guildId/giveaway/:id` - Get specific giveaway
- `PATCH /api/giveaways/:guildId/giveaway/:id` - Mutate giveaway (end/cancel/reroll)
- `GET /api/giveaways/:guildId/settings` - Get settings
- `PATCH /api/giveaways/:guildId/settings` - Update settings

### Enhanced Scheduling with @robojs/cron (Optional)

Giveaway data always persists via Flashcore — with or without cron. Adding `@robojs/cron` enables enhanced scheduling capabilities suited for production (higher accuracy, longer time windows, job persistence, and better recovery), but it is not required for basic persistence.

| Capability                | Without `@robojs/cron`                       | With `@robojs/cron`         |
| ------------------------- | -------------------------------------------- | --------------------------- |
| Giveaway Data Persistence | ✅ Yes (Flashcore)                           | ✅ Yes (Flashcore)          |
| Recovery on Restart       | ✅ Manual (handled in `src/events/ready.ts`) | ✅ Auto + Manual validation |
| Timing Accuracy           | ⚠️ `setTimeout` cascading                    | ✅ Precise cron expressions |
| Maximum Duration          | ⚠️ ~24.8 days per cycle                      | ✅ No practical limit       |
| Job Persistence           | ❌ In-memory only                            | ✅ Stored in Flashcore      |
| Job Auditability          | ❌ No                                        | ✅ Can query job status     |

Install:

```bash
npx robo add @robojs/cron
```

Details:

- Higher Accuracy: Without cron, long giveaways exceed the `MAX_TIMEOUT_MS` limit (~2^31−1 ms, ~24.8 days) and are broken into cascading `setTimeout` calls in `scheduleGiveawayEnd()`, which can introduce small timing drift. With cron, a single job is scheduled using a precise cron expression generated by `timestampToCronExpression()` for accurate execution.
- Longer Time Windows: `setTimeout` is bounded by `MAX_TIMEOUT_MS`, requiring reschedules for >24.8 day durations. Cron schedules 30+ day giveaways without cascading or drift.
- Redundant Recovery: Without cron, recovery relies on the `ready.ts` startup handler scanning Flashcore and calling `scheduleGiveawayEnd()` to restore timers. With cron, jobs are automatically restored by the cron plugin during initialization, and the `ready.ts` handler double-checks via `Cron.get()` — providing redundancy.
- Job Auditability: Cron-backed jobs have IDs and can be inspected via `Cron.get(jobId)`. Plain `setTimeout` timers provide no audit trail.

Note: The plugin works perfectly without cron. For production, `@robojs/cron` is recommended for improved reliability and accuracy.

## API Reference

All endpoints rely on path parameters to scope requests to a specific guild and, when applicable, a giveaway ID. Examples assume your Robo.js server is running locally on port 3000.

### GET /api/giveaways/:guildId

Fetch the active giveaway roster and recent history for a guild.

**Response:**

```ts
{
  active: Giveaway[]
  recent: Giveaway[]
}
```

**Example:**

```bash
curl http://localhost:3000/api/giveaways/123456789012345678
```

### GET /api/giveaways/:guildId/giveaway/:id

Retrieve details for a single giveaway. Returns `404` when the giveaway does not exist.

**Example:**

```bash
curl http://localhost:3000/api/giveaways/123456789012345678/giveaway/01HQRS5F1GZ9J3YF7WXT7H2K2B
```

### PATCH /api/giveaways/:guildId/giveaway/:id

Mutate giveaway state by ending, cancelling, or rerolling winners. Pass one of `end`, `cancel`, or `reroll` in the `action` field. When rerolling, include a `count` value indicating how many new winners to draw.

**Example body:**

```json
{
  "action": "reroll",
  "count": 2
}
```

**Example:**

```bash
curl -X PATCH \
  -H 'Content-Type: application/json' \
  -d '{"action":"reroll","count":2}' \
  http://localhost:3000/api/giveaways/123456789012345678/giveaway/01HQRS5F1GZ9J3YF7WXT7H2K2B
```

### GET /api/giveaways/:guildId/settings

Read the persisted `GuildSettings` for a guild.

**Example:**

```bash
curl http://localhost:3000/api/giveaways/123456789012345678/settings
```

### PATCH /api/giveaways/:guildId/settings

Update giveaway settings by sending a partial or complete `GuildSettings` payload.

**Example:**

```bash
curl -X PATCH \
  -H 'Content-Type: application/json' \
  -d '{"defaults":{"winners":2,"duration":"2h"}}' \
  http://localhost:3000/api/giveaways/123456789012345678/settings
```

## How It Works

### Entry System

1. User clicks "Enter Giveaway" button
2. Bot validates eligibility (roles, account age)
3. Entry is recorded in Flashcore
4. User receives confirmation message

### Winner Selection

1. At end time, bot retrieves all entries
2. Re-validates eligibility at draw time
3. Randomly selects unique winners
4. Updates message and announces results

### Persistence

- All data stored in Flashcore (key-value database)
- Active giveaways recovered on bot restart
- Scheduling automatically resumes

## Persistence & Recovery

### Data Persistence

All giveaway data is always stored in Flashcore regardless of cron availability:

- Giveaway records are stored under the `['giveaways', 'data']` namespace (see `giveawayDataNamespace` in `src/events/ready.ts`).
- Active giveaway IDs per guild are tracked under `['giveaways', 'guilds', guildId, 'active']` (see `guildActiveNamespace()`).
- Entry records for each giveaway are persisted.
- Guild-level settings are stored persistently.

### Scheduling Persistence

- Without `@robojs/cron`: Timer handles live in memory only (lost on restart), but giveaway data persists. On startup, the `ready.ts` handler automatically reschedules all active giveaways by calling `scheduleGiveawayEnd()` for each one.
- With `@robojs/cron`: Both giveaway data and cron jobs persist in Flashcore. Jobs are saved (e.g., `job.save(jobId)`) and automatically restored during cron initialization. The `ready.ts` handler still validates that each job exists via `Cron.get()` and reschedules if missing.

### Recovery Process

1. Bot starts and `ready` event fires.
2. `initCron()` runs to detect cron availability.
3. Handler enumerates all guilds the bot is in.
4. For each guild, load active giveaway IDs from Flashcore.
5. For each active giveaway, load the full record from Flashcore.
6. Verify status; skip if not `active`.
7. If `endsAt` is in the past, call `endGiveaway()` immediately.
8. If still active and cron is available, check for an existing job via `Cron.get(jobId)`.
9. If missing (or when cron is unavailable), call `scheduleGiveawayEnd()` to (re)schedule.
10. Persist any updated `cronJobId` on the giveaway record.

Key takeaway: Giveaway data never gets lost on restart, and scheduling always resumes automatically — with or without cron.

## Edge Cases

✅ **No Entrants** - Shows "Not enough entrants"  
✅ **Insufficient Entrants** - Selects all available entrants  
✅ **Bot Restart** - Recovers and reschedules active giveaways  
✅ **Deleted Channels** - Handles gracefully without crashing  
✅ **Role Changes** - Re-validates eligibility at draw time  
✅ **Duplicate Entries** - Prevented (one entry per user)  
✅ **Spam Clicking** - Rate limited (3-second cooldown)

## Architecture & Design

- **Single-Instance Runtime**: Active giveaways, interaction cooldowns, and timer handles are kept in memory. Running multiple bot instances in parallel will cause duplicated timers and inconsistent state because in-memory data is not synchronized. Horizontal scaling currently requires external coordination.
- **Data Persistence**: All giveaway data (records, entries, settings) is stored in Flashcore and survives restarts regardless of cron availability.
- **Scheduling Modes**: The plugin supports two scheduling approaches:
  - Without `@robojs/cron`: Uses `setTimeout` with cascading reschedules for long durations (max ~24.8 days per cycle as defined in `MAX_TIMEOUT_MS`). Timer handles are in-memory only, but the `ready.ts` handler automatically reschedules all active giveaways on restart by scanning Flashcore.
  - With `@robojs/cron`: Uses persistent cron jobs stored in Flashcore via `job.save()`. Jobs are automatically restored during cron initialization and validated by the `ready.ts` handler. Provides higher accuracy through precise cron expressions generated by `timestampToCronExpression()`, supports unlimited duration giveaways, and enables job auditability via `Cron.get()`.
- **Production Recommendation**: While both modes ensure giveaways complete successfully, `@robojs/cron` is recommended for production deployments due to enhanced reliability, accuracy, and redundant recovery.
- **Idempotent Operations**: Core lifecycle helpers such as `endGiveaway()` and `cancelScheduledJob()` check the giveaway status before mutating state, allowing safe retries. These guards are not atomic; they rely on the single-instance assumption to prevent race conditions. Distributed deployments would require a shared lock.
- **Startup Recovery**: On bot startup the `ready.ts` handler scans Flashcore for active giveaways and reschedules them, ensuring long-running giveaways continue after crashes. When using cron, jobs are automatically restored from storage during initialization.

## Troubleshooting

### Commands not appearing?

1. Wait 1-2 minutes for Discord to sync
2. Try `/` in a text channel
3. Run `npx robo build --force` and restart bot

### Giveaway not ending?

- Check bot is online
- Verify bot has message permissions
- Check terminal for errors

### Winners not announced?

- Verify bot can send messages in the channel
- Check if channel was deleted
- Look for error logs in terminal

## Support

- [GitHub Issues](https://github.com/AdityaTel89/robojs-giveaways/issues)
- [Robo.js Discord](https://robojs.dev/discord)
- [Documentation](https://robojs.dev)

## Contributing

Contributions welcome! Please read our contributing guidelines before submitting PRs.

## License

MIT © Aditya Telsinge

## Credits

Built with [Robo.js](https://robojs.dev) - The all-in-one Discord bot framework.

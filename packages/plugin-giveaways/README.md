# @robojs/giveaways

🎉 One-click Discord giveaways plugin for Robo.js - Makes running giveaways effortless with automatic winner selection, persistent storage, and rich moderation tools.

[![npm version](https://badge.fury.io/js/%40robojs%2Fgiveaways.svg)](https://www.npmjs.com/package/@robojs/giveaways)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

✨ **Zero-Friction Entry** - Users click a button to enter giveaways  
🎯 **Fair Winner Selection** - Random selection with no duplicates  
💾 **Persistent Storage** - Survives bot restarts via Flashcore  
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
- `GET /api/giveaways/:guildId/:id` - Get specific giveaway
- `PATCH /api/giveaways/:guildId/:id` - Mutate giveaway (end/cancel/reroll)
- `GET /api/giveaways/:guildId/settings` - Get settings
- `PATCH /api/giveaways/:guildId/settings` - Update settings

### Cron Scheduling (@robojs/cron)

For production deployments with precise scheduling:

npx robo add @robojs/cron

The plugin automatically upgrades to use cron when available, otherwise uses setTimeout.

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

## Edge Cases

✅ **No Entrants** - Shows "Not enough entrants"  
✅ **Insufficient Entrants** - Selects all available entrants  
✅ **Bot Restart** - Recovers and reschedules active giveaways  
✅ **Deleted Channels** - Handles gracefully without crashing  
✅ **Role Changes** - Re-validates eligibility at draw time  
✅ **Duplicate Entries** - Prevented (one entry per user)  
✅ **Spam Clicking** - Rate limited (3-second cooldown)

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

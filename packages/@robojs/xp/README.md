<p align="center"><strong>@robojs/xp</strong> • MEE6-style chat XP for Robo.js</p>

---

<div align="center">
  <a href="https://github.com/Wave-Play/robo/blob/main/LICENSE"><img alt="GitHub license" src="https://img.shields.io/github/license/Wave-Play/robo" /></a>
  <a href="https://www.npmjs.com/package/@robojs/xp"><img alt="npm" src="https://img.shields.io/npm/v/@robojs/xp" /></a>
  <a href="https://packagephobia.com/result?p=@robojs/xp@latest"><img alt="install size" src="https://packagephobia.com/badge?p=@robojs/xp@latest" /></a>
  <a href="https://roboplay.dev/discord"><img alt="Discord" src="https://img.shields.io/discord/1087134933908193330?color=7289da" /></a>
</div>

➞ [📚 **Documentation:** Getting started](https://robojs.dev/docs/getting-started)

➞ [🚀 **Community:** Join our Discord server](https://roboplay.dev/discord)

## Features

- 💬 **MEE6-parity XP mechanics** - Awards 15-25 XP per message with 60-second cooldown
- 🎯 **Role rewards** - Automatic role assignment with stack or replace modes
- 🚀 **Multipliers** - Server, role, and user XP boosts (MEE6 Pro parity)
- 📊 **Cached leaderboards** - Optimized for 10k+ users with <200ms refresh
- 🛡️ **No-XP roles/channels** - Granular control over where XP is earned
- 🔧 **Admin commands** - Complete control via `/xp` command suite
- 📈 **Event system** - Real-time hooks for level changes and XP updates
- 🌐 **REST API** - Optional HTTP endpoints (requires @robojs/server)
- 💾 **Flashcore persistence** - Guild-scoped data storage with automatic caching

## Installation

```bash
npx robo add @robojs/xp
```

Or scaffold a new Robo preloaded with XP:

```bash
npx create-robo my-robo -p @robojs/xp
```

### Optional: REST API

To enable the HTTP API endpoints, install `@robojs/server`:

```bash
npx robo add @robojs/server
```

## Slash Commands Reference

### Admin Commands (Require Manage Guild Permission)

#### XP Manipulation

| Command | Description | Options |
| --- | --- | --- |
| `/xp give <user> <amount> [reason]` | Award XP to a user | `user` (required), `amount` (1-1,000,000), `reason` (optional) |
| `/xp remove <user> <amount> [reason]` | Remove XP from a user | `user` (required), `amount` (1-1,000,000), `reason` (optional) |
| `/xp set <user> <amount> [reason]` | Set exact XP value | `user` (required), `amount` (0-1,000,000), `reason` (optional) |
| `/xp recalc <user>` | Recalculate level and reconcile roles | `user` (required) |

#### Role Rewards

| Command | Description | Options |
| --- | --- | --- |
| `/xp rewards add <level> <role>` | Add role reward at level | `level` (1-1000), `role` (required) |
| `/xp rewards remove <level>` | Remove role reward | `level` (required) |
| `/xp rewards list` | List all role rewards | None |
| `/xp rewards mode <mode>` | Set stack or replace mode | `mode` (`stack` or `replace`) |
| `/xp rewards remove-on-loss <enabled>` | Toggle reward removal on XP loss | `enabled` (boolean) |

**Stack Mode:** Users keep all role rewards from previous levels
**Replace Mode:** Users only get the highest level role reward

#### Configuration

| Command | Description | Options |
| --- | --- | --- |
| `/xp config get` | View current configuration | None |
| `/xp config set-cooldown <seconds>` | Set XP award cooldown | `seconds` (0-3600) |
| `/xp config set-xp-rate <rate>` | Set XP rate multiplier | `rate` (0.1-10.0) |
| `/xp config add-no-xp-role <role>` | Add No-XP role | `role` (required) |
| `/xp config remove-no-xp-role <role>` | Remove No-XP role | `role` (required) |
| `/xp config add-no-xp-channel <channel>` | Add No-XP channel | `channel` (required) |
| `/xp config remove-no-xp-channel <channel>` | Remove No-XP channel | `channel` (required) |
| `/xp config set-leaderboard-public <enabled>` | Toggle public leaderboard | `enabled` (boolean) |

#### Multipliers

| Command | Description | Options |
| --- | --- | --- |
| `/xp multiplier server <multiplier>` | Set server-wide XP multiplier | `multiplier` (0.1-10.0) |
| `/xp multiplier role <role> <multiplier>` | Set role XP multiplier | `role`, `multiplier` (0.1-10.0) |
| `/xp multiplier user <user> <multiplier>` | Set user XP multiplier | `user`, `multiplier` (0.1-10.0) |
| `/xp multiplier remove-role <role>` | Remove role multiplier | `role` (required) |
| `/xp multiplier remove-user <user>` | Remove user multiplier | `user` (required) |

### User Commands (No Permission Required)

| Command | Description | Options |
| --- | --- | --- |
| `/rank [user]` | View rank card with progress | `user` (optional, defaults to self) |
| `/leaderboard [page]` | View server leaderboard | `page` (optional, default: 1) |

> **Note:** `/leaderboard` requires admin permission when `leaderboard.public` is `false`

## Configuration Guide

### Guild Configuration Structure

```ts
interface GuildConfig {
  // Basic settings
  cooldownSeconds: number          // Per-user message cooldown (default: 60)
  xpRate: number                   // XP rate multiplier (default: 1.0)

  // Exclusions
  noXpRoleIds: string[]            // Roles that don't earn XP
  noXpChannelIds: string[]         // Channels that don't award XP

  // Role rewards
  roleRewards: RoleReward[]        // Level → Role mappings
  rewardsMode: 'stack' | 'replace' // Stack (keep all) or replace (highest only)
  removeRewardOnXpLoss: boolean    // Remove roles when XP drops below level

  // Multipliers (MEE6 Pro parity)
  multipliers: {
    server?: number                // Server-wide multiplier
    role?: Record<string, number>  // Per-role multipliers
    user?: Record<string, number>  // Per-user multipliers
  }

  // Leaderboard
  leaderboard: {
    public: boolean                // Allow non-admins to view
  }

  // Theme (future use)
  theme: {
    embedColor?: string            // Hex color for embeds
    backgroundUrl?: string         // Custom rank card background
  }
}
```

### Global Configuration Defaults

Global defaults apply to all guilds unless overridden. They're stored at `['xp', 'global', 'config']`.

```ts
import { XP } from '@robojs/xp'

// Set global defaults
await XP.config.setGlobal({
  cooldownSeconds: 45,
  xpRate: 1.5,
  leaderboard: { public: true }
})

// Guild-specific overrides
await XP.config.set(guildId, {
  cooldownSeconds: 30  // This guild gets 30s cooldown
})
```

**Config Precedence:** Guild config > Global config > System defaults

### MEE6 Parity Notes

This plugin matches MEE6's core mechanics:

- **XP per message:** 15-25 XP (random, configurable via `xpRate`)
- **Cooldown:** 60 seconds (configurable)
- **Level curve:** `XP = 5 * level² + 50 * level + 100`
- **Role rewards:** Stack or replace modes
- **Multipliers:** Server, role, and user multipliers (MEE6 Pro feature)

## TypeScript API Reference

### XP Manipulation

```ts
import { XP } from '@robojs/xp'

// Add XP to a user
const result = await XP.addXP(guildId, userId, 100, { reason: 'contest_winner' })
console.log(result.leveledUp) // true if user leveled up

// Remove XP from a user
const result = await XP.removeXP(guildId, userId, 50, { reason: 'moderation' })
console.log(result.leveledDown) // true if user leveled down

// Set exact XP value
const result = await XP.setXP(guildId, userId, 5000, { reason: 'admin_adjustment' })

// Recalculate level and reconcile roles
const result = await XP.recalc(guildId, userId)
console.log(result.reconciled) // true if level was corrected

// Query user data
const user = await XP.getUser(guildId, userId)
const xp = await XP.getXP(guildId, userId)
const level = await XP.getLevel(guildId, userId)
```

**Result Types:**

```ts
interface XPChangeResult {
  oldXp: number
  newXp: number
  oldLevel: number
  newLevel: number
  leveledUp: boolean
}

interface XPRemoveResult {
  oldXp: number
  newXp: number
  oldLevel: number
  newLevel: number
  leveledDown: boolean
}

interface XPSetResult {
  oldXp: number
  newXp: number
  oldLevel: number
  newLevel: number
}

interface RecalcResult {
  oldLevel: number
  newLevel: number
  totalXp: number
  reconciled: boolean
}
```

### Configuration Management

```ts
import { XP } from '@robojs/xp'

// Get guild configuration
const config = await XP.config.get(guildId)

// Update guild configuration (partial updates supported)
await XP.config.set(guildId, {
  cooldownSeconds: 45,
  noXpChannelIds: ['123456789012345678']
})

// Validate configuration
const isValid = XP.config.validate(configObject)

// Global configuration
const globalConfig = XP.config.getGlobal()
XP.config.setGlobal({ xpRate: 1.5 })
```

### Leaderboard Queries

```ts
import { XP } from '@robojs/xp'

// Get top 10 users (offset 0, limit 10)
const result = await XP.leaderboard.get(guildId, 0, 10)
// Returns: { entries: Array<{ userId: string; xp: number; level: number; rank: number }>, total: number }

// Get next 10 users (offset 10, limit 10)
const page2 = await XP.leaderboard.get(guildId, 10, 10)

// Get user's rank
const rankInfo = await XP.leaderboard.getRank(guildId, userId)
// Returns: { rank: number; total: number } or null if not found

// Manually invalidate cache
await XP.leaderboard.invalidateCache(guildId)
```

### Role Rewards

```ts
import { XP } from '@robojs/xp'

// Manually reconcile role rewards for a user
await XP.reconcileRewards(guildId, userId)
// Automatically called on level changes
```

### Math Utilities

```ts
import { XP } from '@robojs/xp'

// XP needed to reach a specific level
const xpNeeded = XP.math.xpNeededForLevel(10) // 1100

// Total XP accumulated up to a level
const totalXp = XP.math.totalXpForLevel(10) // 5005

// Compute level from total XP
const progress = XP.math.computeLevelFromTotalXp(5500)
// { level: 10, inLevel: 495, toNext: 1155 }

// Progress within current level
const percent = XP.math.progressInLevel(5500) // 42.86%

// Validate level or XP
const isValidLevel = XP.math.isValidLevel(50) // true
const isValidXp = XP.math.isValidXp(10000) // true
```

### Event System

```ts
import { XP } from '@robojs/xp'

// Listen for level-up events
XP.events.onLevelUp(async ({ guildId, userId, oldLevel, newLevel, totalXp }) => {
  console.log(`User ${userId} leveled up from ${oldLevel} to ${newLevel}!`)
})

// Listen for level-down events
XP.events.onLevelDown(async ({ guildId, userId, oldLevel, newLevel, totalXp }) => {
  console.log(`User ${userId} lost a level: ${oldLevel} → ${newLevel}`)
})

// Listen for XP changes
XP.events.onXPChange(async ({ guildId, userId, oldXp, newXp, delta, reason }) => {
  console.log(`User ${userId} XP changed by ${delta} (reason: ${reason})`)
})

// One-time listeners
XP.events.onceLevelUp(handler)
XP.events.onceLevelDown(handler)
XP.events.onceXPChange(handler)

// Remove listeners
XP.events.offLevelUp(handler)
XP.events.offLevelDown(handler)
XP.events.offXPChange(handler)
```

**Event Payloads:**

```ts
interface LevelUpEvent {
  guildId: string
  userId: string
  oldLevel: number
  newLevel: number
  totalXp: number
}

interface LevelDownEvent {
  guildId: string
  userId: string
  oldLevel: number
  newLevel: number
  totalXp: number
}

interface XPChangeEvent {
  guildId: string
  userId: string
  oldXp: number
  newXp: number
  delta: number
  reason?: string
}
```

### Constants

```ts
import { XP } from '@robojs/xp'

// Default configuration values
XP.constants.DEFAULT_COOLDOWN // 60
XP.constants.DEFAULT_XP_RATE // 1.0
XP.constants.MIN_XP_AWARD // 15
XP.constants.MAX_XP_AWARD // 25

// Level curve formula coefficients
XP.constants.FORMULA_A // 5
XP.constants.FORMULA_B // 50
XP.constants.FORMULA_C // 100
```

## Integration Recipes

### Contest Plugin: Award Bonus XP

```ts
// src/events/contest-winner.ts
import { XP } from '@robojs/xp'

export default async (interaction) => {
  const winnerId = interaction.user.id
  const guildId = interaction.guildId

  // Award 500 bonus XP
  const result = await XP.addXP(guildId, winnerId, 500, { reason: 'contest_winner' })

  if (result.leveledUp) {
    await interaction.reply({
      content: `🎉 You won the contest and leveled up to ${result.newLevel}!`,
      ephemeral: true
    })
  } else {
    await interaction.reply({
      content: '🎉 You won the contest and earned 500 XP!',
      ephemeral: true
    })
  }
}
```

### Moderation Plugin: Remove XP for Violations

```ts
// src/events/warn-issued.ts
import { XP } from '@robojs/xp'

export default async ({ userId, guildId, severity }) => {
  const penalties = {
    minor: 50,
    moderate: 200,
    severe: 500
  }

  const amount = penalties[severity] || 100

  await XP.removeXP(guildId, userId, amount, { reason: `moderation_${severity}` })
}
```

### Premium Plugin: Enable +50% XP Boost

```ts
// src/events/premium-activated.ts
import { XP } from '@robojs/xp'

export default async ({ userId, guildId }) => {
  // Set 1.5x multiplier for premium user
  const config = await XP.config.get(guildId)

  await XP.config.set(guildId, {
    multipliers: {
      ...config.multipliers,
      user: {
        ...(config.multipliers?.user || {}),
        [userId]: 1.5
      }
    }
  })
}
```

### Analytics Plugin: Track XP Changes

```ts
// src/listeners/xp-analytics.ts
import { XP } from '@robojs/xp'
import { logger } from 'robo.js'

// Track all XP changes
XP.events.onXPChange(async ({ guildId, userId, delta, reason }) => {
  logger.info(`XP Analytics: ${userId} ${delta > 0 ? 'gained' : 'lost'} ${Math.abs(delta)} XP`, {
    guildId,
    userId,
    delta,
    reason
  })

  // Send to analytics service
  await analytics.track('xp_change', {
    guild: guildId,
    user: userId,
    amount: delta,
    reason
  })
})
```

### Announcement Plugin: Send Level-Up Messages

```ts
// src/listeners/level-announcements.ts
import { XP } from '@robojs/xp'
import { client } from 'robo.js'
import { EmbedBuilder } from 'discord.js'

XP.events.onLevelUp(async ({ guildId, userId, newLevel, totalXp }) => {
  const guild = await client.guilds.fetch(guildId)
  const user = await guild.members.fetch(userId)

  // Find announcement channel
  const channel = guild.channels.cache.find(c => c.name === 'level-ups')
  if (!channel?.isTextBased()) return

  const embed = new EmbedBuilder()
    .setTitle('🎉 Level Up!')
    .setDescription(`${user} reached **Level ${newLevel}**!`)
    .addFields({ name: 'Total XP', value: totalXp.toString(), inline: true })
    .setColor('#00ff00')
    .setThumbnail(user.displayAvatarURL())

  await channel.send({ embeds: [embed] })
})
```

### Custom Rewards: Build Custom Logic

```ts
// src/listeners/custom-rewards.ts
import { XP } from '@robojs/xp'
import { client } from 'robo.js'

XP.events.onLevelUp(async ({ guildId, userId, newLevel }) => {
  const guild = await client.guilds.fetch(guildId)
  const member = await guild.members.fetch(userId)

  // Custom reward logic
  switch (newLevel) {
    case 10:
      // Award custom badge
      await giveCustomBadge(member, 'veteran')
      break
    case 25:
      // Unlock special channel
      await unlockChannel(member, 'vip-lounge')
      break
    case 50:
      // Grant special permissions
      await grantPermission(member, 'create_events')
      break
  }
})
```

## REST API Documentation

> **Prerequisite:** Install `@robojs/server` to enable HTTP endpoints

### Response Format

All endpoints return JSON with the following structure:

**Success:**
```json
{
  "success": true,
  "data": { ... }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message"
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
| --- | --- | --- |
| `MISSING_GUILD_ID` | 400 | Guild ID parameter missing |
| `GUILD_NOT_FOUND` | 404 | Guild not found or bot not member |
| `MISSING_USER_ID` | 400 | User ID parameter missing |
| `USER_NOT_FOUND` | 404 | User has no XP record |
| `METHOD_NOT_ALLOWED` | 405 | HTTP method not allowed |
| `INVALID_REQUEST` | 400 | Invalid request body or parameters |
| `INVALID_AMOUNT` | 400 | Invalid XP amount |
| `INVALID_CONFIG` | 400 | Invalid configuration |
| `INVALID_LEVEL` | 400 | Invalid level value |
| `INVALID_ROLE_ID` | 400 | Invalid Discord role ID |
| `INVALID_MULTIPLIER` | 400 | Invalid multiplier value |
| `DUPLICATE_REWARD` | 400 | Role reward already exists at level |
| `REWARD_NOT_FOUND` | 404 | Role reward not found |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

### Endpoints

#### User XP Data

**GET** `/api/xp/users/:guildId/:userId`
Get user XP data and level progress.

```bash
curl http://localhost:3000/api/xp/users/123456789012345678/987654321098765432
```

Response:
```json
{
  "success": true,
  "data": {
    "user": {
      "xp": 5500,
      "level": 10,
      "messages": 250,
      "lastAwardedAt": 1234567890000
    },
    "progress": {
      "level": 10,
      "inLevel": 495,
      "toNext": 1155
    },
    "percentage": 42.86
  }
}
```

**POST** `/api/xp/users/:guildId/:userId`
Add XP to user.

```bash
curl -X POST http://localhost:3000/api/xp/users/123.../987... \
  -H "Content-Type: application/json" \
  -d '{"amount": 100, "reason": "api_award"}'
```

**PUT** `/api/xp/users/:guildId/:userId`
Set user XP to specific value.

```bash
curl -X PUT http://localhost:3000/api/xp/users/123.../987... \
  -H "Content-Type: application/json" \
  -d '{"xp": 5000, "reason": "api_set"}'
```

**DELETE** `/api/xp/users/:guildId/:userId`
Remove XP from user.

```bash
curl -X DELETE http://localhost:3000/api/xp/users/123.../987... \
  -H "Content-Type: application/json" \
  -d '{"amount": 50, "reason": "api_penalty"}'
```

#### Recalculate Level

**POST** `/api/xp/users/:guildId/:userId/recalc`
Recalculate user's level from total XP.

```bash
curl -X POST http://localhost:3000/api/xp/users/123.../987.../recalc
```

#### Guild Configuration

**GET** `/api/xp/config/:guildId`
Get current guild configuration.

**PUT** `/api/xp/config/:guildId`
Update guild configuration (partial updates supported).

```bash
curl -X PUT http://localhost:3000/api/xp/config/123... \
  -H "Content-Type: application/json" \
  -d '{"cooldownSeconds": 45, "xpRate": 1.5}'
```

#### Role Rewards

**GET** `/api/xp/config/:guildId/rewards`
List all role rewards.

**POST** `/api/xp/config/:guildId/rewards`
Add new role reward.

```bash
curl -X POST http://localhost:3000/api/xp/config/123.../rewards \
  -H "Content-Type: application/json" \
  -d '{"level": 10, "roleId": "456789012345678901"}'
```

**DELETE** `/api/xp/config/:guildId/rewards`
Remove role reward by level.

```bash
curl -X DELETE http://localhost:3000/api/xp/config/123.../rewards \
  -H "Content-Type: application/json" \
  -d '{"level": 10}'
```

#### Multipliers

**GET** `/api/xp/config/:guildId/multipliers`
Get all multipliers (server, role, user).

**PUT** `/api/xp/config/:guildId/multipliers`
Set/update multipliers.

```bash
curl -X PUT http://localhost:3000/api/xp/config/123.../multipliers \
  -H "Content-Type: application/json" \
  -d '{"server": 2.0, "role": {"456...": 1.5}}'
```

**DELETE** `/api/xp/config/:guildId/multipliers`
Remove specific multipliers.

```bash
curl -X DELETE http://localhost:3000/api/xp/config/123.../multipliers \
  -H "Content-Type: application/json" \
  -d '{"role": ["456..."], "user": ["789..."]}'
```

#### Global Configuration

**GET** `/api/xp/config/global`
Get global configuration defaults.

**PUT** `/api/xp/config/global`
Update global defaults (affects all guilds).

```bash
curl -X PUT http://localhost:3000/api/xp/config/global \
  -H "Content-Type: application/json" \
  -d '{"cooldownSeconds": 45, "xpRate": 1.2}'
```

## Performance & Caching

### Caching Strategy

- **Leaderboard cache:** Top 100 users per guild, 60-second TTL
- **Config cache:** In-memory with event-driven invalidation
- **Complexity:** O(1) cached reads, O(n log n) refresh for n users

### Performance Targets

- **Message award:** <50ms per message (including Flashcore write)
- **Leaderboard refresh (10k users):** ≤200ms (warm cache)
- **Cached leaderboard query:** <10ms
- **Config read (cached):** <5ms

### Scalability

- **Memory per guild:** ~10KB for 100 cached leaderboard entries
- **Recommended limits:** 100k users per guild max
- **Cache eviction:** TTL-based, auto-refreshes on query after expiry

See [PERFORMANCE.md](./PERFORMANCE.md) for detailed benchmarks and optimization guide.

## Data Model

Flashcore keys live under `['xp', guildId]`:

| Key | Contents | Example |
| --- | --- | --- |
| `config` | Guild config merged with global defaults | `{ cooldownSeconds: 60, xpRate: 1.0, ... }` |
| `user:{userId}` | UserXP record | `{ xp: 5500, level: 10, messages: 250, lastAwardedAt: 1234567890000 }` |
| `members` | Set of tracked member IDs | `['user1', 'user2', ...]` |
| `lb:{perPage}:{page}` | Leaderboard cache | `[{ userId, xp, level, rank }, ...]` |
| `schema` | Schema version for future migrations | `1` |

Global defaults live at `['xp', 'global', 'config']`.

### UserXP Structure

```ts
interface UserXP {
  xp: number           // Total XP accumulated
  level: number        // Current level (computed from xp)
  messages: number     // Total messages sent
  lastAwardedAt: number // Timestamp of last XP award
}
```

### GuildConfig Structure

See [Configuration Guide](#configuration-guide) above for complete structure.

## MEE6 Parity

This plugin provides feature parity with MEE6's XP system:

### Parity Features

- ✅ **XP per message:** 15-25 XP (configurable)
- ✅ **Cooldown:** 60 seconds (configurable)
- ✅ **Level curve:** Same quadratic formula
- ✅ **Role rewards:** Stack or replace modes
- ✅ **Multipliers:** Server, role, user (MEE6 Pro)
- ✅ **No-XP roles/channels**
- ✅ **Leaderboard pagination**
- ✅ **Admin commands**

### Configuration for MEE6-like Behavior

```ts
import { XP } from '@robojs/xp'

await XP.config.set(guildId, {
  cooldownSeconds: 60,
  xpRate: 1.0,
  rewardsMode: 'stack',
  removeRewardOnXpLoss: false,
  leaderboard: { public: true }
})
```

## Troubleshooting

### XP Not Being Awarded

**Possible causes:**

1. **Channel type:** Only text channels award XP
2. **No-XP roles:** User has a role in `noXpRoleIds`
3. **No-XP channels:** Channel is in `noXpChannelIds`
4. **Cooldown:** User sent message within cooldown period (default 60s)
5. **Bot messages:** Bots don't earn XP

**Debug:**
```ts
const config = await XP.config.get(guildId)
console.log('No-XP roles:', config.noXpRoleIds)
console.log('No-XP channels:', config.noXpChannelIds)
console.log('Cooldown:', config.cooldownSeconds)
```

### Roles Not Being Granted

**Possible causes:**

1. **Bot permissions:** Bot lacks `Manage Roles` permission
2. **Role hierarchy:** Reward role is higher than bot's highest role
3. **Managed roles:** Cannot assign managed roles (e.g., Nitro Boost)
4. **Missing role:** Role was deleted but still in `roleRewards`

**Fix:**
```ts
// Recalculate roles for a user
await XP.reconcileRewards(guildId, userId)

// Remove deleted roles from config
const config = await XP.config.get(guildId)
const validRewards = config.roleRewards.filter(r => guild.roles.cache.has(r.roleId))
await XP.config.set(guildId, { roleRewards: validRewards })
```

### Leaderboard Showing Stale Data

**Cause:** Cache TTL (60 seconds)

**Solution:**
```ts
// Manually invalidate cache
await XP.leaderboard.invalidateCache(guildId)

// Or wait for TTL to expire (auto-refreshes on next query)
```

### Performance Issues

**Large guilds (10k+ users):**

- First leaderboard query after cache expiry may take 200-500ms
- Subsequent queries are <10ms (cached)
- Consider warming cache during off-peak hours

**Cache warming:**
```ts
// Warm cache for all guilds (top 100 users)
for (const guildId of guildIds) {
  await XP.leaderboard.get(guildId, 0, 100)
}
```

## Development

Run tests or build from the package root:

```bash
# Run all tests
pnpm test

# Build plugin
pnpm build plugin
```

## Links

- [Robo.js Documentation](https://robojs.dev)
- [Discord Community](https://roboplay.dev/discord)
- [GitHub Repository](https://github.com/Wave-Play/robo.js)
- [npm Package](https://www.npmjs.com/package/@robojs/xp)

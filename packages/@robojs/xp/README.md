<p align="center">✨ <strong>Generated with <a href="https://robojs.dev/create-robo">create-robo</a> magic!</strong> ✨</p>

---

# @robojs/xp

MEE6-style chat XP system that exposes a powerful event-driven API that makes building custom features incredibly easy. No need to fork the plugin or write complex integrations—just listen to events and call imperative functions.

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
- 📊 **Cached leaderboards** - Optimized for 10k+ users with under 200ms refresh
- 🛡️ **No-XP roles/channels** - Granular control over where XP is earned
- 🔧 **Admin commands** - Complete control via `/xp` command suite
- 📈 **Event system** - Real-time hooks for level changes and XP updates
- 🌐 **REST API** - Optional HTTP endpoints (requires @robojs/server)
- 💾 **Flashcore persistence** - Guild-scoped data storage with automatic caching
- 🗄️ **Multi-store architecture** - Run parallel progression systems (leveling + currencies, multi-dimensional reputation)

## 🚀 **Build Custom Features in Minutes**

Here's a complete level-up announcement system in ~10 lines:

```typescript
import { events } from '@robojs/xp'
import { client } from 'robo.js'

events.onLevelUp(async ({ guildId, userId, newLevel }) => {
	const guild = await client.guilds.fetch(guildId)
	const channel = guild.channels.cache.find((c) => c.name === 'level-ups')
	if (!channel?.isTextBased()) return

	await channel.send(`🎉 <@${userId}> just reached Level ${newLevel}!`)
})
```

Use the same pattern to award contest bonuses, apply moderation penalties, enable premium XP boosts, track analytics, or build any custom XP-based feature you can imagine.

Check out `seed/events/_start/level-announcements.ts` for a production-ready example with rich embeds and customization options, or explore the [Integration Recipes](#integration-recipes) section below for more patterns.

## 💻 Getting Started

```bash
npx robo add @robojs/xp
```

New to **[Robo.js](https://robojs.dev)**? Start your project with this plugin pre-installed:

```bash
npx create-robo <project-name> -p @robojs/xp
```

### Optional: REST API

To enable the HTTP API endpoints, install `@robojs/server`:

```bash
npx robo add @robojs/server
```

## Slash Commands Reference

### Admin Commands (Require Manage Guild Permission)

#### XP Manipulation

| Command                               | Description                           | Options                                                        |
| ------------------------------------- | ------------------------------------- | -------------------------------------------------------------- |
| `/xp give <user> <amount> [reason]`   | Award XP to a user                    | `user` (required), `amount` (1-1,000,000), `reason` (optional) |
| `/xp remove <user> <amount> [reason]` | Remove XP from a user                 | `user` (required), `amount` (1-1,000,000), `reason` (optional) |
| `/xp set <user> <amount> [reason]`    | Set exact XP value                    | `user` (required), `amount` (0-1,000,000), `reason` (optional) |
| `/xp recalc <user>`                   | Recalculate level and reconcile roles | `user` (required)                                              |

#### Role Rewards

| Command | Description | Options |
| ------- | ----------- | ------- |
| `/xp config` | Configure role rewards (admin only) | Interactive UI with buttons and modals |

**Role Rewards Configuration** (via `/xp config` → Role Rewards):
- **Add Reward**: Assign a role to be awarded at a specific level (1-1000)
- **Remove Reward**: Remove a role reward from a specific level
- **Set Mode**: Choose between Stack (keep all rewards) or Replace (only highest reward)
- **Toggle Remove-on-Loss**: Enable/disable removing rewards when users lose XP/levels
- **View All**: See all configured rewards with pagination

**Stack Mode:** Users keep all role rewards from previous levels  
**Replace Mode:** Users only get the highest level role reward

#### Configuration

| Command | Description | Options |
| ------- | ----------- | ------- |
| `/xp config` | Configure XP system settings | Interactive UI with category navigation |

**Configuration Categories** (via `/xp config`):

**General Settings:**
- **Cooldown**: Set per-user message cooldown (0-3600 seconds)
- **XP Rate**: Set XP rate multiplier (0.1-10.0x)
- **Leaderboard Visibility**: Toggle public/private leaderboard access

**No-XP Zones:**
- **Add/Remove Roles**: Manage roles that don't earn XP
- **Add/Remove Channels**: Manage channels that don't award XP

**Role Rewards:** (see Role Rewards section above)

> **Note:** General settings, No-XP zones, and role rewards are managed through an interactive component-based interface using Discord.js Components V2. Simply run `/xp config` and navigate through the categories using buttons and select menus. Multipliers are managed separately via dedicated slash commands (see Multipliers section below).

#### Multipliers

**Multipliers are managed via dedicated slash commands** and are not currently part of the interactive `/xp config` UI:

| Command                                   | Description                   | Options                         |
| ----------------------------------------- | ----------------------------- | ------------------------------- |
| `/xp multiplier server <multiplier>`      | Set server-wide XP multiplier | `multiplier` (0.1-10.0)         |
| `/xp multiplier role <role> <multiplier>` | Set role XP multiplier        | `role`, `multiplier` (0.1-10.0) |
| `/xp multiplier user <user> <multiplier>` | Set user XP multiplier        | `user`, `multiplier` (0.1-10.0) |
| `/xp multiplier remove-role <role>`       | Remove role multiplier        | `role` (required)               |
| `/xp multiplier remove-user <user>`       | Remove user multiplier        | `user` (required)               |

### User Commands (No Permission Required)

| Command               | Description                  | Options                             |
| --------------------- | ---------------------------- | ----------------------------------- |
| `/rank [user]`        | View rank card with progress | `user` (optional, defaults to self) |
| `/leaderboard [page]` | View server leaderboard      | `page` (optional, default: 1)       |
| `/xp rewards`         | View all role rewards        | None (public, with pagination)      |

> **Note:** `/leaderboard` requires admin permission when `leaderboard.public` is `false`. `/xp rewards` is always public and shows all configured role rewards with pagination support.

## Configuration Guide

### Guild Configuration Structure

````ts
interface GuildConfig {
	// Basic settings
	cooldownSeconds: number // Per-user message cooldown (default: 60)
	xpRate: number // XP rate multiplier (default: 1.0)

	// Exclusions
	noXpRoleIds: string[] // Roles that don't earn XP
	noXpChannelIds: string[] // Channels that don't award XP

	// Role rewards
	roleRewards: RoleReward[] // Level → Role mappings
	rewardsMode: 'stack' | 'replace' // Stack (keep all) or replace (highest only)
	removeRewardOnXpLoss: boolean // Remove roles when XP drops below level

	// Multipliers (MEE6 Pro parity)
	multipliers: {
		server?: number // Server-wide multiplier (set to 0 to disable automatic XP)
		role?: Record<string, number> // Per-role multipliers (set to 0 to disable for role)
		user?: Record<string, number> // Per-user multipliers (set to 0 to disable for user)
	}

	// Leaderboard
	leaderboard: {
		public: boolean // Allow non-admins to view
	}

	// Theme (future use)
	theme: {
		embedColor?: string // Hex color for embeds
		backgroundUrl?: string // Custom rank card background
	}

	// Custom branding
	labels?: {
		xpDisplayName?: string // Custom terminology (default: 'XP', max 20 chars)
	}
}
**Custom Branding:**

Customize XP terminology to match your server's theme. The `labels.xpDisplayName` field changes how XP is displayed in all user-facing commands (`/rank`, `/leaderboard`, `/xp give`, etc.) while keeping command names unchanged.

**Example:**
```typescript
await config.set(guildId, {
	labels: { xpDisplayName: 'Reputation' }
})

// Now /rank shows "Reputation" instead of "XP":
// - Field: "Reputation: 1,500"
// - Field: "Reputation in Level: 450 / 750"
// - Field: "Next Level: 300 Reputation remaining"
````

**Common alternatives:**

- 'Reputation' - Community reputation systems
- 'Points' - Point-based reward systems
- 'Karma' - Reddit-style karma systems
- 'Credits' - Economy/currency systems
- 'Stars' - Achievement/rating systems

### Custom Branding (Reputation System)

Customize XP terminology to match your server's theme. Perfect for community reputation systems, point-based rewards, or any custom terminology.

```typescript
import { config } from '@robojs/xp'

// Set custom branding for the guild
await config.set(guildId, {
	labels: { xpDisplayName: 'Reputation' }
})

// All user-facing displays now use "Reputation" instead of "XP":
// - /rank shows "Reputation: 1,500" and "Reputation in Level: 450 / 750"
// - /leaderboard shows "1,500 Reputation" for each user
// - /xp give shows "Successfully gave 100 Reputation to @User"
// - /xp remove shows "Previous Reputation: 1,500, New Reputation: 1,450"

// Command names stay as /xp (only displays change)
```

**Popular terminology options:**

| Label        | Use Case             | Example Display    |
| ------------ | -------------------- | ------------------ |
| 'Reputation' | Community reputation | "1,500 Reputation" |
| 'Points'     | Point-based rewards  | "1,500 Points"     |
| 'Karma'      | Reddit-style systems | "1,500 Karma"      |
| 'Credits'    | Economy/currency     | "1,500 Credits"    |
| 'Stars'      | Achievement/rating   | "1,500 Stars"      |
| 'Exp'        | Gaming experience    | "1,500 Exp"        |

**Note:** Command names (`/xp`, `/rank`, `/leaderboard`) remain unchanged. Only the visual display of XP values and field names use custom terminology.
**Custom Branding (labels):**

```ts
import { config } from '@robojs/xp'

// Set custom XP terminology
await config.set(guildId, {
	labels: { xpDisplayName: 'Reputation' }
})

// Get config and extract label
const guildConfig = await config.get(guildId)
const label = guildConfig.labels?.xpDisplayName ?? 'XP'
console.log(label) // 'Reputation'

// Use in custom displays
import { formatXP, getXpLabel } from '@robojs/xp'
const formattedXp = formatXP(1500, getXpLabel(guildConfig))
console.log(formattedXp) // '1,500 Reputation'
```

**Validation rules:**

- Must be a string (max 20 characters)
- Cannot be empty string
- Defaults to 'XP' if not configured
- Applies to all user-facing displays (commands, embeds)

### How to Customize XP Terminology

**Goal:** Change "XP" to custom terminology like "Reputation", "Points", or "Karma" throughout all displays.

**Solution:**

```typescript
import { config } from '@robojs/xp'

// Set custom label for the guild
await config.set(guildId, {
	labels: { xpDisplayName: 'Reputation' }
})
```

**What changes:**

- ✅ `/rank` command: "Reputation: 1,500" instead of "XP: 1,500"
- ✅ `/leaderboard` command: "1,500 Reputation" for each entry
- ✅ `/xp give/remove/set` commands: "Previous Reputation", "New Reputation"
- ✅ All embed field names: "Reputation in Level" instead of "XP in Level"

**What stays the same:**

- ❌ Command names: `/xp`, `/rank`, `/leaderboard` (unchanged)
- ❌ API function names: `addXP()`, `getXP()` (unchanged)
- ❌ Internal logic: Only visual display changes

**Validation:**

- Label must be 1-20 characters
- Cannot be empty string
- Can include spaces, emojis, Unicode

**Examples:**

```typescript
// Reputation system
await config.set(guildId, { labels: { xpDisplayName: 'Reputation' } })

// Point-based rewards
await config.set(guildId, { labels: { xpDisplayName: 'Points' } })

// Gaming experience
await config.set(guildId, { labels: { xpDisplayName: 'Exp' } })

// Reset to default
await config.set(guildId, { labels: undefined })
// Or simply don't set labels field
```

**Note:** The custom label applies guild-wide. All users in the guild see the same terminology.

````

**Special value:** Set any multiplier to `0` to disable automatic XP earning at that level (server-wide, per-role, or per-user). This enables manual XP control where only admin commands (`/xp give`, `/xp set`) can grant XP. The `messages` counter will still increment to track activity, but `xpMessages` will remain 0.

**Example:**
```typescript
// Disable automatic XP earning for entire guild
await XP.config.set(guildId, {
	multipliers: { server: 0 }
})

// Disable automatic XP for specific role (e.g., new members)
await XP.config.set(guildId, {
	multipliers: {
		role: { 'newMemberRoleId': 0 }
	}
})

// Disable automatic XP for specific user
await XP.config.set(guildId, {
	multipliers: {
		user: { 'userId': 0 }
	}
})
````


## Multi-Store Architecture

The XP plugin supports multiple isolated data stores so you can run parallel progression systems side-by-side. Each store has independent user data, configuration, leaderboard cache, and event stream. The default store is used by built-in commands; custom stores are accessed imperatively via the API.

### Basic Usage

```typescript
import { XP, leaderboard, config } from '@robojs/xp'

// Default store (implicit)
await XP.addXP(guildId, userId, 100)
const defaultXP = await XP.getXP(guildId, userId)

// Custom reputation store
await XP.addXP(guildId, userId, 50, { storeId: 'reputation' })
const repXP = await XP.getXP(guildId, userId, { storeId: 'reputation' })

// Custom credits store
await XP.addXP(guildId, userId, 200, { storeId: 'credits' })
const creditsXP = await XP.getXP(guildId, userId, { storeId: 'credits' })
```

### Use Cases

| Use Case | Default Store | Custom Stores | Example |
|----------|---------------|---------------|---------|
| Leveling + Currencies | XP/Levels with role rewards | 'coins', 'gems', 'tokens' | Traditional leveling + economy |
| Multi-Dimensional Reputation | Overall activity | 'helpfulness', 'creativity', 'trading' | Community reputation systems |
| Seasonal Systems | Permanent progression | 'season1', 'season2', 'event_halloween' | Battle passes, events |

### Store Isolation

- Each store has its own configuration. Changing one store’s config doesn’t affect others.
- Leaderboards are per store. Caches and invalidation are independent per store.
- All emitted events include a `storeId` field so listeners can filter by store.

Different cooldowns per store:

```typescript
// Default store
await config.set(guildId, { cooldownSeconds: 60 })

// Reputation store
await config.set(guildId, { cooldownSeconds: 120 }, { storeId: 'reputation' })
```

### Built-in Commands vs Custom Stores

- Built-in commands (`/rank`, `/leaderboard`, `/xp`) only use the default store.
- Custom stores require building your own commands or integrations.
- Role rewards only trigger for the default store to avoid conflicts where multiple stores would grant/remove the same roles.

### Configuration Per Store

```typescript
import { config } from '@robojs/xp'

// Configure default store
await config.set(guildId, {
	cooldownSeconds: 60,
	labels: { xpDisplayName: 'XP' }
})

// Configure reputation store with different settings
await config.set(
	guildId,
	{
		cooldownSeconds: 120,
		labels: { xpDisplayName: 'Reputation' }
	},
	{ storeId: 'reputation' }
)
```

### Global Configuration Defaults

Global defaults apply to all guilds unless overridden. They're stored at `['xp', 'global', 'config']`.

```ts
import { config } from '@robojs/xp'

// Set global defaults
await config.setGlobal({
	cooldownSeconds: 45,
	xpRate: 1.5,
	leaderboard: { public: true }
})

// Guild-specific overrides
await config.set(guildId, {
	cooldownSeconds: 30 // This guild gets 30s cooldown
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

## Custom Level Curves

Robo XP supports fully customizable level progression curves. By default, the plugin matches MEE6 parity using a quadratic formula, but you can override the curve per guild and per store (multi-store aware). You can choose from presets (quadratic, linear, exponential, lookup) or supply code via the `getCurve` callback in your plugin config for dynamic logic.

Note: Unless you customize it, the default store uses the MEE6‑compatible quadratic curve defined as:

XP(level) = 5 × level² + 50 × level + 100

This preserves familiar progression for most servers. You can override this globally, per guild, and/or per store.

### Preset Curve Types

You can set a preset curve for a guild (and optionally per store) using your configuration APIs or helper utilities. Presets are fully serializable and are persisted in Flashcore so they survive restarts.

All presets support an optional `maxLevel` cap to prevent progression beyond a certain level.

#### 1) Quadratic Curves (Custom Coefficients)

Formula: XP(level) = a × level² + b × level + c

- Steeper progression example (large or highly active guilds):

```ts
// Example: steeper quadratic
await config.set(guildId, {
  levels: {
    type: 'quadratic',
    params: { a: 10, b: 100, c: 200 },
    maxLevel: 100,
  },
})
```

- Gentler progression example (small/early-stage guilds):

```ts
// Example: gentler quadratic
await config.set(guildId, {
  levels: {
    type: 'quadratic',
    params: { a: 2, b: 20, c: 50 },
  },
})
```

Notes:
- Use higher `a` for faster late‑game growth; adjust `b` and `c` for early levels.
- Add `maxLevel` to cap the system for seasons or events.

#### 2) Linear Curves

Formula: XP(level) = level × xpPerLevel

- Constant 100 XP per level:

```ts
await config.set(guildId, {
  levels: { type: 'linear', params: { xpPerLevel: 100 } },
})
```

- Slower 500 XP per level progression:

```ts
await config.set(guildId, {
  levels: { type: 'linear', params: { xpPerLevel: 500 } },
})
```

Notes:
- Simplest to reason about; great for reputation/credits or non‑competitive tracks.

#### 3) Exponential Curves

Formula: XP(level) = multiplier × base^level

- Doubles required XP every level:

```ts
await config.set(guildId, {
  levels: {
    type: 'exponential',
    params: { base: 2, multiplier: 100 },
    maxLevel: 50, // strongly recommended
  },
})
```

- 50% increase per level:

```ts
await config.set(guildId, {
  levels: {
    type: 'exponential',
    params: { base: 1.5, multiplier: 100 },
    maxLevel: 75,
  },
})
```

Warnings:
- Exponential growth becomes extremely steep; always set a `maxLevel`.

#### 4) Lookup Table Curves

Define exact XP thresholds per level.

```ts
await config.set(guildId, {
  levels: {
    type: 'lookup',
    params: { thresholds: [0, 100, 250, 500, 1000, 2000, 5000] },
    // maxLevel defaults to thresholds.length - 1 when omitted
  },
})
```

Notes:
- Provides pixel‑perfect control over each level’s requirement.
- Useful for seasonal passes and event‑specific tuning.

### Advanced Customization with getCurve Callback

For dynamic logic that can’t be expressed with static presets, define `levels.getCurve` in your plugin config file `config/plugins/robojs/xp.ts`. This callback has the highest precedence:

getCurve callback → guild preset → default quadratic

The callback can be synchronous or asynchronous and is not stored in Flashcore.

Example: Different curves per store

```ts
// config/plugins/robojs/xp.ts
import type { PluginOptions } from '@robojs/xp'

export default {
  levels: {
    getCurve: (guildId, storeId) => {
      if (storeId === 'reputation') {
        // Linear: 500 XP per level
        return {
          xpForLevel: (level) => level * 500,
          levelFromXp: (xp) => Math.floor(xp / 500),
        }
      }
      return null // falls through to guild preset or default quadratic
    },
  },
} satisfies PluginOptions
```

Example: Special guild gets custom quadratic with cap

```ts
export default {
  levels: {
    getCurve: (guildId) => {
      if (guildId === 'SPECIAL_GUILD_ID') {
        return {
          xpForLevel: (level) => 10 * level * level + 100 * level + 200,
          levelFromXp: (xp) => Math.floor((-100 + Math.sqrt(10000 + 40 * (xp - 200))) / 20),
          maxLevel: 100,
        }
      }
      return null
    },
  },
} satisfies PluginOptions
```

Example: Dynamic curves based on guild size (async)

```ts
export default {
  levels: {
    getCurve: async (guildId) => {
      const guild = await client.guilds.fetch(guildId)
      if (guild.memberCount > 1000) {
        return {
          xpForLevel: (level) => 10 * level * level + 100 * level + 200,
          levelFromXp: (xp) => Math.floor((-100 + Math.sqrt(10000 + 40 * (xp - 200))) / 20),
        }
      }
      return null // small guilds use preset/default
    },
  },
} satisfies PluginOptions
```

Curves resolved via `getCurve` are cached per `(guildId, storeId)` to avoid repeated computation.

### Migration Guide

Follow these steps to migrate from the default curve to custom curves.

1) Choose your curve type

- Simple, constant progression → Linear
- Exact per‑level control → Lookup
- Rapid growth (with caps) → Exponential
- Familiar quadratic with tunable coefficients → Quadratic

2) Configure a per‑guild preset (recommended)

```ts
await config.set(guildId, {
  levels: { type: 'linear', params: { xpPerLevel: 100 } },
})
```

- Presets persist in Flashcore and can be changed per guild and per store.

3) Test your curve

- Use `/xp set` to simulate levels and validate math.
- Verify `/rank` and `/leaderboard` outputs.
- Start with small XP ranges to confirm expected progression.

4) Optional: Use the `getCurve` callback for advanced scenarios

- Dynamic logic (guild size, time‑based seasons).
- Different curves per store (e.g., reputation vs. coins).
- Special partner/premium guilds.

Common use cases

- Small servers (< 100 members): gentler curves for faster early progression.
- Large servers (1000+ members): steeper curves to maintain challenge.
- Seasonal systems: lookup tables with strict level caps.
- Multi‑currency: different curves per store (linear for coins, exponential for gems).

### MEE6 Parity and Default Behavior

Default quadratic curve (MEE6 parity):

XP(level) = 5 × level² + 50 × level + 100

Example requirements:

- Level 1: 100 XP
- Level 5: 475 XP
- Level 10: 1,100 XP
- Level 20: 3,100 XP
- Level 50: 15,100 XP
- Level 100: 55,100 XP

Overriding defaults

- Any custom preset or `getCurve` override replaces the default for that guild/store.
- Built‑in commands like `/rank` and `/leaderboard` work with all curve types.

Custom stores

- Custom stores (e.g., `reputation`, `coins`) also default to quadratic but may be configured independently.
- Example: default store uses quadratic, `reputation` uses linear 500 XP/level via `getCurve`.

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

// Recalculate level and reconcile roles (supports storeId option)
const result = await XP.recalc(guildId, userId)
console.log(result.reconciled) // true if level was corrected

// Query user data (supports storeId option)
const user = await XP.getUser(guildId, userId)
const xp = await XP.getXP(guildId, userId)
const level = await XP.getLevel(guildId, userId)

// User object includes both message counters
console.log(user.messages) // Total messages sent: 423
console.log(user.xpMessages) // Messages that awarded XP: 156
```

Supported signatures (multi-store):

- `addXP(guildId, userId, amount, { reason?, storeId? })`
- `removeXP(guildId, userId, amount, { reason?, storeId? })`
- `setXP(guildId, userId, totalXp, { reason?, storeId? })`
- `recalc(guildId, userId, { storeId? })`
- `getUser(guildId, userId, { storeId? })`
- `getXP(guildId, userId, { storeId? })`
- `getLevel(guildId, userId, { storeId? })`

Multi-store query example:

```typescript
// Query different stores
const defaultXP = await XP.getXP(guildId, userId) // Default store
const repXP = await XP.getXP(guildId, userId, { storeId: 'reputation' })
const coins = await XP.getXP(guildId, userId, { storeId: 'coins' })
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
import { config } from '@robojs/xp'

// Get guild configuration
const guildConfig = await config.get(guildId)

// Update guild configuration (partial updates supported)
await config.set(guildId, {
	cooldownSeconds: 45,
	noXpChannelIds: ['123456789012345678']
})

// Validate configuration
const isValid = config.validate(configObject)

// Global configuration
const globalConfig = config.getGlobal()
config.setGlobal({ xpRate: 1.5 })
```

Supported signatures (multi-store):

- `config.get(guildId, { storeId? })`
- `config.set(guildId, partial, { storeId? })`

Multi-store configuration example:

```typescript
// Configure default store
await config.set(guildId, { cooldownSeconds: 60 })

// Configure custom store
await config.set(guildId, { cooldownSeconds: 120 }, { storeId: 'reputation' })
```

**Multipliers (0 for manual control):**

```ts
import { config } from '@robojs/xp'

// Disable automatic XP for entire guild
await config.set(guildId, {
	multipliers: { server: 0 }
})

// Disable automatic XP for specific role
await config.set(guildId, {
	multipliers: {
		role: { roleId: 0 }
	}
})

// Disable automatic XP for specific user
await config.set(guildId, {
	multipliers: {
		user: { userId: 0 }
	}
})

// Admin commands still work regardless of multiplier settings
await XP.addXP(guildId, userId, 500, { reason: 'manual_grant' })
```

### Leaderboard Queries

```ts
import { leaderboard } from '@robojs/xp'

// Get top 10 users (offset 0, limit 10)
const result = await leaderboard.get(guildId, 0, 10)
// Returns: { entries: Array<{ userId: string; xp: number; level: number; rank: number }>, total: number }

// Get next 10 users (offset 10, limit 10)
const page2 = await leaderboard.get(guildId, 10, 10)

// Get user's rank
const rankInfo = await leaderboard.getRank(guildId, userId)
// Returns: { rank: number; total: number } or null if not found

// Manually invalidate cache
await leaderboard.invalidateCache(guildId)
```

Supported signatures (multi-store):

- `leaderboard.get(guildId, offset, limit, { storeId? })`
- `leaderboard.getRank(guildId, userId, { storeId? })`
- `leaderboard.invalidateCache(guildId, { storeId? })`

Multi-store example:

```typescript
// Default store leaderboard
const defaultTop = await leaderboard.get(guildId, 0, 10)

// Custom store leaderboard
const repTop = await leaderboard.get(guildId, 0, 10, { storeId: 'reputation' })
```

### Role Rewards

```ts
import { reconcileRewards } from '@robojs/xp'

// Manually reconcile role rewards for a user
await reconcileRewards(guildId, userId)
// Automatically called on level changes
// Note: this is also available as rewards.reconcile(guildId, userId)
```

### Math Utilities

```ts
import { math } from '@robojs/xp'

// XP needed to reach a specific level
const xpNeeded = math.xpNeededForLevel(10) // 1100

// Total XP accumulated up to a level
const totalXp = math.totalXpForLevel(10) // 5675

// Compute level from total XP
const progress = math.computeLevelFromTotalXp(5500)
// { level: 9, inLevel: 925, toNext: 175 }

// Progress within current level
const { percentage } = math.progressInLevel(5500) // ~84.1%

// Validate level or XP
const isValidLevel = math.isValidLevel(50) // true
const isValidXp = math.isValidXp(10000) // true
```

### Event System

```ts
import { events } from '@robojs/xp'

// Listen for level-up events
events.onLevelUp(async ({ guildId, userId, oldLevel, newLevel, totalXp }) => {
	console.log(`User ${userId} leveled up from ${oldLevel} to ${newLevel}!`)
})

// Listen for level-down events
events.onLevelDown(async ({ guildId, userId, oldLevel, newLevel, totalXp }) => {
	console.log(`User ${userId} lost a level: ${oldLevel} → ${newLevel}`)
})

// Listen for XP changes
events.onXPChange(async ({ guildId, userId, oldXp, newXp, delta, reason }) => {
	console.log(`User ${userId} XP changed by ${delta} (reason: ${reason})`)
})

// One-time listeners (generic API)
events.once('levelUp', handler)
events.once('levelDown', handler)
events.once('xpChange', handler)

// Remove listeners (generic API)
events.off('levelUp', handler)
events.off('levelDown', handler)
events.off('xpChange', handler)
```

**Event Payloads:**

```ts
interface LevelUpEvent {
	guildId: string
	userId: string
	storeId: string
	oldLevel: number
	newLevel: number
	totalXp: number
}

interface LevelDownEvent {
	guildId: string
	userId: string
	storeId: string
	oldLevel: number
	newLevel: number
	totalXp: number
}

interface XPChangeEvent {
	guildId: string
	userId: string
	storeId: string
	oldXp: number
	newXp: number
	delta: number
	reason?: string
}
```

Filter events by store:

```typescript
import { events } from '@robojs/xp'

events.onLevelUp(({ guildId, userId, newLevel, storeId }) => {
  if (storeId === 'reputation') {
    console.log(`Reputation level up: ${newLevel}`)
  } else if (storeId === 'default') {
    console.log(`XP level up: ${newLevel}`)
  }
})
```

### Constants

```ts
import { constants } from '@robojs/xp'

// Default configuration values
constants.DEFAULT_COOLDOWN // 60
constants.DEFAULT_XP_RATE // 1.0

// Default curve coefficients
constants.DEFAULT_CURVE_A // 5
constants.DEFAULT_CURVE_B // 50
constants.DEFAULT_CURVE_C // 100
```

### Additional APIs

#### config.getDefault()

Returns the default MEE6-compatible configuration before applying any global or guild overrides.

```ts
import { config } from '@robojs/xp'

const defaults = config.getDefault()
// Useful for building UIs or generating initial configs
```

#### math.xpDeltaForLevelRange()

Computes the XP difference needed to move between two levels (inclusive of starting point), useful for multi-level jumps and grants.

```ts
import { math } from '@robojs/xp'

// XP needed to go from level 5 to level 10
const delta = math.xpDeltaForLevelRange(5, 10)
```

#### rewards object

The rewards module is also available as an object if you prefer a namespaced import.

```ts
import { rewards } from '@robojs/xp'

// Reconcile a user's roles based on their current level
await rewards.reconcile(guildId, userId)

// Alias of reconcile for clarity
await rewards.reconcileRewards(guildId, userId)
```

## Integration Recipes

The @robojs/xp plugin is designed to be extended. These recipes demonstrate common integration patterns using the event system and imperative API.

For a complete, production-ready example, see `seed/events/_start/level-announcements.ts` which demonstrates MEE6-style level-up announcements with rich embeds, progress bars, and extensive customization options.

Below are additional recipes for common use cases:

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
import { config } from '@robojs/xp'

export default async ({ userId, guildId }) => {
	// Set 1.5x multiplier for premium user
	const guildConfig = await config.get(guildId)

	await config.set(guildId, {
		multipliers: {
			...guildConfig.multipliers,
			user: {
				...(guildConfig.multipliers?.user || {}),
				[userId]: 1.5
			}
		}
	})
}
```

### Analytics Plugin: Track XP Changes

```ts
// src/listeners/xp-analytics.ts
import { events, XP } from '@robojs/xp'
import { logger } from 'robo.js'

// Track all XP changes
events.onXPChange(async ({ guildId, userId, delta, reason }) => {
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

// Also track message activity
events.onXPChange(async ({ guildId, userId }) => {
	const user = await XP.getUser(guildId, userId)

	// Calculate XP efficiency (what % of messages award XP)
	const efficiency = user.messages > 0 ? ((user.xpMessages / user.messages) * 100).toFixed(1) : 0

	logger.info(`User ${userId} XP efficiency: ${efficiency}%`, {
		totalMessages: user.messages,
		xpMessages: user.xpMessages
	})
})
```

**Note:** Track message efficiency to identify users affected by cooldowns or No-XP restrictions.

### Announcement Plugin: Send Level-Up Messages

```ts
// src/listeners/level-announcements.ts
import { events } from '@robojs/xp'
import { client } from 'robo.js'
import { EmbedBuilder } from 'discord.js'

events.onLevelUp(async ({ guildId, userId, newLevel, totalXp }) => {
	const guild = await client.guilds.fetch(guildId)
	const user = await guild.members.fetch(userId)

	// Find announcement channel
	const channel = guild.channels.cache.find((c) => c.name === 'level-ups')
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

### Manual XP Control (Disable Automatic Earning)

Disable automatic message-based XP earning while retaining full control via admin commands. Perfect for contest-only XP systems, event-based rewards, or manual moderation.

```typescript
import { XP } from '@robojs/xp'

// Disable automatic XP earning for entire guild
await XP.config.set(guildId, {
	multipliers: { server: 0 }
})

// Now only admin commands can grant XP
await XP.addXP(guildId, contestWinnerId, 1000, { reason: 'contest_winner' })
await XP.addXP(guildId, eventParticipantId, 500, { reason: 'event_participation' })

// Users can still send messages (messages counter increments)
// But xpMessages stays 0 (no automatic XP)
```

**Use cases:**

- **Contest-only XP:** Award XP only to contest winners, not for chatting
- **Event-based rewards:** Grant XP for specific achievements (reactions, voice time, etc.)
- **Manual moderation:** Admins review and approve all XP grants
- **Temporary freeze:** Disable XP during maintenance or special events
- **Hybrid systems:** Disable for new members (role multiplier 0), enable after verification

**Note:** Admin commands (`/xp give`, `/xp set`, `/xp remove`) bypass the message handler and work regardless of multiplier settings.

### Custom Configuration UI Integration

If you need to programmatically configure XP settings (e.g., from a web dashboard or bot setup wizard), use the same public API that the `/xp config` command uses:

```typescript
import { config } from '@robojs/xp'

// Example: Setup wizard that configures XP for a new guild
export default async function setupGuild(guildId: string) {
  // Configure basic settings
  await config.set(guildId, {
    cooldownSeconds: 45,
    xpRate: 1.2,
    leaderboard: { public: true }
  })

  // Add no-XP zones
  await config.set(guildId, {
    noXpRoleIds: ['123456789012345678'], // Muted role
    noXpChannelIds: ['987654321098765432'] // Bot commands channel
  })

  // Configure role rewards
  await config.set(guildId, {
    roleRewards: [
      { level: 5, roleId: '111111111111111111' },
      { level: 10, roleId: '222222222222222222' },
      { level: 20, roleId: '333333333333333333' }
    ],
    rewardsMode: 'stack',
    removeRewardOnXpLoss: false
  })

  // Set multipliers
  await config.set(guildId, {
    multipliers: {
      server: 1.5, // 50% boost for entire server
      role: {
        '444444444444444444': 2.0 // Booster role gets 2x XP
      }
    }
  })
}
```

**Use cases:**
- Web dashboard for guild admins
- Automated setup wizards
- Bulk configuration across multiple guilds
- Integration with other management systems

**Note:** The `/xp config` command provides a user-friendly interface for manual configuration, while the API enables programmatic control for advanced integrations.

### Custom Rewards: Build Custom Logic

```ts
// src/listeners/custom-rewards.ts
import { events } from '@robojs/xp'
import { client } from 'robo.js'

events.onLevelUp(async ({ guildId, userId, newLevel }) => {
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

### Multi-Currency Economy System

```typescript
// Award XP to multiple stores simultaneously
import { XP } from '@robojs/xp'

export default async (message) => {
	const guildId = message.guildId
	const userId = message.author.id

	// Award to default store (leveling with role rewards)
	await XP.addXP(guildId, userId, 20, { reason: 'message' })

	// Award coins (server currency)
	await XP.addXP(guildId, userId, 10, { reason: 'message', storeId: 'coins' })

	// Award tokens (premium currency) if user has premium role
	if (message.member.roles.cache.has(premiumRoleId)) {
		await XP.addXP(guildId, userId, 5, { reason: 'premium_message', storeId: 'tokens' })
	}
}
```

### Reputation System with Multiple Dimensions

```typescript
// Track different types of reputation
import { XP, events } from '@robojs/xp'

// Award helpfulness reputation
export async function awardHelpfulness(guildId: string, userId: string) {
	await XP.addXP(guildId, userId, 25, {
		reason: 'helped_member',
		storeId: 'helpfulness'
	})
}

// Award creativity reputation
export async function awardCreativity(guildId: string, userId: string) {
	await XP.addXP(guildId, userId, 50, {
		reason: 'created_content',
		storeId: 'creativity'
	})
}

// Listen for reputation level-ups
events.onLevelUp(({ userId, newLevel, storeId }) => {
	if (storeId === 'helpfulness') {
		console.log(`${userId} reached helpfulness level ${newLevel}!`)
	}
})
```

### Seasonal Battle Pass System

```typescript
// Seasonal progression with store isolation
import { XP, config } from '@robojs/xp'

const CURRENT_SEASON = 'season3'

// Award seasonal XP
export async function awardSeasonalXP(guildId: string, userId: string, amount: number) {
	await XP.addXP(guildId, userId, amount, {
		reason: 'seasonal_activity',
		storeId: CURRENT_SEASON
	})
}

// Get user's seasonal progress
export async function getSeasonalProgress(guildId: string, userId: string) {
	const xp = await XP.getXP(guildId, userId, { storeId: CURRENT_SEASON })
	const level = await XP.getLevel(guildId, userId, { storeId: CURRENT_SEASON })
	return { xp, level, season: CURRENT_SEASON }
}

// Reset season (start new season without affecting default store)
export async function startNewSeason(guildId: string) {
	// Old season data remains in 'season3' store
	// New season starts fresh in 'season4' store
	// Default store (permanent progression) is unaffected
}
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

| Code                 | HTTP Status | Description                         |
| -------------------- | ----------- | ----------------------------------- |
| `MISSING_GUILD_ID`   | 400         | Guild ID parameter missing          |
| `GUILD_NOT_FOUND`    | 404         | Guild not found or bot not member   |
| `MISSING_USER_ID`    | 400         | User ID parameter missing           |
| `USER_NOT_FOUND`     | 404         | User has no XP record               |
| `METHOD_NOT_ALLOWED` | 405         | HTTP method not allowed             |
| `INVALID_REQUEST`    | 400         | Invalid request body or parameters  |
| `INVALID_AMOUNT`     | 400         | Invalid XP amount                   |
| `INVALID_CONFIG`     | 400         | Invalid configuration               |
| `INVALID_LEVEL`      | 400         | Invalid level value                 |
| `INVALID_ROLE_ID`    | 400         | Invalid Discord role ID             |
| `INVALID_MULTIPLIER` | 400         | Invalid multiplier value            |
| `DUPLICATE_REWARD`   | 400         | Role reward already exists at level |
| `REWARD_NOT_FOUND`   | 404         | Role reward not found               |
| `INTERNAL_ERROR`     | 500         | Unexpected server error             |

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
			"messages": 423,
			"xpMessages": 156,
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

- **Leaderboard cache:** Top 100 users per guild per store, 60-second TTL
- **Config cache:** In-memory with event-driven invalidation
- **Complexity:** O(1) cached reads, O(n log n) refresh for n users

### Multi-Store Performance

- Each store maintains an independent cache (e.g., default store cache, reputation store cache).
- XP changes in one store do not invalidate caches for other stores.
- Approximate memory: ~10KB per store per guild for 100 cached entries.
- Example: A guild with 3 stores (default, reputation, coins) ≈ ~30KB cache.

### Scalability

- **Memory per guild:** ~10KB × number of stores for 100 cached leaderboard entries per store
- **Recommended limits:** 100k users per guild max
- **Cache eviction:** TTL-based, auto-refreshes on query after expiry

See [PERFORMANCE.md](./PERFORMANCE.md) for detailed benchmarks and optimization guide.

## Data Model

Flashcore keys live under `['xp', storeId, guildId]`:

| Key                                 | Contents                                 | Example                                                                                 |
| ----------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------- |
| `['xp', 'default', guildId]`        | Guild config merged with global defaults | `{ cooldownSeconds: 60, xpRate: 1.0, ... }`                                             |
| `['xp', 'default', guildId, 'users', userId]` | UserXP record (default store)            | `{ xp: 5500, level: 10, messages: 423, xpMessages: 156, lastAwardedAt: 1234567890000 }` |
| `['xp', 'reputation', guildId, 'users', userId]` | UserXP record (custom store example)   | `{ xp: 250, level: 2 }`                                                                  |
| `['xp', 'default', guildId, 'members']` | Set of tracked member IDs                | `['user1', 'user2', ...]`                                                               |
| `['xp', 'default', guildId, 'lb:{perPage}:{page}']` | Leaderboard cache (per store)      | `[{ userId, xp, level, rank }, ...]`                                                    |
| `['xp', 'default', guildId, 'schema']` | Schema version for future migrations     | `1`                                                                                     |

Global defaults live at `['xp', 'global', 'config']` and apply to all stores as base defaults.

### Multi-Store Namespace Structure

Each store has independent data under its own namespace:

- Default store: `['xp', 'default', guildId, ...]`
- Reputation store: `['xp', 'reputation', guildId, ...]`
- Coins store: `['xp', 'coins', guildId, ...]`

This ensures complete isolation between stores:

- Independent user data
- Independent configuration
- Independent members tracking
- Independent schema versions

### UserXP Structure

```typescript
interface UserXP {
	xp: number // Total XP accumulated
	level: number // Current level (computed from xp)
	messages: number // Total messages sent in guild text channels
	xpMessages: number // Messages that awarded XP (subset of messages)
	lastAwardedAt: number // Timestamp of last XP award (Unix ms)
}
```

**Message Counter Distinction:**

- `messages` tracks **all** messages sent in guild text channels (increments after basic validation: bot check, guild check, text channel check)
- `xpMessages` tracks **only** messages that actually awarded XP (increments after all checks pass: No-XP channels, No-XP roles, cooldown)

These counters will differ when:

- User sends messages within cooldown period (default 60s)
- User has a No-XP role
- User sends messages in No-XP channels
- User is a bot (neither counter increments)

Example: A user sends 100 messages in 5 minutes. With a 60s cooldown, only ~5 messages award XP. Result: `messages: 100`, `xpMessages: 5`.

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
import { config } from '@robojs/xp'

await config.set(guildId, {
	cooldownSeconds: 60,
	xpRate: 1.0,
	rewardsMode: 'stack',
	removeRewardOnXpLoss: false,
	leaderboard: { public: true }
})
```

## Troubleshooting

### Users Not Earning XP from Messages

**Symptom:** Users send messages but their XP doesn't increase. The `messages` counter increments but `xpMessages` stays at 0.

**Possible causes:**

1. **Multiplier set to 0 (manual control mode):**

   ```typescript
   const config = await XP.config.get(guildId)
   console.log('Server multiplier:', config.multipliers?.server ?? 1.0)
   console.log('Role multipliers:', config.multipliers?.role)
   console.log('User multipliers:', config.multipliers?.user)
   ```

   - If any multiplier in the chain is 0, no XP is awarded
   - Check: `server: 0` disables for everyone
   - Check: `role: { 'roleId': 0 }` disables for users with that role
   - Check: `user: { 'userId': 0 }` disables for specific user
   - **Solution:** Set multipliers to non-zero values to re-enable automatic XP

2. **No-XP channels:**

   ```typescript
   const config = await XP.config.get(guildId)
   console.log('No-XP channels:', config.noXpChannelIds)
   ```

   - Messages in these channels don't award XP
   - **Solution:** Remove channel from `noXpChannelIds` list

3. **No-XP roles:**

   ```typescript
   const config = await XP.config.get(guildId)
   console.log('No-XP roles:', config.noXpRoleIds)
   ```

   - Users with these roles don't earn XP
   - **Solution:** Remove role from `noXpRoleIds` list

4. **Cooldown blocking rapid messages:**
   - Default 60s cooldown means only 1 message per minute awards XP
   - Check: `messages` much higher than `xpMessages` indicates cooldown blocking
   - **Solution:** This is expected behavior; reduce `cooldownSeconds` if needed

**Difference between 0 multiplier and No-XP zones:**

| Feature                 | 0 Multiplier                       | No-XP Channels/Roles            |
| ----------------------- | ---------------------------------- | ------------------------------- |
| **Scope**               | Server/role/user level             | Channel or role level           |
| **messages counter**    | ✅ Increments                      | ✅ Increments                   |
| **xpMessages counter**  | ❌ Stays 0                         | ❌ Stays 0                      |
| **Admin commands work** | ✅ Yes                             | ✅ Yes                          |
| **Use case**            | Manual XP control                  | Exclude specific areas          |
| **Flexibility**         | Can combine (server × role × user) | All-or-nothing per channel/role |

**Debug checklist:**

```typescript
const user = await XP.getUser(guildId, userId)
const config = await XP.config.get(guildId)

console.log('User XP:', user.xp)
console.log('Total messages:', user.messages)
console.log('XP messages:', user.xpMessages)
console.log('Ratio:', ((user.xpMessages / user.messages) * 100).toFixed(1) + '%')
console.log('\nConfig:')
console.log('- Cooldown:', config.cooldownSeconds + 's')
console.log('- XP Rate:', config.xpRate)
console.log('- Server multiplier:', config.multipliers?.server ?? 1.0)
console.log('- No-XP channels:', config.noXpChannelIds)
console.log('- No-XP roles:', config.noXpRoleIds)
```

### XP Not Being Awarded

**Possible causes:**

1. **Channel type:** Only text channels award XP
2. **No-XP roles:** User has a role in `noXpRoleIds`
3. **No-XP channels:** Channel is in `noXpChannelIds`
4. **Cooldown:** User sent message within cooldown period (default 60s)
5. **Bot messages:** Bots don't earn XP

**Debug:**

```ts
import { config } from '@robojs/xp'
const guildConfig = await config.get(guildId)
console.log('No-XP roles:', guildConfig.noXpRoleIds)
console.log('No-XP channels:', guildConfig.noXpChannelIds)
console.log('Cooldown:', guildConfig.cooldownSeconds)
```

### Message Counter Discrepancy

**Issue:** The `messages` count is much higher than `xpMessages` count.

**This is expected behavior.** The two counters track different metrics:

- **`messages`**: Total messages sent in guild text channels (after basic validation)
- **`xpMessages`**: Messages that actually awarded XP (after all checks)

**Common reasons for discrepancy:**

1. **Cooldown blocking XP**: With default 60s cooldown, rapid messages don't award XP
   - Example: 10 messages in 1 minute → `messages: 10`, `xpMessages: 1`

2. **No-XP channels**: Messages in excluded channels increment `messages` but not `xpMessages`
   - Check: `config.noXpChannelIds`

3. **No-XP roles**: Users with excluded roles increment `messages` but not `xpMessages`
   - Check: `config.noXpRoleIds`

4. **Temporary restrictions**: User had No-XP role or was in No-XP channel for a period

**Debug:**

```typescript
import { XP, config } from '@robojs/xp'
const user = await XP.getUser(guildId, userId)
const guildConfig = await config.get(guildId)

console.log('Total messages:', user.messages)
console.log('XP messages:', user.xpMessages)
console.log('Ratio:', ((user.xpMessages / user.messages) * 100).toFixed(1) + '%')
console.log('Cooldown:', guildConfig.cooldownSeconds + 's')
console.log('No-XP channels:', guildConfig.noXpChannelIds)
console.log('No-XP roles:', guildConfig.noXpRoleIds)
```

**Expected ratios:**

- Active chatters with 60s cooldown: 10-30% (depends on chat frequency)
- Users in No-XP channels frequently: 5-15%
- Users with temporary No-XP role: varies widely

**This is not a bug** - it's intentional design to track both total activity and XP-eligible activity.

### Roles Not Being Granted

**Possible causes:**

1. **Bot permissions:** Bot lacks `Manage Roles` permission
2. **Role hierarchy:** Reward role is higher than bot's highest role
3. **Managed roles:** Cannot assign managed roles (e.g., Nitro Boost)
4. **Missing role:** Role was deleted but still in `roleRewards`

**Fix:**

```ts
import { reconcileRewards, config } from '@robojs/xp'

// Recalculate roles for a user
await reconcileRewards(guildId, userId)

// Remove deleted roles from config
const guildConfig = await config.get(guildId)
const validRewards = guildConfig.roleRewards.filter((r) => guild.roles.cache.has(r.roleId))
await config.set(guildId, { roleRewards: validRewards })
```

### Leaderboard Showing Stale Data

**Cause:** Cache TTL (60 seconds)

**Solution:**

```ts
import { leaderboard } from '@robojs/xp'
// Manually invalidate cache
await leaderboard.invalidateCache(guildId)

// Or wait for TTL to expire (auto-refreshes on next query)
```

### Performance Issues

**Large guilds (10k+ users):**

- First leaderboard query after cache expiry may take 200-500ms
- Subsequent queries are under 10ms (cached)
- Consider warming cache during off-peak hours

**Cache warming:**

```ts
import { leaderboard } from '@robojs/xp'
// Warm cache for all guilds (top 100 users)
for (const guildId of guildIds) {
	await leaderboard.get(guildId, 0, 100)
}
```

### Multi-Store Issues

#### Custom Store Not Working

- Symptom: Custom store operations fail or return null
- Cause: Forgetting to pass `storeId` in options
- Solution: Always include `{ storeId: 'storeName' }` for custom stores

```typescript
// ❌ Wrong - uses default store
await XP.getXP(guildId, userId)

// ✅ Correct - uses reputation store
await XP.getXP(guildId, userId, { storeId: 'reputation' })
```

#### Role Rewards Not Working for Custom Store

- Symptom: Leveling up in custom store doesn't grant roles
- This is expected: Role rewards only trigger for default store
- Rationale: Prevents conflicts where multiple stores would grant/remove the same roles
- Solution: Use default store for leveling with role rewards; use custom stores for parallel progression without roles

#### Leaderboard Showing Wrong Data

- Symptom: Leaderboard shows data from different store
- Cause: Not passing `storeId` to leaderboard query
- Solution:

```typescript
// Default store leaderboard
const defaultTop = await leaderboard.get(guildId, 0, 10)

// Reputation store leaderboard
const repTop = await leaderboard.get(guildId, 0, 10, { storeId: 'reputation' })
```

#### Events Firing for All Stores

- Symptom: Event listener triggers for all stores, not just one
- Solution: Filter events by `storeId` field

```typescript
events.onLevelUp((event) => {
	if (event.storeId !== 'reputation') return // Skip non-reputation events
	console.log('Reputation level up!')
})
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

Robo XP supports fully customizable level progression curves. By default, the plugin matches MEE6 parity using a quadratic formula, but you can override the curve per guild and per store (multi-store aware). You can choose from presets (quadratic, linear, exponential, lookup) or supply code via the `getCurve` callback in your plugin config for dynamic logic.

Note: Unless you customize it, the default store uses the MEE6‑compatible quadratic curve defined as:

XP(level) = 5 × level² + 50 × level + 100

This preserves familiar progression for most servers. You can override this globally, per guild, and/or per store.

### Preset Curve Types

You can set a preset curve for a guild (and optionally per store) using your configuration APIs or helper utilities. Presets are fully serializable and are persisted in Flashcore so they survive restarts.

All presets support an optional `maxLevel` cap to prevent progression beyond a certain level.

#### 1) Quadratic Curves (Custom Coefficients)

Formula: XP(level) = a × level² + b × level + c

- Steeper progression example (large or highly active guilds):

```ts
// Example: steeper quadratic
await config.set(guildId, {
  levels: {
    type: 'quadratic',
    params: { a: 10, b: 100, c: 200 },
    maxLevel: 100,
  },
})
```

- Gentler progression example (small/early-stage guilds):

```ts
// Example: gentler quadratic
await config.set(guildId, {
  levels: {
    type: 'quadratic',
    params: { a: 2, b: 20, c: 50 },
  },
})
```

Notes:
- Use higher `a` for faster late‑game growth; adjust `b` and `c` for early levels.
- Add `maxLevel` to cap the system for seasons or events.

#### 2) Linear Curves

Formula: XP(level) = level × xpPerLevel

- Constant 100 XP per level:

```ts
await config.set(guildId, {
  levels: { type: 'linear', params: { xpPerLevel: 100 } },
})
```

- Slower 500 XP per level progression:

```ts
await config.set(guildId, {
  levels: { type: 'linear', params: { xpPerLevel: 500 } },
})
```

Notes:
- Simplest to reason about; great for reputation/credits or non‑competitive tracks.

#### 3) Exponential Curves

Formula: XP(level) = multiplier × base^level

- Doubles required XP every level:

```ts
await config.set(guildId, {
  levels: {
    type: 'exponential',
    params: { base: 2, multiplier: 100 },
    maxLevel: 50, // strongly recommended
  },
})
```

- 50% increase per level:

```ts
await config.set(guildId, {
  levels: {
    type: 'exponential',
    params: { base: 1.5, multiplier: 100 },
    maxLevel: 75,
  },
})
```

Warnings:
- Exponential growth becomes extremely steep; always set a `maxLevel`.

#### 4) Lookup Table Curves

Define exact XP thresholds per level.

```ts
await config.set(guildId, {
  levels: {
    type: 'lookup',
    params: { thresholds: [0, 100, 250, 500, 1000, 2000, 5000] },
    // maxLevel defaults to thresholds.length - 1 when omitted
  },
})
```

Notes:
- Provides pixel‑perfect control over each level’s requirement.
- Useful for seasonal passes and event‑specific tuning.

### Advanced Customization with getCurve Callback

For dynamic logic that can’t be expressed with static presets, define `levels.getCurve` in your plugin config file `config/plugins/robojs/xp.ts`. This callback has the highest precedence:

getCurve callback → guild preset → default quadratic

The callback can be synchronous or asynchronous and is not stored in Flashcore.

Example: Different curves per store

```ts
// config/plugins/robojs/xp.ts
import type { PluginOptions } from '@robojs/xp'

export default {
  levels: {
    getCurve: (guildId, storeId) => {
      if (storeId === 'reputation') {
        // Linear: 500 XP per level
        return {
          xpForLevel: (level) => level * 500,
          levelFromXp: (xp) => Math.floor(xp / 500),
        }
      }
      return null // falls through to guild preset or default quadratic
    },
  },
} satisfies PluginOptions
```

Example: Special guild gets custom quadratic with cap

```ts
export default {
  levels: {
    getCurve: (guildId) => {
      if (guildId === 'SPECIAL_GUILD_ID') {
        return {
          xpForLevel: (level) => 10 * level * level + 100 * level + 200,
          levelFromXp: (xp) => Math.floor((-100 + Math.sqrt(10000 + 40 * (xp - 200))) / 20),
          maxLevel: 100,
        }
      }
      return null
    },
  },
} satisfies PluginOptions
```

Example: Dynamic curves based on guild size (async)

```ts
export default {
  levels: {
    getCurve: async (guildId) => {
      const guild = await client.guilds.fetch(guildId)
      if (guild.memberCount > 1000) {
        return {
          xpForLevel: (level) => 10 * level * level + 100 * level + 200,
          levelFromXp: (xp) => Math.floor((-100 + Math.sqrt(10000 + 40 * (xp - 200))) / 20),
        }
      }
      return null // small guilds use preset/default
    },
  },
} satisfies PluginOptions
```

Curves resolved via `getCurve` are cached per `(guildId, storeId)` to avoid repeated computation.

### Migration Guide

Follow these steps to migrate from the default curve to custom curves.

1) Choose your curve type

- Simple, constant progression → Linear
- Exact per‑level control → Lookup
- Rapid growth (with caps) → Exponential
- Familiar quadratic with tunable coefficients → Quadratic

2) Configure a per‑guild preset (recommended)

```ts
await config.set(guildId, {
  levels: { type: 'linear', params: { xpPerLevel: 100 } },
})
```

- Presets persist in Flashcore and can be changed per guild and per store.

3) Test your curve

- Use `/xp set` to simulate levels and validate math.
- Verify `/rank` and `/leaderboard` outputs.
- Start with small XP ranges to confirm expected progression.

4) Optional: Use the `getCurve` callback for advanced scenarios

- Dynamic logic (guild size, time‑based seasons).
- Different curves per store (e.g., reputation vs. coins).
- Special partner/premium guilds.

Common use cases

- Small servers (< 100 members): gentler curves for faster early progression.
- Large servers (1000+ members): steeper curves to maintain challenge.
- Seasonal systems: lookup tables with strict level caps.
- Multi‑currency: different curves per store (linear for coins, exponential for gems).

### MEE6 Parity and Default Behavior

Default quadratic curve (MEE6 parity):

XP(level) = 5 × level² + 50 × level + 100

Example requirements:

- Level 1: 100 XP
- Level 5: 475 XP
- Level 10: 1,100 XP
- Level 20: 3,100 XP
- Level 50: 15,100 XP
- Level 100: 55,100 XP

Overriding defaults

- Any custom preset or `getCurve` override replaces the default for that guild/store.
- Built‑in commands like `/rank` and `/leaderboard` work with all curve types.

Custom stores

- Custom stores (e.g., `reputation`, `coins`) also default to quadratic but may be configured independently.
- Example: default store uses quadratic, `reputation` uses linear 500 XP/level via `getCurve`.

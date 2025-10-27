# @robojs/xp

@robojs/xp - XP and Leveling System for Discord Bots

A comprehensive XP and leveling system plugin for Robo.js with MEE6 parity.
Provides XP manipulation APIs, configuration management, level curve mathematics,
role rewards, event system, and admin commands for Discord servers.

## Features

- **MEE6 Parity**: Formula `XP = 5 * level^2 + 50 * level + 100` with default settings matching MEE6
- **Role Rewards**: Automatic role assignment on level-up with stack/replace modes
- **XP Multipliers**: Per-user and per-role multipliers (MEE6 Pro parity)
- **Event-Driven**: Type-safe events for levelUp, levelDown, xpChange
- **No-XP Zones**: Configure channels/roles to exclude from XP gains
- **Fully Typed**: Comprehensive TypeScript support with result types

## Installation

```bash
npm install @robojs/xp
```

## Quick Start

### Basic XP Manipulation

```typescript
import { xp } from '@robojs/xp'

// Award XP to a user
const result = await xp.add('guildId', 'userId', 100, { reason: 'contest_winner' })
if (result.leveledUp) {
  console.log(`User leveled up to ${result.newLevel}!`)
}

// Remove XP for moderation
await xp.remove('guildId', 'userId', 50, { reason: 'spam_penalty' })

// Set absolute XP value
await xp.set('guildId', 'userId', 5000)
```

### Event Listening

```typescript
import { events } from '@robojs/xp'
import type { LevelUpEvent } from '@robojs/xp'

// Type-safe level-up listener
events.on('levelUp', (event: LevelUpEvent) => {
  console.log(`User ${event.userId} reached level ${event.newLevel}!`)
  // Role rewards applied automatically via internal listeners
})

// Track all XP changes
events.on('xpChange', (event) => {
  console.log(`User ${event.userId} gained ${event.delta} XP (${event.reason})`)
})
```

### Configuration Management

```typescript
import { config } from '@robojs/xp'

// Get guild config (creates with defaults if needed)
const guildConfig = await config.get('123456789012345678')

// Configure role rewards
await config.set('123456789012345678', {
  roleRewards: [
    { level: 5, roleId: '234567890123456789' },
    { level: 10, roleId: '345678901234567890' }
  ],
  rewardsMode: 'stack' // Users keep all qualifying roles
})

// Set up XP multipliers (MEE6 Pro parity)
await config.set('123456789012345678', {
  multipliers: {
    user: {
      'premiumUserId': 1.5 // +50% XP boost
    }
  }
})
```

### Leaderboard Queries

```typescript
import { leaderboard } from '@robojs/xp'

// Get top 10 users
const top10 = await leaderboard.get('guildId', 0, 10)
top10.forEach(entry => {
  console.log(`#${entry.rank}: ${entry.userId} - Level ${entry.level} (${entry.xp} XP)`)
})

// Get user's rank position
const rankInfo = await leaderboard.getRank('guildId', 'userId')
if (rankInfo) {
  console.log(`You are rank ${rankInfo.rank} out of ${rankInfo.total}`)
}
```

## Integration Examples

### Contest Plugin Integration

```typescript
import { xp } from '@robojs/xp'

// Award bonus XP to contest winners
const result = await xp.add(guildId, winnerId, 500, { reason: 'contest_winner' })
if (result.leveledUp) {
  await channel.send(`Congrats <@${winnerId}>! You leveled up to ${result.newLevel}!`)
}
```

### Moderation Plugin Integration

```typescript
import { xp } from '@robojs/xp'

// Remove XP for rule violations
try {
  await xp.remove(guildId, userId, 100, { reason: 'spam_violation' })
} catch (error) {
  logger.warn('User has no XP to remove')
}
```

### Analytics Plugin Integration

```typescript
import { events } from '@robojs/xp'

// Track XP changes for analytics
events.on('xpChange', (event) => {
  analytics.track('xp_change', {
    guildId: event.guildId,
    userId: event.userId,
    delta: event.delta,
    reason: event.reason
  })
})
```

### Announcement Plugin Integration

```typescript
import { events } from '@robojs/xp'

// Send level-up announcements
events.on('levelUp', async (event) => {
  const channel = await getAnnouncementChannel(event.guildId)
  await channel.send(`<@${event.userId}> reached level ${event.newLevel}!`)
})
```

## Remarks

### Event-Driven Architecture

All XP mutations emit events after Flashcore persistence. Role rewards reconcile
automatically via event listeners. Events guarantee consistency (emitted only after
successful persistence).

### MEE6 Parity

- **Level curve formula**: `5*l² + 50*l + 100`
- **Default settings**: Match MEE6 for seamless migration
- **XP per message**: 15-25 XP with 60s cooldown
- **Role rewards**: Stack vs replace modes
- **Multipliers**: Equivalent to MEE6 Pro features

### Performance Characteristics

- **Leaderboard caching**: Top 100 users per guild, 60s TTL
- **Automatic cache invalidation**: On XP changes
- **Math operations**: All O(1) or O(log n)

### Persistence & Consistency

- **Storage**: All data in Flashcore under 'xp' namespace
- **Guild-scoped data**: `['xp', guildId, ...]`
- **Global config**: `['xp', 'global', 'config']`
- **Event timing**: Emitted only after successful persistence

### Type Safety

- **Full TypeScript support**: Comprehensive types for all APIs
- **Event payloads**: Strongly typed via discriminated unions
- **Result types**: For all XP mutations (XPChangeResult, etc.)
- **Config validation**: Detailed error messages

### Extensibility

- **Event system**: Custom integrations via typed event listeners
- **Config**: Custom multipliers per role/user
- **Theme support**: Custom embed colors
- **Manual reconciliation**: Advanced API for edge cases

## Documentation

For full documentation, visit: https://docs.robojs.dev/plugins/xp

## References

### reconcileRewards

Re-exports reconcile

## Interfaces

- [AddXPOptions](Interface.AddXPOptions.md)
- [GuildConfig](Interface.GuildConfig.md)
- [LeaderboardEntry](Interface.LeaderboardEntry.md)
- [LevelDownEvent](Interface.LevelDownEvent.md)
- [LevelProgress](Interface.LevelProgress.md)
- [LevelUpEvent](Interface.LevelUpEvent.md)
- [RecalcResult](Interface.RecalcResult.md)
- [RoleReward](Interface.RoleReward.md)
- [UserXP](Interface.UserXP.md)
- [XPChangeEvent](Interface.XPChangeEvent.md)
- [XPChangeResult](Interface.XPChangeResult.md)
- [XPRemoveResult](Interface.XPRemoveResult.md)
- [XPSetResult](Interface.XPSetResult.md)

## Type Aliases

- [GlobalConfig](TypeAlias.GlobalConfig.md)
- [RewardsMode](TypeAlias.RewardsMode.md)

## Variables

- [config](Variable.config.md)
- [constants](Variable.constants.md)
- [events](Variable.events.md)
- [leaderboard](Variable.leaderboard.md)
- [math](Variable.math.md)
- [rewards](Variable.rewards.md)
- [xp](Variable.xp.md)
- [XP](Variable.XP.md)

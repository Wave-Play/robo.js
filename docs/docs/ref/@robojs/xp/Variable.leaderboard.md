# Variable: leaderboard

```ts
const leaderboard: object;
```

Leaderboard API for ranking and leaderboard operations

High-performance leaderboard system with intelligent caching for fast queries
on large servers. Designed to handle 10k+ users with under 200ms response times.

**Features:**
- In-memory caching of top 100 users per guild
- Automatic cache invalidation on XP changes
- Paginated leaderboard retrieval
- Efficient rank position lookup
- Stable sort (XP desc, userId asc)
- Cache warming on first query

**Caching Behavior:**
- **Cache TTL**: 60 seconds (auto-refresh on expiry)
- **Cache size**: Top 100 users per guild (ranked 1-100)
- **Invalidation**: Automatic on xpChange, levelUp, levelDown events
- **Cold start**: First query builds cache (O(n log n))
- **Warm cache**: Subsequent queries are O(1)

## Type declaration

### get()

```ts
get: (guildId, offset, limit) => Promise<object> = getLeaderboardCore;
```

Get paginated leaderboard entries (offset, limit)

Retrieves leaderboard with pagination support and total user count.
Uses cached data if available and fresh, otherwise triggers refresh.
Supports deep pagination beyond the cached top N.

Complexity:
- O(1) for cached reads within cached range (within TTL)
- O(n log n) for cache refresh (all users sorted)
- O(n log n) for deep pagination fallback (full dataset sort and slice)

#### Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `guildId` | `string` | `undefined` | Guild ID |
| `offset` | `number` | `0` | Starting position (0-indexed, default: 0) |
| `limit` | `number` | `10` | Number of entries to return (default: 10) |

#### Returns

`Promise`\<`object`\>

Object with entries array and total user count

##### entries

```ts
entries: LeaderboardEntry[];
```

##### total

```ts
total: number;
```

#### Example

```typescript
// Get top 10 users
const { entries, total } = await getLeaderboard('123...', 0, 10)

// Get users 11-20 (page 2)
const { entries, total } = await getLeaderboard('123...', 10, 10)

// Get users 101-110 (beyond cached top 100)
const { entries, total } = await getLeaderboard('123...', 100, 10)
```

### getRank()

```ts
getRank: (guildId, userId) => Promise<object | null> = getUserRankCore;
```

Get user's rank position (1-indexed)

Gets user's rank position in the leaderboard.
Returns null if user has no XP record.

For users in top 100, uses cached data (O(n) search).
For users beyond cache, fetches all users and calculates position (O(n log n)).
Always returns the total number of tracked users from getAllUsers.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `guildId` | `string` | Guild ID |
| `userId` | `string` | User ID |

#### Returns

`Promise`\<`object` \| `null`\>

Rank info (1-indexed position and total users) or null if user not found

#### Example

```typescript
const rankInfo = await getUserRank('123...', '456...')
if (rankInfo) {
  console.log(`User is rank ${rankInfo.rank} out of ${rankInfo.total}`)
}
```

### invalidateCache()

```ts
invalidateCache: (guildId) => void = invalidateCacheCore;
```

Manually invalidate cache for a guild (usually automatic)

Invalidates cache for a specific guild.
Called automatically when XP changes via event listeners.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `guildId` | `string` | Guild ID |

#### Returns

`void`

#### Example

```typescript
// Manual cache invalidation (usually automatic)
invalidateCache('123...')
```

## Examples

### Get Top Users (Paginated)

```typescript
import { leaderboard } from '@robojs/xp'

// Get top 10 users (first page)
const top10 = await leaderboard.get('guildId', 0, 10)
top10.forEach(entry => {
  console.log(`#${entry.rank}: ${entry.userId} - Level ${entry.level} (${entry.xp} XP)`)
})

// Get next 10 users (second page)
const next10 = await leaderboard.get('guildId', 10, 10)
```

### Build Leaderboard Command

```typescript
import { leaderboard } from '@robojs/xp'
import { CommandInteraction } from 'discord.js'

async function handleLeaderboardCommand(interaction: CommandInteraction) {
  const page = interaction.options.getInteger('page') ?? 1
  const pageSize = 10
  const offset = (page - 1) * pageSize

  // Get leaderboard entries for this page
  const entries = await leaderboard.get(interaction.guildId, offset, pageSize)

  if (entries.length === 0) {
    await interaction.reply('No users on this page!')
    return
  }

  // Build leaderboard embed
  const description = entries
    .map(entry => `#${entry.rank}: <@${entry.userId}> - Level ${entry.level} (${entry.xp} XP)`)
    .join('\n')

  await interaction.reply({
    embeds: [{
      title: `Leaderboard - Page ${page}`,
      description
    }]
  })
}
```

### Get User's Rank Position

```typescript
import { leaderboard } from '@robojs/xp'

// Get user's rank position
const rankInfo = await leaderboard.getRank('guildId', 'userId')

if (rankInfo) {
  console.log(`User is rank #${rankInfo.rank} out of ${rankInfo.total} users`)
  console.log(`Level: ${rankInfo.level}, XP: ${rankInfo.xp}`)
} else {
  console.log('User has no XP record')
}
```

### Build Rank Command

```typescript
import { leaderboard } from '@robojs/xp'
import { CommandInteraction } from 'discord.js'

async function handleRankCommand(interaction: CommandInteraction) {
  const userId = interaction.options.getUser('user')?.id ?? interaction.user.id

  const rankInfo = await leaderboard.getRank(interaction.guildId, userId)

  if (!rankInfo) {
    await interaction.reply('This user has no XP yet!')
    return
  }

  await interaction.reply({
    embeds: [{
      title: `Rank for <@${userId}>`,
      fields: [
        { name: 'Rank', value: `#${rankInfo.rank}`, inline: true },
        { name: 'Level', value: `${rankInfo.level}`, inline: true },
        { name: 'XP', value: `${rankInfo.xp}`, inline: true }
      ],
      footer: { text: `Out of ${rankInfo.total} users` }
    }]
  })
}
```

### Manual Cache Invalidation (Advanced)

```typescript
import { leaderboard } from '@robojs/xp'

// Usually automatic, but can be manually triggered
leaderboard.invalidateCache('guildId')

// Next leaderboard.get() call will rebuild cache from Flashcore
const fresh = await leaderboard.get('guildId', 0, 10)
```

## Remarks

- Cache is automatically invalidated on XP changes (via event listeners)
- First query after invalidation rebuilds cache (O(n log n))
- Subsequent queries use cached data (O(1) for top 100)
- Leaderboard entries are sorted: XP desc, userId asc (stable sort)
- Rank positions are 1-indexed (rank 1 = top user)
- `getRank()` returns `null` for users with no XP record
- Cache TTL is 60 seconds - auto-refreshes on expiry
- Manual invalidation is rarely needed (automatic via events)

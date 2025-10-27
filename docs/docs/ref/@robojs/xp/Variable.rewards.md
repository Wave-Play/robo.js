# Variable: rewards

```ts
const rewards: object;
```

Role rewards reconciliation API

Provides manual control over role reward reconciliation. In most cases,
role rewards are automatically reconciled when users level up/down via
internal event listeners registered in `runtime/rewards.ts`.

**When to Use This API:**
- Fixing role inconsistencies after manual database edits
- Forcing reconciliation after guild config changes
- Building custom role reward logic outside standard flow
- Debugging role reward issues

**When NOT to Use:**
- Normal level-up/down operations (automatic via events)
- After calling `xp.add()`, `xp.remove()`, `xp.set()` (automatic)
- Regular XP gains from messages (automatic)

## Type declaration

### reconcile()

```ts
reconcile: (guildId, userId, newLevel, guildConfig) => Promise<void> = reconcileRoleRewards;
```

Manually reconcile role rewards for a user at a specific level.

This function applies the appropriate role rewards based on the user's
level and the guild's configuration. It handles both 'stack' and 'replace'
modes, and respects role position hierarchy.

Main reconciliation function for role rewards

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `guildId` | `string` |
| `userId` | `string` |
| `newLevel` | `number` |
| `guildConfig` | [`GuildConfig`](Interface.GuildConfig.md) |

#### Returns

`Promise`\<`void`\>

#### Param

Guild snowflake ID

#### Param

User snowflake ID

#### Param

User's current level

#### Param

Guild configuration with role rewards settings

#### Example

```typescript
import { rewards, config, xp } from '@robojs/xp'

const guildConfig = await config.get('guildId')
const userLevel = await xp.getLevel('guildId', 'userId')
await rewards.reconcile('guildId', 'userId', userLevel, guildConfig)
```

### reconcileRewards()

```ts
reconcileRewards: (guildId, userId, newLevel, guildConfig) => Promise<void> = reconcileRoleRewards;
```

Alias for reconcile() - manually reconcile role rewards for a user.

Main reconciliation function for role rewards

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `guildId` | `string` |
| `userId` | `string` |
| `newLevel` | `number` |
| `guildConfig` | [`GuildConfig`](Interface.GuildConfig.md) |

#### Returns

`Promise`\<`void`\>

#### Param

Guild snowflake ID

#### Param

User snowflake ID

#### Param

User's current level

#### Param

Guild configuration with role rewards settings

#### Example

```typescript
import { rewards, config, xp } from '@robojs/xp'

const guildConfig = await config.get('guildId')
const userLevel = await xp.getLevel('guildId', 'userId')
await rewards.reconcileRewards('guildId', 'userId', userLevel, guildConfig)
```

## Examples

### Manual Role Reconciliation After Config Change

```typescript
import { reconcileRewards, config, xp } from '@robojs/xp'

// After changing role rewards config, reconcile all affected users
const guildConfig = await config.get('guildId')
const userLevel = await xp.getLevel('guildId', 'userId')

// Manually reconcile roles for this user
await reconcileRewards('guildId', 'userId', userLevel, guildConfig)
```

### Fix Role Inconsistencies

```typescript
import { reconcileRewards, config, xp } from '@robojs/xp'

// If roles are out of sync (e.g., after manual role changes)
async function fixUserRoles(guildId: string, userId: string) {
  const guildConfig = await config.get(guildId)
  const userLevel = await xp.getLevel(guildId, userId)

  // Force reconciliation to correct state
  await reconcileRewards(guildId, userId, userLevel, guildConfig)
  console.log(`Reconciled roles for user ${userId} at level ${userLevel}`)
}
```

### Bulk Reconciliation After Major Config Change

```typescript
import { reconcileRewards, config, xp } from '@robojs/xp'
import { getAllUsers } from '@robojs/xp/store'

// After major config change, reconcile all users
async function reconcileAllUsers(guildId: string) {
  const guildConfig = await config.get(guildId)
  const allUsers = await getAllUsers(guildId)

  for (const user of allUsers) {
    await reconcileRewards(guildId, user.userId, user.level, guildConfig)
  }

  console.log(`Reconciled ${allUsers.length} users`)
}
```

## Remarks

- **Automatic reconciliation** happens via event listeners in `runtime/rewards.ts`
- Events trigger reconciliation: `levelUp`, `levelDown` (from `core/xp.ts`)
- Manual reconciliation is **idempotent** - safe to call multiple times
- This is an **advanced API** - most users won't need it
- Role rewards follow `rewardsMode` config: 'stack' or 'replace'
- Bot must have `MANAGE_ROLES` permission and higher role position
- Reconciliation respects `removeRewardsOnLoss` config setting

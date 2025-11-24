# Variable: XP

```ts
const XP: object;
```

XP manipulation API for programmatic XP management

Core API for adding, removing, setting, and querying user XP. All XP mutations
are transactional and automatically trigger events and role reconciliation.

**Features:**
- Add/remove/set XP values with type-safe result objects
- Automatic level calculation based on default curve
- Event emission (levelUp, levelDown, xpChange) after persistence
- Automatic role reward reconciliation via event listeners
- Flashcore persistence with consistency guarantees
- Error handling for invalid inputs and missing users

**Method Aliases:**
- `add()` or `addXP()` - Award XP to a user
- `remove()` or `removeXP()` - Remove XP from a user
- `set()` or `setXP()` - Set absolute XP value
- `get()` or `getXP()` - Get user's total XP

**All XP Mutations Automatically:**
1. Validate inputs (non-negative amounts, valid IDs)
2. Load or create user record
3. Calculate new level using default formula
4. Persist to Flashcore
5. Emit events (after successful persistence)
6. Trigger role reconciliation (via event listeners)

## Type declaration

### add()

```ts
add: (guildId, userId, amount, options?) => Promise<XPChangeResult> = addXPCore;
```

Add XP to a user (emits events, triggers role reconciliation)

Adds XP to a user, computes level changes, and emits events.
Events are emitted after persistence for consistency.
Role reconciliation happens automatically via event listeners.
If the guild's level curve defines a maxLevel, users cannot exceed it.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `guildId` | `string` | Guild snowflake ID |
| `userId` | `string` | User snowflake ID |
| `amount` | `number` | Amount of XP to add (must be positive) |
| `options`? | [`AddXPOptions`](Interface.AddXPOptions.md) | Optional settings like reason and storeId |

#### Returns

`Promise`\<[`XPChangeResult`](Interface.XPChangeResult.md)\>

Result object with old/new XP, levels, and leveledUp flag

#### Examples

```ts
// Default store
await addXP('guildId', 'userId', 100, { reason: 'message' })
```

```ts
// Custom store
await addXP('guildId', 'userId', 50, { reason: 'quest', storeId: 'reputation' })
```

### addXP()

```ts
addXP: (guildId, userId, amount, options?) => Promise<XPChangeResult> = addXPCore;
```

Add XP to a user - alias for add()

Adds XP to a user, computes level changes, and emits events.
Events are emitted after persistence for consistency.
Role reconciliation happens automatically via event listeners.
If the guild's level curve defines a maxLevel, users cannot exceed it.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `guildId` | `string` | Guild snowflake ID |
| `userId` | `string` | User snowflake ID |
| `amount` | `number` | Amount of XP to add (must be positive) |
| `options`? | [`AddXPOptions`](Interface.AddXPOptions.md) | Optional settings like reason and storeId |

#### Returns

`Promise`\<[`XPChangeResult`](Interface.XPChangeResult.md)\>

Result object with old/new XP, levels, and leveledUp flag

#### Examples

```ts
// Default store
await addXP('guildId', 'userId', 100, { reason: 'message' })
```

```ts
// Custom store
await addXP('guildId', 'userId', 50, { reason: 'quest', storeId: 'reputation' })
```

### get()

```ts
get: (guildId, userId, options?) => Promise<number> = getXPCore;
```

Get user's total XP (returns 0 if not found)

Returns user's total XP (0 if not found).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `guildId` | `string` | Guild snowflake ID |
| `userId` | `string` | User snowflake ID |
| `options`? | [`GetXPOptions`](Interface.GetXPOptions.md) | Optional settings like storeId |

#### Returns

`Promise`\<`number`\>

Total XP

#### Examples

```ts
// Default store
const xp = await getXP('guildId', 'userId')
```

```ts
// Custom store
const reputation = await getXP('guildId', 'userId', { storeId: 'reputation' })
```

### getLevel()

```ts
getLevel: (guildId, userId, options?) => Promise<number> = getLevelCore;
```

Get user's level (returns 0 if not found)

Returns user's level (0 if not found).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `guildId` | `string` | Guild snowflake ID |
| `userId` | `string` | User snowflake ID |
| `options`? | [`GetXPOptions`](Interface.GetXPOptions.md) | Optional settings like storeId |

#### Returns

`Promise`\<`number`\>

User level

#### Examples

```ts
// Default store
const level = await getLevel('guildId', 'userId')
```

```ts
// Custom store
const repLevel = await getLevel('guildId', 'userId', { storeId: 'reputation' })
```

### getUser()

```ts
getUser: (guildId, userId, options?) => Promise<UserXP | null> = getUserDataCore;
```

Get full user XP record (returns null if not found)

Returns full user XP record.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `guildId` | `string` | Guild snowflake ID |
| `userId` | `string` | User snowflake ID |
| `options`? | [`GetXPOptions`](Interface.GetXPOptions.md) | Optional settings like storeId |

#### Returns

`Promise`\<[`UserXP`](Interface.UserXP.md) \| `null`\>

User XP record or null if not found

#### Examples

```ts
// Default store
const userData = await getUserData('guildId', 'userId')
```

```ts
// Custom store
const repData = await getUserData('guildId', 'userId', { storeId: 'reputation' })
```

### getXP()

```ts
getXP: (guildId, userId, options?) => Promise<number> = getXPCore;
```

Get user's total XP - alias for get()

Returns user's total XP (0 if not found).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `guildId` | `string` | Guild snowflake ID |
| `userId` | `string` | User snowflake ID |
| `options`? | [`GetXPOptions`](Interface.GetXPOptions.md) | Optional settings like storeId |

#### Returns

`Promise`\<`number`\>

Total XP

#### Examples

```ts
// Default store
const xp = await getXP('guildId', 'userId')
```

```ts
// Custom store
const reputation = await getXP('guildId', 'userId', { storeId: 'reputation' })
```

### recalc()

```ts
recalc: (guildId, userId, options?) => Promise<RecalcResult> = recalcLevelCore;
```

Recalculate level from total XP and reconcile roles

Recalculates level from total XP and reconciles roles.
Useful for fixing inconsistencies after config changes or manual database edits.
Recalculation uses the current level curve configuration, which may differ from
when XP was originally awarded.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `guildId` | `string` | Guild snowflake ID |
| `userId` | `string` | User snowflake ID |
| `options`? | [`RecalcOptions`](Interface.RecalcOptions.md) | Optional settings like storeId |

#### Returns

`Promise`\<[`RecalcResult`](Interface.RecalcResult.md)\>

Result object with old/new levels and reconciliation status

#### Examples

```ts
// Default store
await recalcLevel('guildId', 'userId')
```

```ts
// Custom store
await recalcLevel('guildId', 'userId', { storeId: 'reputation' })
```

### remove()

```ts
remove: (guildId, userId, amount, options?) => Promise<XPRemoveResult> = removeXPCore;
```

Remove XP from a user (emits events, triggers role reconciliation)

Removes XP from a user (calls addXP with negative amount).
Ensures XP doesn't go below 0.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `guildId` | `string` | Guild snowflake ID |
| `userId` | `string` | User snowflake ID |
| `amount` | `number` | Amount of XP to remove (must be positive) |
| `options`? | [`AddXPOptions`](Interface.AddXPOptions.md) | Optional settings like reason and storeId |

#### Returns

`Promise`\<[`XPRemoveResult`](Interface.XPRemoveResult.md)\>

Result object with old/new XP, levels, and leveledDown flag

### removeXP()

```ts
removeXP: (guildId, userId, amount, options?) => Promise<XPRemoveResult> = removeXPCore;
```

Remove XP from a user - alias for remove()

Removes XP from a user (calls addXP with negative amount).
Ensures XP doesn't go below 0.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `guildId` | `string` | Guild snowflake ID |
| `userId` | `string` | User snowflake ID |
| `amount` | `number` | Amount of XP to remove (must be positive) |
| `options`? | [`AddXPOptions`](Interface.AddXPOptions.md) | Optional settings like reason and storeId |

#### Returns

`Promise`\<[`XPRemoveResult`](Interface.XPRemoveResult.md)\>

Result object with old/new XP, levels, and leveledDown flag

### set()

```ts
set: (guildId, userId, totalXp, options?) => Promise<XPSetResult> = setXPCore;
```

Set absolute XP value for a user (emits events, triggers role reconciliation)

Sets absolute XP value for a user.
If the guild's level curve defines a maxLevel, users cannot exceed it.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `guildId` | `string` | Guild snowflake ID |
| `userId` | `string` | User snowflake ID |
| `totalXp` | `number` | New total XP (must be non-negative) |
| `options`? | [`AddXPOptions`](Interface.AddXPOptions.md) | Optional settings like reason and storeId |

#### Returns

`Promise`\<[`XPSetResult`](Interface.XPSetResult.md)\>

Result object with old/new XP and levels

### setXP()

```ts
setXP: (guildId, userId, totalXp, options?) => Promise<XPSetResult> = setXPCore;
```

Set absolute XP value for a user - alias for set()

Sets absolute XP value for a user.
If the guild's level curve defines a maxLevel, users cannot exceed it.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `guildId` | `string` | Guild snowflake ID |
| `userId` | `string` | User snowflake ID |
| `totalXp` | `number` | New total XP (must be non-negative) |
| `options`? | [`AddXPOptions`](Interface.AddXPOptions.md) | Optional settings like reason and storeId |

#### Returns

`Promise`\<[`XPSetResult`](Interface.XPSetResult.md)\>

Result object with old/new XP and levels

## Examples

### Award XP with Level-Up Detection (using addXP)

```typescript
import { xp } from '@robojs/xp'
import type { XPChangeResult } from '@robojs/xp'

// Award XP to a user (default store)
const result: XPChangeResult = await xp.addXP('guildId', 'userId', 100, {
  reason: 'contest_winner'
})

console.log(`Old XP: ${result.oldXp}, New XP: ${result.newXp}`)
console.log(`Old Level: ${result.oldLevel}, New Level: ${result.newLevel}`)

if (result.leveledUp) {
  console.log(`User leveled up to ${result.newLevel}!`)
  // Role rewards already applied automatically via event listeners
}

// Award XP to custom store (parallel progression)
await xp.add('guildId', 'userId', 50, { reason: 'helped_user', storeId: 'reputation' })
```

### Remove XP with Error Handling (using removeXP)

```typescript
import { xp } from '@robojs/xp'
import type { XPRemoveResult } from '@robojs/xp'

// Remove XP for moderation - using removeXP alias
try {
  const result: XPRemoveResult = await xp.removeXP('guildId', 'userId', 100, {
    reason: 'spam_violation'
  })

  if (result.leveledDown) {
    console.log(`User dropped from level ${result.oldLevel} to ${result.newLevel}`)
    // Roles removed automatically if removeRewardsOnLoss is true
  }
} catch (error) {
  console.error('Failed to remove XP:', error.message)
  // Handle user not found or other errors
}

// Or use the shorthand remove() method (equivalent)
const result2 = await xp.remove('guildId', 'userId', 100, { reason: 'spam_violation' })
```

### Set Absolute XP Value (using setXP)

```typescript
import { xp } from '@robojs/xp'
import type { XPSetResult } from '@robojs/xp'

// Set absolute XP value (admin tool) - using setXP alias
const result: XPSetResult = await xp.setXP('guildId', 'userId', 10000)

console.log(`XP changed from ${result.oldXp} to ${result.newXp}`)
console.log(`Level changed from ${result.oldLevel} to ${result.newLevel}`)

// Events emitted based on level change:
// - If newLevel > oldLevel: 'levelUp' event
// - If newLevel < oldLevel: 'levelDown' event
// - Always: 'xpChange' event

// Or use the shorthand set() method (equivalent)
const result2 = await xp.set('guildId', 'userId', 10000)
```

### Query User XP Data (using getXP)

```typescript
import { xp } from '@robojs/xp'

// Get user's total XP - using getXP alias
const totalXp = await xp.getXP('guildId', 'userId')
console.log(`User has ${totalXp} XP`) // Returns 0 if not found

// Or use the shorthand get() method (equivalent)
const totalXp2 = await xp.get('guildId', 'userId')

// Get user's level
const level = await xp.getLevel('guildId', 'userId')
console.log(`User is level ${level}`) // Returns 0 if not found

// Get full user XP record
const user = await xp.getUser('guildId', 'userId')
if (user) {
  console.log(`XP: ${user.xp}, Level: ${user.level}`)
  console.log(`Messages: ${user.messages}`)
  console.log(`Last awarded: ${new Date(user.lastAwardedAt)}`)
} else {
  console.log('User has no XP record')
}
```

### Remove XP with Error Handling

```typescript
import { xp } from '@robojs/xp'
import type { XPRemoveResult } from '@robojs/xp'

// Remove XP for moderation (with error handling)
try {
  const result: XPRemoveResult = await xp.remove('guildId', 'userId', 100, {
    reason: 'spam_violation'
  })

  if (result.leveledDown) {
    console.log(`User dropped from level ${result.oldLevel} to ${result.newLevel}`)
    // Roles removed automatically if removeRewardsOnLoss is true
  }
} catch (error) {
  console.error('Failed to remove XP:', error.message)
  // Handle user not found or other errors
}
```

### Set Absolute XP Value

```typescript
import { xp } from '@robojs/xp'
import type { XPSetResult } from '@robojs/xp'

// Set absolute XP value (admin tool)
const result: XPSetResult = await xp.set('guildId', 'userId', 10000)

console.log(`XP changed from ${result.oldXp} to ${result.newXp}`)
console.log(`Level changed from ${result.oldLevel} to ${result.newLevel}`)

// Events emitted based on level change:
// - If newLevel > oldLevel: 'levelUp' event
// - If newLevel < oldLevel: 'levelDown' event
// - Always: 'xpChange' event
```

### Query User XP Data

```typescript
import { xp } from '@robojs/xp'

// Get user's total XP
const totalXp = await xp.get('guildId', 'userId')
console.log(`User has ${totalXp} XP`) // Returns 0 if not found

// Get user's level
const level = await xp.getLevel('guildId', 'userId')
console.log(`User is level ${level}`) // Returns 0 if not found

// Get full user XP record
const user = await xp.getUser('guildId', 'userId')
if (user) {
  console.log(`XP: ${user.xp}, Level: ${user.level}`)
  console.log(`Messages: ${user.messages}`)
  console.log(`Last awarded: ${new Date(user.lastAwardedAt)}`)
} else {
  console.log('User has no XP record')
}
```

### Recalculate Level After Config Changes

```typescript
import { xp } from '@robojs/xp'
import type { RecalcResult } from '@robojs/xp'

// Recalculate level from total XP (useful after config changes)
const result: RecalcResult = await xp.recalc('guildId', 'userId')

if (result.reconciled) {
  console.log(`Level corrected: ${result.oldLevel} → ${result.newLevel}`)
  console.log(`Total XP: ${result.totalXp}`)
  // Role rewards reconciled automatically
} else {
  console.log('Level was already correct')
}
```

### Contest Plugin Integration

```typescript
import { xp } from '@robojs/xp'

// Award bonus XP to contest winners
async function awardContestPrize(guildId: string, winners: string[]) {
  const prizes = [500, 300, 100] // 1st, 2nd, 3rd place

  for (let i = 0; i < winners.length; i++) {
    const result = await xp.add(guildId, winners[i], prizes[i], {
      reason: `contest_place_${i + 1}`
    })

    if (result.leveledUp) {
      await announceWinner(winners[i], result.newLevel, prizes[i])
    }
  }
}
```

### Moderation Plugin Integration

```typescript
import { xp } from '@robojs/xp'

// Remove XP for rule violations
async function penalizeUser(guildId: string, userId: string, severity: 'minor' | 'major') {
  const penalty = severity === 'major' ? 500 : 100

  try {
    const result = await xp.remove(guildId, userId, penalty, {
      reason: `${severity}_violation`
    })

    if (result.leveledDown) {
      logger.info(`User ${userId} penalized: level ${result.oldLevel} → ${result.newLevel}`)
    }
  } catch (error) {
    logger.warn(`Failed to penalize user ${userId}: ${error.message}`)
  }
}
```

## Remarks

- All mutations validate inputs before execution (non-negative amounts, valid IDs)
- Events are emitted **after** successful Flashcore persistence
- Role rewards reconcile automatically via internal event listeners
- `get()` and `getLevel()` return 0 for users with no XP record
- `getUser()` returns `null` for users with no XP record
- `add()` and `remove()` create user records if they don't exist
- `recalc()` is idempotent - safe to call multiple times

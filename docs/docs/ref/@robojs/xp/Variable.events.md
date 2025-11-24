# Variable: events

```ts
const events: object;
```

Event system for XP changes and level progression

Type-safe event system for subscribing to XP-related events. All events are
emitted **after** Flashcore persistence, guaranteeing consistency.

**Available Events:**
- `'levelUp'`: Emitted when a user gains a level (typed as `LevelUpEvent`)
- `'levelDown'`: Emitted when a user loses a level (typed as `LevelDownEvent`)
- `'xpChange'`: Emitted on any XP change (typed as `XPChangeEvent`)

**All events include `storeId` field:**
- Identifies which data store triggered the event
- Allows event listeners to filter events by store
- Role rewards only process default store events
- Leaderboard cache invalidation uses this for per-store invalidation

**Convenience Methods** (delegates to `on()`):
- `onLevelUp(handler)`: Shorthand for `on('levelUp', handler)`
- `onLevelDown(handler)`: Shorthand for `on('levelDown', handler)`
- `onXPChange(handler)`: Shorthand for `on('xpChange', handler)`

**Features:**
- Strongly typed event payloads via discriminated unions
- Events emitted synchronously after persistence
- Automatic role reconciliation via internal event listeners
- One-time listeners via `once()`
- Listener removal via `off()`
- Convenience methods for common event types

## Type declaration

### off()

```ts
off: <T>(event, listener) => void;
```

Remove an event listener

Removes a previously registered event listener.

The listener function reference must match the one passed to `on()` or `once()`.

#### Type Parameters

| Type Parameter |
| ------ |
| `T` *extends* `XPEventName` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `event` | `T` | The event name to remove the listener from |
| `listener` | (`payload`) => `void` | The callback function to remove |

#### Returns

`void`

#### Example

```typescript
import { events } from '@robojs/xp'

const handleLevelUp = (event) => {
  console.log(`Level up: ${event.newLevel}`)
}

events.on('levelUp', handleLevelUp)
// Later...
events.off('levelUp', handleLevelUp)
```

### on()

```ts
on: <T>(event, listener) => void;
```

Register a persistent event listener

Registers a persistent event listener for XP events.

The listener will be invoked every time the specified event is emitted.
Use this for ongoing monitoring of XP events.

#### Type Parameters

| Type Parameter |
| ------ |
| `T` *extends* `XPEventName` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `event` | `T` | The event name to listen for |
| `listener` | (`payload`) => `void` | The callback function to invoke when the event is emitted |

#### Returns

`void`

#### Example

```typescript
import { events } from '@robojs/xp'

// Listen for level-ups
events.on('levelUp', (event) => {
  console.log(`User ${event.userId} reached level ${event.newLevel}!`)
})

// Listen for XP changes
events.on('xpChange', (event) => {
  console.log(`User ${event.userId} gained ${event.delta} XP`)
})
```

### once()

```ts
once: <T>(event, listener) => void;
```

Register a one-time event listener

Registers a one-time event listener for XP events.

The listener will be invoked only once when the event is emitted,
then automatically removed.

#### Type Parameters

| Type Parameter |
| ------ |
| `T` *extends* `XPEventName` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `event` | `T` | The event name to listen for |
| `listener` | (`payload`) => `void` | The callback function to invoke when the event is emitted |

#### Returns

`void`

#### Example

```typescript
import { events } from '@robojs/xp'

// Listen for next level-up only
events.once('levelUp', (event) => {
  console.log(`First level-up: ${event.userId} reached level ${event.newLevel}`)
})
```

### onLevelDown()

```ts
onLevelDown: (handler) => void;
```

Convenience method: Register a listener for level-down events

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `handler` | (`event`) => `void` |

#### Returns

`void`

### onLevelUp()

```ts
onLevelUp: (handler) => void;
```

Convenience method: Register a listener for level-up events

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `handler` | (`event`) => `void` |

#### Returns

`void`

### onXPChange()

```ts
onXPChange: (handler) => void;
```

Convenience method: Register a listener for XP change events

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `handler` | (`event`) => `void` |

#### Returns

`void`

## Examples

### Type-Safe Level-Up Listener (with convenience method)

```typescript
import { events } from '@robojs/xp'
import type { LevelUpEvent } from '@robojs/xp'

// Using convenience method
events.onLevelUp((event: LevelUpEvent) => {
  console.log(`User ${event.userId} leveled up to level ${event.newLevel}!`)
})

// Or using generic on() method
events.on('levelUp', (event: LevelUpEvent) => {
  console.log(`User ${event.userId} leveled up to level ${event.newLevel}!`)
})
```

### Level-Down Listener (XP Removal)

```typescript
import { events } from '@robojs/xp'
import type { LevelDownEvent } from '@robojs/xp'

// Using convenience method
events.onLevelDown((event: LevelDownEvent) => {
  console.log(`User ${event.userId} dropped to level ${event.newLevel}`)
})

// Or using generic on() method
events.on('levelDown', (event: LevelDownEvent) => {
  console.log(`User ${event.userId} dropped to level ${event.newLevel}`)
  // Role rewards removed automatically if removeRewardsOnLoss is true
})
```

### Track All XP Changes (with convenience method)

```typescript
import { events } from '@robojs/xp'
import type { XPChangeEvent } from '@robojs/xp'

// Using convenience method
events.onXPChange((event: XPChangeEvent) => {
  console.log(`Store ${event.storeId}: User ${event.userId} XP changed by ${event.delta}`)
})

// Or using generic on() method
events.on('xpChange', (event: XPChangeEvent) => {
  console.log(`User ${event.userId} XP changed by ${event.delta}`)
  console.log(`Store: ${event.storeId}`)
  console.log(`Reason: ${event.reason || 'message'}`)
  console.log(`Old XP: ${event.oldXp}, New XP: ${event.newXp}`)
})
```

### Level-Down Listener (XP Removal)

```typescript
import { events } from '@robojs/xp'
import type { LevelDownEvent } from '@robojs/xp'

// Handle level-down events (e.g., from moderation)
events.on('levelDown', (event: LevelDownEvent) => {
  console.log(`User ${event.userId} dropped to level ${event.newLevel}`)
  console.log(`Lost ${event.oldLevel - event.newLevel} levels`)
  // Role rewards removed automatically if removeRewardsOnLoss is true
})
```

### Track All XP Changes

```typescript
import { events } from '@robojs/xp'
import type { XPChangeEvent } from '@robojs/xp'

// Listen for any XP change (level-up, level-down, or same level)
events.on('xpChange', (event: XPChangeEvent) => {
  console.log(`User ${event.userId} XP changed by ${event.delta}`)
  console.log(`Reason: ${event.reason || 'message'}`)
  console.log(`Old XP: ${event.oldXp}, New XP: ${event.newXp}`)
  console.log(`Old Level: ${event.oldLevel}, New Level: ${event.newLevel}`)
})
```

### One-Time Listener

```typescript
import { events } from '@robojs/xp'

// Listen for first level-up only
events.once('levelUp', (event) => {
  console.log('First level up detected!')
  console.log(`User ${event.userId} reached level ${event.newLevel}`)
  // Listener automatically removed after first trigger
})
```

### Remove Listener

```typescript
import { events } from '@robojs/xp'
import type { XPChangeEvent } from '@robojs/xp'

// Create a named listener function
const trackXpChanges = (event: XPChangeEvent) => {
  console.log(`XP changed: ${event.delta}`)
}

// Register listener
events.on('xpChange', trackXpChanges)

// Later, remove listener
events.off('xpChange', trackXpChanges)
```

### Build Level-Up Announcement System

```typescript
import { events } from '@robojs/xp'
import { client } from 'robo.js'

events.on('levelUp', async (event) => {
  // Get guild and user
  const guild = await client.guilds.fetch(event.guildId)
  const member = await guild.members.fetch(event.userId)

  // Send announcement to system channel
  const channel = guild.systemChannel
  if (channel) {
    await channel.send({
      content: `Congratulations <@${event.userId}>! You reached level ${event.newLevel}!`,
      allowedMentions: { users: [event.userId] }
    })
  }
})
```

### Track XP for Analytics (with multi-store support)

```typescript
import { events } from '@robojs/xp'

events.on('xpChange', (event) => {
  // Send to analytics service
  analytics.track('xp_change', {
    guildId: event.guildId,
    userId: event.userId,
    storeId: event.storeId,
    delta: event.delta,
    reason: event.reason,
    timestamp: Date.now()
  })
})

// Filter by store for specific tracking
events.on('levelUp', (event) => {
  if (event.storeId === 'reputation') {
    analytics.track('reputation_level_up', {
      guildId: event.guildId,
      userId: event.userId,
      newLevel: event.newLevel
    })
  }
})
```

## Remarks

- Events are emitted **after** successful Flashcore persistence
- Role rewards reconcile automatically via internal event listeners
- Event names are string literals: `'levelUp'`, `'levelDown'`, `'xpChange'`
- TypeScript provides type safety for event payloads via discriminated unions
- Events are emitted synchronously - listeners run immediately
- Internal listeners for role rewards are registered in `runtime/rewards.ts`

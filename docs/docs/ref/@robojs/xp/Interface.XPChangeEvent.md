# Interface: XPChangeEvent

Event emitted when a user's XP changes (without level change)

 All fields are read-only event data

## Remarks

The storeId field identifies which data store triggered this event. Leaderboard
cache invalidation uses this field to invalidate only the affected store.

## Example

```ts
{
 *   guildId: '123456789012345678',
 *   userId: '234567890123456789',
 *   storeId: 'default',
 *   oldXp: 1500,
 *   newXp: 1550,
 *   delta: 50,
 *   reason: 'message'
 * }
```

## Properties

### delta

```ts
readonly delta: number;
```

Change in XP (newXp - oldXp, can be negative)

***

### guildId

```ts
readonly guildId: string;
```

Guild where XP change occurred

***

### newXp

```ts
readonly newXp: number;
```

New XP amount

***

### oldXp

```ts
readonly oldXp: number;
```

Previous XP amount

***

### reason?

```ts
readonly optional reason: string;
```

Optional reason for XP change (e.g., 'manual_adjustment', 'message')

***

### storeId

```ts
readonly storeId: string;
```

Store identifier that triggered this event

***

### userId

```ts
readonly userId: string;
```

User whose XP changed

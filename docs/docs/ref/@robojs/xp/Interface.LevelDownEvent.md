# Interface: LevelDownEvent

Event emitted when a user levels down (XP loss)

 All fields are read-only event data

## Remarks

The storeId field identifies which data store triggered this event. Role removal
(when removeRewardOnXpLoss is enabled) only processes events from the default store
to avoid conflicts.

## Example

```ts
{
 *   guildId: '123456789012345678',
 *   userId: '234567890123456789',
 *   storeId: 'default',
 *   oldLevel: 5,
 *   newLevel: 4,
 *   totalXp: 1200
 * }
```

## Properties

### guildId

```ts
readonly guildId: string;
```

Guild where level down occurred

***

### newLevel

```ts
readonly newLevel: number;
```

New level (always < oldLevel)

***

### oldLevel

```ts
readonly oldLevel: number;
```

Previous level

***

### storeId

```ts
readonly storeId: string;
```

Store identifier that triggered this event

***

### totalXp

```ts
readonly totalXp: number;
```

Total XP after level down

***

### userId

```ts
readonly userId: string;
```

User who leveled down

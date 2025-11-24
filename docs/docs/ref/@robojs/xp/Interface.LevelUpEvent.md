# Interface: LevelUpEvent

Event emitted when a user levels up

 All fields are read-only event data

## Remarks

The storeId field identifies which data store triggered this event. Role rewards
only process events from the default store to avoid conflicts (e.g., reputation
store shouldn't grant Discord roles).

## Example

```ts
{
 *   guildId: '123456789012345678',
 *   userId: '234567890123456789',
 *   storeId: 'default',
 *   oldLevel: 4,
 *   newLevel: 5,
 *   totalXp: 1550
 * }
```

## Properties

### guildId

```ts
readonly guildId: string;
```

Guild where level up occurred

***

### newLevel

```ts
readonly newLevel: number;
```

New level (always > oldLevel)

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

Total XP after level up

***

### userId

```ts
readonly userId: string;
```

User who leveled up

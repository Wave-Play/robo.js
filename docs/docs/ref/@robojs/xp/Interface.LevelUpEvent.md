# Interface: LevelUpEvent

Event emitted when a user levels up

 All fields are read-only event data

## Example

```ts
{
 *   guildId: '123456789012345678',
 *   userId: '234567890123456789',
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

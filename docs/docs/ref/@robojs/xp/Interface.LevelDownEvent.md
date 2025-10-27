# Interface: LevelDownEvent

Event emitted when a user levels down (XP loss)

 All fields are read-only event data

## Example

```ts
{
 *   guildId: '123456789012345678',
 *   userId: '234567890123456789',
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

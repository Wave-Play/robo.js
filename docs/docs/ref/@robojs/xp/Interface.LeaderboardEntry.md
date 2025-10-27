# Interface: LeaderboardEntry

Leaderboard entry with user rank information

Used by the leaderboard service for sorted, cached results.

## Example

```ts
{
 *   userId: '123456789012345678',
 *   xp: 3450,
 *   level: 15,
 *   rank: 1
 * }
```

## Properties

### level

```ts
level: number;
```

Current level (derived from XP)

***

### rank

```ts
rank: number;
```

1-indexed position on the leaderboard

***

### userId

```ts
userId: string;
```

Discord user ID

***

### xp

```ts
xp: number;
```

Total XP for this user

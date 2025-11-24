# Interface: UserXP

User XP data stored per guild member

## Example

```ts
{
 *   xp: 1500,
 *   level: 5,
 *   lastAwardedAt: 1704067200000,
 *   messages: 423,
 *   xpMessages: 156
 * }
```

## Properties

### lastAwardedAt

```ts
lastAwardedAt: number;
```

Unix timestamp (ms) of last XP award for cooldown tracking

***

### level

```ts
level: number;
```

Current level (derived from XP using default curve)

***

### messages

```ts
messages: number;
```

Total messages sent in guild text channels (increments after basic validation, before No-XP/cooldown checks)

***

### xp

```ts
xp: number;
```

Total XP accumulated (determines level)

***

### xpMessages

```ts
xpMessages: number;
```

Messages that awarded XP (increments only when XP is actually granted, after all checks pass)

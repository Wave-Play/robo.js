# Interface: StoreOptions

Options for specifying which data store to use

The XP plugin supports multiple isolated data stores, each with independent:
- User XP data and levels
- Guild configuration
- Leaderboard rankings
- Event streams

The default store ('default') is used by all built-in commands (/rank, /leaderboard, etc.)
Custom stores are accessed imperatively for building parallel systems.

## Examples

```ts
// Default store (used by commands)
await XP.addXP(guildId, userId, 100) // Uses 'default'
```

```ts
// Custom reputation store
await XP.addXP(guildId, userId, 50, { storeId: 'reputation' })
```

```ts
// Custom currency store
await XP.addXP(guildId, userId, 200, { reason: 'quest', storeId: 'credits' })
```

```ts
Use cases:
- Leveling + multiple currencies (e.g., 'default', 'gold', 'gems')
- Multi-dimensional reputation (e.g., 'combat', 'crafting', 'trading')
- Seasonal systems (e.g., 'season1', 'season2', 'season3')
```

## Extended by

- [`AddXPOptions`](Interface.AddXPOptions.md)
- [`GetXPOptions`](Interface.GetXPOptions.md)
- [`RecalcOptions`](Interface.RecalcOptions.md)
- [`FlashcoreOptions`](Interface.FlashcoreOptions.md)

## Properties

### storeId?

```ts
optional storeId: string;
```

Store identifier (defaults to 'default')

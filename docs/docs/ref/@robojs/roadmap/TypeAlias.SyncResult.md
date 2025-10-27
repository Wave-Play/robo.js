# Type Alias: SyncResult

```ts
type SyncResult: object;
```

Captures the result of a synchronization run between a provider and the roadmap surface.

## Type declaration

### cards

```ts
readonly cards: readonly RoadmapCard[];
```

Readonly snapshot of all cards retrieved during the sync.

### columns

```ts
readonly columns: readonly RoadmapColumn[];
```

Readonly column definitions included in the sync.

### stats

```ts
readonly stats: object;
```

Aggregated counters describing sync operations.

### stats.archived

```ts
readonly archived: number;
```

Cards archived or transitioned to an archival column.

### stats.created

```ts
readonly created: number;
```

Cards created during the sync.

### stats.errors

```ts
readonly errors: number;
```

Number of operations that resulted in errors.

### stats.total

```ts
readonly total: number;
```

Total number of cards processed.

### stats.updated

```ts
readonly updated: number;
```

Cards updated during the sync.

### syncedAt

```ts
readonly syncedAt: Date;
```

Timestamp noting when the sync completed.

## Remarks

Consumers can leverage this structure to determine whether cards need to be created, updated, or
archived within Discord. The stats block enables runtime analytics and logging without inspecting
the card arrays.

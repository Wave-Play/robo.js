# Interface: SyncProgressUpdate

Progress update data sent during sync operations.

## Remarks

This interface provides real-time feedback about sync progress, enabling
UI updates and progress tracking. The stats object is a snapshot of current
progress and will be updated as the sync proceeds.

## Properties

### currentCard

```ts
readonly currentCard: RoadmapCard;
```

The card currently being processed

***

### currentIndex

```ts
readonly currentIndex: number;
```

Zero-based index of the card currently being processed

***

### dryRun

```ts
readonly dryRun: boolean;
```

Whether this is a dry run (no changes applied)

***

### stats

```ts
readonly stats: object;
```

Current sync statistics (snapshot)

| Name | Type |
| ------ | ------ |
| `archived` | `number` |
| `created` | `number` |
| `errors` | `number` |
| `total` | `number` |
| `updated` | `number` |

***

### totalCards

```ts
readonly totalCards: number;
```

Total number of cards to process in this sync

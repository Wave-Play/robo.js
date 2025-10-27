# Interface: UsageRecordedEvent

Event payload describing recorded usage and updated totals.

## Extended by

- [`UsageLimitEvent`](Interface.UsageLimitEvent.md)

## Properties

### entry

```ts
entry: TokenUsageEntry;
```

Usage entry that was persisted.

***

### model

```ts
model: string;
```

Model associated with the recorded usage.

***

### totals

```ts
totals: UsageTotalsSnapshot;
```

Updated totals including lifetime and window snapshots.

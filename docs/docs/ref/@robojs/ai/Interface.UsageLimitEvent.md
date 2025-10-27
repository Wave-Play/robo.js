# Interface: UsageLimitEvent

Event payload emitted when usage breaches at least one limit.

## Extends

- [`UsageRecordedEvent`](Interface.UsageRecordedEvent.md)

## Properties

### breaches

```ts
breaches: TokenLimitBreach[];
```

Collection of breached limit descriptors.

***

### entry

```ts
entry: TokenUsageEntry;
```

Usage entry that was persisted.

#### Inherited from

[`UsageRecordedEvent`](Interface.UsageRecordedEvent.md).[`entry`](Interface.UsageRecordedEvent.md#entry)

***

### model

```ts
model: string;
```

Model associated with the recorded usage.

#### Inherited from

[`UsageRecordedEvent`](Interface.UsageRecordedEvent.md).[`model`](Interface.UsageRecordedEvent.md#model)

***

### totals

```ts
totals: UsageTotalsSnapshot;
```

Updated totals including lifetime and window snapshots.

#### Inherited from

[`UsageRecordedEvent`](Interface.UsageRecordedEvent.md).[`totals`](Interface.UsageRecordedEvent.md#totals)

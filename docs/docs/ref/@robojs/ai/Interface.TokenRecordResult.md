# Interface: TokenRecordResult

Response returned after successfully recording usage.

## Properties

### breaches

```ts
breaches: TokenLimitBreach[];
```

Breaches triggered by the usage operation.

***

### entry

```ts
entry: TokenUsageEntry;
```

Persisted usage entry.

***

### totals

```ts
totals: UsageTotalsSnapshot;
```

Updated totals snapshot after recording the entry.

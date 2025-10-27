# Interface: TokenRecordOptions

Options accepted by recordUsage when logging token consumption.

## Properties

### kind?

```ts
optional kind: string;
```

Optional usage classification.

***

### metadata?

```ts
optional metadata: Record<string, unknown>;
```

Additional metadata, such as guild or user identifiers.

***

### model

```ts
model: string;
```

Model identifier being charged.

***

### timestamp?

```ts
optional timestamp: number;
```

Override timestamp for backfilled events.

***

### tokensIn?

```ts
optional tokensIn: number;
```

Prompt tokens to record.

***

### tokensOut?

```ts
optional tokensOut: number;
```

Completion tokens to record.

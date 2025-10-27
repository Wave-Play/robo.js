# Interface: TokenUsageEntry

Individual token usage record persisted to Flashcore.

## Properties

### createdAt

```ts
createdAt: number;
```

Timestamp (ms) when the usage occurred.

***

### id

```ts
id: string;
```

Unique identifier assigned to the usage entry.

***

### kind?

```ts
optional kind: string;
```

Optional usage category describing the request.

***

### metadata?

```ts
optional metadata: Record<string, unknown>;
```

Optional metadata for downstream analytics.

***

### model

```ts
model: string;
```

Model for which tokens were consumed.

***

### tokensIn

```ts
tokensIn: number;
```

Number of prompt tokens recorded.

***

### tokensOut

```ts
tokensOut: number;
```

Number of completion tokens recorded.

***

### total

```ts
total: number;
```

Combined total tokens.

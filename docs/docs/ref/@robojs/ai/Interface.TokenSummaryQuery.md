# Interface: TokenSummaryQuery

Parameters controlling usage summary retrieval.

## Properties

### cursor?

```ts
optional cursor: string;
```

Pagination cursor returned from prior results.

***

### limit?

```ts
optional limit: number;
```

Maximum number of rows to return (1-500).

***

### model?

```ts
optional model: string;
```

Filter results to a specific model.

***

### range?

```ts
optional range: object;
```

Timestamp range filter (milliseconds).

| Name | Type | Description |
| ------ | ------ | ------ |
| `from`? | `number` | Inclusive lower bound timestamp. |
| `to`? | `number` | Inclusive upper bound timestamp. |

***

### window?

```ts
optional window: TokenWindow;
```

Window to aggregate by; defaults to `day`.

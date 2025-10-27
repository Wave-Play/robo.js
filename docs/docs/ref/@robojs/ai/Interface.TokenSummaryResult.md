# Interface: TokenSummaryResult

Result structure produced by getSummary.

## Properties

### nextCursor?

```ts
optional nextCursor: string;
```

Pagination cursor for fetching subsequent results.

***

### results

```ts
results: object[];
```

Aggregated rows grouped by model and window key.

***

### window

```ts
window: TokenWindow;
```

Window that was aggregated.

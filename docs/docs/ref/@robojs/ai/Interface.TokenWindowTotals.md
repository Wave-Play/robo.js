# Interface: TokenWindowTotals

Aggregate token counts for a given window.

## Properties

### tokensIn

```ts
tokensIn: number;
```

Prompt tokens consumed during the window.

***

### tokensOut

```ts
tokensOut: number;
```

Completion tokens produced during the window.

***

### total

```ts
total: number;
```

Combined prompt and completion tokens.

***

### updatedAt

```ts
updatedAt: number;
```

Last time the totals were updated, represented as a UNIX timestamp.

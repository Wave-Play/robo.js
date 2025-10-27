# Interface: TokenLimitRule

Configuration describing a single token limit rule.

## Properties

### maxTokens

```ts
maxTokens: number;
```

Maximum tokens allowed within the window.

***

### message?

```ts
optional message: string;
```

Optional message surfaced when the limit is exceeded.

***

### mode?

```ts
optional mode: TokenLimitMode;
```

Enforcement mode. Use `block` to throw [TokenLimitError](Class.TokenLimitError.md), or `warn` to emit events
without blocking execution.

***

### window

```ts
window: TokenSummaryWindow;
```

Sliding window in which the limit is evaluated.

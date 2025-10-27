# Interface: TokenLimitBreach

Snapshot describing how a limit was breached.

## Properties

### exceededBy

```ts
exceededBy: number;
```

Tokens beyond the configured limit.

***

### maxTokens

```ts
maxTokens: number;
```

Configured maximum tokens for the window.

***

### message?

```ts
optional message: string;
```

Message defined by the rule, if any.

***

### mode

```ts
mode: TokenLimitMode;
```

Enforcement mode active for the breach.

***

### model

```ts
model: string;
```

Model that triggered the breach.

***

### previousTotal

```ts
previousTotal: number;
```

Total prior to the latest usage being recorded.

***

### remainingBefore

```ts
remainingBefore: number;
```

Tokens remaining before the latest update.

***

### total

```ts
total: number;
```

New total after recording the usage.

***

### window

```ts
window: TokenSummaryWindow;
```

Window in which the limit was exceeded.

***

### windowKey

```ts
windowKey: string;
```

Window key (e.g., ISO day or ISO week) identifying the period.

# Interface: TokenLimitErrorContext

Context supplied when constructing a [TokenLimitError](Class.TokenLimitError.md).

## See

TokenLimitError

## Properties

### model

```ts
model: string;
```

Model that triggered the limit breach.

***

### rule

```ts
rule: TokenLimitRule;
```

Limit rule that was violated.

***

### usageKind?

```ts
optional usageKind: string;
```

Optional usage classification.

***

### window

```ts
window: TokenSummaryWindow;
```

Window where the limit was exceeded.

***

### windowKey

```ts
windowKey: string;
```

Active window key for the breach.

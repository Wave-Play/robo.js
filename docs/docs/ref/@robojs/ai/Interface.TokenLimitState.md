# Interface: TokenLimitState

Snapshot describing the real-time state of token limits for a model.

## Properties

### blocked

```ts
blocked: boolean;
```

Indicates whether requests should be blocked under the configured rule.

***

### message?

```ts
optional message: string;
```

Optional message derived from the active rule.

***

### model

```ts
model: string;
```

Model identifier.

***

### rule?

```ts
optional rule: TokenLimitRule;
```

Active rule applied to the model, if one exists.

***

### windows

```ts
windows: Record<TokenSummaryWindow, object>;
```

Per-window state including remaining tokens and current window key.

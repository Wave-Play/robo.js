# Variable: tokenLedger

```ts
const tokenLedger: object;
```

High-level facade exposing token accounting utilities, aggregation helpers, and limit
enforcement hooks for the AI plugin.

## Type declaration

### assertWithinLimit()

```ts
assertWithinLimit: (model, usageKind?) => Promise<void>;
```

Throws [TokenLimitError](Class.TokenLimitError.md) when the specified model is currently blocked by a limit rule.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `model` | `string` | Model identifier to evaluate. |
| `usageKind`? | `string` | Optional usage category for additional context within the error. |

#### Returns

`Promise`\<`void`\>

#### Throws

TokenLimitError When a `block` mode limit has been exhausted.

### configure()

```ts
configure: (configuration) => void = configureTokenLedger;
```

Applies ledger configuration including limit rules and hook subscriptions.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `configuration` | [`TokenLedgerConfiguration`](Interface.TokenLedgerConfiguration.md) |

#### Returns

`void`

### getEntriesForDay()

```ts
getEntriesForDay: (dayKey) => Promise<TokenUsageEntry[]>;
```

Retrieves all persisted usage entries for the given ISO day key.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `dayKey` | `string` |

#### Returns

`Promise`\<[`TokenUsageEntry`](Interface.TokenUsageEntry.md)[]\>

### getLifetimeTotals()

```ts
getLifetimeTotals: (model?) => Promise<Record<string, TokenWindowTotals>>;
```

Retrieves lifetime token totals for all models or a specific model.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `model`? | `string` |

#### Returns

`Promise`\<`Record`\<`string`, [`TokenWindowTotals`](Interface.TokenWindowTotals.md)\>\>

### getLimitRule()

```ts
getLimitRule: (model) => TokenLimitRule | undefined;
```

Retrieves the configured limit rule for a model, if present.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `model` | `string` |

#### Returns

[`TokenLimitRule`](Interface.TokenLimitRule.md) \| `undefined`

Limit rule matching the model, if configured.

### getLimits()

```ts
getLimits: () => TokenLimitConfig;
```

Retrieves the active limit configuration.

#### Returns

[`TokenLimitConfig`](Interface.TokenLimitConfig.md)

### getLimitState()

```ts
getLimitState: (model) => Promise<TokenLimitState>;
```

Computes the real-time limit state for a model, including remaining budget and block status.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `model` | `string` |

#### Returns

`Promise`\<[`TokenLimitState`](Interface.TokenLimitState.md)\>

Per-window remaining tokens and blocking metadata for the model.

### getSummary()

```ts
getSummary: (query) => Promise<TokenSummaryResult>;
```

Summarizes usage across configured windows with optional model, range, and pagination filters.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `query` | [`TokenSummaryQuery`](Interface.TokenSummaryQuery.md) | Summary parameters controlling model filtering, pagination, and window selection. |

#### Returns

`Promise`\<[`TokenSummaryResult`](Interface.TokenSummaryResult.md)\>

Aggregated usage rows paired with the next cursor when available.

#### Example

```ts
const summary = await getSummary({ window: 'week', limit: 10 })
```

### off()

```ts
off: <T>(event, listener) => void;
```

Removes a usage event listener.

#### Type Parameters

| Type Parameter |
| ------ |
| `T` *extends* keyof `UsageEventPayloads` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | `T` |
| `listener` | [`UsageEventListener`](TypeAlias.UsageEventListener.md)\<`T`\> |

#### Returns

`void`

### on()

```ts
on: <T>(event, listener) => void;
```

Registers a listener for recurring usage events.

#### Type Parameters

| Type Parameter |
| ------ |
| `T` *extends* keyof `UsageEventPayloads` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | `T` |
| `listener` | [`UsageEventListener`](TypeAlias.UsageEventListener.md)\<`T`\> |

#### Returns

`void`

### once()

```ts
once: <T>(event, listener) => void;
```

Registers a one-time listener for usage events.

#### Type Parameters

| Type Parameter |
| ------ |
| `T` *extends* keyof `UsageEventPayloads` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | `T` |
| `listener` | [`UsageEventListener`](TypeAlias.UsageEventListener.md)\<`T`\> |

#### Returns

`void`

### recordUsage()

```ts
recordUsage: (options) => Promise<TokenRecordResult | null>;
```

Records token consumption for a model, persists the entry, and updates cached aggregates.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`TokenRecordOptions`](Interface.TokenRecordOptions.md) | Usage details including model, token counts, and optional metadata. |

#### Returns

`Promise`\<[`TokenRecordResult`](Interface.TokenRecordResult.md) \| `null`\>

Snapshot containing the persisted entry, updated totals, and limit breaches.

#### Example

```ts
await recordUsage({ model: 'gpt-4o-mini', tokensIn: 1200, tokensOut: 800, metadata: { job: 'daily-digest' } })
```

### setLimits()

```ts
setLimits: (limits?) => void;
```

Replaces the active limit configuration.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `limits`? | [`TokenLimitConfig`](Interface.TokenLimitConfig.md) |

#### Returns

`void`

### willExceedLimit()

```ts
willExceedLimit: (model, tokens, window?) => Promise<boolean>;
```

Predicts whether adding the provided tokens would exceed the configured limit.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `model` | `string` |
| `tokens` | `number` |
| `window`? | [`TokenSummaryWindow`](TypeAlias.TokenSummaryWindow.md) |

#### Returns

`Promise`\<`boolean`\>

True when the addition would breach a configured rule.

## Examples

```ts
const result = await tokenLedger.recordUsage({ model: 'gpt-4o', tokensIn: 500, tokensOut: 300 })
console.log(result.totals.windows.day?.totals.total)
```

```ts
const summary = await tokenLedger.getSummary({ model: 'gpt-4o', window: 'day' })
```

```ts
tokenLedger.configure({
  limits: { perModel: { 'gpt-4o': { window: 'day', maxTokens: 50_000, mode: 'warn' } } },
  hooks: {
    onLimitReached: ({ breaches }) => console.warn(breaches)
  }
})
```

## Remarks

Aggregates are persisted via Flashcore and cached in-memory for fast read access.

## See

 - TokenLimitError
 - TokenLimitConfig
 - TokenSummaryQuery

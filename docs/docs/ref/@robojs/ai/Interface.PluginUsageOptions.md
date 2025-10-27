# Interface: PluginUsageOptions

Token usage configuration including limit rules and hooks.

## Properties

### limits?

```ts
optional limits: TokenLimitConfig;
```

Limit rules to enforce via the token ledger.

***

### onLimitReached()?

```ts
optional onLimitReached: (payload) => void | Promise<void>;
```

Hook fired when limit breaches occur.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `payload` | [`UsageLimitEvent`](Interface.UsageLimitEvent.md) |

#### Returns

`void` \| `Promise`\<`void`\>

***

### onRecorded()?

```ts
optional onRecorded: (payload) => void | Promise<void>;
```

Hook fired after usage is recorded.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `payload` | [`UsageRecordedEvent`](Interface.UsageRecordedEvent.md) |

#### Returns

`void` \| `Promise`\<`void`\>

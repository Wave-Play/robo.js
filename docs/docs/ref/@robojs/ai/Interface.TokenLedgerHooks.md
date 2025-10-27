# Interface: TokenLedgerHooks

Optional hook callbacks invoked during ledger operations.

## Properties

### onLimitReached()?

```ts
optional onLimitReached: (payload) => void | Promise<void>;
```

Called when usage breaches a configured limit.

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

Called after usage is recorded and aggregates are updated.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `payload` | [`UsageRecordedEvent`](Interface.UsageRecordedEvent.md) |

#### Returns

`void` \| `Promise`\<`void`\>

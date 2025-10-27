# Type Alias: UsageEventListener()\<T\>

```ts
type UsageEventListener<T>: (payload) => void | Promise<void>;
```

Listener signature for ledger usage events.

## Type Parameters

| Type Parameter |
| ------ |
| `T` *extends* [`UsageEventName`](TypeAlias.UsageEventName.md) |

## Parameters

| Parameter | Type |
| ------ | ------ |
| `payload` | `UsageEventPayloads`\[`T`\] |

## Returns

`void` \| `Promise`\<`void`\>

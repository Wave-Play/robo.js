# Function: httpSubscriptionLink()

```ts
function httpSubscriptionLink<TInferrable, TEventSource>(opts): TRPCLink<TInferrable>
```

## Type Parameters

| Type Parameter |
| ------ |
| `TInferrable` *extends* `InferrableClientTypes` |
| `TEventSource` *extends* `AnyConstructor` |

## Parameters

| Parameter | Type |
| ------ | ------ |
| `opts` | `HTTPSubscriptionLinkOptions`\<`inferClientTypes`\<`TInferrable`\>, `TEventSource`\> |

## Returns

`TRPCLink`\<`TInferrable`\>

## See

https://trpc.io/docs/client/links/httpSubscriptionLink

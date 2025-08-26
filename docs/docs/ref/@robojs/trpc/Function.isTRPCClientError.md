# Function: isTRPCClientError()

```ts
function isTRPCClientError<TInferrable>(cause): cause is TRPCClientError<TInferrable>
```

## Type Parameters

| Type Parameter |
| ------ |
| `TInferrable` *extends* `InferrableClientTypes` |

## Parameters

| Parameter | Type |
| ------ | ------ |
| `cause` | `unknown` |

## Returns

`cause is TRPCClientError<TInferrable>`

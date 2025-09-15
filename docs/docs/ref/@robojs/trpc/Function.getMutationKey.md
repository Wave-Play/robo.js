# Function: getMutationKey()

```ts
function getMutationKey<TProcedure>(procedure): TRPCMutationKey
```

Method to extract the mutation key for a procedure

## Type Parameters

| Type Parameter |
| ------ |
| `TProcedure` *extends* `DecoratedMutation`\<`any`\> |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `procedure` | `TProcedure` | procedure |

## Returns

`TRPCMutationKey`

## See

https://trpc.io/docs/v11/getQueryKey#mutations

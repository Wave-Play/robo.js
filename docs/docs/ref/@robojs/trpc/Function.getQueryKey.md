# Function: getQueryKey()

```ts
function getQueryKey<TProcedureOrRouter>(procedureOrRouter, ..._params): TRPCQueryKey
```

Method to extract the query key for a procedure

## Type Parameters

| Type Parameter |
| ------ |
| `TProcedureOrRouter` *extends* `ProcedureOrRouter` |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `procedureOrRouter` | `TProcedureOrRouter` | procedure or AnyRouter |
| ...`_params` | `GetParams`\<`TProcedureOrRouter`\> | - |

## Returns

`TRPCQueryKey`

## See

https://trpc.io/docs/v11/getQueryKey

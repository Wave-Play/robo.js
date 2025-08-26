# Function: createTRPCQueryUtils()

```ts
function createTRPCQueryUtils<TRouter>(opts): CreateQueryUtils<TRouter>
```

**`Internal`**

Creates a set of utility functions that can be used to interact with `react-query`

## Type Parameters

| Type Parameter |
| ------ |
| `TRouter` *extends* `AnyRouter` |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `opts` | `CreateQueryUtilsOptions`\<`TRouter`\> | the `TRPCClient` and `QueryClient` to use |

## Returns

`CreateQueryUtils`\<`TRouter`\>

a set of utility functions that can be used to interact with `react-query`

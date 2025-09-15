# Function: getUntypedClient()

```ts
function getUntypedClient<TRouter>(client): TRPCUntypedClient<TRouter>
```

**`Internal`**

Get an untyped client from a proxy client

## Type Parameters

| Type Parameter |
| ------ |
| `TRouter` *extends* `AnyRouter` |

## Parameters

| Parameter | Type |
| ------ | ------ |
| `client` | `TRPCClient`\<`TRouter`\> |

## Returns

`TRPCUntypedClient`\<`TRouter`\>

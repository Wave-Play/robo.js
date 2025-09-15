# Function: splitLink()

```ts
function splitLink<TRouter>(opts): TRPCLink<TRouter>
```

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `TRouter` *extends* `AnyRouter` | `AnyRouter` |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `opts` | `object` | - |
| `opts.condition` | (`op`) => `boolean` | - |
| `opts.false` | `TRPCLink`\<`TRouter`\> \| `TRPCLink`\<`TRouter`\>[] | The link to execute next if the test function returns `false`. |
| `opts.true` | `TRPCLink`\<`TRouter`\> \| `TRPCLink`\<`TRouter`\>[] | The link to execute next if the test function returns `true`. |

## Returns

`TRPCLink`\<`TRouter`\>

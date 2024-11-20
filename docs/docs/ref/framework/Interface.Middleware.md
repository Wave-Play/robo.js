# Interface: Middleware

## Properties

### default()

```ts
default: (data) => void | MiddlewareResult | Promise<MiddlewareResult>;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | [`MiddlewareData`](Interface.MiddlewareData.md) |

#### Returns

`void` \| [`MiddlewareResult`](Interface.MiddlewareResult.md) \| `Promise`\<[`MiddlewareResult`](Interface.MiddlewareResult.md)\>

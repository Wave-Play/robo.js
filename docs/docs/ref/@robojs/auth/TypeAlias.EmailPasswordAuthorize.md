# Type Alias: EmailPasswordAuthorize()

```ts
type EmailPasswordAuthorize: (credentials, context) => Promise<AdapterUser | null>;
```

## Parameters

| Parameter | Type |
| ------ | ------ |
| `credentials` | `Record`\<`string`, `unknown`\> \| `undefined` |
| `context` | [`EmailPasswordAuthorizeContext`](Interface.EmailPasswordAuthorizeContext.md) |

## Returns

`Promise`\<[`AdapterUser`](Interface.AdapterUser.md) \| `null`\>

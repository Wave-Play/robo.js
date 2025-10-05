# Type Alias: EmailBuilder()

```ts
type EmailBuilder: (ctx) => MailMessage | null | Promise<MailMessage | null>;
```

Builder used to assemble a message on-demand.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | [`EmailContext`](TypeAlias.EmailContext.md) |

## Returns

[`MailMessage`](TypeAlias.MailMessage.md) \| `null` \| `Promise`\<[`MailMessage`](TypeAlias.MailMessage.md) \| `null`\>

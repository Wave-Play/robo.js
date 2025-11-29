# Type Alias: EmailBuilder()

```ts
type EmailBuilder: (ctx) => MailMessage | null | Promise<MailMessage | null>;
```

Builder used to assemble a message on-demand. Return `null` to skip sending
when conditions are not met (e.g. suppressing internal traffic alerts).
Registered via [EmailsOptions.triggers](Interface.EmailsOptions.md#triggers); builders execute sequentially.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | [`EmailContext`](TypeAlias.EmailContext.md) |

## Returns

[`MailMessage`](TypeAlias.MailMessage.md) \| `null` \| `Promise`\<[`MailMessage`](TypeAlias.MailMessage.md) \| `null`\>

## Examples

```ts
ctx => ({ to: ctx.user.email!, subject: 'Welcome', html: '<p>Hi</p>' })
```

```ts
ctx => ctx.session?.ip?.startsWith('192.168.') ? null : adminAlert(ctx)
```

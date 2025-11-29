# Interface: AuthMailer

Interface mail adapter implementations must satisfy. Implementations may
wrap SaaS APIs (Resend, Postmark, SendGrid) or local transports (SMTP).

## Methods

### send()

```ts
send(message): Promise<void | object>
```

Deliver a message. Throwing rejects the send and logs an error upstream.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | [`MailMessage`](TypeAlias.MailMessage.md) |

#### Returns

`Promise`\<`void` \| `object`\>

Optionally return a provider message id for logging.

***

### shutdown()?

```ts
optional shutdown(): Promise<void>
```

Optional hook to release resources during shutdown.

#### Returns

`Promise`\<`void`\>

***

### verify()?

```ts
optional verify(): Promise<void>
```

Optional hook to verify credentials (called during plugin start). Throw to
block startup when configuration is invalid. ⚠️ Avoid logging secrets.

#### Returns

`Promise`\<`void`\>

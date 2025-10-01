# Interface: AuthMailer

Interface mail adapter implementations must satisfy.

## Methods

### send()

```ts
send(message): Promise<void | object>
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | [`MailMessage`](TypeAlias.MailMessage.md) |

#### Returns

`Promise`\<`void` \| `object`\>

***

### shutdown()?

```ts
optional shutdown(): Promise<void>
```

#### Returns

`Promise`\<`void`\>

***

### verify()?

```ts
optional verify(): Promise<void>
```

#### Returns

`Promise`\<`void`\>

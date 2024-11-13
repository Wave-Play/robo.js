# Interface: RoboReply

## Properties

### code()

```ts
code: (statusCode) => RoboReply;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `statusCode` | `number` |

#### Returns

[`RoboReply`](Interface.RoboReply.md)

***

### hasSent

```ts
hasSent: boolean;
```

***

### header()

```ts
header: (name, value) => RoboReply;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |
| `value` | `string` |

#### Returns

[`RoboReply`](Interface.RoboReply.md)

***

### res

```ts
res: ServerResponse<IncomingMessage>;
```

***

### send()

```ts
send: (data) => RoboReply;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | `string` |

#### Returns

[`RoboReply`](Interface.RoboReply.md)

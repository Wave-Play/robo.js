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

### json()

```ts
json: (data) => RoboReply;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | `unknown` |

#### Returns

[`RoboReply`](Interface.RoboReply.md)

***

### raw

```ts
raw: ServerResponse<IncomingMessage>;
```

***

### send()

```ts
send: (response) => RoboReply;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `response` | `Response` \| `BodyInit` |

#### Returns

[`RoboReply`](Interface.RoboReply.md)

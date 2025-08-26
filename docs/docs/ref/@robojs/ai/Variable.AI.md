# Variable: AI

```ts
const AI: object;
```

The core AI interface.
Use this to call AI features programatically.

## Type declaration

### chat()

```ts
chat: (messages, options) => Promise<void>;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `messages` | [`ChatMessage`](Interface.ChatMessage.md)[] |
| `options` | `ChatOptions` |

#### Returns

`Promise`\<`void`\>

### chatSync()

```ts
chatSync: (messages, options) => Promise<ChatReply>;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `messages` | [`ChatMessage`](Interface.ChatMessage.md)[] |
| `options` | `Omit`\<`ChatOptions`, `"onReply"`\> |

#### Returns

`Promise`\<`ChatReply`\>

### generateImage()

```ts
generateImage: (options) => Promise<GenerateImageResult>;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`GenerateImageOptions`](Interface.GenerateImageOptions.md) |

#### Returns

`Promise`\<[`GenerateImageResult`](Interface.GenerateImageResult.md)\>

### isReady()

```ts
isReady: () => boolean;
```

#### Returns

`boolean`

# Class: `abstract` BaseEngine

## Constructors

### new BaseEngine()

```ts
new BaseEngine(): BaseEngine
```

#### Returns

[`BaseEngine`](Class.BaseEngine.md)

## Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| `_hooks` | `protected` | `Record`\<`"chat"`, [`Hook`](TypeAlias.Hook.md)[]\> |

## Methods

### callHooks()

```ts
callHooks(
   event, 
   context, 
iteration): Promise<ChatMessage[]>
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | `"chat"` |
| `context` | `HookContext` |
| `iteration` | `number` |

#### Returns

`Promise`\<[`ChatMessage`](Interface.ChatMessage.md)[]\>

***

### chat()

```ts
abstract chat(messages, options): Promise<ChatResult>
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `messages` | [`ChatMessage`](Interface.ChatMessage.md)[] |
| `options` | [`ChatOptions`](Interface.ChatOptions.md) |

#### Returns

`Promise`\<[`ChatResult`](Interface.ChatResult.md)\>

***

### generateImage()

```ts
abstract generateImage(options): Promise<GenerateImageResult>
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`GenerateImageOptions`](Interface.GenerateImageOptions.md) |

#### Returns

`Promise`\<[`GenerateImageResult`](Interface.GenerateImageResult.md)\>

***

### getFunctionHandlers()

```ts
abstract getFunctionHandlers(): Record<string, Command>
```

#### Returns

`Record`\<`string`, `Command`\>

***

### getInfo()

```ts
abstract getInfo(): Record<string, unknown>
```

#### Returns

`Record`\<`string`, `unknown`\>

***

### init()

```ts
init(): Promise<void>
```

Perform any initialization required by the engine here.

#### Returns

`Promise`\<`void`\>

***

### off()

```ts
off(event, hook): void
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | `"chat"` |
| `hook` | [`Hook`](TypeAlias.Hook.md) |

#### Returns

`void`

***

### on()

```ts
on(event, hook): void
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | `"chat"` |
| `hook` | [`Hook`](TypeAlias.Hook.md) |

#### Returns

`void`

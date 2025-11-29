# Class: `abstract` BaseEngine

Abstract base class to be extended by AI engine implementations. Provides hook orchestration,
default capability flags, and optional voice-session helpers.

## Examples

```ts
class MyEngine extends BaseEngine {
  public async chat(messages: ChatMessage[], options: ChatOptions) {
    // Call provider API and translate the result to ChatResult
    return provider.complete(messages, options)
  }

  public getFunctionHandlers() {
    return {}
  }

  public getInfo() {
    return { name: 'my-engine', version: '1.0.0' }
  }
}
```

```ts
engine.on('chat', async (ctx) => {
  return ctx.messages.filter(Boolean)
})
```

```ts
if (engine.supportedFeatures().voice) {
  await engine.startVoiceSession(options)
}
```

## Remarks

Subclasses must implement [BaseEngine.chat](Class.BaseEngine.md#chat), [BaseEngine.generateImage](Class.BaseEngine.md#generateimage),
[BaseEngine.getFunctionHandlers](Class.BaseEngine.md#getfunctionhandlers), and [BaseEngine.getInfo](Class.BaseEngine.md#getinfo). Override optional voice
methods when providing realtime functionality.

## Constructors

### new BaseEngine()

```ts
new BaseEngine(): BaseEngine
```

#### Returns

[`BaseEngine`](Class.BaseEngine.md)

## Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| `_hooks` | `protected` | `Record`\<`"chat"`, [`Hook`](TypeAlias.Hook.md)[]\> | Registered hooks keyed by event type. |

## Methods

### callHooks()

```ts
callHooks(
   event, 
   context, 
iteration): Promise<ChatMessage[]>
```

Sequentially executes registered hooks for the given event while allowing each hook to mutate
the message array.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `event` | `"chat"` | Hook event name. |
| `context` | `HookContext` | Mutable hook context. |
| `iteration` | `number` | Current retry iteration. |

#### Returns

`Promise`\<[`ChatMessage`](Interface.ChatMessage.md)[]\>

Latest message array after all hooks have run.

***

### chat()

```ts
abstract chat(messages, options): Promise<ChatResult>
```

Produces a conversational response based on supplied messages and options.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `messages` | [`ChatMessage`](Interface.ChatMessage.md)[] | Message history presented to the engine. |
| `options` | [`ChatOptions`](Interface.ChatOptions.md) | Additional configuration for the completion request. |

#### Returns

`Promise`\<[`ChatResult`](Interface.ChatResult.md)\>

Chat response including tool calls, conversation state, and voice metadata.

***

### generateImage()

```ts
abstract generateImage(options): Promise<GenerateImageResult>
```

Generates an image using the backing provider.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`GenerateImageOptions`](Interface.GenerateImageOptions.md) | Prompt and configuration for the image request. |

#### Returns

`Promise`\<[`GenerateImageResult`](Interface.GenerateImageResult.md)\>

Generated images represented as base64 payloads or URLs.

***

### getFunctionHandlers()

```ts
abstract getFunctionHandlers(): Record<string, Command>
```

Returns a mapping of function names to Robo command handlers invoked during tool execution.

#### Returns

`Record`\<`string`, `Command`\>

***

### getInfo()

```ts
abstract getInfo(): Record<string, unknown>
```

Provides descriptive information about the engine for diagnostics or inspection tooling.

#### Returns

`Record`\<`string`, `unknown`\>

***

### getMCPTools()?

```ts
optional getMCPTools(): MCPTool[]
```

Optionally returns MCP (Model Context Protocol) tool configurations for this engine.
Engines that support MCP should override this method to return their configured MCP servers.

#### Returns

[`MCPTool`](Interface.MCPTool.md)[]

Array of MCP tool configurations, or empty array if MCP is not supported.

***

### init()

```ts
init(): Promise<void>
```

Perform asynchronous initialization prior to handling requests. Override for custom setup.

#### Returns

`Promise`\<`void`\>

***

### off()

```ts
off(event, hook): void
```

Removes a previously registered hook from the engine.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `event` | `"chat"` | Hook event name. |
| `hook` | [`Hook`](TypeAlias.Hook.md) | Hook callback to remove. |

#### Returns

`void`

***

### on()

```ts
on(event, hook): void
```

Registers a hook to run during specific engine orchestration events.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `event` | `"chat"` | Hook event name. |
| `hook` | [`Hook`](TypeAlias.Hook.md) | Hook callback to register. |

#### Returns

`void`

***

### startVoiceSession()

```ts
startVoiceSession(_options): Promise<VoiceSessionHandle>
```

Starts a realtime voice session. Engines without voice capabilities should override
[BaseEngine.supportedFeatures](Class.BaseEngine.md#supportedfeatures) or this method to avoid throwing.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `_options` | [`VoiceSessionStartOptions`](Interface.VoiceSessionStartOptions.md) | Voice session options supplied by the caller. |

#### Returns

`Promise`\<[`VoiceSessionHandle`](Interface.VoiceSessionHandle.md)\>

#### Throws

Always throws when not overridden by subclasses.

***

### stopVoiceSession()

```ts
stopVoiceSession(_handle): Promise<void>
```

Stops a realtime voice session previously started by [BaseEngine.startVoiceSession](Class.BaseEngine.md#startvoicesession).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `_handle` | [`VoiceSessionHandle`](Interface.VoiceSessionHandle.md) | Voice session handle. |

#### Returns

`Promise`\<`void`\>

#### Throws

Always throws when voice is unsupported.

***

### summarizeToolResult()?

```ts
optional summarizeToolResult(_params): Promise<object>
```

Optionally summarize tool execution results for provider-specific follow-up prompts.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `_params` | `object` | Details describing the tool invocation to summarize. |
| `_params.call` | [`ChatFunctionCall`](Interface.ChatFunctionCall.md) | - |
| `_params.model`? | `string` | - |
| `_params.resultText` | `string` | - |
| `_params.success` | `boolean` | - |

#### Returns

`Promise`\<`object`\>

Summary text and an optional response identifier for traceability.

##### responseId

```ts
responseId: null | string;
```

##### summary

```ts
summary: string;
```

***

### supportedFeatures()

```ts
supportedFeatures(): EngineSupportedFeatures
```

Returns the supported feature flags for the engine. Override to enable capabilities.

#### Returns

[`EngineSupportedFeatures`](Interface.EngineSupportedFeatures.md)

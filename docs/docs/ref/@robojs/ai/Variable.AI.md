# Variable: AI

```ts
const AI: object;
```

Primary runtime facade for the Robo AI plugin. Provides chat completions, voice orchestration,
image generation, and detailed usage tracking through a single cohesive interface. Import this
singleton when integrating AI features inside commands, web handlers, or other Robo plugins.

## Type declaration

### chat()

```ts
chat: (messages, options) => Promise<void>;
```

Executes a chat completion using the registered engine. Handles typing indicators, task context,
tool invocation scheduling, and token limit errors.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `messages` | [`ChatMessage`](Interface.ChatMessage.md)[] | Message history including system prompts and user turns. |
| `options` | `ChatOptions` | Chat execution options including Discord context and callbacks. |

#### Returns

`Promise`\<`void`\>

Resolves when the chat flow has completed and replies (if any) were dispatched.

#### Remarks

Tool calls are scheduled asynchronously through the tool executor. Token limit errors are
surfaced to the caller via `onReply` to provide user-friendly messaging.

### chatSync()

```ts
chatSync: (messages, options) => Promise<ChatReply>;
```

Helper that wraps chat and resolves with the first reply payload.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `messages` | [`ChatMessage`](Interface.ChatMessage.md)[] | Message array provided to chat. |
| `options` | `Omit`\<`ChatOptions`, `"onReply"`\> | Chat options excluding `onReply`. |

#### Returns

`Promise`\<`ChatReply`\>

Resolves with the reply emitted by the engine or rejects on error.

### generateImage()

```ts
generateImage: (options) => Promise<GenerateImageResult>;
```

Generates an image by delegating to the configured engine.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`GenerateImageOptions`](Interface.GenerateImageOptions.md) | Image prompt and configuration. |

#### Returns

`Promise`\<[`GenerateImageResult`](Interface.GenerateImageResult.md)\>

Image generation result containing URLs or base64 payloads.

### getActiveTasks()

```ts
getActiveTasks: (channelId?) => BackgroundTaskSnapshot[];
```

Retrieves background task snapshots associated with the optional channel.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `channelId`? | `string` |

#### Returns

`BackgroundTaskSnapshot`[]

### getLifetimeUsage()

```ts
getLifetimeUsage: (model?) => Promise<Record<string, TokenWindowTotals>>;
```

Retrieves lifetime token totals aggregated by model.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `model`? | `string` |

#### Returns

`Promise`\<`Record`\<`string`, [`TokenWindowTotals`](Interface.TokenWindowTotals.md)\>\>

### getMCPServers()

```ts
getMCPServers: () => MCPTool[];
```

Retrieves configured MCP servers from plugin options, optionally delegating to the engine's
getMCPTools() method if available. Returns an empty array if no MCP servers are configured.

#### Returns

[`MCPTool`](Interface.MCPTool.md)[]

Array of MCP tool configurations.

### getUsageSummary()

```ts
getUsageSummary: (query?) => Promise<TokenSummaryResult>;
```

Resolves summary statistics for token usage within the configured ledger windows.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `query`? | [`TokenSummaryQuery`](Interface.TokenSummaryQuery.md) |

#### Returns

`Promise`\<[`TokenSummaryResult`](Interface.TokenSummaryResult.md)\>

### getVoiceMetrics()

```ts
getVoiceMetrics: () => VoiceMetricsSnapshot;
```

Returns aggregate metrics describing active voice sessions.

#### Returns

`VoiceMetricsSnapshot`

### getVoiceStatus()

```ts
getVoiceStatus: (guildId?) => Promise<object>;
```

Retrieves voice subsystem status for the optional guild.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `guildId`? | `string` |

#### Returns

`Promise`\<`object`\>

##### baseConfig

```ts
baseConfig: VoiceRuntimeConfig;
```

##### guildConfigs

```ts
guildConfigs: Record<string, VoiceRuntimeConfig>;
```

##### sessions

```ts
sessions: object[] = sessionStatuses;
```

### isReady()

```ts
isReady: () => boolean;
```

#### Returns

`boolean`

### offUsageEvent()

```ts
offUsageEvent: <T>(event, listener) => void;
```

Removes a usage event listener from the token ledger.

#### Type Parameters

| Type Parameter |
| ------ |
| `T` *extends* keyof `UsageEventPayloads` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | `T` |
| `listener` | [`UsageEventListener`](TypeAlias.UsageEventListener.md)\<`T`\> |

#### Returns

`void`

### offVoiceEvent()

```ts
offVoiceEvent: <T>(event, listener) => void;
```

Removes a previously registered voice event listener.

#### Type Parameters

| Type Parameter |
| ------ |
| `T` *extends* keyof `VoiceEventMap` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | `T` |
| `listener` | (`payload`) => `void` |

#### Returns

`void`

### onceUsageEvent()

```ts
onceUsageEvent: <T>(event, listener) => void;
```

Attaches a one-time usage event listener to the token ledger.

#### Type Parameters

| Type Parameter |
| ------ |
| `T` *extends* keyof `UsageEventPayloads` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | `T` |
| `listener` | [`UsageEventListener`](TypeAlias.UsageEventListener.md)\<`T`\> |

#### Returns

`void`

### onUsageEvent()

```ts
onUsageEvent: <T>(event, listener) => void;
```

Attaches a usage event listener to the token ledger.

#### Type Parameters

| Type Parameter |
| ------ |
| `T` *extends* keyof `UsageEventPayloads` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | `T` |
| `listener` | [`UsageEventListener`](TypeAlias.UsageEventListener.md)\<`T`\> |

#### Returns

`void`

### onVoiceEvent()

```ts
onVoiceEvent: <T>(event, listener) => void;
```

Registers a voice event listener on the shared voice manager.

#### Type Parameters

| Type Parameter |
| ------ |
| `T` *extends* keyof `VoiceEventMap` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | `T` |
| `listener` | (`payload`) => `void` |

#### Returns

`void`

### setVoiceConfig()

```ts
setVoiceConfig: (options) => Promise<void>;
```

Applies a voice configuration patch either globally or for a specific guild.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | `SetVoiceConfigOptions` |

#### Returns

`Promise`\<`void`\>

### startVoice()

```ts
startVoice: (options) => Promise<void>;
```

Starts the shared voice manager in a Discord guild, joining the specified voice channel and
configuring transcription playback streams.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | `StartVoiceOptions` | Voice join options including guild and channel identifiers. |

#### Returns

`Promise`\<`void`\>

#### Throws

OptionalDependencyError Wrapped when the Discord voice dependency is absent.

### stopVoice()

```ts
stopVoice: (options) => Promise<void>;
```

Stops the voice manager within the given guild and disconnects from the active channel.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | `StopVoiceOptions` | Guild identifier and optional channel override. |

#### Returns

`Promise`\<`void`\>

#### Throws

Error When no voice connection exists for the guild.

## Examples

```ts
import { AI } from '@robojs/ai'

await AI.chat({
  messages: [
    { role: 'system', content: 'Provide concise answers.' },
    { role: 'user', content: 'Summarize the changelog.' }
  ],
  channel,
  member,
  onReply: ({ text }) => channel.send(text)
})
```

```ts
import { AI } from '@robojs/ai'

await AI.startVoice({ guildId: guild.id, channelId: voiceChannel.id })

AI.onVoiceEvent('playback', ({ delta }) => {
  console.log('Streaming voice chunk', delta.timestamp)
})

await AI.stopVoice({ guildId: guild.id })
```

```ts
import { AI } from '@robojs/ai'

const summary = await AI.getUsageSummary({ window: 'day' })
console.log('Prompt tokens today', summary.windowTotals.prompt)

AI.onUsageEvent('usage.limitReached', (event) => {
  console.warn('Token limit exceeded for', event.breach.model)
})

AI.onUsageEvent('usage.recorded', (event) => {
  console.log('Token usage recorded:', event.usage.tokens)
})
```

## Remarks

Engines lazily initialize. Call AI.isReady() before executing
intensive workloads or await project startup hooks to guarantee availability.

## See

 - BaseEngine
 - tokenLedger
 - ChatOptions
 - VoiceSessionStartOptions

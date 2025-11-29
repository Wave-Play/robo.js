# Interface: PluginOptions

Plugin configuration structure resolved during initialization.

## Properties

### commands?

```ts
optional commands: boolean | string[];
```

Command allow/deny list configuration.

***

### engine?

```ts
optional engine: BaseEngine;
```

Custom AI engine instance to override defaults.

***

### insight?

```ts
optional insight: boolean;
```

Enables vector store insights synchronisation.

***

### instructions?

```ts
optional instructions: string;
```

System instructions injected into AI prompts.

***

### mcpServers?

```ts
optional mcpServers: MCPTool[];
```

MCP (Model Context Protocol) server configurations for tool integration.

***

### restrict?

```ts
optional restrict: object;
```

Channel restriction settings limiting where the bot responds.

| Name | Type |
| ------ | ------ |
| `channelIds` | `string`[] |

***

### usage?

```ts
optional usage: PluginUsageOptions;
```

Token usage tracking configuration.

***

### voice?

```ts
optional voice: VoicePluginVoiceOptions;
```

Voice feature configuration delegated to the voice manager.

***

### whitelist?

```ts
optional whitelist: object;
```

Whitelist of channels where the bot can respond freely.

| Name | Type |
| ------ | ------ |
| `channelIds` | `string`[] |

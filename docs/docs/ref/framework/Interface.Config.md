# Interface: Config

## Properties

### clientOptions?

```ts
optional clientOptions: ClientOptions;
```

***

### defaults?

```ts
optional defaults: object;
```

| Name | Type |
| ------ | ------ |
| `contexts`? | [`CommandContext`](TypeAlias.CommandContext.md)[] |
| `defaultMemberPermissions`? | `string` \| `number` \| `bigint` |
| `dev`? | `boolean` |
| `help`? | `boolean` |
| `integrationTypes`? | [`CommandIntegrationType`](TypeAlias.CommandIntegrationType.md)[] |

***

### excludePaths?

```ts
optional excludePaths: string[];
```

***

### experimental?

```ts
optional experimental: object;
```

| Name | Type | Description |
| ------ | ------ | ------ |
| `buildDirectory`? | `string` | - |
| `disableBot`? | `boolean` | - |
| `incrementalBuilds`? | `boolean` | - |
| `shard`? | `boolean` \| `ShardingManagerOptions` | - |
| `userInstall`? | `boolean` | **Deprecated** Use `integrationTypes` in command config instead |

***

### flashcore?

```ts
optional flashcore: object;
```

| Name | Type |
| ------ | ------ |
| `keyv`? | `unknown` |

***

### invite?

```ts
optional invite: object;
```

| Name | Type |
| ------ | ------ |
| `autoPermissions`? | `boolean` |
| `permissions`? | `number` \| ( \| `"CreateInstantInvite"` \| `"KickMembers"` \| `"BanMembers"` \| `"Administrator"` \| `"ManageChannels"` \| `"ManageGuild"` \| `"AddReactions"` \| `"ViewAuditLog"` \| `"PrioritySpeaker"` \| `"Stream"` \| `"ViewChannel"` \| `"SendMessages"` \| `"SendTTSMessages"` \| `"ManageMessages"` \| `"EmbedLinks"` \| `"AttachFiles"` \| `"ReadMessageHistory"` \| `"MentionEveryone"` \| `"UseExternalEmojis"` \| `"ViewGuildInsights"` \| `"Connect"` \| `"Speak"` \| `"MuteMembers"` \| `"DeafenMembers"` \| `"MoveMembers"` \| `"UseVAD"` \| `"ChangeNickname"` \| `"ManageNicknames"` \| `"ManageRoles"` \| `"ManageWebhooks"` \| `"ManageEmojisAndStickers"` \| `"ManageGuildExpressions"` \| `"UseApplicationCommands"` \| `"RequestToSpeak"` \| `"ManageEvents"` \| `"ManageThreads"` \| `"CreatePublicThreads"` \| `"CreatePrivateThreads"` \| `"UseExternalStickers"` \| `"SendMessagesInThreads"` \| `"UseEmbeddedActivities"` \| `"ModerateMembers"` \| `"ViewCreatorMonetizationAnalytics"` \| `"UseSoundboard"` \| `"CreateGuildExpressions"` \| `"CreateEvents"` \| `"UseExternalSounds"` \| `"SendVoiceMessages"` \| `"SendPolls"` \| `"UseExternalApps"`)[] |
| `scopes`? | [`Scope`](TypeAlias.Scope.md)[] |

***

### logger?

```ts
optional logger: object;
```

| Name | Type |
| ------ | ------ |
| `drain`? | [`LogDrain`](TypeAlias.LogDrain.md) |
| `enabled`? | `boolean` |
| `level`? | `LogLevel` |

***

### plugins?

```ts
optional plugins: Plugin[];
```

***

### roboplay?

```ts
optional roboplay: object;
```

| Name | Type |
| ------ | ------ |
| `node`? | `"18"` \| `"20"` \| `"latest"` |

***

### sage?

```ts
optional sage: false | SageOptions;
```

***

### seed?

```ts
optional seed: object;
```

| Name | Type |
| ------ | ------ |
| `description`? | `string` |

***

### timeouts?

```ts
optional timeouts: object;
```

| Name | Type |
| ------ | ------ |
| `autocomplete`? | `number` |
| `commandDeferral`? | `number` |
| `commandRegistration`? | `number` |
| `lifecycle`? | `number` |

***

### type?

```ts
optional type: "plugin" | "robo";
```

***

### updateCheckInterval?

```ts
optional updateCheckInterval: number;
```

How often to check for updates to Robo.js in seconds. Default: 1 hour

***

### watcher?

```ts
optional watcher: object;
```

| Name | Type |
| ------ | ------ |
| `ignore`? | `string`[] |

# Interface: Manifest

## Properties

### \_\_README

```ts
__README: string;
```

***

### \_\_robo

```ts
__robo: object;
```

| Name | Type |
| ------ | ------ |
| `config` | [`Config`](Interface.Config.md) |
| `language` | `"javascript"` \| `"typescript"` |
| `mode` | `string` |
| `seed`? | `object` |
| `seed.description`? | `string` |
| `type` | `"plugin"` \| `"robo"` |
| `updatedAt`? | `string` |
| `version`? | `string` |

***

### api

```ts
api: Record<string, ApiEntry>;
```

***

### commands

```ts
commands: Record<string, CommandEntry>;
```

***

### context

```ts
context: object;
```

| Name | Type |
| ------ | ------ |
| `message` | `Record`\<`string`, [`ContextConfig`](Interface.ContextConfig.md)\> |
| `user` | `Record`\<`string`, [`ContextConfig`](Interface.ContextConfig.md)\> |

***

### events

```ts
events: Record<string, EventConfig[]>;
```

***

### middleware?

```ts
optional middleware: BaseConfig[];
```

***

### permissions?

```ts
optional permissions: number | (
  | "CreateInstantInvite"
  | "KickMembers"
  | "BanMembers"
  | "Administrator"
  | "ManageChannels"
  | "ManageGuild"
  | "AddReactions"
  | "ViewAuditLog"
  | "PrioritySpeaker"
  | "Stream"
  | "ViewChannel"
  | "SendMessages"
  | "SendTTSMessages"
  | "ManageMessages"
  | "EmbedLinks"
  | "AttachFiles"
  | "ReadMessageHistory"
  | "MentionEveryone"
  | "UseExternalEmojis"
  | "ViewGuildInsights"
  | "Connect"
  | "Speak"
  | "MuteMembers"
  | "DeafenMembers"
  | "MoveMembers"
  | "UseVAD"
  | "ChangeNickname"
  | "ManageNicknames"
  | "ManageRoles"
  | "ManageWebhooks"
  | "ManageEmojisAndStickers"
  | "ManageGuildExpressions"
  | "UseApplicationCommands"
  | "RequestToSpeak"
  | "ManageEvents"
  | "ManageThreads"
  | "CreatePublicThreads"
  | "CreatePrivateThreads"
  | "UseExternalStickers"
  | "SendMessagesInThreads"
  | "UseEmbeddedActivities"
  | "ModerateMembers"
  | "ViewCreatorMonetizationAnalytics"
  | "UseSoundboard"
  | "CreateGuildExpressions"
  | "CreateEvents"
  | "UseExternalSounds"
  | "SendVoiceMessages"
  | "SendPolls"
  | "UseExternalApps")[];
```

***

### scopes?

```ts
optional scopes: Scope[];
```

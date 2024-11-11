# Interface: Manifest

## Properties

| Property | Type |
| ------ | ------ |
| `__README` | `string` |
| `__robo` | `object` |
| `__robo.config` | [`Config`](Interface.Config.md) |
| `__robo.language` | `"javascript"` \| `"typescript"` |
| `__robo.mode` | `string` |
| `__robo.seed?` | `object` |
| `__robo.seed.description?` | `string` |
| `__robo.type` | `"plugin"` \| `"robo"` |
| `__robo.updatedAt?` | `string` |
| `__robo.version?` | `string` |
| `api` | `Record`\<`string`, [`ApiEntry`](Interface.ApiEntry.md)\> |
| `commands` | `Record`\<`string`, [`CommandEntry`](Interface.CommandEntry.md)\> |
| `context` | `object` |
| `context.message` | `Record`\<`string`, [`ContextConfig`](Interface.ContextConfig.md)\> |
| `context.user` | `Record`\<`string`, [`ContextConfig`](Interface.ContextConfig.md)\> |
| `events` | `Record`\<`string`, [`EventConfig`](Interface.EventConfig.md)[]\> |
| `middleware?` | [`BaseConfig`](Interface.BaseConfig.md)[] |
| `permissions?` | `number` \| ( \| `"CreateInstantInvite"` \| `"KickMembers"` \| `"BanMembers"` \| `"Administrator"` \| `"ManageChannels"` \| `"ManageGuild"` \| `"AddReactions"` \| `"ViewAuditLog"` \| `"PrioritySpeaker"` \| `"Stream"` \| `"ViewChannel"` \| `"SendMessages"` \| `"SendTTSMessages"` \| `"ManageMessages"` \| `"EmbedLinks"` \| `"AttachFiles"` \| `"ReadMessageHistory"` \| `"MentionEveryone"` \| `"UseExternalEmojis"` \| `"ViewGuildInsights"` \| `"Connect"` \| `"Speak"` \| `"MuteMembers"` \| `"DeafenMembers"` \| `"MoveMembers"` \| `"UseVAD"` \| `"ChangeNickname"` \| `"ManageNicknames"` \| `"ManageRoles"` \| `"ManageWebhooks"` \| `"ManageEmojisAndStickers"` \| `"ManageGuildExpressions"` \| `"UseApplicationCommands"` \| `"RequestToSpeak"` \| `"ManageEvents"` \| `"ManageThreads"` \| `"CreatePublicThreads"` \| `"CreatePrivateThreads"` \| `"UseExternalStickers"` \| `"SendMessagesInThreads"` \| `"UseEmbeddedActivities"` \| `"ModerateMembers"` \| `"ViewCreatorMonetizationAnalytics"` \| `"UseSoundboard"` \| `"CreateGuildExpressions"` \| `"CreateEvents"` \| `"UseExternalSounds"` \| `"SendVoiceMessages"` \| `"SendPolls"` \| `"UseExternalApps"`)[] |
| `scopes?` | [`Scope`](TypeAlias.Scope.md)[] |

# Interface: Config

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| `clientOptions?` | `ClientOptions` | - |
| `defaults?` | `object` | - |
| `defaults.dev?` | `boolean` | - |
| `defaults.help?` | `boolean` | - |
| `excludePaths?` | `string`[] | - |
| `experimental?` | `object` | - |
| `experimental.buildDirectory?` | `string` | - |
| `experimental.disableBot?` | `boolean` | - |
| `experimental.incrementalBuilds?` | `boolean` | - |
| `experimental.shard?` | `boolean` \| `ShardingManagerOptions` | - |
| `experimental.userInstall?` | `boolean` | - |
| `flashcore?` | `object` | - |
| `flashcore.keyv?` | `unknown` | - |
| `invite?` | `object` | - |
| `invite.autoPermissions?` | `boolean` | - |
| `invite.permissions?` | `number` \| ( \| `"CreateInstantInvite"` \| `"KickMembers"` \| `"BanMembers"` \| `"Administrator"` \| `"ManageChannels"` \| `"ManageGuild"` \| `"AddReactions"` \| `"ViewAuditLog"` \| `"PrioritySpeaker"` \| `"Stream"` \| `"ViewChannel"` \| `"SendMessages"` \| `"SendTTSMessages"` \| `"ManageMessages"` \| `"EmbedLinks"` \| `"AttachFiles"` \| `"ReadMessageHistory"` \| `"MentionEveryone"` \| `"UseExternalEmojis"` \| `"ViewGuildInsights"` \| `"Connect"` \| `"Speak"` \| `"MuteMembers"` \| `"DeafenMembers"` \| `"MoveMembers"` \| `"UseVAD"` \| `"ChangeNickname"` \| `"ManageNicknames"` \| `"ManageRoles"` \| `"ManageWebhooks"` \| `"ManageEmojisAndStickers"` \| `"ManageGuildExpressions"` \| `"UseApplicationCommands"` \| `"RequestToSpeak"` \| `"ManageEvents"` \| `"ManageThreads"` \| `"CreatePublicThreads"` \| `"CreatePrivateThreads"` \| `"UseExternalStickers"` \| `"SendMessagesInThreads"` \| `"UseEmbeddedActivities"` \| `"ModerateMembers"` \| `"ViewCreatorMonetizationAnalytics"` \| `"UseSoundboard"` \| `"CreateGuildExpressions"` \| `"CreateEvents"` \| `"UseExternalSounds"` \| `"SendVoiceMessages"` \| `"SendPolls"` \| `"UseExternalApps"`)[] | - |
| `invite.scopes?` | [`Scope`](TypeAlias.Scope.md)[] | - |
| `logger?` | `object` | - |
| `logger.drain?` | [`LogDrain`](TypeAlias.LogDrain.md) | - |
| `logger.enabled?` | `boolean` | - |
| `logger.level?` | `LogLevel` | - |
| `plugins?` | [`Plugin`](TypeAlias.Plugin.md)[] | - |
| `roboplay?` | `object` | - |
| `roboplay.node?` | `"18"` \| `"20"` \| `"latest"` | - |
| `sage?` | `false` \| [`SageOptions`](TypeAlias.SageOptions.md) | - |
| `seed?` | `object` | - |
| `seed.description?` | `string` | - |
| `timeouts?` | `object` | - |
| `timeouts.autocomplete?` | `number` | - |
| `timeouts.commandDeferral?` | `number` | - |
| `timeouts.commandRegistration?` | `number` | - |
| `timeouts.lifecycle?` | `number` | - |
| `type?` | `"plugin"` \| `"robo"` | - |
| `updateCheckInterval?` | `number` | How often to check for updates to Robo.js in seconds. Default: 1 hour |
| `watcher?` | `object` | - |
| `watcher.ignore?` | `string`[] | - |

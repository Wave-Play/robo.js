# Interface: CommandEntry

## Extends

- [`CommandConfig`](Interface.CommandConfig.md)

## Properties

| Property | Type | Inherited from |
| ------ | ------ | ------ |
| `__auto?` | `true` | [`CommandConfig`](Interface.CommandConfig.md).`__auto` |
| `__module?` | `string` | [`CommandConfig`](Interface.CommandConfig.md).`__module` |
| `__path?` | `string` | [`CommandConfig`](Interface.CommandConfig.md).`__path` |
| `__plugin?` | `object` | [`CommandConfig`](Interface.CommandConfig.md).`__plugin` |
| `__plugin.name` | `string` | - |
| `__plugin.path` | `string` | - |
| `defaultMemberPermissions?` | `string` \| `number` \| `bigint` | [`CommandConfig`](Interface.CommandConfig.md).`defaultMemberPermissions` |
| `description?` | `string` | [`CommandConfig`](Interface.CommandConfig.md).`description` |
| `descriptionLocalizations?` | `Record`\<`string`, `string`\> | [`CommandConfig`](Interface.CommandConfig.md).`descriptionLocalizations` |
| `dmPermission?` | `boolean` | [`CommandConfig`](Interface.CommandConfig.md).`dmPermission` |
| `nameLocalizations?` | `Record`\<`string`, `string`\> | [`CommandConfig`](Interface.CommandConfig.md).`nameLocalizations` |
| `options?` | readonly [`CommandOption`](Interface.CommandOption.md)[] | [`CommandConfig`](Interface.CommandConfig.md).`options` |
| `sage?` | `false` \| [`SageOptions`](TypeAlias.SageOptions.md) | [`CommandConfig`](Interface.CommandConfig.md).`sage` |
| `subcommands?` | `Record`\<`string`, [`CommandEntry`](Interface.CommandEntry.md)\> | - |
| `timeout?` | `number` | [`CommandConfig`](Interface.CommandConfig.md).`timeout` |

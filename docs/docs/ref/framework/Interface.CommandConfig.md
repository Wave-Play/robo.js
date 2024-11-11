# Interface: CommandConfig

## Extends

- [`BaseConfig`](Interface.BaseConfig.md)

## Extended by

- [`CommandEntry`](Interface.CommandEntry.md)

## Properties

| Property | Type | Overrides | Inherited from |
| ------ | ------ | ------ | ------ |
| `__auto?` | `true` | - | [`BaseConfig`](Interface.BaseConfig.md).`__auto` |
| `__module?` | `string` | - | [`BaseConfig`](Interface.BaseConfig.md).`__module` |
| `__path?` | `string` | - | [`BaseConfig`](Interface.BaseConfig.md).`__path` |
| `__plugin?` | `object` | - | [`BaseConfig`](Interface.BaseConfig.md).`__plugin` |
| `__plugin.name` | `string` | - | - |
| `__plugin.path` | `string` | - | - |
| `defaultMemberPermissions?` | `string` \| `number` \| `bigint` | - | - |
| `description?` | `string` | - | [`BaseConfig`](Interface.BaseConfig.md).`description` |
| `descriptionLocalizations?` | `Record`\<`string`, `string`\> | - | - |
| `dmPermission?` | `boolean` | - | - |
| `nameLocalizations?` | `Record`\<`string`, `string`\> | - | - |
| `options?` | readonly [`CommandOption`](Interface.CommandOption.md)[] | - | - |
| `sage?` | `false` \| [`SageOptions`](TypeAlias.SageOptions.md) | - | - |
| `timeout?` | `number` | [`BaseConfig`](Interface.BaseConfig.md).`timeout` | - |

# Interface: HandlerRecord\<T\>

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `T` | `unknown` |

## Properties

| Property | Type |
| ------ | ------ |
| `auto?` | `boolean` |
| `description?` | `string` |
| `handler` | `T` |
| `key` | `string` |
| `module?` | `string` |
| `path` | `string` |
| `plugin?` | `object` |
| `plugin.name` | `string` |
| `plugin.path` | `string` |
| `type` | \| `"event"` \| `"api"` \| `"command"` \| `"context"` \| `"middleware"` |

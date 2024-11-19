# Function: getPluginOptions()

```ts
function getPluginOptions(packageName): unknown | null
```

Gets the config options for a specific plugin package.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `packageName` | `string` | The name of the package to get the options for. |

## Returns

`unknown` \| `null`

The options for the package, or null if the package is not installed nor configured.

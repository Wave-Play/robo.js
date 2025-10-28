# Function: getState()

```ts
function getState<T>(key, options?): T | null | undefined
```

Get a value from the state.
If the value does not exist, null is returned.

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `T` | `string` |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `key` | `string` | The key to get the value for. |
| `options`? | `GetStateOptions` | - |

## Returns

`T` \| `null` \| `undefined`

The value for the given key, or null if the key does not exist.

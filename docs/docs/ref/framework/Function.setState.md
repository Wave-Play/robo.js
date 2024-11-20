# Function: setState()

```ts
function setState<T>(
   key, 
   value, 
   options?): T
```

Set a value in the state.
When the persist option is set to true, the state will be persisted to disk.

## Type Parameters

| Type Parameter |
| ------ |
| `T` |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `key` | `string` | The key to set the value for. |
| `value` | `T` \| (`oldValue`) => `T` | The value to set. |
| `options`? | `SetStateOptions` | Options for setting the state. (Persisting to disk) |

## Returns

`T`

# Variable: Flashcore

```ts
const Flashcore: object;
```

Built-in KV database for long-term storage.

```ts
import { Flashcore } from 'robo.js'

await Flashcore.set('key', 'value')
const value = await Flashcore.get('key')
await Flashcore.delete('key')
```

Use this to store and retrieve data across sessions. All APIs are asynchronous.
Defaults to file-based storage, but can be configured to use other engines using Keyv adapters.

[**Learn more:** Flashcore Database](https://robojs.dev/robojs/flashcore)

## Type declaration

### clear()

```ts
clear: () => boolean | void | Promise<boolean> | Promise<void>;
```

Clears all key-value pairs from the store.

#### Returns

`boolean` \| `void` \| `Promise`\<`boolean`\> \| `Promise`\<`void`\>

- Resolves to a boolean indicating whether the operation was successful.

### delete()

```ts
delete: (key, options?) => boolean | Promise<boolean>;
```

Deletes the value associated with a key from the store.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `key` | `string` | The key associated with the value to delete. |
| `options`? | `FlashcoreOptions` | - |

#### Returns

`boolean` \| `Promise`\<`boolean`\>

- Resolves to a boolean indicating whether the operation was successful.

### get()

```ts
get: <V>(key, options?) => V | Promise<V>;
```

Gets the value associated with a key.

#### Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| `V` | The type of the value. |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `key` | `string` | The key associated with the value. |
| `options`? | `FlashcoreOptions` & `object` | - |

#### Returns

`V` \| `Promise`\<`V`\>

- May return a promise you can await or the value directly.

### has()

```ts
has: (key, options?) => boolean | Promise<boolean>;
```

Checks if a key exists in the store.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `key` | `string` | The key to check. |
| `options`? | `FlashcoreOptions` | Options for the operation. |

#### Returns

`boolean` \| `Promise`\<`boolean`\>

- A boolean indicating whether the key exists.

### off()

```ts
off: (key, callback?, options?) => void;
```

Unregisters a callback from a key, so it will no longer be executed when the key's value changes.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `key` | `string` | The key to stop watching. |
| `callback`? | `WatcherCallback`\<`unknown`\> | The callback function to remove from the key's watch list. If no callback is provided, all callbacks associated with the key are removed. |
| `options`? | `FlashcoreOptions` | - |

#### Returns

`void`

### on()

```ts
on: (key, callback, options?) => void;
```

Registers a callback to be executed when a specific key's value changes in the store.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `key` | `string` | The key to watch for changes. |
| `callback` | `WatcherCallback`\<`unknown`\> | The callback function to execute when the key's value changes. The callback receives the new and old values as arguments. |
| `options`? | `FlashcoreOptions` | - |

#### Returns

`void`

### set()

```ts
set: <V>(key, value, options?) => boolean | Promise<boolean>;
```

Sets a key-value pair in the store.

#### Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| `V` | The type of the value. |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `key` | `string` | The key to associate with the value. |
| `value` | `V` | The value to set. |
| `options`? | `FlashcoreOptions` | - |

#### Returns

`boolean` \| `Promise`\<`boolean`\>

- Resolves to a boolean indicating whether the operation was successful.

# Variable: Flashcore

```ts
const Flashcore: object;
```

Built-in database for storing key-value pairs.

## Type declaration

| Name | Type | Description |
| ------ | ------ | ------ |
| `clear` | () => `boolean` \| `void` \| `Promise`\<`boolean`\> \| `Promise`\<`void`\> | Clears all key-value pairs from the store. |
| `delete` | (`key`, `options`?) => `boolean` \| `Promise`\<`boolean`\> | Deletes the value associated with a key from the store. |
| `get` | \<`V`\>(`key`, `options`?) => `V` \| `Promise`\<`V`\> | Gets the value associated with a key. |
| `has` | (`key`, `options`?) => `boolean` \| `Promise`\<`boolean`\> | - |
| `off` | (`key`, `callback`?, `options`?) => `void` | Unregisters a callback from a key, so it will no longer be executed when the key's value changes. |
| `on` | (`key`, `callback`, `options`?) => `void` | Registers a callback to be executed when a specific key's value changes in the store. |
| `set` | \<`V`\>(`key`, `value`, `options`?) => `boolean` \| `Promise`\<`boolean`\> | Sets a key-value pair in the store. |

# Interface: FlashcoreAdapter\<K, V\>

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `K` | `string` |
| `V` | `unknown` |

## Methods

### clear()

```ts
clear(): boolean | void | Promise<void> | Promise<boolean>
```

#### Returns

`boolean` \| `void` \| `Promise`\<`void`\> \| `Promise`\<`boolean`\>

***

### delete()

```ts
delete(key): boolean | Promise<boolean>
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `K` |

#### Returns

`boolean` \| `Promise`\<`boolean`\>

***

### get()

```ts
get(key): V | Promise<V>
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `K` |

#### Returns

`V` \| `Promise`\<`V`\>

***

### has()

```ts
has(key): boolean | Promise<boolean>
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `K` |

#### Returns

`boolean` \| `Promise`\<`boolean`\>

***

### set()

```ts
set(key, value): boolean | Promise<boolean>
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `K` |
| `value` | `V` |

#### Returns

`boolean` \| `Promise`\<`boolean`\>

# Interface: RequestPayloadHandle

Utility handle for inspecting and mutating a parsed request payload.

## Properties

### source

```ts
readonly source: PayloadSource;
```

## Methods

### assign()

```ts
assign(partial): void
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `partial` | `Record`\<`string`, `unknown`\> |

#### Returns

`void`

***

### get()

```ts
get<T>(): T
```

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `T` *extends* `Record`\<`string`, `unknown`\> | `Record`\<`string`, `unknown`\> |

#### Returns

`T`

***

### replace()

```ts
replace(data): void
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | `Record`\<`string`, `unknown`\> |

#### Returns

`void`

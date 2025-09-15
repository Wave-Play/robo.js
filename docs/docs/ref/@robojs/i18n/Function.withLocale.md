# Function: withLocale()

## withLocale(local)

```ts
function withLocale(local): <K>(key, params?) => string
```

Binds a `LocaleLike` to produce a curried translator.

- **Loose mode (default):** returns a `t$` that accepts optional params based on `ParamsFor<K>`.
- **Strict mode:** pass `{ strict: true }` to return a `tr$` that **requires** all params
  for keys that have any (using your `MaybeArgs<K>` tuple).

Overloads:
- `withLocale(local)` → `<K>(key: K, params?: ParamsFor<K>) => string`
- `withLocale(local, { strict: true })` → `<K>(key: K, ...args: MaybeArgs<K>) => string`

### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `local` | `any` | A `LocaleLike` (string, `{ locale }`, `{ guildLocale }`, or a Discord Interaction). |

### Returns

`Function`

#### Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* [`Locale`](Variable.Locale.md) |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `K` |
| `params`? | [`Locale`](Variable.Locale.md)\<`K`\> |

#### Returns

`string`

### Examples

```ts
// Loose (default): params optional when message has params
const t$ = withLocale('en-US')
t$('common:hello.user', { user: { name: 'Robo' } })
t$('stats:pets.count', { count: 2 })
t$('common:ping') // key with no params
```

```ts
// Strict: params required when message has params
const tr$ = withLocale('en-US', { strict: true })
tr$('common:hello.user', { user: { name: 'Robo' } })  // ✅ required
// tr$('common:hello.user')                           // ❌ compile-time error
tr$('common:ping')                                    // ✅ key with no params
```

## withLocale(local, opts)

```ts
function withLocale(local, opts): <K>(key, ...args) => string
```

### Parameters

| Parameter | Type |
| ------ | ------ |
| `local` | `any` |
| `opts` | `object` |
| `opts.strict` | `true` |

### Returns

`Function`

#### Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* [`Locale`](Variable.Locale.md) |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `K` |
| ...`args` | `MaybeArgs`\<`K`\> |

#### Returns

`string`

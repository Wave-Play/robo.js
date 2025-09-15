# Function: tr()

```ts
function tr<K>(
   locale, 
   key, ...
   args): string
```

`tr` — a **strict** version of `t`:
- Works the same as [t](Function.t.md) but **requires** that all message parameters are provided and non-undefined.
- If the target key has **no parameters**, `tr` does **not** require a params object.
- Supports nested objects (auto-flattened), dotted placeholders, and uses the same formatter cache.

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| `K` *extends* `LocaleKey` | A namespaced key from your generated `LocaleKey`. |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `locale` | `any` | A `LocaleLike` (`'en-US'`, `{ locale: 'en-US' }`, or a Discord Interaction/guild context). |
| `key` | `K` | A **namespaced** key present in your locales. |
| ...`args` | `MaybeArgs`\<`K`\> | If the key expects params, pass a single object whose type is StrictParamsFor of `K`; otherwise omit this argument entirely. |

## Returns

`string`

The formatted string for the given locale and key.

## Examples

```ts
// /locales/en-US/common.json:
// { "hello.user": "Hello {user.name}!" } → "common:hello.user"
import { tr } from '@robojs/i18n'
tr('en-US', 'common:hello.user', { user: { name: 'Robo' } }) // OK
// tr('en-US', 'common:hello.user', { user: {} })            // ❌ compile-time error
```

```ts
// /locales/en-US/common.json:
// { "ping": "Pong!" } → "common:ping"
tr('en-US', 'common:ping') // OK: no params required
```

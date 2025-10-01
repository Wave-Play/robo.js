# Function: t()

```ts
function t<K>(
   locale, 
   key, 
params?): Locale<K>
```

Formats a localized message by key with **strongly-typed params** inferred from your MF2 message.

- Supports `LocaleLike`: pass a locale string (`'en-US'`) or any object with `{ locale }` or `{ guildLocale }`.
- Accepts **nested params** (e.g., `{ user: { name: 'Robo' } }`) which are auto-flattened to dotted paths.
- Handles MF2 number/date/time (e.g., `{$n :number}`, `{$ts :time}`, `{$ts :date}`); for date/time the param can be `Date | number`.

### 🔑 About namespaced keys
Keys are **namespaced by file path**:
- `/locales/<locale>/common.json` ⇒ `common:<json-key>`
- `/locales/<locale>/shared/common.json` ⇒ `shared/common:<json-key>`
- Deeper folders keep slash-separated segments (e.g., `shared/common/example:<json-key>`).
The `key` argument must be the **full namespaced key** and is type-safe via `LocaleKey`.

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| `K` *extends* `LocaleKey` | A key from your generated `LocaleKey` union (namespaced). |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `locale` | `any` | A `LocaleLike` (`'en-US'`, `{ locale: 'en-US' }`, or a Discord Interaction/guild context). |
| `key` | `K` | A **namespaced** key present in your `/locales` folder (e.g., `common:hello.user`). |
| `params`? | `any` | Parameters inferred from the MF2 message (`ParamsFor<K>`). Nested objects are allowed. |

## Returns

[`Locale`](Variable.Locale.md)\<`K`\>

The formatted string for the given locale and key.

## Examples

```ts
// /locales/en-US/common.json:
// { "hello.user": "Hello {$user.name}!" }
// Namespaced key becomes: "common:hello.user"

import { t } from '@robojs/i18n'
t('en-US', 'common:hello.user', { user: { name: 'Robo' } }) // "Hello Robo!"
```

```ts
// MF2 plural-style match (file: /locales/en-US/stats.json):
// { "pets.count": ".input {$count :number}\n.match $count\n  one {{You have {$count} pet}}\n  *   {{You have {$count} pets}}" }
t('en-US', 'stats:pets.count', { count: 1 }) // "You have 1 pet"
t('en-US', 'stats:pets.count', { count: 3 }) // "You have 3 pets"
```

```ts
// Date/time (file: /locales/en-US/common.json):
// { "when.run": "Ran at {$ts :time style=short} on {$ts :date style=medium}" }
t('en-US', 'common:when.run', { ts: Date.now() })
```

```ts
// Using a Discord interaction object (has {locale} or {guildLocale}):
export default (interaction: ChatInputCommandInteraction) => {
  return t(interaction, 'common:hello.user', { user: { name: interaction.user.username } })
}
```

## Throws

If the locale is unknown (no `/locales/<locale>` loaded) or the key is missing in that locale.

## Remarks

- You can also pass dotted params directly: `t('en-US', 'common:hello.user', { 'user.name': 'Robo' })`.
- If different locales disagree on a param’s kind, the generator safely widens the param type.

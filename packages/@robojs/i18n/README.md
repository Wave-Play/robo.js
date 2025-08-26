<p align="center">✨ <strong>Generated with <a href="https://robojs.dev/create-robo">create-robo</a> magic!</strong> ✨</p>

---

# `@robojs/i18n`

Type-safe **i18n** for **Robo.js** with **ICU MessageFormat**.

Drop JSON files in `/locales`, get strongly-typed **namespaced keys** & parameters, and format messages at runtime with `t()` or the strict `tr()`—no custom build steps required.

- **Strong types** from your JSON — keys & params are inferred from ICU messages.
- **Runtime formatting** with `t(localeLike, key, params?)` anywhere in your app.
- **Strict mode** with `tr(localeLike, key, ...args)` and `withLocale(locale, { strict: true })`.
- **Zero friction** — just add `/locales/**.json`; the plugin loads once and generates types.
- **Nested parameters** — pass objects (e.g., `{ user: { name: 'Robo' } }`) and we flatten them automatically.
- **Discord-ready** — optional helper to localize slash command metadata.
- **Fast** — uses a tiny in-memory cache of compiled formatters to minimize parse overhead.

<div align="center">
	[![GitHub
	license](https://img.shields.io/github/license/Wave-Play/robo)](https://github.com/Wave-Play/robo/blob/main/LICENSE)
	[![npm](https://img.shields.io/npm/v/@robojs/i18n)](https://www.npmjs.com/package/@robojs/i18n) [![install
	size](https://packagephobia.com/badge?p=@robojs/i18n@latest)](https://packagephobia.com/result?p=@robojs/i18n@latest)
	[![Discord](https://img.shields.io/discord/1087134933908193330?color=7289da)](https://robojs.dev/discord) [![All
	Contributors](https://img.shields.io/github/all-contributors/Wave-Play/robo.js?color=cf7cfc)](https://github.com/Wave-Play/robo.js/blob/main/CONTRIBUTING.md#contributors)
</div>

➞ [📚 **Documentation:** Getting started](https://robojs.dev/docs/getting-started)

➞ [🚀 **Community:** Join our Discord server](https://robojs.dev/discord)

---

## Installation 💻

Add the plugin to an existing Robo:

```bash
npx robo add @robojs/i18n
```

Or start a new project with it preinstalled:

```bash
npx create-robo <project-name> -p @robojs/i18n
```

---

## Folder structure

Place your messages under `/locales/<locale>/**/*.json`.

**Keys are automatically namespaced from the file path**:

- `/locales/<locale>/common.json` → prefix `common:`
  e.g. `common:hello.user`
- `/locales/<locale>/shared/common.json` → prefix `shared.common:`
  e.g. `shared.common:hello`
- Deeper paths keep dot-separated folders + filename (without `.json`), then `:`
  e.g. `/locales/en-US/marketing/home/hero.json` → `marketing.home.hero:`

Example tree:

```
/locales
  /en-US
    common.json
    /shared
      common.json
  /es-ES
    common.json
```

**en-US/common.json**

```json
{
	"hello.user": "Hello {user.name}!",
	"pets.count": "{count, plural, one {# pet} other {# pets}}",
	"when.run": "Ran at {ts, time, short} on {ts, date, medium}"
}
```

**es-ES/common.json**

```json
{
	"hello.user": "¡Hola {user.name}!",
	"pets.count": "{count, plural, one {# mascota} other {# mascotas}}",
	"when.run": "Ejecutado a las {ts, time, short} el {ts, date, medium}"
}
```

> Only string values are used. Non-JSON files are ignored. The plugin loads everything once, keeps it in state, and generates types from what it finds.

---

## How type-safety works

On first load, the plugin:

1. Scans `/locales/**.json`.
2. Parses **ICU messages** to detect parameter kinds (plural/number/date/time/select/argument).
3. Emits `generated/types.d.ts` with:
   - `type Locale = 'en-US' | 'es-ES' | ...`
   - `type LocaleKey = 'common:hello.user' | 'common:pets.count' | ...` ← **namespaced**
   - `type LocaleParamsMap` and `type ParamsFor<K>`

Formatting is done by `intl-messageformat` at runtime, with a small cache of compiled formatters to reduce CPU work across calls.

---

## Runtime usage (`t`) 🌐

`t(localeLike, key, params?)` formats a message right now. The `params` type is **inferred** from `key`.
Keys must use the **namespaced** form.

```ts
import { t } from '@robojs/i18n'

// Accepts a string, a Discord Interaction, or any { locale } / { guildLocale } object
const locale = 'en-US' as const

// ✅ Nested objects: {user.name} is inferred from "common:hello.user"
t(locale, 'common:hello.user', { user: { name: 'Robo' } })

// ❌ Type error: `count` must be a number
// @ts-expect-error
t(locale, 'common:pets.count', { count: 'three' })

// ✅ Date | number accepted for {ts, date/time}
t(locale, 'common:when.run', { ts: Date.now() })
```

`localeLike` can be:

- `'en-US'` (string)
- `{ locale: 'en-US' }`
- `{ guildLocale: 'en-US' }`

---

## Strict runtime usage (`tr`) 🔒

`tr(localeLike, key, ...args)` is a **strict** variant of `t`:

- If the message has parameters, they are **required** and **non-undefined**.
- If the message has no parameters, you can omit the params object.
- Works with the same namespaced keys and nested param objects.

```ts
import { tr } from '@robojs/i18n'

// ✅ Requires { user.name }
tr('en-US', 'common:hello.user', { user: { name: 'Robo' } })

// ❌ Compile-time error: missing params
// tr('en-US', 'common:hello.user')

tr('en-US', 'common:ping') // OK — key with no params
```

---

## Cleaner calls with `withLocale` 🧼

Avoid threading `locale` around:

```ts
import { withLocale } from '@robojs/i18n'
import type { ChatInputCommandInteraction } from 'discord.js'

export default (interaction: ChatInputCommandInteraction) => {
	const t$ = withLocale(interaction)

	// Types still infer from the key:
	return t$('common:hello.user', { user: { name: 'Robo' } })
}
```

### Strict variant

Pass `{ strict: true }` to get a curried **strict** translator (`tr$`) that enforces required params like `tr`:

```ts
import { withLocale } from '@robojs/i18n'

const tr$ = withLocale('en-US', { strict: true })
tr$('common:hello.user', { user: { name: 'Robo' } }) // ✅ required
// tr$('common:hello.user')                           // ❌ compile-time error

tr$('common:ping') // ✅ key with no params
```

---

## Nested parameter objects 🧩

Although ICU placeholders look flat (e.g., `{user.name}`), you can pass **nested objects** and we’ll **flatten** them for you:

```json
// /locales/en-US/common.json
{
	"greet": "Hi {user.name}! You have {stats.count, number} points."
}
```

```ts
t('en-US', 'common:greet', {
	user: { name: 'Robo' },
	stats: { count: 42 }
})
// -> "Hi Robo! You have 42 points."
```

Arrays are also supported via dotted indices, e.g. an ICU `{items.0}` can be satisfied with `{ items: ['a', 'b'] }`.

> If you prefer, you can pass dotted keys directly: `{ 'user.name': 'Robo' }`. Both forms work.

---

## Discord slash commands

### `createCommandConfig` 🎮

If your **Robo** uses **Discord Slash Commands**, import **our** `createCommandConfig` (drop-in replacement for Robo’s), then write **namespaced keys** instead of raw strings. The plugin will:

- Fill the **default** name/description from your configured `defaultLocale`.
- Generate `nameLocalizations` / `descriptionLocalizations` for **every** locale it finds.
- Do the same for each **option** (`nameKey`, `descriptionKey`).

> **Note:** For options, `name` \*\*is still required\*\* and should be provided **alongside** `nameKey` for best TypeScript inference.

```ts
import { createCommandConfig, t } from '@robojs/i18n'
import type { ChatInputCommandInteraction } from 'discord.js'
import type { CommandOptions } from 'robo.js'

export const config = createCommandConfig({
	nameKey: 'commands:cmd.ping.name',
	descriptionKey: 'commands:cmd.ping.desc',
	options: [
		{
			type: 'string',
			name: 'text',
			nameKey: 'commands:cmd.ping.arg',
			descriptionKey: 'commands:cmd.ping.arg.desc',
			required: false
		}
	]
} as const)

export default (interaction: ChatInputCommandInteraction, options: CommandOptions<typeof config>) => {
	return t(interaction, 'common:hello.user', { user: { name: options.text ?? 'Robo' } })
}
```

**/locales/en-US/commands.json**

```json
{
	"cmd.ping.name": "Ping",
	"cmd.ping.desc": "Measure latency",
	"cmd.ping.arg": "Text",
	"cmd.ping.arg.desc": "Optional text to include"
}
```

> Any Robo.js project can use this plugin. `createCommandConfig` is a convenience specifically for Discord-style slash commands.

---

## End-to-end example

```ts
import { withLocale } from '@robojs/i18n'
import type { ChatInputCommandInteraction } from 'discord.js'

export default (interaction: ChatInputCommandInteraction) => {
	const t$ = withLocale(interaction)
	const tr$ = withLocale(interaction, { strict: true })

	const welcome = tr$('common:hello.user', { user: { name: 'Traveler' } })
	const summary = t$('common:pets.count', { count: 2 }) // optional in loose mode
	const when = t$('common:when.run', { ts: new Date() })

	return `${welcome}\n${summary}\n${when}`
}
```

---

## Performance ⚡

We keep a small in-memory **cache of compiled `IntlMessageFormat` instances**, keyed by `(locale, key, message)`. This avoids reparsing strings on repeated calls and is a good fit for typical projects with **a few hundred keys per locale**. If you hot-reload or want to clear the cache (e.g., during tests), call the exposed helper.

```ts
import { clearFormatterCache } from '@robojs/i18n'

clearFormatterCache()
```

---

## Supported ICU pieces (what’s parsed)

The plugin recognizes these ICU elements and maps them to param types:

| ICU element | Example snippet                                    | Param type inferred |
| ----------- | -------------------------------------------------- | ------------------- |
| argument    | `{name}`                                           | `string`            |
| number      | `{count, number}` / `{count, plural, ...}`         | `number`            |
| plural      | `{count, plural, one {...} other {...}}`           | `number`            |
| select      | `{kind, select, user {...} bot {...} other {...}}` | `string`            |
| date        | `{ts, date, medium}`                               | `Date \| number`    |
| time        | `{ts, time, short}`                                | `Date \| number`    |

> If different locales disagree on a param’s kind, the type safely widens (e.g., `number` vs `string` → `string`; any date/time → `Date \| number`).

---

## Notes & FAQs

- **Works outside Discord** — `t()`/`tr()` are plain functions. Use them anywhere you can pass a locale string or object.
- **Missing locale or key** → throws an error (fast fail).
- **Nested ICU** (e.g., plurals inside options) is traversed correctly.
- **No manual type imports needed** — `t()`/`tr()` infer `ParamsFor<K>` from your keys.
- **Namespaced keys are required** — use the `<folders>.<file>:` prefix for every key.

---

## Got questions? 🤔

If you have any questions or need help with this plugin, join our Discord — we’re friendly and happy to help!

➞ [🚀 ](https://robojs.dev/discord)**[Community: Join our Discord server](https://robojs.dev/discord)**

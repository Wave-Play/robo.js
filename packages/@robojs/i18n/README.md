<p align="center">✨ <strong>Generated with <a href="https://robojs.dev/create-robo">create-robo</a> magic!</strong> ✨</p>

---

# @robojs/i18n

Type-safe **i18n** for **Robo.js** with **ICU MessageFormat**.

Drop JSON files in `/locales`, get strongly-typed **namespaced keys** & parameters, and format messages at runtime with `t()` or the strict `tr()`—no custom build steps required.

- **Strong types** from your JSON — keys & params are inferred from ICU messages.
- **Runtime formatting** with `t(localeLike, key, params?)` anywhere in your app.
- **Strict mode** with `tr(localeLike, key, ...args)` and `withLocale(locale, { strict: true })`.
- **Zero friction** — just add `/locales/**.json`; the plugin loads once and generates types.
- **Nested parameters** — pass objects (e.g., `{ user: { name: 'Robo' } }`) and we flatten them automatically.
- **Discord-ready** — optional helper to localize slash command metadata.
- **Fast** — tiny in-memory cache of compiled formatters to minimize parse overhead.

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

## Installation 💻

Add the plugin to an existing Robo:

```bash
npx robo add @robojs/i18n
```

Or start a new project with it preinstalled:

```bash
npx create-robo <project-name> -p @robojs/i18n
```

## Folder structure

Put message files under `/locales/<locale>/**/*.json`.

**Keys are automatically namespaced from the file path**:

- `/locales/<locale>/app.json` ⇒ prefix `app:`
- `/locales/<locale>/shared/common.json` ⇒ prefix `shared/common:`
- Deeper paths keep slash-separated folders + filename (no `.json`), then `:`
  - e.g. `/locales/en-US/marketing/home/hero.json` ⇒ `marketing/home/hero:`

Example tree:

```
/locales
  /en-US
    app.json
  /es-ES
    app.json
```

**en-US/app.json**

```json
{
	"hello": "Hello {name}!",
	"pets.count": "{count, plural, one {# pet} other {# pets}}"
}
```

**es-ES/app.json**

```json
{
	"hello": "¡Hola {name}!",
	"pets.count": "{count, plural, one {# mascota} other {# mascotas}}"
}
```

> Only string values are used. Non-JSON files are ignored. The plugin loads everything once, keeps it in state, and generates types from what it finds.

## Runtime usage (`t`) 🌐

`t(localeLike, key, params?)` formats a message right now. The `params` type is **inferred** from `key`.

```ts
import { t } from '@robojs/i18n'

// Accepts a string, a Discord Interaction, or any { locale } / { guildLocale } object
const locale = 'en-US' as const

t(locale, 'app:hello', { name: 'Robo' }) // "Hello Robo!"
t(locale, 'app:pets.count', { count: 3 }) // "3 pets"
```

`locale` can be:

- `'en-US'` (string)
- `{ locale: 'en-US' }`
- `{ guildLocale: 'en-US' }`

## Strict runtime usage (`tr`) 🔒

`tr(localeLike, key, ...args)` is a **strict** variant of `t`:

- If the message has parameters, they are **required** and **non-undefined**.
- If the message has no parameters, you can omit the params object.

```ts
import { tr } from '@robojs/i18n'

const locale = 'en-US' as const

tr(locale, 'app:hello', { name: 'Robo' }) // ✅ required
// tr(locale, 'app:hello')                // ❌ compile-time error

tr(locale, 'app:ping') // ✅ key with no params
```

## Cleaner calls with `withLocale` 🧼

Avoid threading `locale` around:

```ts
import { withLocale } from '@robojs/i18n'
import type { ChatInputCommandInteraction } from 'discord.js'

export default (interaction: ChatInputCommandInteraction) => {
	const t$ = withLocale(interaction)
	return t$('app:hello', { name: 'Robo' })
}
```

### Strict variant

Pass `{ strict: true }` to get a curried **strict** translator (`tr$`) that enforces required params like `tr`:

```ts
import { withLocale } from '@robojs/i18n'

const tr$ = withLocale('en-US', { strict: true })
tr$('app:hello', { name: 'Robo' }) // ✅ required
// tr$('app:hello')                 // ❌ compile-time error

tr$('app:ping') // ✅ key with no params
```

## Nesting 🧩

You can nest **keys inside JSON** and provide **nested objects for params**.

### Nested keys

Instead of writing flat keys, you may structure your locale file:

```json
// /locales/en-US/app.json
{
	"greetings": {
		"hello": "Hello {name}!"
	}
}
```

The key becomes `app:greetings.hello`.

> ⚠️ **Collision rule:** a file cannot contain both a literal dotted key and a nested object that flatten to the same key (e.g., `"greetings.hello": "…"` and `{ "greetings": { "hello": "…" } }`). The build will **error** with a clear message.

### Nested parameter objects

Although ICU placeholders look flat (`{user.name}`), you can pass nested objects and they’ll be flattened for you.

```json
// /locales/en-US/app.json
{
	"profile": "Hi {user.name}! You have {stats.count, number} points."
}
```

```ts
t('en-US', 'app:profile', {
	user: { name: 'Robo' },
	stats: { count: 42 }
})
// -> "Hi Robo! You have 42 points."
```

> Prefer objects for readability; dotted param keys like `{ 'user.name': 'Robo' }` also work if you need them.

## Discord slash commands

### `createCommandConfig` 🎮

Import `createCommandConfig` from `@robojs/i18n` instead of `robo.js` to define slash command metadata with **i18n** keys. The plugin will fill in names and descriptions for all locales at runtime.

```ts
import { createCommandConfig, t } from '@robojs/i18n'
import type { ChatInputCommandInteraction } from 'discord.js'
import type { CommandOptions } from 'robo.js'

export const config = createCommandConfig({
	nameKey: 'commands:ping.name',
	descriptionKey: 'commands:ping.desc',
	options: [
		{
			type: 'string',
			name: 'text',
			nameKey: 'commands:ping.arg.name',
			descriptionKey: 'commands:ping.arg.desc'
		}
	]
} as const)

export default (interaction: ChatInputCommandInteraction, options: CommandOptions<typeof config>) => {
	const user = { name: options.text ?? 'Robo' }
	return t(interaction, 'commands:hey', { user })
}
```

**/locales/en-US/commands.json**

```json
{
	"hey": "Hey there, {user.name}!",
	"ping": {
		"name": "ping",
		"desc": "Measure latency",
		"arg": {
			"name": "text",
			"desc": "Optional text to include"
		}
	}
}
```

> For options, `name` **is still required** (helps TS inference) and should be provided alongside `nameKey`.

## Performance ⚡

We keep a small in-memory **cache of compiled `IntlMessageFormat` instances**, keyed by `(locale, key, message)`. This avoids reparsing strings on repeated calls and fits apps with **a few hundred keys per locale**. You can clear it during tests or hot-reload:

```ts
import { clearFormatterCache } from '@robojs/i18n'
clearFormatterCache()
```

## Supported ICU pieces (what’s parsed)

| ICU element | Example snippet                                    | Param type inferred |
| ----------- | -------------------------------------------------- | ------------------- |
| argument    | `{name}`                                           | `string`            |
| number      | `{count, number}` / `{count, plural, ...}`         | `number`            |
| plural      | `{count, plural, one {...} other {...}}`           | `number`            |
| select      | `{kind, select, user {...} bot {...} other {...}}` | `string`            |
| date        | `{ts, date, medium}`                               | `Date \| number`    |
| time        | `{ts, time, short}`                                | `Date \| number`    |

> If different locales disagree on a param’s kind, the type safely widens (e.g., `number` vs `string` → `string`; any date/time → `Date \| number`).

## How type-safety works

On first load, the plugin:

1. Scans `/locales/**.json`.
2. Parses **ICU messages** to detect parameter kinds (plural/number/date/time/select/argument).
3. Emits `generated/types.d.ts` with:
   - `type Locale = 'en-US' | 'es-ES' | ...`
   - `type LocaleKey = 'app:hello' | 'app:pets.count' | 'shared/common:...' | ...` ← **namespaced**
   - `type LocaleParamsMap` and `type ParamsFor<K>`

Formatting is done by `intl-messageformat` at runtime, with a small cache of compiled formatters to reduce CPU work across calls.

## Notes & FAQs

- **Works outside Discord** — `t()`/`tr()` are plain functions. Use them anywhere you can pass a locale string or object.
- **Missing locale or key** → throws an error (fast fail).
- **Nested ICU** (e.g., plurals inside options) is traversed correctly.
- **No manual type imports needed** — `t()`/`tr()` infer `ParamsFor<K>` from your keys.
- **Namespaced keys are required** — always use the `<folders>/<file>:` prefix (e.g., `app:hello`, `shared/common:greet`).

## Got questions? 🤔

If you have any questions or need help with this plugin, join our Discord — we’re friendly and happy to help!

➞ [🚀 ](https://robojs.dev/discord)**[Community: Join our Discord server](https://robojs.dev/discord)**

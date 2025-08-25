<p align="center">✨ <strong>Generated with <a href="https://robojs.dev/create-robo">create-robo</a> magic!</strong> ✨</p>

---

# `@robojs/i18n`

Type-safe **i18n** for **Robo.js** with **ICU MessageFormat**.

Drop JSON files in `/locales`, get strongly-typed keys & parameters, and format messages at runtime with `t()`—no custom build steps required.

* **Strong types** from your JSON — keys & params are inferred from ICU messages.
* **Runtime formatting** with `t(localeLike, key, params?)` anywhere in your app.
* **Zero friction** — just add `/locales/**.json`; the plugin loads once and generates types.
* **Discord-ready** — optional helper to localize slash command metadata.

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

## Folder structure & message files

Place your messages under `/locales/<locale>/**/*.json`. Example:

```
/locales
  /en-US
    common.json
  /es-ES
    common.json
```

**en-US/common.json**

```json
{
  "hello.user": "Hello {name}!",
  "pets.count": "{count, plural, one {# pet} other {# pets}}",
  "when.run": "Ran at {ts, time, short} on {ts, date, medium}"
}
```

**es-ES/common.json**

```json
{
  "hello.user": "¡Hola {name}!",
  "pets.count": "{count, plural, one {# mascota} other {# mascotas}}",
  "when.run": "Ejecutado a las {ts, time, short} el {ts, date, medium}"
}
```

> Non-JSON files are ignored; only string values are used. The plugin loads everything once, keeps it in state, and generates types from what it finds.

---

## How type-safety works

On first load, the plugin:

1. Scans `/locales/**.json`.
2. Parses **ICU messages** to detect parameter kinds (plural/number/date/time/select/argument).
3. Emits `generated/types.d.ts` with:

   * `type Locale = 'en-US' | 'es-ES' | ...`
   * `type LocaleKey = 'hello.user' | 'pets.count' | ...`
   * `type LocaleParamsMap` and `type ParamsFor<K>`

Formatting is done by `intl-messageformat` at runtime.

---

## Runtime usage (`t`) 🌐

`t(localeLike, key, params?)` formats a message right now. The `params` type is **inferred** from `key`.

```ts
import { t } from '@robojs/i18n'

// Accepts a string, a Discord Interaction, or any { locale } / { guildLocale } object
const locale = 'en-US' as const

// ✅ Correct: requires a { name: string }
const msg1 = t(locale, 'hello.user', { name: 'Robo' })

// ❌ Type error: `count` must be a number
// @ts-expect-error
t(locale, 'pets.count', { count: 'three' })

// ✅ Date | number accepted for {ts, date/time}
const msg2 = t(locale, 'when.run', { ts: Date.now() })
```

`localeLike` can be:

* `'en-US'` (string)
* `{ locale: 'en-US' }`
* `{ guildLocale: 'en-US' }`

---

## Cleaner calls with `withLocale` 🧼

Avoid threading `locale` around:

```ts
import { withLocale } from '@robojs/i18n'
import type { ChatInputCommandInteraction } from 'discord.js'

export default (interaction: ChatInputCommandInteraction) => {
  const t$ = withLocale(interaction)

  // Types still infer from the key:
  return t$('hello.user', { name: 'Robo' })
}
```

---

## Optional plugin config

Set a default locale for command metadata:

```ts
export default {
  /** Used when populating default descriptions/names for command metadata */
  defaultLocale: 'en-US'
}
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

## Discord slash commands

### `createCommandConfig` 🎮

If your **Robo** uses **Discord Slash Commands**, import **our** `createCommandConfig` (drop-in replacement for Robo’s), then write **keys** instead of raw strings. The plugin will:

* Fill the **default** name/description from your configured `defaultLocale`.
* Generate `nameLocalizations` / `descriptionLocalizations` for **every** locale it finds.
* Do the same for each **option** (`nameKey`, `descriptionKey`).

> **Note:** For options, `name` \*\* is still required\*\* and should be provided **alongside** `nameKey` for best TypeScript inference.

```ts
import { createCommandConfig, t } from '@robojs/i18n'
import type { ChatInputCommandInteraction } from 'discord.js'
import type { CommandOptions } from 'robo.js'

export const config = createCommandConfig({
  nameKey: 'cmd.ping.name',
  descriptionKey: 'cmd.ping.desc',
  options: [{
    type: 'string',
    name: 'text',
    nameKey: 'cmd.ping.arg',
    descriptionKey: 'cmd.ping.arg.desc',
    required: false
  }]
} as const)

export default (
  interaction: ChatInputCommandInteraction,
  options: CommandOptions<typeof config>
) => {
  // Reply using an existing key from /locales/common.json in this README
  return t(interaction, 'hello.user', { name: options.text ?? 'Robo' })
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

export default (interaction: ChatInputCommandInteraction) => {
  const t$ = withLocale(interaction)

  // Safe, inferred params:
  const welcome = t$('hello.user', { name: 'Traveler' })
  const summary = t$('pets.count', { count: 2 })
  const when = t$('when.run', { ts: new Date() })

  return `${welcome}\n${summary}\n${when}`
}
```

---

## Notes & FAQs

* **Works outside Discord** — `t()` is just a function. Use it anywhere you can pass a locale string or object.
* **Missing locale or key** → throws an error (fast fail).
* **Nested ICU** (e.g., plurals inside options) is traversed correctly.
* **No manual type imports needed** — `t()` infers `ParamsFor<K>` from your keys.

---

## Got questions? 🤔

If you have any questions or need help with this plugin, join our Discord — we’re friendly and happy to help!

➞ [🚀 ](https://robojs.dev/discord)**[Community: Join our Discord server](https://robojs.dev/discord)**

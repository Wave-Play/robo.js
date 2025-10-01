# Function: createCommandConfig()

```ts
function createCommandConfig<C>(config): CommandConfig
```

Creates a **localized** command configuration for Robo.js projects.

This is a drop-in replacement for `robo.js`’s `createCommandConfig` that:
- Accepts **key-based** fields (`nameKey`, `descriptionKey`, and per-option keys).
- Resolves the default strings from the configured `defaultLocale` (plugin option).
- Auto-populates `nameLocalizations` and `descriptionLocalizations` for **all** discovered locales.

## Type Parameters

| Type Parameter |
| ------ |
| `C` *extends* `LocaleCommandConfig` |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `config` | `ValidatedCommandConfig`\<`C`\> | A command config that uses **namespaced** locale keys instead of raw strings. |

## Returns

`CommandConfig`

A standard `SmartCommandConfig` ready for Robo.js to register.

## Examples

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

```json
{
  "hey": "Hey there, {$user.name}!",
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

## Remarks

- Locales and message files are loaded once (on first call). You can call this
  multiple times for different commands; it will reuse the loaded state.
- If a `descriptionKey` is omitted, only names/localizations for options are generated.
- All keys must use the **namespaced** form (`<folders>/<file>:` + `<json-key>`).

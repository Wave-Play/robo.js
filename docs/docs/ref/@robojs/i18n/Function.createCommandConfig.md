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

## Example

```ts
// /locales/en-US/commands.json
// {
//   "cmd.ping.name": "Ping",
//   "cmd.ping.desc": "Measure latency",
//   "cmd.ping.arg": "Text",
//   "cmd.ping.arg.desc": "Optional text to include"
// }
// Use the namespaced form: "commands:<json-key>"
import { createCommandConfig } from '@robojs/i18n'

export const config = createCommandConfig({
  nameKey: 'commands:cmd.ping.name',
  descriptionKey: 'commands:cmd.ping.desc',
  options: [{
    type: 'string',
    name: 'text', // keep a raw name to help TS narrow option types
    nameKey: 'commands:cmd.ping.arg',
    descriptionKey: 'commands:cmd.ping.arg.desc',
    required: false
  }]
} as const)
```

## Remarks

- Locales and message files are loaded once (on first call). You can call this
  multiple times for different commands; it will reuse the loaded state.
- If a `descriptionKey` is omitted, only names/localizations for options are generated.
- All keys must use the **namespaced** form (`<folders>.<file>:` + `<json-key>`).

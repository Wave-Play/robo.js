# Function: normalizeAuthOptions()

```ts
function normalizeAuthOptions(options): NormalizedAuthPluginOptions
```

Parses plugin configuration, applies defaults, and returns an Auth.js-ready option set.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | `unknown` | Raw value supplied by the Robo config or CLI scaffolder. |

## Returns

`NormalizedAuthPluginOptions`

A normalized configuration consumable by Auth.js and runtime helpers.

## Examples

```ts
const resolved = normalizeAuthOptions({ basePath: '/api/auth' })
console.log(resolved.basePath) // "/api/auth"
```

```ts
const resolved = normalizeAuthOptions({ providers: [GitHubProvider({ clientId, clientSecret })] })
console.log(resolved.session.strategy) // "jwt"
```

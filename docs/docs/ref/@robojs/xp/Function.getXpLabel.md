# Function: getXpLabel()

```ts
function getXpLabel(config): string
```

Extracts custom XP label from guild config with fallback to 'XP'.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `config` | [`GuildConfig`](Interface.GuildConfig.md) | Guild configuration |

## Returns

`string`

Custom XP display name or 'XP' if not configured

## Example

```ts
const label = getXpLabel(config)
// Returns 'Reputation' if config.labels.xpDisplayName is set
// Returns 'XP' if labels is undefined or xpDisplayName is undefined
```

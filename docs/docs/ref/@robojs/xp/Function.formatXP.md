# Function: formatXP()

```ts
function formatXP(xp, label?): string
```

Formats XP with commas and custom label.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `xp` | `number` | XP amount to format |
| `label`? | `string` | Custom label for XP (defaults to 'XP') |

## Returns

`string`

Formatted string with thousands separators

## Example

```ts
formatXP(1500) // Returns '1,500 XP'
formatXP(1500, 'Reputation') // Returns '1,500 Reputation'
formatXP(1500, 'Points') // Returns '1,500 Points'
```

# Function: formatCardContent()

```ts
function formatCardContent(card, maxLength): string
```

Formats a roadmap card into Discord message content with automatic truncation.

Includes description and metadata (assignees, labels, last updated). Content is
truncated to respect Discord limits (4000 for thread creation, 2000 for updates).

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `card` | [`RoadmapCard`](TypeAlias.RoadmapCard.md) | `undefined` | The roadmap card to format. |
| `maxLength` | `number` | `2000` | Maximum character limit (default: 2000). |

## Returns

`string`

Formatted message content.

## Example

```ts
const content = formatCardContent(card, 4000);
```

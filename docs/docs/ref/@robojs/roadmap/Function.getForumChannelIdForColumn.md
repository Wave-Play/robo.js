# Function: getForumChannelIdForColumn()

```ts
function getForumChannelIdForColumn(guildId, columnName): string | undefined
```

Gets the forum channel ID for a specific column.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `guildId` | `string` | The Discord guild ID. |
| `columnName` | `string` | The column name (e.g., 'Backlog'). |

## Returns

`string` \| `undefined`

The forum channel ID, or undefined if not configured.
